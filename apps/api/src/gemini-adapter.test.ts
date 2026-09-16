import { IntelligenceError } from "@ida/domain";
import { describe, expect, it, vi } from "vitest";
import type { JsonInferenceTransport } from "./ai-adapters.js";
import { GeminiTextAdapter, geminiGeneratePath, geminiTextModelId } from "./gemini-adapter.js";

const input = () => ({
  modelId: geminiTextModelId,
  prompt: "Demande synthétique",
  maxOutputTokens: 100,
  signal: new AbortController().signal,
});
const candidate = (parts: unknown[] = [{ text: "Réponse synthétique" }]) => ({
  index: 0,
  finishReason: "STOP",
  content: { role: "model", parts },
});
const response = (value = candidate()) => ({ modelVersion: geminiTextModelId, candidates: [value] });
function fixture(body: unknown = response(), status = 200) {
  const transport = { post: vi.fn<JsonInferenceTransport["post"]>().mockResolvedValue({ status, body }) };
  return { transport, adapter: new GeminiTextAdapter("gemini", transport) };
}

describe("Gemini text adapter, injected transport only", () => {
  it("pins generateContent and LOW thinking; discards thoughts/signatures and never requests tools or streaming", async () => {
    const f = fixture(
      response(
        candidate([
          { text: "SYNTHETIC_PRIVATE_REASONING", thought: true },
          { text: "Réponse synthétique", thoughtSignature: "SYNTHETIC_PRIVATE_SIGNATURE" },
        ]),
      ),
    );
    const request = input();
    expect(await f.adapter.generate(request)).toEqual({ text: "Réponse synthétique" });
    expect(f.adapter.locality).toBe("CLOUD");
    expect(f.transport.post).toHaveBeenCalledExactlyOnceWith(
      geminiGeneratePath,
      {
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: { maxOutputTokens: 100, thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false } },
        store: false,
      },
      request.signal,
    );
  });

  it.each([
    { modelId: "gemini-2.0-flash" },
    { prompt: " " },
    { prompt: "x".repeat(8193) },
    { maxOutputTokens: 0 },
    { maxOutputTokens: 513 },
    { maxOutputTokens: 1.5 },
  ])("rejects unsupported requests without transport", async (patch) => {
    const f = fixture();
    await expect(f.adapter.generate({ ...input(), ...patch })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(f.transport.post).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...response(), modelVersion: "other" },
    { ...response(), error: "SYNTHETIC_PRIVATE_ERROR" },
    { ...response(), candidates: [] },
    { ...response(), candidates: [candidate(), candidate()] },
    response({ ...candidate(), index: 1 }),
    response({ ...candidate(), finishReason: "MAX_TOKENS" }),
    response({ ...candidate(), finishReason: "MALFORMED_FUNCTION_CALL" }),
    response({ ...candidate(), content: { role: "user", parts: [{ text: "wrong" }] } }),
    response(candidate([])),
    response(candidate([{ text: "" }])),
    response(candidate([{ text: "x".repeat(32769) }])),
    response(candidate([{ text: "<th" }, { text: "ink>private</think>answer" }])),
    response(candidate([{ functionCall: { name: "publish" } }])),
    response(candidate([{ text: "answer", executableCode: {} }])),
    response(candidate([{ text: "private", thought: true }])),
    response(candidate([{ text: "answer", thought: "false" }])),
    response(candidate([{ text: "answer", thoughtSignature: 1 }])),
  ])("rejects incomplete, nontext or executable output", async (body) => {
    await expect(fixture(body).adapter.generate(input())).rejects.toThrow("IDA intelligence: INVALID_RESPONSE");
  });

  it.each(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"])(
    "returns bounded refusal for %s",
    async (finishReason) => {
      await expect(fixture(response({ ...candidate(), finishReason })).adapter.generate(input())).rejects.toMatchObject(
        { code: "REFUSED" },
      );
    },
  );
  it("does not render prompt block feedback or blocked ratings", async () => {
    await expect(
      fixture({ promptFeedback: { blockReason: "SAFETY", blockReasonMessage: "PRIVATE" } }).adapter.generate(input()),
    ).rejects.toMatchObject({ code: "REFUSED" });
    await expect(
      fixture({ ...response(), candidates: [{ ...candidate(), safetyRatings: [{ blocked: true }] }] }).adapter.generate(
        input(),
      ),
    ).rejects.toMatchObject({ code: "REFUSED" });
  });

  it.each([
    [401, "AUTHENTICATION_REQUIRED"],
    [403, "AUTHENTICATION_REQUIRED"],
    [429, "RATE_LIMITED"],
    [503, "UNAVAILABLE"],
    [302, "INVALID_RESPONSE"],
    [400, "INVALID_RESPONSE"],
    [500, "INVALID_RESPONSE"],
  ] as const)("redacts status %i", async (status, code) => {
    const f = fixture({ error: "SYNTHETIC_PRIVATE_ERROR" }, status);
    await expect(f.adapter.generate(input())).rejects.toThrow(`IDA intelligence: ${code}`);
    expect(f.transport.post).toHaveBeenCalledOnce();
  });
  it("redacts arbitrary transport exceptions and preserves internal timeout without retry", async () => {
    const f = fixture();
    f.transport.post.mockRejectedValueOnce(new Error("SYNTHETIC_PRIVATE_ERROR"));
    await expect(f.adapter.generate(input())).rejects.toThrow("IDA intelligence: INVALID_RESPONSE");
    f.transport.post.mockRejectedValueOnce(new IntelligenceError("TIMEOUT"));
    await expect(f.adapter.generate(input())).rejects.toThrow("IDA intelligence: TIMEOUT");
    expect(f.transport.post).toHaveBeenCalledTimes(2);
  });
  it("honours abort before dispatch and discards late responses", async () => {
    const f = fixture();
    const aborted = new AbortController();
    aborted.abort();
    await expect(f.adapter.generate({ ...input(), signal: aborted.signal })).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(f.transport.post).not.toHaveBeenCalled();
    const active = new AbortController();
    f.transport.post.mockImplementationOnce(async () => {
      active.abort();
      return { status: 200, body: response() };
    });
    await expect(f.adapter.generate({ ...input(), signal: active.signal })).rejects.toMatchObject({
      code: "CANCELLED",
    });
  });
});
