import { mkdir, mkdtemp, open, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerBuiltWeb } from "./built-web.js";

const apps: ReturnType<typeof Fastify>[] = [];
const fixtures: string[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const path of fixtures.splice(0)) {
    const absolute = resolve(path);
    if (!absolute.startsWith(`${resolve(tmpdir())}${sep}ida-built-web-`)) throw new Error("Unsafe fixture cleanup");
    await rm(absolute, { recursive: true, force: true });
  }
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "ida-built-web-"));
  fixtures.push(directory);
  const root = join(directory, "dist");
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "design", "reference"), { recursive: true });
  await writeFile(join(root, "index.html"), '<!doctype html><div id="root"></div>');
  await writeFile(join(root, "assets", "app-fingerprint.js"), 'document.title = "IDA";');
  await writeFile(join(root, "assets", "app-fingerprint.css"), "body{color:white}");
  await writeFile(join(root, "design", "reference", "ambiance.mp4"), "0123456789abcdef");
  await writeFile(join(root, "design", "reference", "image été.png"), "fixture-png");
  await writeFile(join(root, "manifest.webmanifest"), '{"name":"IDA"}');
  await writeFile(join(root, "apple-touch-icon.png"), "fixture-icon");
  const app = Fastify();
  apps.push(app);
  // Injection normalizes URL dot segments before routing. Preserve a synthetic
  // wire path for these cases without opening a real network listener.
  app.addHook("onRequest", async (request) => {
    const rawPath = request.headers["x-fixture-raw-path"];
    if (typeof rawPath === "string") request.raw.url = rawPath;
  });
  app.get("/v1/probe", () => ({ api: "unchanged" }));
  await registerBuiltWeb(app, { root });
  await app.ready();
  return { app, root, directory };
}

describe("built web delivery — explicit public assets only", () => {
  it("serves the built entry and assets with exact types and restrictive headers", async () => {
    const { app } = await fixture();
    const html = await app.inject("/");
    expect(html.statusCode).toBe(200);
    expect(html.body).toContain('<div id="root">');
    expect(html.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(html.headers["cache-control"]).toBe("no-store");
    expect(html.headers["x-content-type-options"]).toBe("nosniff");
    expect(html.headers["x-frame-options"]).toBe("DENY");
    expect(html.headers["referrer-policy"]).toBe("no-referrer");
    expect(html.headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(html.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(html.headers["content-security-policy"]).not.toMatch(/https?:|unsafe-eval|script-src[^;]*unsafe-inline/u);
    const javascript = await app.inject("/assets/app-fingerprint.js?v=1");
    expect(javascript.statusCode).toBe(200);
    expect(javascript.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(javascript.body).toBe('document.title = "IDA";');
    expect((await app.inject("/assets/app-fingerprint.css")).headers["content-type"]).toBe("text/css; charset=utf-8");
    expect((await app.inject("/design/reference/image%20%C3%A9t%C3%A9.png")).body).toBe("fixture-png");
    expect((await app.inject("/manifest.webmanifest")).headers["content-type"]).toBe(
      "application/manifest+json; charset=utf-8",
    );
    expect((await app.inject("/apple-touch-icon.png")).body).toBe("fixture-icon");
    expect((await app.inject("/index.html")).body).toBe(html.body);
  });

  it("does not replace API routes, API errors or unknown routes with HTML", async () => {
    const { app } = await fixture();
    expect((await app.inject("/v1/probe")).json()).toEqual({ api: "unchanged" });
    for (const url of ["/v1/missing", "/dashboard", "/src/main.tsx", "/package.json", "/README.md"])
      expect((await app.inject(url)).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/" })).statusCode).toBe(404);
  });

  it("never serves source maps, private files, executable design files or arbitrary root images", async () => {
    const { app, root } = await fixture();
    for (const [name, value] of [
      ["assets/app.js.map", "synthetic-source-map"],
      ["assets/settings.json", "synthetic-private-settings"],
      ["assets/.env", "synthetic-secret"],
      ["assets/ignored.ts", "synthetic-source"],
      ["design/script.js", "synthetic-script"],
      ["design/style.css", "synthetic-style"],
      ["private.png", "synthetic-private-image"],
    ] as const) {
      await writeFile(join(root, name), value);
      const response = await app.inject(`/${name}`);
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain(value);
    }
  });

  it.each([
    "/assets/../index.html",
    "/assets/%2e%2e/index.html",
    "/assets/%252e%252e/index.html",
    "/assets/..%5cindex.html",
    "/assets/%2e%2e%255cindex.html",
    "/assets/%2eprivate/file.png",
    "/assets/file.png%3Asecret",
    "/assets/folder%00/file.png",
    "/assets/folder./file.png",
    "/assets/folder%20/file.png",
    "/assets//file.png",
    "/assets/%zz.png",
    "/assets/C%3A/windows/file.png",
  ])("rejects ambiguous or escaping request %s", async (url) => {
    const { app, directory } = await fixture();
    const response = await app.inject({ url, headers: { "x-fixture-raw-path": url } });
    expect([400, 404]).toContain(response.statusCode);
    expect(response.body).not.toContain('<div id="root">');
    expect(response.body).not.toContain(directory);
  });

  it("denies directory symlink/junction escapes, including safe-looking extensions", async () => {
    const { app, root, directory } = await fixture();
    const outside = join(directory, "private");
    await mkdir(outside);
    await writeFile(join(outside, "not-public.png"), "synthetic-private-data");
    await symlink(outside, join(root, "design", "escape"), process.platform === "win32" ? "junction" : "dir");
    const response = await app.inject("/design/escape/not-public.png");
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("synthetic-private-data");
    expect(response.body).not.toContain(directory);
  });

  it("denies symlinks even when their target is inside the build", async () => {
    const { app, root } = await fixture();
    await symlink(
      join(root, "design", "reference"),
      join(root, "design", "alias"),
      process.platform === "win32" ? "junction" : "dir",
    );
    expect((await app.inject("/design/alias/ambiance.mp4")).statusCode).toBe(404);
  });

  it("refuses a directory with an allowed file extension", async () => {
    const { app, root } = await fixture();
    await mkdir(join(root, "design", "not-a-file.png"));
    expect((await app.inject("/design/not-a-file.png")).statusCode).toBe(404);
  });

  it("requires an explicit absolute build root with a regular index, not a symlink root", async () => {
    const { directory, root } = await fixture();
    const app = Fastify();
    apps.push(app);
    await expect(registerBuiltWeb(app, { root: "apps/web/dist" })).rejects.toThrow("absolute");
    await expect(registerBuiltWeb(app, { root: directory })).rejects.toThrow();
    const alias = join(directory, "linked-dist");
    await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
    await expect(registerBuiltWeb(app, { root: alias })).rejects.toThrow("Invalid frontend build root");
  });
});

describe("built web media — bounded streaming and single byte ranges", () => {
  it.each([
    ["bytes=0-3", "0123", "bytes 0-3/16"],
    ["bytes=4-", "456789abcdef", "bytes 4-15/16"],
    ["bytes=-4", "cdef", "bytes 12-15/16"],
    ["bytes=12-500", "cdef", "bytes 12-15/16"],
    ["bytes=-100", "0123456789abcdef", "bytes 0-15/16"],
  ])("streams %s as a 206 representation", async (range, body, contentRange) => {
    const { app } = await fixture();
    const response = await app.inject({ url: "/design/reference/ambiance.mp4", headers: { range } });
    expect(response.statusCode).toBe(206);
    expect(response.body).toBe(body);
    expect(response.headers["content-range"]).toBe(contentRange);
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-length"]).toBe(String(body.length));
    expect(response.headers["content-type"]).toBe("video/mp4");
  });

  it.each([
    "bytes=16-",
    "bytes=5-2",
    "bytes=-0",
    "bytes=-",
    "bytes=0-1,4-5",
    "items=0-1",
    "bytes=9007199254740993-",
    "bytes=0-9007199254740993",
    "bytes=1.5-3",
    "bytes=1-2 ",
  ])("rejects invalid, multiple or unsatisfiable %s", async (range) => {
    const { app } = await fixture();
    const response = await app.inject({ url: "/design/reference/ambiance.mp4", headers: { range } });
    expect(response.statusCode).toBe(416);
    expect(response.headers["content-range"]).toBe("bytes */16");
    expect(response.headers["content-length"]).toBe("0");
    expect(response.body).toBe("");
  });

  it("serves HEAD without a body and ignores Range on HEAD and unverified If-Range", async () => {
    const { app } = await fixture();
    const head = await app.inject({
      method: "HEAD",
      url: "/design/reference/ambiance.mp4",
      headers: { range: "bytes=1-2" },
    });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe("");
    expect(head.headers["content-length"]).toBe("16");
    expect(head.headers["content-range"]).toBeUndefined();
    const fallback = await app.inject({
      url: "/design/reference/ambiance.mp4",
      headers: { range: "bytes=1-2", "if-range": '"unverified"' },
    });
    expect(fallback.statusCode).toBe(200);
    expect(fallback.body).toBe("0123456789abcdef");
  });

  it("handles empty representations and reads only a selected tail of a larger asset", async () => {
    const { app, root } = await fixture();
    await writeFile(join(root, "design", "empty.mp4"), "");
    const empty = await app.inject("/design/empty.mp4");
    expect(empty.statusCode).toBe(200);
    expect(empty.body).toBe("");
    expect((await app.inject({ url: "/design/empty.mp4", headers: { range: "bytes=0-" } })).statusCode).toBe(416);
    const size = 8 * 1024 * 1024;
    const file = await open(join(root, "design", "large.mp4"), "w");
    await file.truncate(size);
    await file.write(Buffer.from("tail"), 0, 4, size - 4);
    await file.close();
    const tail = await app.inject({ url: "/design/large.mp4", headers: { range: "bytes=-4" } });
    expect(tail.statusCode).toBe(206);
    expect(tail.body).toBe("tail");
    expect(tail.headers["content-range"]).toBe(`bytes ${size - 4}-${size - 1}/${size}`);
  });
});
