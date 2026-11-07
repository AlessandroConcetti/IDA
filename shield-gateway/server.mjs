import http from "node:http";
import { createHash } from "node:crypto";

const PORT = Number(process.env.PORT || 10000);
const PREVIEW_HOST = process.env.SHIELD_PREVIEW_HOST || "ida-shield-preview.onrender.com";
const UPSTREAM = process.env.SHIELD_UPSTREAM || "https://ida-studio-showroom-static.onrender.com";
const MAX_BODY = 1024 * 1024;
const TIMEOUT_MS = 12000;
const BLOCKED_PATHS = [/^\/\.env(?:\/|$)/i, /^\/\.git(?:\/|$)/i, /^\/wp-admin(?:\/|$)/i, /^\/server-status(?:\/|$)/i];
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const target = new URL(UPSTREAM);
if (target.protocol !== "https:" || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
  throw new Error("IDA Shield: invalid upstream");
}
if (!["ida-studio-showroom-static.onrender.com"].includes(target.hostname)) {
  throw new Error("IDA Shield: upstream not allowlisted");
}
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const host = String(req.headers.host || "").toLowerCase();
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
  const deny = (code, reason) => {
    res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(reason);
  };
  if (host !== PREVIEW_HOST) return deny(421, "Unknown host");
  if (req.url === "/__ida_shield/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "preview", enforcement: false, version: "0.1" }));
  }
  if (!SAFE_METHODS.has(req.method)) return deny(405, "Method not allowed");
  if (req.headers["content-length"] && Number(req.headers["content-length"]) > MAX_BODY) return deny(413, "Request too large");
  if (req.headers["transfer-encoding"]) return deny(400, "Unsupported request encoding");
  let pathname;
  try {
    const u = new URL(req.url || "/", "https://" + PREVIEW_HOST);
    pathname = decodeURIComponent(u.pathname);
    if (pathname.includes("\\") || pathname.includes("\0")) return deny(400, "Invalid path");
  } catch {
    return deny(400, "Invalid URL");
  }
  if (BLOCKED_PATHS.some((p) => p.test(pathname))) return deny(403, "Forbidden");
  const url = new URL(req.url || "/", target);
  if (url.origin !== target.origin) return deny(400, "Invalid destination");
  try {
    const response = await fetch(url, {
      method: req.method,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "accept": String(req.headers.accept || "*/*"), "accept-language": String(req.headers["accept-language"] || "") },
    });
    const responseHeaders = {};
    for (const key of ["content-type", "cache-control", "etag", "last-modified", "location", "content-security-policy"]) {
      const val = response.headers.get(key);
      if (val) responseHeaders[key] = val;
    }
    // Preview is intentionally uncached; never forward upstream cookies or credentials.
    responseHeaders["cache-control"] = "no-store";
    res.writeHead(response.status, responseHeaders);
    if (req.method === "HEAD" || !response.body) return res.end();
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > 8 * 1024 * 1024) return res.destroy();
    res.end(body);
  } catch {
    deny(502, "Upstream unavailable");
  } finally {
    console.info(JSON.stringify({ event: "shield_request", path: pathname, method: req.method, status: res.statusCode, ms: Date.now() - started, request_id: createHash("sha256").update(String(started) + Math.random()).digest("hex").slice(0, 12) }));
  }
});
server.requestTimeout = TIMEOUT_MS + 3000;
server.headersTimeout = 10000;
server.listen(PORT, "0.0.0.0", () => console.log("IDA Shield preview listening on " + PORT));
