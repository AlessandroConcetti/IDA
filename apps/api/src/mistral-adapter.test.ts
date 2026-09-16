import { IntelligenceError } from "@ida/domain";
import { describe, expect, it, vi } from "vitest";
import type { JsonInferenceTransport } from "./ai-adapters.js";
import { MistralTextAdapter, mistralChatPath, mistralTextModelId } from "./mistral-adapter.js";

function input() {
  return {
    modelId: mistralTextModelId,
    prompt: "Demande synthétique",
    maxOutputTokens: 100,
    signal: new AbortController().signal,
  };
}
function response(message: Record<string, unknown> = {}) {
  return {
    object: "chat.completion",
    model: mistralTextModelId,
    choices: [
      { index: 0, finish_reason: "stop", message: { role: "assistant", content: "Réponse synthétique", ...message } },
    ],
  };
}
function fixture(body: unknown = response(), status = 200) {
  const transport = { post: vi.fn<JsonInferenceTransport["post"]>().mockResolvedValue({ status, body }) };
  return { transport, adapter: new MistralTextAdapter("mistral", transport) };
}

describe("Mistral text adapter, injected transport only", () => {
  it("pins the model, disables reasoning and tools, and returns only answer text", async () => {
    const f = fixture(response({ reasoning: "SYNTHETIC_PRIVATE_REASONING" }));
    const request = input();
    expect(await f.adapter.generate(request)).toEqual({ text: "Réponse synthétique" });
    expect(f.adapter.locality).toBe("CLOUD");
    expect(f.transport.post).toHaveBeenCalledExactlyOnceWith(
      mistralChatPath,
      {
        model: mistralTextModelId,
        messages: [{ role: "user", content: request.prompt }],
        max_tokens: 100,
        n: 1,
        service_tier: "standard_only",
        reasoning_effort: "none",
        stream: false,
        tools: [],
        tool_choice: "none",
      },
      request.signal,
    );
  });

  it.each([
    { modelId: "openai/gpt-oss-20b" },
    { prompt: " " },
    { prompt: "x".repeat(8193) },
    { maxOutputTokens: 0 },
    { maxOutputTokens: 513 },
    { maxOutputTokens: 1.5 },
  ])("rejects unsupported requests before transport", async (patch) => {
    const f = fixture();
    await expect(f.adapter.generate({ ...input(), ...patch })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(f.transport.post).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...response(), object: "chat.completion.chunk" },
    { ...response(), model: "other" },
    { ...response(), error: "SYNTHETIC_PRIVATE_ERROR" },
    { ...response(), choices: [] },
    { ...response(), choices: [...response().choices, ...response().choices] },
    { ...response(), choices: [{ ...response().choices[0], index: 1 }] },
    { ...response(), choices: [{ ...response().choices[0], finish_reason: "length" }] },
    { ...response(), choices: [{ ...response().choices[0], finish_reason: "tool_calls" }] },
    response({ role: "user" }),
    response({ content: null }),
    response({ content: " " }),
    response({ content: "x".repeat(32769) }),
    response({ content: "<think>synthetic reasoning</think>Réponse" }),
    response({ tool_calls: [{ function: { name: "publish" } }] }),
    response({ tool_calls: {} }),
    response({ function_call: { name: "publish" } }),
  ])("rejects incomplete, malformed or executable output", async (body) => {
    await expect(fixture(body).adapter.generate(input())).rejects.toThrow("IDA intelligence: INVALID_RESPONSE");
  });

  it("keeps explicit refusal private", async () => {
    await expect(fixture(response({ refusal: "SYNTHETIC_PRIVATE_REFUSAL" })).adapter.generate(input())).rejects.toThrow(
      "IDA intelligence: REFUSED",
    );
  });

  it("accepts the documented nullable tool-call field but never renders extra metadata", async () => {
    const f = fixture(response({ tool_calls: null, reasoning: "SYNTHETIC_PRIVATE_REASONING" }));
    expect(await f.adapter.generate(input())).toEqual({ text: "Réponse synthétique" });
  });

  it.each([
    [401, "AUTHENTICATION_REQUIRED"],
    [403, "AUTHENTICATION_REQUIRED"],
    [429, "RATE_LIMITED"],
    [503, "UNAVAILABLE"],
    [302, "INVALID_RESPONSE"],
    [400, "INVALID_RESPONSE"],
    [500, "INVALID_RESPONSE"],
  ] as const)("redacts provider errors for status %i", async (status, code) => {
    const f = fixture({ error: "SYNTHETIC_PRIVATE_ERROR" }, status);
    await expect(f.adapter.generate(input())).rejects.toThrow(`IDA intelligence: ${code}`);
    expect(f.transport.post).toHaveBeenCalledTimes(1);
  });

  it("redacts network errors, preserves bounded internal errors, and never retries", async () => {
    const f = fixture();
    f.transport.post.mockRejectedValueOnce(new Error("SYNTHETIC_PRIVATE_ERROR"));
    await expect(f.adapter.generate(input())).rejects.toThrow("IDA intelligence: INVALID_RESPONSE");
    f.transport.post.mockRejectedValueOnce(new IntelligenceError("TIMEOUT"));
    await expect(f.adapter.generate(input())).rejects.toThrow("IDA intelligence: TIMEOUT");
    expect(f.transport.post).toHaveBeenCalledTimes(2);
  });

  it("does not send an aborted request and discards a late response", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort("SYNTHETIC_PRIVATE_REASON");
    await expect(f.adapter.generate({ ...input(), signal: controller.signal })).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(f.transport.post).not.toHaveBeenCalled();
    const active = new AbortController();
    f.transport.post.mockImplementation(async () => {
      active.abort();
      return { status: 200, body: response() };
    });
    await expect(f.adapter.generate({ ...input(), signal: active.signal })).rejects.toMatchObject({
      code: "CANCELLED",
    });
  });
});
