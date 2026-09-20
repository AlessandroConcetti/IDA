import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMcpScopedFiles,
  type McpFileBinding,
  McpScopedFileError,
  validateMcpFileRequest,
} from "./mcp-scoped-files.js";

// Native ESM exports are immutable; keep real filesystem operations behind a
// Vitest module facade so race/cancellation tests can intercept one operation.
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
}));

const fixtures: string[] = [];
const signal = () => new AbortController().signal;
const read = { tool: "READ_FILE_SCOPED", resourceId: "notes" } as const;

afterEach(async () => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) {
    const absolute = resolve(fixture);
    if (!absolute.startsWith(`${resolve(tmpdir())}${sep}ida-mcp-files-`)) throw new Error("Unsafe fixture cleanup");
    await fs.rm(absolute, { recursive: true, force: true });
  }
});

async function fixture(content: string | Uint8Array = "Bonjour IDA\nUne ligne déclarée.\n") {
  const directory = await fs.mkdtemp(join(tmpdir(), "ida-mcp-files-"));
  fixtures.push(directory);
  const root = join(directory, "approved");
  await fs.mkdir(join(root, "docs"), { recursive: true });
  const target = join(root, "docs", "notes.txt");
  await fs.writeFile(target, content);
  const binding: McpFileBinding = {
    workspaceId: "workspace-fixture",
    root,
    resources: [{ id: "notes", name: "Notes", relativePath: "docs/notes.txt" }],
  };
  return { directory, root, target, binding, reader: createMcpScopedFiles(binding) };
}

async function expectUnavailable(promise: Promise<unknown>, forbidden = "") {
  const error: unknown = await promise.catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(McpScopedFileError);
  expect(error).toMatchObject({ code: "MCP_FILE_UNAVAILABLE" });
  if (forbidden) expect(JSON.stringify(error)).not.toContain(forbidden);
  expect((error as Error).message).not.toMatch(/ENOENT|EACCES|EPERM|[a-z]:[\\/]/iu);
  expect(error).not.toHaveProperty("cause");
}

describe("MCP scoped file requests", () => {
  it("accepts resource identifiers and trimmed literal queries", () => {
    expect(validateMcpFileRequest(read)).toEqual(read);
    expect(validateMcpFileRequest({ tool: "READ_FILE_SCOPED", resourceId: "a_2-3" })).toEqual({
      tool: "READ_FILE_SCOPED",
      resourceId: "a_2-3",
    });
    expect(validateMcpFileRequest({ tool: "SEARCH_FILES_SCOPED", query: "  (a.*b)[x]  " })).toEqual({
      tool: "SEARCH_FILES_SCOPED",
      query: "(a.*b)[x]",
    });
    expect(validateMcpFileRequest({ tool: "SEARCH_FILES_SCOPED", query: "q".repeat(120) })).toHaveProperty("query");
  });

  it.each([
    null,
    [],
    "READ_FILE_SCOPED",
    {},
    { tool: "READ_FILE_SCOPED" },
    { tool: "WRITE_FILE_SCOPED", resourceId: "notes" },
    { ...read, path: "docs/notes.txt" },
    { ...read, query: "notes" },
    { ...read, resourceId: "Notes" },
    { ...read, resourceId: "../notes" },
    { ...read, resourceId: "notes.txt" },
    { ...read, resourceId: "a".repeat(65) },
    { ...read, resourceId: "" },
    { ...read, resourceId: 123 },
    { tool: "SEARCH_FILES_SCOPED", query: "   " },
    { tool: "SEARCH_FILES_SCOPED", query: "q".repeat(121) },
    { tool: "SEARCH_FILES_SCOPED", query: "a\u0000b" },
    { tool: "SEARCH_FILES_SCOPED", query: "notes", root: "/private" },
  ])("rejects invalid requests and additional properties %#", (input) => {
    expect(() => validateMcpFileRequest(input)).toThrow(McpScopedFileError);
    try {
      validateMcpFileRequest(input);
    } catch (error) {
      expect(error).toMatchObject({ code: "MCP_FILE_REQUEST_INVALID" });
    }
  });

  it("rejects inherited fields, accessors and symbol properties", () => {
    const getter = vi.fn(() => "notes");
    const accessor = Object.defineProperty({ tool: "READ_FILE_SCOPED" }, "resourceId", { get: getter });
    for (const input of [Object.create(read), accessor, { ...read, [Symbol("extra")]: true }])
      expect(() => validateMcpFileRequest(input)).toThrow(McpScopedFileError);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("MCP approved resource binding", () => {
  it("exposes labels only and snapshots every binding field", async () => {
    const { binding, reader, root } = await fixture();
    const resource = binding.resources[0];
    if (!resource) throw new Error("Missing fixture resource");
    resource.id = "other";
    resource.name = "Changed";
    resource.relativePath = "../../private.txt";
    binding.root = "/other-root";
    binding.resources = [];
    const catalog = reader.catalog();
    expect(catalog).toEqual([{ id: "notes", name: "Notes" }]);
    if (catalog[0]) catalog[0].name = "Caller mutation";
    catalog.push({ id: "injected", name: "Injected" });
    expect(reader.catalog()).toEqual([{ id: "notes", name: "Notes" }]);
    const result = await reader.execute(read, signal());
    expect(result).toEqual({
      tool: "READ_FILE_SCOPED",
      untrusted: true,
      resourceId: "notes",
      text: "Bonjour IDA\nUne ligne déclarée.\n",
    });
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain("relativePath");
  });

  it.each([
    "../private.txt",
    "docs/../../private.txt",
    "docs\\..\\..\\private.txt",
    "./docs/notes.txt",
    "/private.txt",
    "\\private.txt",
    "C:\\private.txt",
    "C:private.txt",
    "//server/share/private.txt",
    "\\\\server\\share\\private.txt",
    "docs/notes.txt:secret",
    "docs\u0000/notes.txt",
    "docs//notes.txt",
    "docs./notes.txt",
    "docs /notes.txt",
  ])("rejects escaping or ambiguous configured relative paths %s", async (relativePath) => {
    const { binding } = await fixture();
    expect(() =>
      createMcpScopedFiles({ ...binding, resources: [{ id: "notes", name: "Notes", relativePath }] }),
    ).toThrow(McpScopedFileError);
  });

  it.each(["relative", "C:relative", "\\\\server\\share", "//server/share", "\\\\?\\C:\\folder", "/root\u0000"])(
    "rejects relative, UNC and device roots %s",
    async (root) => {
      const { binding } = await fixture();
      expect(() => createMcpScopedFiles({ ...binding, root })).toThrow(McpScopedFileError);
    },
  );

  it("limits resource count and rejects duplicate ids, empty labels and invalid workspace", async () => {
    const { binding } = await fixture();
    const resources = Array.from({ length: 16 }, (_, index) => ({
      id: `r${index}`,
      name: "Notes",
      relativePath: "docs/notes.txt",
    }));
    expect(createMcpScopedFiles({ ...binding, resources }).catalog()).toHaveLength(16);
    for (const candidate of [
      { ...binding, resources: [] },
      { ...binding, resources: [...resources, { id: "extra", name: "Extra", relativePath: "docs/notes.txt" }] },
      { ...binding, resources: [resources[0], resources[0]] },
      { ...binding, resources: [{ id: "notes", name: " ", relativePath: "docs/notes.txt" }] },
      { ...binding, workspaceId: " " },
    ])
      expect(() => createMcpScopedFiles(candidate as McpFileBinding)).toThrow(McpScopedFileError);
  });

  it("reads no undeclared file and never scans directories", async () => {
    const { root, reader } = await fixture();
    await fs.writeFile(join(root, "undeclared.txt"), "unique private marker");
    await expectUnavailable(reader.execute({ ...read, resourceId: "undeclared" }, signal()), "private marker");
    expect(await reader.execute({ tool: "SEARCH_FILES_SCOPED", query: "private marker" }, signal())).toEqual({
      tool: "SEARCH_FILES_SCOPED",
      untrusted: true,
      matches: [],
    });
  });
});

describe("MCP scoped filesystem checks", () => {
  it("accepts empty files and the exact UTF-8 byte limit", async () => {
    const { reader, target } = await fixture("");
    expect(await reader.execute(read, signal())).toMatchObject({ text: "" });
    const limit = "é".repeat(32768);
    await fs.writeFile(target, limit);
    expect(await reader.execute(read, signal())).toMatchObject({ text: limit });
    await fs.appendFile(target, "a");
    await expectUnavailable(reader.execute(read, signal()));
  });

  it.each([
    Buffer.from([0xc3, 0x28]),
    Buffer.from([0xff, 0xfe, 0x41, 0]),
    Buffer.from("text\u0000binary"),
    Buffer.from("text\u001bcontrol"),
  ])("rejects invalid UTF-8 and binary/control content %#", async (bytes) => {
    const { reader, directory } = await fixture(bytes);
    await expectUnavailable(reader.execute(read, signal()), directory);
  });

  it("masks missing files and directories without returning OS details", async () => {
    const { reader, directory, target } = await fixture();
    await fs.unlink(target);
    await expectUnavailable(reader.execute(read, signal()), directory);
    await fs.mkdir(target);
    await expectUnavailable(reader.execute(read, signal()), directory);
  });

  it("refuses hard links, even for a declared resource", async () => {
    const { directory, target, reader } = await fixture();
    await fs.link(target, join(directory, "alias.txt"));
    await expectUnavailable(reader.execute(read, signal()), directory);
  });

  it.each(["inside", "outside"])("refuses directory symlinks/junctions targeting %s the root", async (location) => {
    const { directory, root, binding } = await fixture();
    const destination = location === "inside" ? join(root, "docs") : join(directory, "private");
    if (location === "outside") {
      await fs.mkdir(destination);
      await fs.writeFile(join(destination, "notes.txt"), "private marker");
    }
    await fs.symlink(destination, join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
    const reader = createMcpScopedFiles({
      ...binding,
      resources: [{ id: "notes", name: "Notes", relativePath: "alias/notes.txt" }],
    });
    await expectUnavailable(reader.execute(read, signal()), "private marker");
  });

  it("refuses a symlink/junction root and a symlink/junction in root ancestors", async () => {
    const { directory, root, binding } = await fixture();
    const rootAlias = join(directory, "root-alias");
    await fs.symlink(root, rootAlias, process.platform === "win32" ? "junction" : "dir");
    const aliased = createMcpScopedFiles({ ...binding, root: rootAlias });
    await expectUnavailable(aliased.execute(read, signal()));
    const parentAlias = join(directory, "parent-alias");
    await fs.symlink(root, parentAlias, process.platform === "win32" ? "junction" : "dir");
    const throughAncestor = createMcpScopedFiles({
      ...binding,
      root: join(parentAlias, "docs"),
      resources: [{ id: "notes", name: "Notes", relativePath: "notes.txt" }],
    });
    await expectUnavailable(throughAncestor.execute(read, signal()));
  });

  it("detects a file modified between validation and opening", async () => {
    const { reader, target } = await fixture();
    const originalOpen = fs.open;
    vi.spyOn(fs, "open").mockImplementationOnce(async (...args) => {
      const handle = await originalOpen(...args);
      await fs.appendFile(target, "concurrent change");
      return handle;
    });
    await expectUnavailable(reader.execute(read, signal()));
  });

  it("detects an ancestor replaced with an outside junction after validation", async () => {
    const { reader, directory, root } = await fixture();
    const outside = join(directory, "private");
    await fs.mkdir(outside);
    await fs.writeFile(join(outside, "notes.txt"), "outside marker");
    const originalOpen = fs.open;
    vi.spyOn(fs, "open").mockImplementationOnce(async (...args) => {
      await fs.rename(join(root, "docs"), join(root, "old-docs"));
      await fs.symlink(outside, join(root, "docs"), process.platform === "win32" ? "junction" : "dir");
      return originalOpen(...args);
    });
    await expectUnavailable(reader.execute(read, signal()), "outside marker");
  });
});

describe("MCP bounded search and cancellation", () => {
  it("searches literal text case-insensitively with one-based line numbers", async () => {
    const { reader } = await fixture("Bonjour\r\nIDA [a.*b]\rAutre IDA\n");
    expect(await reader.execute({ tool: "SEARCH_FILES_SCOPED", query: " ida " }, signal())).toEqual({
      tool: "SEARCH_FILES_SCOPED",
      untrusted: true,
      matches: [
        { resourceId: "notes", line: 2, excerpt: "IDA [a.*b]" },
        { resourceId: "notes", line: 3, excerpt: "Autre IDA" },
      ],
    });
    expect(await reader.execute({ tool: "SEARCH_FILES_SCOPED", query: "[a.*b]" }, signal())).toMatchObject({
      matches: [{ line: 2 }],
    });
    expect(await reader.execute({ tool: "SEARCH_FILES_SCOPED", query: "I.A" }, signal())).toMatchObject({
      matches: [],
    });
  });

  it("bounds matches across all resources and excerpts around matching text", async () => {
    const line = `${"a".repeat(500)}MATCH${"b".repeat(500)}`;
    const { binding } = await fixture(Array.from({ length: 12 }, () => line).join("\n"));
    const reader = createMcpScopedFiles({
      ...binding,
      resources: [...binding.resources, { id: "second", name: "Second", relativePath: "docs/notes.txt" }],
    });
    const result = (await reader.execute({ tool: "SEARCH_FILES_SCOPED", query: "match" }, signal())) as {
      matches: { resourceId: string; excerpt: string }[];
    };
    expect(result.matches).toHaveLength(20);
    expect(result.matches.filter(({ resourceId }) => resourceId === "notes")).toHaveLength(12);
    for (const { excerpt } of result.matches) {
      expect(excerpt.length).toBeLessThanOrEqual(240);
      expect(excerpt).toContain("MATCH");
    }
  });

  it("fails closed on an unavailable search resource", async () => {
    const { binding } = await fixture("IDA");
    const reader = createMcpScopedFiles({
      ...binding,
      resources: [...binding.resources, { id: "missing", name: "Missing", relativePath: "missing.txt" }],
    });
    await expectUnavailable(reader.execute({ tool: "SEARCH_FILES_SCOPED", query: "IDA" }, signal()));
  });

  it("honors pre-existing aborts without filesystem access or exposing the reason", async () => {
    const { reader } = await fixture();
    const lstat = vi.spyOn(fs, "lstat");
    const controller = new AbortController();
    controller.abort(new Error("private abort reason"));
    const error: unknown = await reader.execute(read, controller.signal).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: "MCP_FILE_ABORTED" });
    expect((error as Error).message).not.toContain("private abort reason");
    expect(lstat).not.toHaveBeenCalled();
  });

  it("honors cancellation after opening and closes the file", async () => {
    const { reader } = await fixture();
    const controller = new AbortController();
    const originalOpen = fs.open;
    const close = vi.fn();
    vi.spyOn(fs, "open").mockImplementationOnce(async (...args) => {
      const handle = await originalOpen(...args);
      const originalClose = handle.close.bind(handle);
      vi.spyOn(handle, "close").mockImplementation(async () => {
        close();
        await originalClose();
      });
      controller.abort();
      return handle;
    });
    await expect(reader.execute(read, controller.signal)).rejects.toMatchObject({ code: "MCP_FILE_ABORTED" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("snapshots the request before asynchronous reads", async () => {
    const { reader } = await fixture();
    const request = { tool: "SEARCH_FILES_SCOPED", query: "IDA" } as const;
    const pending = reader.execute(request, signal());
    Object.assign(request, { query: "absent" });
    expect(await pending).toMatchObject({ matches: [{ resourceId: "notes", line: 1 }] });
  });
});
