import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { assertLocalOnlyHost, resolveLocalWebOrigin } from "./runtime-config.js";

describe("built frontend + Core — loopback remains locked", () => {
  let app: FastifyInstance;
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "ida-built-core-"));
    const root = join(directory, "dist");
    await mkdir(root);
    await writeFile(join(root, "index.html"), "<!doctype html><title>IDA fixture</title>");
    app = await createApp({
      dataDir: join(directory, "database"),
      storageDir: join(directory, "media"),
      identityMode: "LOCAL_LOCK",
      localBuiltWeb: { root, origin: "http://127.0.0.1:8787" },
    });
  }, 30_000);
  afterAll(async () => {
    await app?.close();
    if (directory) {
      const target = resolve(directory);
      if (!target.startsWith(`${resolve(tmpdir())}${sep}ida-built-core-`)) throw new Error("Unsafe fixture cleanup");
      await rm(target, { recursive: true, force: true });
    }
  });
  it("serves the public shell but not private API content", async () => {
    expect((await app.inject("/")).statusCode).toBe(200);
    const denied = await app.inject({ url: "/v1/me", headers: { host: "127.0.0.1:8787" } });
    expect(denied.statusCode).toBe(401);
    expect(denied.headers["cache-control"]).toBe("no-store");
    expect(denied.headers["content-type"]).toContain("application/json");
  });
  it.each(["http://127.0.0.1:8787", "http://127.0.0.1:5173"])(
    "accepts the exact local origin %s without granting authentication",
    async (origin) => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/unlock",
        headers: { host: "127.0.0.1:8787", origin, "sec-fetch-site": "same-origin" },
        payload: {},
      });
      // Strict input error proves the boundary passed, not authentication.
      expect(response.statusCode).toBe(400);
      expect(response.headers["set-cookie"]).toBeUndefined();
    },
  );
  it.each([
    { host: "192.168.1.15:8787", origin: "http://127.0.0.1:8787" },
    { host: "127.0.0.1:8787", origin: "http://192.168.1.15:8787" },
    { host: "127.0.0.1:8787", origin: "https://ida.example" },
    { host: "127.0.0.1:8787", origin: "http://127.0.0.1:8788" },
    { host: "127.0.0.1:8787", origin: "http://127.0.0.1:8787", "sec-fetch-site": "cross-site" },
  ])("rejects network or foreign-origin mutations %#", async (headers) => {
    const result = await app.inject({ method: "POST", url: "/v1/auth/lock", headers });
    expect(result.statusCode).toBe(403);
    expect(result.headers["set-cookie"]).toBeUndefined();
  });
});

describe("explicit local web origin", () => {
  it.each(["http://127.0.0.1:8787", "http://localhost:8787", "http://[::1]:8787"])("accepts %s", (origin) => {
    expect(resolveLocalWebOrigin(origin)).toBe(origin);
  });
  it.each([
    "http://192.168.1.15:8787",
    "https://ida.example",
    "https://localhost:8787",
    "*",
    "null",
    "http://127.0.0.1:8787/",
    "http://127.0.0.1:8787/path",
    "http://127.0.0.1:8787?next=bad",
    "http://user@127.0.0.1:8787",
    "http://127.1:8787",
    "http://127.0.0.1.example:8787",
  ])("does not turn local config into remote authorization: %s", (origin) => {
    expect(() => resolveLocalWebOrigin(origin)).toThrow();
  });
  it.each(["0.0.0.0", "::", "192.168.1.15"])("still refuses listening on %s", (host) => {
    expect(() => assertLocalOnlyHost(host)).toThrow();
  });
});
