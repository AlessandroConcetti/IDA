import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { request } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkMistralConnection, runMistralConnectionCheck } from "../../../scripts/check-mistral-connection.js";
import { windowsIntelligenceSecret } from "./connector-vault.js";
import { mistralTextModelId } from "./mistral-adapter.js";

vi.mock("node:https", () => ({ request: vi.fn() }));
vi.mock("./connector-vault.js", () => ({ windowsIntelligenceSecret: vi.fn() }));

const args = ["--workspace-id", "wsp_synthetic", "--check-auth"];
const privateValue = "SYNTHETIC_PRIVATE_VALUE";
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

describe("Mistral auth diagnostic: mocked vault and HTTPS, no real key or sockets", () => {
  it.each([
    [],
    ["--workspace-id", "wsp_synthetic"],
    ["--check-auth"],
    ["--workspace-id", "../wsp_other", "--check-auth"],
    ["--workspace-id", "wsp_synthetic", "--url", "https://example.invalid"],
    [...args, "--check-auth"],
    ["--check-auth", "wsp_synthetic", "--workspace-id"],
  ])("rejects malformed arguments before reading the vault: %j", async (...input) => {
    expect(await checkMistralConnection(input)).toMatchObject({ state: "INVALID_ARGUMENTS", httpStatus: null });
    expect(windowsIntelligenceSecret).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([true, false])("uses one fixed TLS GET and reports exact model presence: %s", async (present) => {
    const pending = checkMistralConnection(["--check-auth", "--workspace-id", "wsp_synthetic"]);
    await flush();
    expect(windowsIntelligenceSecret).toHaveBeenCalledWith(
      expect.stringMatching(/connector-secrets$/u),
      "wsp_synthetic",
      "mistral",
    );
    expect(callAt().options).toEqual({
      protocol: "https:",
      hostname: "api.mistral.ai",
      port: 443,
      path: "/v1/models",
      method: "GET",
      agent: false,
      rejectUnauthorized: true,
      maxHeaderSize: 8192,
      headers: {
        accept: "application/json",
        "accept-encoding": "identity",
        connection: "close",
        authorization: `Bearer ${privateValue}`,
      },
    });
    expect(callAt().req.end).toHaveBeenCalledWith();
    const response = deliver({
      object: "list",
      data: [{ id: present ? mistralTextModelId : `${mistralTextModelId}-other` }],
    });
    expect(await pending).toEqual({
      state: "AUTHENTICATED",
      httpStatus: 200,
      configuredModelId: mistralTextModelId,
      modelPresent: present,
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
    expect(await checkMistralConnection(args)).toEqual({
      state: kind === "missing" ? "KEY_MISSING" : "KEY_UNREADABLE",
      httpStatus: null,
      configuredModelId: mistralTextModelId,
      modelPresent: null,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([401, 403, 302, 307, 429, 500])("discards HTTP %i bodies and headers without retry", async (status) => {
    const pending = checkMistralConnection(args);
    await flush();
    const response = incoming(status, {
      location: `https://example.invalid/${privateValue}`,
      "x-account": privateValue,
    });
    response.emit("data", Buffer.from(privateValue));
    const state =
      status === 401 || status === 403 ? "AUTH_REJECTED" : status < 400 ? "REDIRECT_REJECTED" : "HTTP_ERROR";
    expect(await pending).toEqual({
      state,
      httpStatus: status,
      configuredModelId: mistralTextModelId,
      modelPresent: null,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    null,
    {},
    { object: "list", data: {} },
    { object: "list", data: [{ id: 7 }] },
    { object: "list", data: [], error: privateValue },
  ])("rejects unexpected JSON: %j", async (body) => {
    const pending = checkMistralConnection(args);
    await flush();
    deliver(body);
    expect(await pending).toMatchObject({ state: "INVALID_RESPONSE", httpStatus: 200, modelPresent: null });
  });

  it.each(["html", "gzip", "length", "oversize", "bad-json", "truncated", "aborted"])(
    "rejects invalid responses: %s",
    async (kind) => {
      const pending = checkMistralConnection(args);
      await flush();
      const headers: Record<string, string> = {};
      if (kind === "html") headers["content-type"] = "text/html";
      if (kind === "gzip") headers["content-encoding"] = "gzip";
      if (kind === "length") headers["content-length"] = String(1024 * 1024 + 1);
      const response = incoming(200, headers);
      if (kind === "aborted") response.emit("aborted");
      else if (!response.destroy.mock.calls.length) {
        response.emit("data", kind === "oversize" ? Buffer.alloc(1024 * 1024 + 1) : Buffer.from(privateValue));
        response.complete = kind !== "truncated";
        response.emit("end");
      }
      expect(await pending).toMatchObject({ state: "INVALID_RESPONSE", modelPresent: null });
    },
  );

  it.each(["vault", "network"])("enforces one 10 second deadline during %s", async (kind) => {
    vi.useFakeTimers();
    let release: (key: string) => void = () => {};
    if (kind === "vault")
      secret.resolve.mockImplementation(
        () =>
          new Promise<string>((done) => {
            release = done;
          }),
      );
    const pending = checkMistralConnection(args);
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toMatchObject({ state: "TIMEOUT", modelPresent: null });
    release(privateValue);
    await flush();
    if (kind === "vault") expect(request).not.toHaveBeenCalled();
    else expect(callAt().req.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("prints only the predetermined report and never private network details", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const pending = runMistralConnectionCheck(args);
    await flush();
    callAt().req.emit("error", new Error(privateValue));
    expect(await pending).toBe(1);
    expect(stdout).toHaveBeenCalledExactlyOnceWith(
      `${JSON.stringify({ state: "NETWORK_ERROR", httpStatus: null, configuredModelId: mistralTextModelId, modelPresent: null })}\n`,
    );
    expect(stderr).not.toHaveBeenCalled();
    stdout.mockClear();
    const success = runMistralConnectionCheck(args);
    await flush();
    calls.shift();
    deliver({ object: "list", data: [{ id: mistralTextModelId }, { id: privateValue }], account: privateValue });
    expect(await success).toBe(0);
    expect(stdout).toHaveBeenCalledExactlyOnceWith(
      `${JSON.stringify({ state: "AUTHENTICATED", httpStatus: 200, configuredModelId: mistralTextModelId, modelPresent: true })}\n`,
    );
    expect(stderr).not.toHaveBeenCalled();
  });
});
