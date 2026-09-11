import { constants } from "node:fs";
import { type FileHandle, lstat, open, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const assetTypes: Readonly<Record<string, string>> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const rootTypes: Readonly<Record<string, string>> = {
  "index.html": "text/html; charset=utf-8",
  "manifest.webmanifest": "application/manifest+json; charset=utf-8",
  "icon.svg": "image/svg+xml",
  "icon-192.png": "image/png",
  "icon-512.png": "image/png",
  "apple-touch-icon.png": "image/png",
  "favicon.ico": "image/x-icon",
};

const builtWebCsp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

function secureHeaders(reply: FastifyReply) {
  reply.headers({
    "Content-Security-Policy": builtWebCsp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self), display-capture=()",
    "Cache-Control": "no-store",
  });
}

function requestedFile(rawUrl: string): { name: string; type: string } | null {
  const rawPath = rawUrl.split("?", 1)[0] ?? "";
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) return null;
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  // Reject ambiguous re-encoding, Windows separators/ADS, hidden components and
  // dot traversal before resolving a path. Query parameters never name files.
  if (
    /[\\%:#]/u.test(path) ||
    [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return null;
  if (path === "/") return { name: "index.html", type: rootTypes["index.html"] as string };
  const parts = path.slice(1).split("/");
  if (parts.some((part) => !part || part.startsWith(".") || /[. ]$/u.test(part))) return null;
  const name = parts.join("/");
  if (parts.length === 1) {
    const type = Object.hasOwn(rootTypes, name) ? rootTypes[name] : undefined;
    return type ? { name, type } : null;
  }
  if (parts[0] !== "assets" && parts[0] !== "design") return null;
  const extension = extname(name).toLowerCase();
  // The design tree is presentation media, never executable JavaScript/CSS.
  if (parts[0] === "design" && [".js", ".css"].includes(extension)) return null;
  const type = Object.hasOwn(assetTypes, extension) ? assetTypes[extension] : undefined;
  return type ? { name, type } : null;
}

function isWithin(root: string, candidate: string) {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function openBuiltFile(root: string, name: string): Promise<FileHandle> {
  const parts = name.split("/");
  const target = resolve(root, name);
  let candidate = root;
  for (const part of parts) {
    candidate = resolve(candidate, part);
    if (!isWithin(root, candidate)) throw new Error("Unavailable build asset");
    const information = await lstat(candidate);
    if (information.isSymbolicLink()) throw new Error("Unavailable build asset");
    if (candidate === target ? !information.isFile() : !information.isDirectory())
      throw new Error("Unavailable build asset");
  }
  const resolved = await realpath(candidate);
  if (!isWithin(root, resolved)) throw new Error("Unavailable build asset");
  const handle = await open(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const [opened, current, checkedPath] = await Promise.all([handle.stat(), lstat(candidate), realpath(candidate)]);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      opened.dev !== current.dev ||
      opened.ino !== current.ino ||
      !isWithin(root, checkedPath) ||
      checkedPath !== resolved ||
      !Number.isSafeInteger(opened.size)
    )
      throw new Error("Unavailable build asset");
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

function singleRange(value: string, size: number): { start: number; end: number } | null {
  if (value.length > 100 || size === 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  if (first === null) {
    if (last === null || last <= 0) return null;
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (last !== null && last < first)) return null;
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}

/**
 * Opt-in delivery of a trusted, immutable frontend build. This does not open a
 * listener, authenticate a device, change API routes or enable network access.
 * Never point root at a repository, private storage or an upload directory.
 * The deployment owner must prevent concurrent untrusted writes to this tree;
 * Node's portable filesystem API cannot make every ancestor lookup atomic.
 */
export async function registerBuiltWeb(app: FastifyInstance, options: { root: string }): Promise<void> {
  if (!isAbsolute(options.root)) throw new Error("An absolute frontend build root is required");
  const originalRoot = resolve(options.root);
  const rootInfo = await lstat(originalRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("Invalid frontend build root");
  const root = await realpath(originalRoot);
  const index = await openBuiltFile(root, "index.html");
  await index.close();

  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    secureHeaders(reply);
    const selected = requestedFile(request.raw.url ?? "");
    if (!selected) return reply.code(404).send({ error: { code: "BUILT_ASSET_NOT_FOUND" } });
    let file: FileHandle | undefined;
    try {
      file = await openBuiltFile(root, selected.name);
      const { size } = await file.stat();
      reply.header("Content-Type", selected.type);
      reply.header("Accept-Ranges", "bytes");
      // Range applies only to GET. Without a matching representation validator,
      // If-Range conservatively falls back to the complete representation.
      const rangeHeader = request.method === "GET" && !request.headers["if-range"] ? request.headers.range : undefined;
      const range = typeof rangeHeader === "string" ? singleRange(rangeHeader, size) : undefined;
      if (rangeHeader !== undefined && (!range || Array.isArray(rangeHeader))) {
        await file.close();
        file = undefined;
        return reply.code(416).header("Content-Range", `bytes */${size}`).header("Content-Length", "0").send();
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? size - 1;
      reply.header("Content-Length", range ? end - start + 1 : size);
      if (range) reply.code(206).header("Content-Range", `bytes ${start}-${end}/${size}`);
      if (request.method === "HEAD" || size === 0) {
        await file.close();
        file = undefined;
        return reply.send();
      }
      const stream = file.createReadStream({ start, end, autoClose: true });
      file = undefined;
      request.raw.once("aborted", () => stream.destroy());
      reply.raw.once("close", () => stream.destroy());
      return reply.send(stream);
    } catch {
      await file?.close();
      reply.removeHeader("Content-Length");
      reply.removeHeader("Content-Range");
      return reply
        .code(404)
        .type("application/json")
        .send({ error: { code: "BUILT_ASSET_NOT_FOUND" } });
    }
  };

  for (const url of ["/", ...Object.keys(rootTypes).map((name) => `/${name}`), "/assets/*", "/design/*"])
    app.route({ method: ["GET", "HEAD"], url, handler });
}
