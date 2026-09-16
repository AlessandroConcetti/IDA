import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectorSecret } from "./connector-vault.js";
import { GeminiTextAdapter, geminiGeneratePath, geminiTextModelId } from "./gemini-adapter.js";
import { GeminiHttpsTransport, type GeminiTransportConfig } from "./gemini-transport.js";

vi.mock("node:https", () => ({ request: vi.fn() }));

type MockRequest = EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
type Call = {
  options: RequestOptions;
  payload: string;
  req: MockRequest;
  respond: (incoming: IncomingMessage) => void;
};
const calls: Call[] = [];
const transports: GeminiHttpsTransport[] = [];
const httpsMock = vi.mocked(httpsRequest);
const syntheticToken = "synthetic-test-secret-123456";
const signal = () => new AbortController().signal;
function callAt(index = 0): Call {
  const call = calls.at(index);
  if (!call) throw new Error("Missing mocked HTTPS call");
  return call;
}
function payload() {
  return {
    contents: [{ role: "user", parts: [{ text: "Demande synthétique" }] }],
    generationConfig: { maxOutputTokens: 100, thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false } },
    store: false,
  };
}
function answer() {
  return {
    modelVersion: geminiTextModelId,
    candidates: [
      { index: 0, finishReason: "STOP", content: { role: "model", parts: [{ text: "Réponse synthétique" }] } },
    ],
  };
}
function fixture(config: GeminiTransportConfig = {}) {
  const secret = {
    available: vi.fn<ConnectorSecret["available"]>().mockResolvedValue(true),
    resolve: vi.fn<ConnectorSecret["resolve"]>().mockResolvedValue(syntheticToken),
  };
  const transport = new GeminiHttpsTransport({ secret, enabled: true, reviewedFreePlan: true, ...config });
  transports.push(transport);
  return { transport, secret };
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
function incoming(call: Call, statusCode = 200, headers: Record<string, string> = {}) {
  const response = Object.assign(new EventEmitter(), {
    statusCode,
    headers: { "content-type": "application/json", ...headers },
    complete: false,
    destroy: vi.fn(),
  });
  call.respond(response as unknown as IncomingMessage);
  return response;
}
function deliver(call: Call, body: unknown = answer()) {
  const response = incoming(call);
  response.emit("data", Buffer.from(JSON.stringify(body)));
  response.complete = true;
  response.emit("end");
  return response;
}

beforeEach(() => {
  calls.length = 0;
  httpsMock.mockReset();
  httpsMock.mockImplementation(((options: RequestOptions, respond: (incoming: IncomingMessage) => void) => {
    const req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    req.end.mockImplementation((body: string) => calls.push({ options, payload: body, req, respond }));
    return req as unknown as ClientRequest;
  }) as typeof httpsRequest);
});
afterEach(() => {
  for (const transport of transports.splice(0)) transport.dispose();
  vi.useRealTimers();
});

describe("Gemini HTTPS transport, mocked node:https only; no sockets", () => {
  it("is disabled by default and checks server approval before secret resolution", async () => {
    const bare = new GeminiHttpsTransport();
    expect(await bare.available()).toBe(false);
    await expect(bare.post(geminiGeneratePath, payload(), signal())).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const config of [{ enabled: false }, { reviewedFreePlan: false }]) {
      const f = fixture(config);
      await expect(f.transport.post(geminiGeneratePath, payload(), signal())).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(f.secret.resolve).not.toHaveBeenCalled();
      expect(f.secret.available).not.toHaveBeenCalled();
    }
    expect(httpsMock).not.toHaveBeenCalled();
  });

  it("reports only secret availability, without decrypting, checking billing or networking", async () => {
    const f = fixture({ enabled: false, reviewedFreePlan: false });
    expect(await f.transport.available()).toBe(true);
    f.secret.available.mockRejectedValueOnce(new Error("SYNTHETIC_PRIVATE_ERROR"));
    expect(await f.transport.available()).toBe(false);
    expect(f.secret.resolve).not.toHaveBeenCalled();
    expect(httpsMock).not.toHaveBeenCalled();
    f.transport.dispose();
    expect(await f.transport.available()).toBe(false);
  });

  it.each([
    { enabled: "true" },
    { reviewedFreePlan: "true" },
    { secret: null },
    { secret: {} },
    { hostname: "example.invalid" },
    { port: 80 },
    { rejectUnauthorized: false },
    { proxy: "example.invalid" },
    { timeoutMs: 30001 },
  ])("rejects unreviewed transport options", (config) => {
    expect(() => new GeminiHttpsTransport(config as GeminiTransportConfig)).toThrow(
      "IDA intelligence: CONFIGURATION_INVALID",
    );
    expect(httpsMock).not.toHaveBeenCalled();
  });

  it("composes the adapter with fixed TLS destination and authorization only in the header", async () => {
    const f = fixture();
    const pending = new GeminiTextAdapter("gemini", f.transport).generate({
      modelId: geminiTextModelId,
      prompt: "Demande synthétique",
      maxOutputTokens: 100,
      signal: signal(),
    });
    await flush();
    const call = callAt();
    expect(call).toBeDefined();
    expect(call?.options).toEqual({
      protocol: "https:",
      hostname: "generativelanguage.googleapis.com",
      port: 443,
      method: "POST",
      path: geminiGeneratePath,
      agent: false,
      rejectUnauthorized: true,
      maxHeaderSize: 8192,
      headers: {
        accept: "application/json",
        "accept-encoding": "identity",
        connection: "close",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(JSON.stringify(payload())),
        "x-goog-api-key": syntheticToken,
      },
    });
    expect(JSON.parse(call?.payload ?? "{}")).toEqual(payload());
    expect(call?.payload).not.toContain(syntheticToken);
    const response = deliver(call);
    expect(await pending).toEqual({ text: "Réponse synthétique" });
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(call?.req.destroy).toHaveBeenCalledOnce();
    expect(f.secret.resolve).toHaveBeenCalledOnce();
  });

  it.each(["/openai/v1/models", `${geminiGeneratePath}?key=x`, "http://example.invalid", "//example.invalid"])(
    "rejects non-allowlisted path %s before secret resolution",
    async (path) => {
      const f = fixture();
      await expect(f.transport.post(path, payload(), signal())).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      expect(f.secret.resolve).not.toHaveBeenCalled();
      expect(httpsMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { model: "other" },
    { stream: true },
    { tools: [{ functionDeclarations: [] }] },
    { cachedContent: "cachedContents/private" },
    { store: true },
    { generationConfig: { ...payload().generationConfig, maxOutputTokens: 0 } },
    { generationConfig: { ...payload().generationConfig, maxOutputTokens: 513 } },
    { generationConfig: { ...payload().generationConfig, maxOutputTokens: "100" } },
    {
      generationConfig: {
        ...payload().generationConfig,
        thinkingConfig: { thinkingLevel: "MINIMAL", includeThoughts: false },
      },
    },
    {
      generationConfig: {
        ...payload().generationConfig,
        thinkingConfig: { thinkingLevel: "LOW", includeThoughts: true },
      },
    },
    { generationConfig: { ...payload().generationConfig, responseModalities: ["IMAGE"] } },
    { contents: [{ role: "model", parts: [{ text: "Synthetic" }] }] },
    { contents: [{ role: "user", parts: [{ text: ["Synthetic"] }] }] },
    { contents: [{ role: "user", parts: [{ text: "Synthetic", inlineData: {} }] }] },
    { contents: [{ role: "user", parts: [{ text: " " }] }] },
    { contents: [{ role: "user", parts: [{ text: "x".repeat(8193) }] }] },
    { contents: [{ role: "user", parts: [{ text: "\\u0000".repeat(8192) }] }] },
  ])("validates the exact payload and byte budget before any decryption", async (patch) => {
    const f = fixture();
    await expect(f.transport.post(geminiGeneratePath, { ...payload(), ...patch }, signal())).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(f.secret.resolve).not.toHaveBeenCalled();
    expect(httpsMock).not.toHaveBeenCalled();
  });

  it("copies the payload before resolving the secret and ignores inherited serializers", async () => {
    const f = fixture();
    let resolveSecret: (token: string) => void = () => {};
    f.secret.resolve.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSecret = resolve;
        }),
    );
    const body = payload();
    Object.setPrototypeOf(body, { toJSON: () => ({ model: "other", prompt: "INJECTED" }) });
    const pending = f.transport.post(geminiGeneratePath, body, signal());
    body.contents = [{ role: "user", parts: [{ text: "CHANGED" }] }];
    resolveSecret(syntheticToken);
    await flush();
    expect(JSON.parse(callAt().payload)).toEqual(payload());
    deliver(callAt());
    await pending;
  });

  it.each(["short", "synthetic\r\nsecret-header-injection", "x".repeat(8193)])(
    "rejects malformed secrets",
    async (token) => {
      const f = fixture();
      f.secret.resolve.mockResolvedValue(token);
      await expect(f.transport.post(geminiGeneratePath, payload(), signal())).rejects.toThrow(
        "IDA intelligence: AUTHENTICATION_REQUIRED",
      );
      expect(httpsMock).not.toHaveBeenCalled();
    },
  );

  it("redacts missing and rejected secrets", async () => {
    const f = fixture();
    f.secret.resolve.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_ERROR"));
    await expect(f.transport.post(geminiGeneratePath, payload(), signal())).rejects.toThrow(
      "IDA intelligence: AUTHENTICATION_REQUIRED",
    );
    await expect(
      fixture({ secret: undefined }).transport.post(geminiGeneratePath, payload(), signal()),
    ).rejects.toThrow("IDA intelligence: AUTHENTICATION_REQUIRED");
    expect(httpsMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 429, 503])(
    "returns only status %i and discards error bodies and quota headers",
    async (status) => {
      const f = fixture();
      const pending = f.transport.post(geminiGeneratePath, payload(), signal());
      await flush();
      const response = incoming(callAt(), status, {
        "x-private": "SYNTHETIC_PRIVATE",
        "x-ratelimit-remaining-tokens": "8000",
      });
      response.emit("data", Buffer.from("SYNTHETIC_PRIVATE_ERROR"));
      expect(await pending).toEqual({ status, body: null });
      expect(response.destroy).toHaveBeenCalledOnce();
      expect(calls).toHaveLength(1);
    },
  );

  it.each([301, 302, 307, 308, 400, 500])("never follows status %i or leaks its location", async (status) => {
    const f = fixture();
    const pending = f.transport.post(geminiGeneratePath, payload(), signal());
    const assertion = expect(pending).rejects.toThrow("IDA intelligence: INVALID_RESPONSE");
    await flush();
    incoming(callAt(), status, { location: "https://example.invalid/SYNTHETIC_PRIVATE" });
    await assertion;
    expect(httpsMock).toHaveBeenCalledOnce();
  });

  it.each([
    "html",
    "gzip",
    "length",
    "chunks",
    "bad-json",
    "bad-utf8",
    "truncated",
    "length-mismatch",
    "aborted",
    "close",
    "error",
  ])("rejects unsafe responses: %s", async (variant) => {
    const f = fixture();
    const pending = f.transport.post(geminiGeneratePath, payload(), signal());
    const assertion = expect(pending).rejects.toThrow("IDA intelligence: INVALID_RESPONSE");
    await flush();
    const headers: Record<string, string> = {};
    if (variant === "html") headers["content-type"] = "text/html";
    if (variant === "gzip") headers["content-encoding"] = "gzip";
    if (variant === "length") headers["content-length"] = String(128 * 1024 + 1);
    if (variant === "length-mismatch") headers["content-length"] = "50";
    const response = incoming(callAt(), 200, headers);
    if (!response.destroy.mock.calls.length) {
      if (["aborted", "close", "error"].includes(variant)) response.emit(variant, new Error("SYNTHETIC_PRIVATE_ERROR"));
      else {
        let data = Buffer.from("{}");
        if (variant === "chunks") data = Buffer.alloc(128 * 1024 + 1, "x");
        if (variant === "bad-json") data = Buffer.from("SYNTHETIC_PRIVATE_ERROR");
        if (variant === "bad-utf8") data = Buffer.from([0xff]);
        response.emit("data", data);
        response.complete = variant !== "truncated";
        response.emit("end");
      }
    }
    await assertion;
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(calls[0]?.req.destroy).toHaveBeenCalledOnce();
  });

  it("redacts synchronous and asynchronous network errors and rejects upgrades without retry", async () => {
    const f = fixture();
    const pending = f.transport.post(geminiGeneratePath, payload(), signal());
    const assertion = expect(pending).rejects.toThrow("IDA intelligence: INVALID_RESPONSE");
    await flush();
    callAt().req.emit("error", new Error("SYNTHETIC_PRIVATE_ERROR"));
    await assertion;
    const next = f.transport.post(geminiGeneratePath, payload(), signal());
    const upgraded = expect(next).rejects.toThrow("IDA intelligence: INVALID_RESPONSE");
    await flush();
    const socket = { destroy: vi.fn() };
    callAt(1).req.emit("upgrade", {}, socket);
    await upgraded;
    expect(socket.destroy).toHaveBeenCalledOnce();
    httpsMock.mockImplementationOnce(() => {
      throw new Error("SYNTHETIC_PRIVATE_ERROR");
    });
    await expect(f.transport.post(geminiGeneratePath, payload(), signal())).rejects.toThrow(
      "IDA intelligence: INVALID_RESPONSE",
    );
    expect(httpsMock).toHaveBeenCalledTimes(3);
  });

  it("cancels before decryption, during decryption and after request dispatch", async () => {
    const f = fixture();
    const aborted = new AbortController();
    aborted.abort();
    await expect(f.transport.post(geminiGeneratePath, payload(), aborted.signal)).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(f.secret.resolve).not.toHaveBeenCalled();
    let release: (token: string) => void = () => {};
    f.secret.resolve.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = f.transport.post(geminiGeneratePath, payload(), controller.signal);
    const assertion = expect(pending).rejects.toThrow("IDA intelligence: CANCELLED");
    controller.abort("SYNTHETIC_PRIVATE_REASON");
    await assertion;
    release(syntheticToken);
    await flush();
    expect(httpsMock).not.toHaveBeenCalled();
    const active = new AbortController();
    const next = f.transport.post(geminiGeneratePath, payload(), active.signal);
    const cancelled = expect(next).rejects.toThrow("IDA intelligence: CANCELLED");
    await flush();
    active.abort();
    await cancelled;
    expect(calls[0]?.req.destroy).toHaveBeenCalledOnce();
    // Une réponse tardive ne peut pas rouvrir l'opération ni être livrée.
    expect(deliver(callAt()).destroy).toHaveBeenCalledOnce();
  });

  it("has one in-flight operation and releases capacity after cancellation", async () => {
    const f = fixture();
    const controller = new AbortController();
    const pending = f.transport.post(geminiGeneratePath, payload(), controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(f.transport.post(geminiGeneratePath, payload(), signal())).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(f.secret.resolve).toHaveBeenCalledOnce();
    controller.abort();
    await assertion;
    const next = f.transport.post(geminiGeneratePath, payload(), signal());
    await flush();
    deliver(callAt(-1));
    expect(await next).toEqual({ status: 200, body: answer() });
  });

  it("shares a fixed 30 second deadline across decryption and HTTPS and removes timers", async () => {
    vi.useFakeTimers();
    const f = fixture();
    let release: (token: string) => void = () => {};
    f.secret.resolve.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = f.transport.post(geminiGeneratePath, payload(), signal());
    const assertion = expect(pending).rejects.toThrow("IDA intelligence: TIMEOUT");
    await vi.advanceTimersByTimeAsync(29000);
    release(syntheticToken);
    await flush();
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(calls[0]?.req.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out an uncooperative secret and permanently disposes active work", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.secret.resolve.mockImplementationOnce(() => new Promise(() => {}));
    const pending = f.transport.post(geminiGeneratePath, payload(), signal());
    const assertion = expect(pending).rejects.toThrow("IDA intelligence: TIMEOUT");
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
    expect(httpsMock).not.toHaveBeenCalled();
    const next = f.transport.post(geminiGeneratePath, payload(), signal());
    const cancelled = expect(next).rejects.toThrow("IDA intelligence: CANCELLED");
    await flush();
    f.transport.dispose();
    await cancelled;
    await expect(f.transport.post(geminiGeneratePath, payload(), signal())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
