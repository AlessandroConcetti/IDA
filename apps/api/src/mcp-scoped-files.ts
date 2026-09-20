import { type BigIntStats, constants } from "node:fs";
import { type FileHandle, lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, parse, relative, resolve, sep, win32 } from "node:path";

const MAX_BYTES = 64 * 1024;
const MAX_RESOURCES = 16;
const MAX_MATCHES = 20;
const MAX_EXCERPT = 240;
const resourceIdPattern = /^[a-z0-9_-]{1,64}$/u;

export interface McpFileBinding {
  workspaceId: string;
  root: string;
  resources: readonly { id: string; name: string; relativePath: string }[];
}

export type McpFileRequest =
  | { tool: "READ_FILE_SCOPED"; resourceId: string }
  | { tool: "SEARCH_FILES_SCOPED"; query: string };

type ErrorCode = "MCP_FILE_REQUEST_INVALID" | "MCP_FILE_BINDING_INVALID" | "MCP_FILE_UNAVAILABLE" | "MCP_FILE_ABORTED";

export class McpScopedFileError extends Error {
  constructor(readonly code: ErrorCode) {
    super("La lecture MCP des fichiers déclarés est indisponible.");
    this.name = "McpScopedFileError";
  }
}

function fail(code: ErrorCode): never {
  throw new McpScopedFileError(code);
}

function checkAbort(signal: AbortSignal): void {
  if (signal.aborted) fail("MCP_FILE_ABORTED");
}

function containsControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
}

export function validateMcpFileRequest(input: unknown): McpFileRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("MCP_FILE_REQUEST_INVALID");
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) fail("MCP_FILE_REQUEST_INVALID");
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 2 || keys.some((key) => typeof key !== "string")) fail("MCP_FILE_REQUEST_INVALID");
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor)) fail("MCP_FILE_REQUEST_INVALID");
  }
  const value = input as Record<string, unknown>;
  if (
    value.tool === "READ_FILE_SCOPED" &&
    keys.includes("resourceId") &&
    typeof value.resourceId === "string" &&
    resourceIdPattern.test(value.resourceId)
  )
    return { tool: "READ_FILE_SCOPED", resourceId: value.resourceId };
  if (value.tool === "SEARCH_FILES_SCOPED" && keys.includes("query") && typeof value.query === "string") {
    const query = value.query.trim();
    if (query.length >= 1 && query.length <= 120 && !containsControl(query))
      return { tool: "SEARCH_FILES_SCOPED", query };
  }
  return fail("MCP_FILE_REQUEST_INVALID");
}

function safePart(part: string): boolean {
  return !!part && part !== "." && part !== ".." && !/[. ]$/u.test(part) && !/[:*?<>|]/u.test(part);
}

function validateRoot(root: unknown): string {
  if (
    typeof root !== "string" ||
    root.length > 4096 ||
    containsControl(root) ||
    !isAbsolute(root) ||
    /^[\\/]{2}/u.test(root) ||
    (process.platform === "win32" ? !/^[a-z]:[\\/]/iu.test(root) : root.includes("\\"))
  )
    return fail("MCP_FILE_BINDING_INVALID");
  const tail = root.slice(parse(root).root.length).replace(/[\\/]$/u, "");
  if (tail.length > 0 && tail.split(/[\\/]/u).some((part) => !safePart(part))) fail("MCP_FILE_BINDING_INVALID");
  return resolve(root);
}

function validateRelativePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1024 ||
    containsControl(value) ||
    isAbsolute(value) ||
    win32.isAbsolute(value) ||
    value.split(/[\\/]/u).some((part) => !safePart(part))
  )
    return fail("MCP_FILE_BINDING_INVALID");
  return value.split(/[\\/]/u).join(sep);
}

function within(root: string, path: string): boolean {
  const local = relative(root, path);
  return local !== "" && local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return (
    sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

type CheckedPath = { path: string; info: BigIntStats };

async function inspectPath(root: string, target: string, signal: AbortSignal): Promise<CheckedPath[]> {
  const volume = parse(target).root;
  const parts = target.slice(volume.length).split(sep);
  let candidate = volume;
  const paths = [volume];
  for (const part of parts) {
    candidate = resolve(candidate, part);
    paths.push(candidate);
  }
  const checked: CheckedPath[] = [];
  for (const path of paths) {
    checkAbort(signal);
    const info = await lstat(path, { bigint: true });
    checkAbort(signal);
    if (info.isSymbolicLink() || (path === target ? !info.isFile() || info.nlink !== 1n : !info.isDirectory()))
      fail("MCP_FILE_UNAVAILABLE");
    checked.push({ path, info });
  }
  const realRoot = await realpath(root);
  checkAbort(signal);
  const realTarget = await realpath(target);
  checkAbort(signal);
  if (relative(root, realRoot) !== "" || relative(target, realTarget) !== "" || !within(realRoot, realTarget))
    fail("MCP_FILE_UNAVAILABLE");
  return checked;
}

async function readText(root: string, relativePath: string, signal: AbortSignal): Promise<string> {
  checkAbort(signal);
  const target = resolve(root, relativePath);
  if (!within(root, target)) fail("MCP_FILE_UNAVAILABLE");
  const before = await inspectPath(root, target, signal);
  const initial = before[before.length - 1]?.info;
  if (!initial || initial.size > BigInt(MAX_BYTES)) fail("MCP_FILE_UNAVAILABLE");
  let handle: FileHandle | undefined;
  try {
    checkAbort(signal);
    handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    checkAbort(signal);
    const opened = await handle.stat({ bigint: true });
    checkAbort(signal);
    if (!opened.isFile() || !sameFile(initial, opened)) fail("MCP_FILE_UNAVAILABLE");
    // A fixed buffer and explicit offsets bound the read even when a file grows.
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      checkAbort(signal);
      const { bytesRead } = await handle.read(buffer, length, Math.min(8192, buffer.length - length), length);
      checkAbort(signal);
      length += bytesRead;
      if (bytesRead === 0) break;
    }
    if (length > MAX_BYTES || BigInt(length) !== opened.size) fail("MCP_FILE_UNAVAILABLE");
    const finished = await handle.stat({ bigint: true });
    checkAbort(signal);
    const after = await inspectPath(root, target, signal);
    const current = after[after.length - 1]?.info;
    if (
      !sameFile(opened, finished) ||
      !current ||
      !sameFile(opened, current) ||
      before.length !== after.length ||
      before.some((entry, index) => !after[index] || !sameIdentity(entry.info, after[index].info))
    )
      fail("MCP_FILE_UNAVAILABLE");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length));
    if ([...text].some((character) => !["\t", "\n", "\r"].includes(character) && containsControl(character)))
      fail("MCP_FILE_UNAVAILABLE");
    checkAbort(signal);
    return text;
  } finally {
    await handle?.close();
  }
}

/**
 * Explicit server-owned resource binding, with no directory discovery or paths
 * accepted from callers. The owner must protect root and its ancestors from
 * concurrent untrusted writes: portable Node cannot atomically open every
 * ancestor. Repeated identity/link checks also fail closed on observed changes.
 */
export function createMcpScopedFiles(binding: McpFileBinding) {
  const root = validateRoot(binding.root);
  if (
    typeof binding.workspaceId !== "string" ||
    !binding.workspaceId.trim() ||
    binding.workspaceId.length > 200 ||
    containsControl(binding.workspaceId) ||
    !Array.isArray(binding.resources) ||
    binding.resources.length < 1 ||
    binding.resources.length > MAX_RESOURCES
  )
    fail("MCP_FILE_BINDING_INVALID");
  const ids = new Set<string>();
  const resources = Object.freeze(
    Array.from(binding.resources).map((resource) => {
      if (
        !resource ||
        typeof resource.id !== "string" ||
        !resourceIdPattern.test(resource.id) ||
        ids.has(resource.id) ||
        typeof resource.name !== "string" ||
        !resource.name.trim() ||
        resource.name.length > 120 ||
        containsControl(resource.name)
      )
        fail("MCP_FILE_BINDING_INVALID");
      ids.add(resource.id);
      return Object.freeze({
        id: resource.id,
        name: resource.name.trim(),
        relativePath: validateRelativePath(resource.relativePath),
      });
    }),
  );
  return {
    catalog(): { id: string; name: string }[] {
      return resources.map(({ id, name }) => ({ id, name }));
    },
    async execute(input: McpFileRequest, signal: AbortSignal): Promise<unknown> {
      try {
        checkAbort(signal);
        const request = validateMcpFileRequest(input);
        if (request.tool === "READ_FILE_SCOPED") {
          const resource = resources.find(({ id }) => id === request.resourceId);
          if (!resource) fail("MCP_FILE_UNAVAILABLE");
          const text = await readText(root, resource.relativePath, signal);
          checkAbort(signal);
          return { tool: request.tool, untrusted: true, resourceId: resource.id, text };
        }
        const query = request.query.toLowerCase();
        const matches: { resourceId: string; line: number; excerpt: string }[] = [];
        for (const resource of resources) {
          checkAbort(signal);
          const text = await readText(root, resource.relativePath, signal);
          const lines = text.split(/\r\n|\r|\n/u);
          for (let index = 0; index < lines.length && matches.length < MAX_MATCHES; index++) {
            checkAbort(signal);
            const line = lines[index] ?? "";
            const position = line.toLowerCase().indexOf(query);
            if (position < 0) continue;
            const start = Math.max(0, position - 60);
            matches.push({ resourceId: resource.id, line: index + 1, excerpt: line.slice(start, start + MAX_EXCERPT) });
          }
          if (matches.length === MAX_MATCHES) break;
        }
        checkAbort(signal);
        return { tool: request.tool, untrusted: true, matches };
      } catch (error) {
        checkAbort(signal);
        if (error instanceof McpScopedFileError) throw error;
        return fail("MCP_FILE_UNAVAILABLE");
      }
    },
  };
}
