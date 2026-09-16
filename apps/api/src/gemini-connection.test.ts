import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { request } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkGeminiConnection, runGeminiConnectionCheck } from "../../../scripts/check-gemini-connection.js";
import { windowsIntelligenceSecret } from "./connector-vault.js";
import { geminiTextModelId } from "./gemini-adapter.js";

vi.mock("node:https", () => ({ request: vi.fn() }));
vi.mock("./connector-vault.js", () => ({ windowsIntelligenceSecret: vi.fn() }));

const args = ["--workspace-id", "wsp_synthetic", "--check-auth"];
const privateValue = "SYNTHETIC_PRIVATE_VALUE";
const metadata = { name: `models/${geminiTextModelId}`, supportedGenerationMethods: ["generateContent"] };
const secret = { available: vi.fn(), resolve: vi.fn() };
type MockRequest = EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
type Call = { options: RequestOptions; req: MockRequest; respond: (incoming: IncomingMessage) => void };
const calls: Call[] = [];
function callAt(): Call {
  const call = calls[0];
  if (!call) throw new Error("Expected mocked HTTPS request");
  return call;
}
function incoming(statusCode = 200, headers: Record<string, string> = {}) {
  const response = Object.assign(new EventEmitter(), {
    statusCode,
    headers: { "content-type": "application/json", ...headers },
    complete: false,
    destroy: vi.fn(),
  });
  callAt().respond(response as unknown as IncomingMessage);
  return response;
}
function deliver(body: unknown) {
  const response = incoming();
  response.emit("data", Buffer.from(JSON.stringify(body)));
  response.complete = true;
  response.emit("end");
  return response;
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
beforeEach(() => {
  calls.length = 0;
  secret.available.mockReset().mockResolvedValue(true);
  secret.resolve.mockReset().mockResolvedValue(privateValue);
  vi.mocked(windowsIntelligenceSecret).mockReset().mockReturnValue(secret);
  vi.mocked(request)
    .mockReset()
    .mockImplementation(((options: RequestOptions, respond: (incoming: IncomingMessage) => void) => {
      const req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
      req.end.mockImplementation(() => calls.push({ options, req, respond }));
      return req as unknown as ClientRequest;
    }) as typeof request);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Gemini metadata diagnostic: mocked vault and HTTPS, no real key or sockets", () => {
  it.each([
    [],
    ["--workspace-id", "wsp_synthetic"],
    ["--check-auth"],
    ["--workspace-id", "../wsp_other", "--check-auth"],
    ["--workspace-id", "wsp_synthetic", "--url", "https://example.invalid"],
    [...args, "--check-auth"],
    ["--check-auth", "wsp_synthetic", "--workspace-id"],
  ])("rejects malformed arguments before reading the vault: %j", async (...input) => {
    expect(await checkGeminiConnection(input)).toMatchObject({ state: "INVALID_ARGUMENTS", httpStatus: null });
    expect(windowsIntelligenceSecret).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([true, false])("uses one fixed TLS GET and reports generation metadata only: %s", async (supported) => {
    const pending = checkGeminiConnection(["--check-auth", "--workspace-id", "wsp_synthetic"]);
    await flush();
    expect(windowsIntelligenceSecret).toHaveBeenCalledWith(
      expect.stringMatching(/connector-secrets$/u),
      "wsp_synthetic",
      "gemini",
    );
    expect(callAt().options).toEqual({
      protocol: "https:",
      hostname: "generativelanguage.googleapis.com",
      port: 443,
      path: `/v1beta/models/${geminiTextModelId}`,
      method: "GET",
      agent: false,
      rejectUnauthorized: true,
      maxHeaderSize: 8192,
      headers: {
        accept: "application/json",
        "accept-encoding": "identity",
        connection: "close",
        "x-goog-api-key": privateValue,
      },
    });
    expect(callAt().req.end).toHaveBeenCalledWith();
    const response = deliver({
      ...metadata,
      supportedGenerationMethods: [supported ? "generateContent" : "countTokens"],
      description: privateValue,
    });
    expect(await pending).toEqual({
      state: "AUTHENTICATED",
      httpStatus: 200,
      configuredModelId: geminiTextModelId,
      modelPresent: true,
      generateContentSupported: supported,
    });
    expect(request).toHaveBeenCalledOnce();
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(callAt().req.destroy).toHaveBeenCalledOnce();
  });

  it.each(["missing", "read-error", "metadata-error", "bad-format"])("redacts secret failures: %s", async (kind) => {
    if (kind === "missing") secret.available.mockResolvedValue(false);
    if (kind === "metadata-error") secret.available.mockRejectedValue(new Error(privateValue));
    if (kind === "read-error") secret.resolve.mockRejectedValue(new Error(privateValue));
    if (kind === "bad-format") secret.resolve.mockResolvedValue(`${privateValue}\r\nINJECTION`);
    expect(await checkGeminiConnection(args)).toEqual({
      state: kind === "missing" ? "KEY_MISSING" : "KEY_UNREADABLE",
      httpStatus: null,
      configuredModelId: geminiTextModelId,
      modelPresent: null,
      generateContentSupported: null,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 302, 307, 429, 500])(
    "discards HTTP %i bodies and headers without retry or model substitution",
    async (status) => {
      const pending = checkGeminiConnection(args);
      await flush();
      const response = incoming(status, {
        location: `https://example.invalid/${privateValue}`,
        "x-account": privateValue,
      });
      response.emit("data", Buffer.from(privateValue));
      const state =
        status === 401 || status === 403
          ? "AUTH_REJECTED"
          : status >= 300 && status < 400
            ? "REDIRECT_REJECTED"
            : "HTTP_ERROR";
      expect(await pending).toEqual({
        state,
        httpStatus: status,
        configuredModelId: geminiTextModelId,
        modelPresent: null,
        generateContentSupported: null,
      });
      expect(request).toHaveBeenCalledOnce();
    },
  );

  it.each([
    null,
    {},
    { ...metadata, name: `${metadata.name}-other` },
    { ...metadata, supportedGenerationMethods: "generateContent" },
    { ...metadata, supportedGenerationMethods: [7] },
    { ...metadata, supportedGenerationMethods: [""] },
    { ...metadata, supportedGenerationMethods: ["x".repeat(129)] },
    { ...metadata, supportedGenerationMethods: Array(65).fill("generateContent") },
    { ...metadata, error: privateValue },
  ])("rejects unexpected JSON: %j", async (body) => {
    const pending = checkGeminiConnection(args);
    await flush();
    deliver(body);
    expect(await pending).toMatchObject({ state: "INVALID_RESPONSE", httpStatus: 200, modelPresent: null });
  });

  it.each([
    "html",
    "gzip",
    "length",
    "bad-length",
    "length-mismatch",
    "oversize",
    "bad-json",
    "bad-utf8",
    "truncated",
    "aborted",
    "close",
    "response-error",
  ])("rejects invalid responses: %s", async (kind) => {
    const pending = checkGeminiConnection(args);
    await flush();
    const headers: Record<string, string> = {};
    if (kind === "html") headers["content-type"] = "text/html";
    if (kind === "gzip") headers["content-encoding"] = "gzip";
    if (kind === "length") headers["content-length"] = String(64 * 1024 + 1);
    if (kind === "bad-length") headers["content-length"] = "abc";
    if (kind === "length-mismatch") headers["content-length"] = "1";
    const response = incoming(200, headers);
    if (kind === "aborted" || kind === "close") response.emit(kind);
    else if (kind === "response-error") response.emit("error", new Error(privateValue));
    else if (!response.destroy.mock.calls.length) {
      const chunk =
        kind === "oversize"
          ? Buffer.alloc(64 * 1024 + 1)
          : kind === "bad-utf8"
            ? Buffer.from([0xff])
            : kind === "length-mismatch"
              ? Buffer.from(JSON.stringify(metadata))
              : Buffer.from(privateValue);
      response.emit("data", chunk);
      response.complete = kind !== "truncated";
      response.emit("end");
    }
    expect(await pending).toMatchObject({ state: "INVALID_RESPONSE", modelPresent: null });
  });

  it.each(["availability", "vault", "network"])("enforces one 10 second deadline during %s", async (kind) => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    if (kind === "availability")
      secret.available.mockImplementation(
        () =>
          new Promise<boolean>((done) => {
            release = () => done(true);
          }),
      );
    if (kind === "vault")
      secret.resolve.mockImplementation(
        () =>
          new Promise<string>((done) => {
            release = () => done(privateValue);
          }),
      );
    const pending = checkGeminiConnection(args);
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({ state: "TIMEOUT", modelPresent: null });
    release();
    await flush();
    if (kind !== "network") expect(request).not.toHaveBeenCalled();
    else {
      expect(callAt().req.destroy).toHaveBeenCalledOnce();
      const late = incoming();
      expect(late.destroy).toHaveBeenCalledOnce();
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects upgrades without following them", async () => {
    const pending = checkGeminiConnection(args);
    await flush();
    const socket = { destroy: vi.fn() };
    callAt().req.emit("upgrade", {}, socket);
    expect(await pending).toMatchObject({ state: "INVALID_RESPONSE", modelPresent: null });
    expect(socket.destroy).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
  });

  it("redacts synchronous HTTPS failures", async () => {
    vi.mocked(request).mockImplementation(() => {
      throw new Error(privateValue);
    });
    expect(await checkGeminiConnection(args)).toMatchObject({ state: "NETWORK_ERROR", httpStatus: null });
  });

  it("prints only the predetermined report and never private network details", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const pending = runGeminiConnectionCheck(args);
    await flush();
    callAt().req.emit("error", new Error(privateValue));
    expect(await pending).toBe(1);
    expect(stdout).toHaveBeenCalledExactlyOnceWith(
      `${JSON.stringify({ state: "NETWORK_ERROR", httpStatus: null, configuredModelId: geminiTextModelId, modelPresent: null, generateContentSupported: null })}\n`,
    );
    expect(stderr).not.toHaveBeenCalled();
    for (const supported of [true, false]) {
      stdout.mockClear();
      calls.length = 0;
      const success = runGeminiConnectionCheck(args);
      await flush();
      deliver({ ...metadata, supportedGenerationMethods: supported ? ["generateContent"] : [], account: privateValue });
      expect(await success).toBe(supported ? 0 : 1);
      expect(stdout).toHaveBeenCalledExactlyOnceWith(
        `${JSON.stringify({ state: "AUTHENTICATED", httpStatus: 200, configuredModelId: geminiTextModelId, modelPresent: true, generateContentSupported: supported })}\n`,
      );
      expect(stderr).not.toHaveBeenCalled();
    }
  });
});
