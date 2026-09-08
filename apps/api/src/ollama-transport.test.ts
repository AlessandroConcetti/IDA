import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaAdapter } from "./ai-adapters.js";
import { OllamaLoopbackTransport, type OllamaTransportConfig } from "./ollama-transport.js";

const pin = { name: "ida-test:small", digest: "a".repeat(64) };
const installed = { ...pin, model: pin.name, size: 1024 };
const reply = { done: true, done_reason: "stop", message: { role: "assistant", content: "Proposition synthétique" } };
const signal = () => new AbortController().signal;
function body() {
  return {
    model: pin.name,
    messages: [{ role: "user", content: "Texte synthétique" }],
    stream: false,
    tools: [],
    options: { num_predict: 100 },
    keep_alive: 0,
  };
}
function serializedBody(contextTokens = 4096) {
  return { ...body(), options: { num_predict: 100, num_ctx: contextTokens } };
}
function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function json(response: ServerResponse, value: unknown) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}
const servers: { server: Server; sockets: Set<Socket> }[] = [];
const transports: OllamaLoopbackTransport[] = [];
async function fixture(handler?: (request: IncomingMessage, response: ServerResponse) => void) {
  const calls: {
    path: string | undefined;
    method: string | undefined;
    body: string;
    headers: IncomingMessage["headers"];
  }[] = [];
  const sockets = new Set<Socket>();
  let connections = 0;
  const server = createServer(async (request, response) => {
    try {
      let data = "";
      for await (const chunk of request) data += chunk.toString();
      calls.push({ path: request.url, method: request.method, body: data, headers: request.headers });
      if (handler) handler(request, response);
      else json(response, request.url === "/api/tags" ? { models: [installed] } : reply);
    } catch {
      response.destroy();
    }
  });
  server.on("connection", (socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  servers.push({ server, sockets });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test fixture did not bind loopback");
  return {
    port: address.port,
    calls,
    get connections() {
      return connections;
    },
  };
}
function transport(port: number, overrides: OllamaTransportConfig = {}) {
  const result = new OllamaLoopbackTransport({
    enabled: true,
    localOnlyDeploymentApproved: true,
    port,
    models: [pin],
    ...overrides,
  });
  transports.push(result);
  return result;
}
afterEach(async () => {
  for (const item of transports.splice(0)) item.dispose();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      ({ server, sockets }) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          for (const socket of sockets) socket.destroy();
        }),
    ),
  );
});

describe("Ollama loopback transport, isolated HTTP fixtures only", () => {
  it("sets a reviewed server context window and preserves canonical uppercase quantization tags", async () => {
    const model = { ...pin, name: "qwen3:4b-instruct-2507-q4_K_M" };
    const f = await fixture((request, response) =>
      json(response, request.url === "/api/tags" ? { models: [{ ...model, model: model.name, size: 1024 }] } : reply),
    );
    const t = transport(f.port, { models: [model], contextTokens: 2048 });
    await t.post("/api/chat", { ...body(), model: model.name }, signal());
    expect(JSON.parse(f.calls[1]?.body ?? "{}")).toEqual({ ...serializedBody(2048), model: model.name });
  });
  it("composes the existing adapter over real HTTP, inventory before prompt, with no extra identity or tools", async () => {
    const f = await fixture();
    const result = await new OllamaAdapter("ollama", transport(f.port)).generate({
      modelId: pin.name,
      prompt: "Texte synthétique",
      maxOutputTokens: 100,
      signal: signal(),
    });
    expect(result).toEqual({ text: "Proposition synthétique" });
    expect(f.calls.map((call) => [call.method, call.path])).toEqual([
      ["GET", "/api/tags"],
      ["POST", "/api/chat"],
    ]);
    expect(f.calls[0]?.body).toBe("");
    expect(JSON.parse(f.calls[1]?.body ?? "{}")).toEqual(serializedBody());
    expect(f.calls[1]?.headers.authorization).toBeUndefined();
    expect(f.calls[1]?.headers.cookie).toBeUndefined();
    expect(f.calls[1]?.headers.connection).toBe("close");
  });
  it.each([{ enabled: false }, { localOnlyDeploymentApproved: false }])(
    "denies disabled/unreviewed deployment before any socket: %j",
    async (config) => {
      const f = await fixture();
      const t = transport(f.port, config);
      await expect(t.post("/api/chat", body(), signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(t.inspectInstalledModels(signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.calls).toHaveLength(0);
      expect(f.connections).toBe(0);
    },
  );
  it("has no automatic activation by default or inventory-based model approval", async () => {
    const f = await fixture();
    await expect(new OllamaLoopbackTransport().inspectInstalledModels(signal())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const t = transport(f.port, { models: [] });
    expect(await t.inspectInstalledModels(signal())).toEqual([{ ...pin, size: 1024 }]);
    await expect(t.post("/api/chat", body(), signal())).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(f.calls).toHaveLength(1);
  });
  it.each([
    { port: 0 },
    { port: null },
    { port: 65536 },
    { port: 1.5 },
    { timeoutMs: 0 },
    { timeoutMs: null },
    { contextTokens: null },
    { contextTokens: 511 },
    { contextTokens: 8193 },
    { contextTokens: 1.5 },
    { timeoutMs: 120001 },
    { enabled: "true" },
    { localOnlyDeploymentApproved: "true" },
    { baseUrl: "http://example.invalid" },
    { models: [pin, pin] },
    { models: [{ ...pin, digest: "short" }] },
    ...[
      "local",
      "local:cloud",
      "local:large-cloud",
      "https://example.invalid/x",
      "hf.co/team/model:small",
      "../local:small",
    ].map((name) => ({ models: [{ ...pin, name }] })),
  ])("rejects malformed server configuration: %j", (config) => {
    expect(() => new OllamaLoopbackTransport(config as OllamaTransportConfig)).toThrow(
      "IDA intelligence: CONFIGURATION_INVALID",
    );
  });
  it.each([
    "/api/pull",
    "/api/create",
    "/api/delete",
    "/api/chat?model=x",
    "http://example.invalid/api/chat",
    "//example.invalid",
    "/v1/responses",
  ])("refuses non-allowlisted path %s without opening a socket", async (path) => {
    const f = await fixture();
    await expect(transport(f.port).post(path, body(), signal())).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(f.calls).toHaveLength(0);
    expect(f.connections).toBe(0);
  });
  it.each([
    { model: "other:small" },
    { model: "local:cloud" },
    { stream: true },
    { keep_alive: "5m" },
    { tools: [{ function: { name: "publish_post" } }] },
    { format: "json" },
    { messages: [{ role: "system", content: "SYNTHETIC" }] },
    { messages: [{ role: "user", content: "SYNTHETIC", images: ["SYNTHETIC"] }] },
    { messages: [{ role: "user", content: "x".repeat(32001) }] },
    { options: { num_predict: -1 } },
    { options: { num_predict: 8193 } },
    { options: { num_predict: 1, num_ctx: 999999 } },
  ])("strictly validates request fields before inventory: %j", async (patch) => {
    const f = await fixture();
    await expect(transport(f.port).post("/api/chat", { ...body(), ...patch }, signal())).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(f.calls).toHaveLength(0);
    expect(f.connections).toBe(0);
  });
  it("snapshots both model pins and the prompt before the first await", async () => {
    const seen = deferred();
    let release: () => void = () => {};
    const f = await fixture((request, response) => {
      if (request.url === "/api/tags") {
        release = () => json(response, { models: [installed] });
        seen.resolve();
      } else json(response, reply);
    });
    const mutablePin = { ...pin };
    const t = transport(f.port, { models: [mutablePin] });
    mutablePin.digest = "b".repeat(64);
    const request = body();
    const pending = t.post("/api/chat", request, signal());
    await seen.promise;
    request.model = "other:small";
    request.messages[0] = { role: "user", content: "CHANGED" };
    release();
    await pending;
    expect(JSON.parse(f.calls[1]?.body ?? "{}")).toEqual(serializedBody());
  });
  it.each([
    { models: [], code: "NO_COMPATIBLE_MODEL" },
    { models: [{ ...installed, digest: "b".repeat(64) }], code: "NO_COMPATIBLE_MODEL" },
    { models: [installed, installed], code: "INVALID_RESPONSE" },
    { models: [{ ...installed, remote_host: "https://example.invalid" }], code: "INVALID_RESPONSE" },
    { models: [{ ...installed, remote_model: "remote" }], code: "INVALID_RESPONSE" },
    { models: [{ ...installed, model: "other:small" }], code: "INVALID_RESPONSE" },
    { models: [{ ...installed, size: 0 }], code: "INVALID_RESPONSE" },
    { models: [{ ...installed, digest: "invalid" }], code: "INVALID_RESPONSE" },
    { models: [{ ...installed, name: "local:cloud" }], code: "NO_COMPATIBLE_MODEL" },
  ])("never sends a prompt for absent, changed, duplicate or remote models", async ({ models, code }) => {
    const f = await fixture((_request, response) => json(response, { models }));
    await expect(transport(f.port).post("/api/chat", body(), signal())).rejects.toMatchObject({ code });
    expect(f.calls.map((call) => call.path)).toEqual(["/api/tags"]);
  });
  it("projects only inventory metadata and excludes unsupported/cloud model identifiers", async () => {
    const f = await fixture((_request, response) =>
      json(response, {
        models: [
          { ...installed, details: { prompt: "SYNTHETIC_PRIVATE" } },
          { ...installed, name: "other:cloud" },
          { ...installed, name: "hf.co/team/model:small" },
        ],
      }),
    );
    expect(await transport(f.port).inspectInstalledModels(signal())).toEqual([{ ...pin, size: 1024 }]);
  });
  it.each(["inventory", "chat"])("ignores proxy variables and never follows a redirect during %s", async (phase) => {
    const target = await fixture();
    const targetUrl = `http://127.0.0.1:${target.port}`;
    vi.stubEnv("HTTP_PROXY", targetUrl);
    vi.stubEnv("HTTPS_PROXY", targetUrl);
    vi.stubEnv("ALL_PROXY", targetUrl);
    vi.stubEnv("NODE_USE_ENV_PROXY", "1");
    const f = await fixture((request, response) => {
      if (phase === "chat" && request.url === "/api/tags") json(response, { models: [installed] });
      else {
        response.writeHead(307, { location: `${targetUrl}/capture` });
        response.end("SYNTHETIC_PRIVATE");
      }
    });
    await expect(transport(f.port).post("/api/chat", body(), signal())).rejects.toThrow(
      "IDA intelligence: INVALID_RESPONSE",
    );
    expect(target.calls).toHaveLength(0);
    expect(target.connections).toBe(0);
    expect(f.calls).toHaveLength(phase === "chat" ? 2 : 1);
  });
  it.each([401, 403, 429, 503])("discards status %i error bodies and headers", async (status) => {
    const f = await fixture((request, response) => {
      if (request.url === "/api/tags") json(response, { models: [installed] });
      else {
        response.writeHead(status, { "x-private": "SYNTHETIC_PRIVATE" });
        response.end("SYNTHETIC_PRIVATE");
      }
    });
    expect(await transport(f.port).post("/api/chat", body(), signal())).toEqual({ status, body: null });
  });
  it.each(["invalid-json", "utf8", "html", "gzip", "content-length", "chunked", "truncated", "upgrade", "model-count"])(
    "rejects unsafe or incomplete responses: %s",
    async (variant) => {
      const f = await fixture((_request, response) => {
        if (variant === "upgrade") {
          response.writeHead(101, { connection: "Upgrade", upgrade: "websocket" });
          response.end();
          return;
        }
        response.setHeader("content-type", variant === "html" ? "text/html" : "application/json");
        if (variant === "gzip") response.setHeader("content-encoding", "gzip");
        const valid = JSON.stringify({ models: [installed] });
        const oversized = JSON.stringify({ models: [installed], ignored: "x".repeat(512 * 1024) });
        if (variant === "content-length") response.setHeader("content-length", Buffer.byteLength(oversized));
        if (variant === "truncated") {
          response.setHeader("content-length", 200);
          response.write("{");
          response.flushHeaders();
          response.end();
          return;
        }
        if (variant === "chunked") {
          response.write(oversized.slice(0, 300 * 1024));
          response.end(oversized.slice(300 * 1024));
        } else if (variant === "model-count") {
          response.end(
            JSON.stringify({
              models: Array.from({ length: 129 }, (_, index) => ({
                ...installed,
                name: `ida-test:model-${index}`,
                model: `ida-test:model-${index}`,
              })),
            }),
          );
        } else if (variant === "utf8") {
          response.end(
            Buffer.concat([Buffer.from(`${valid.slice(0, -1)},"ignored":"`), Buffer.from([0xff]), Buffer.from('"}')]),
          );
        } else if (variant === "content-length") response.end(oversized);
        else response.end(variant === "invalid-json" ? "SYNTHETIC_PRIVATE" : valid);
      });
      await expect(transport(f.port, { timeoutMs: 1000 }).inspectInstalledModels(signal())).rejects.toThrow(
        "IDA intelligence: INVALID_RESPONSE",
      );
    },
  );
  it("denies an already aborted operation without opening a socket", async () => {
    const f = await fixture();
    const controller = new AbortController();
    controller.abort("SYNTHETIC_PRIVATE");
    await expect(transport(f.port).post("/api/chat", body(), controller.signal)).rejects.toThrow(
      "IDA intelligence: CANCELLED",
    );
    expect(f.calls).toHaveLength(0);
    expect(f.connections).toBe(0);
  });
  it.each(["inventory", "chat"])("cancels %s, closes its socket and releases the capacity slot", async (phase) => {
    const seen = deferred();
    const closed = deferred();
    let hold = true;
    const f = await fixture((request, response) => {
      const selected = phase === "inventory" ? "/api/tags" : "/api/chat";
      if (hold && request.url === selected) {
        response.on("close", closed.resolve);
        seen.resolve();
      } else json(response, request.url === "/api/tags" ? { models: [installed] } : reply);
    });
    const t = transport(f.port);
    const controller = new AbortController();
    const pending = t.post("/api/chat", body(), controller.signal);
    const assertion = expect(pending).rejects.toThrow("IDA intelligence: CANCELLED");
    await seen.promise;
    await expect(t.inspectInstalledModels(signal())).rejects.toMatchObject({ code: "RATE_LIMITED" });
    controller.abort();
    await assertion;
    await closed.promise;
    expect(f.calls).toHaveLength(phase === "inventory" ? 1 : 2);
    hold = false;
    expect(await t.inspectInstalledModels(signal())).toEqual([{ ...pin, size: 1024 }]);
  });
  it("shares one deadline across inventory and generation and closes timed-out sockets", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const inventorySeen = deferred();
    const chatSeen = deferred();
    const closed = deferred();
    let release: () => void = () => {};
    const f = await fixture((request, response) => {
      if (request.url === "/api/tags") {
        release = () => json(response, { models: [installed] });
        inventorySeen.resolve();
      } else {
        response.on("close", closed.resolve);
        chatSeen.resolve();
      }
    });
    const t = transport(f.port, { timeoutMs: 100 });
    const pending = t.post("/api/chat", body(), signal());
    const assertion = expect(pending).rejects.toThrow("IDA intelligence: TIMEOUT");
    await inventorySeen.promise;
    await vi.advanceTimersByTimeAsync(80);
    release();
    await chatSeen.promise;
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    await closed.promise;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("disposes active inventory without sending a prompt or allowing reactivation", async () => {
    const seen = deferred();
    const f = await fixture(() => {
      seen.resolve();
    });
    const t = transport(f.port);
    const pending = t.post("/api/chat", body(), signal());
    const assertion = expect(pending).rejects.toThrow("IDA intelligence: CANCELLED");
    await seen.promise;
    t.dispose();
    await assertion;
    await expect(t.inspectInstalledModels(signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.calls).toHaveLength(1);
  });
  it("redacts a refused connection and leaves no retry running", async () => {
    const f = await fixture();
    const entry = servers.pop();
    if (!entry) throw new Error("Missing test server");
    await new Promise<void>((resolve) => entry.server.close(() => resolve()));
    await expect(transport(f.port).inspectInstalledModels(signal())).rejects.toThrow(
      "IDA intelligence: INVALID_RESPONSE",
    );
    expect(f.calls).toHaveLength(0);
  });
});
