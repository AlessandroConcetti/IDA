import { describe, expect, it, vi } from "vitest";
import { type JsonInferenceTransport, OllamaAdapter, OpenAIResponsesAdapter } from "./ai-adapters.js";

function transport(body: unknown, status = 200) {
  return { post: vi.fn<JsonInferenceTransport["post"]>().mockResolvedValue({ status, body }) };
}
function input() {
  return {
    modelId: "reviewed-model",
    prompt: "Texte synthétique de test",
    maxOutputTokens: 100,
    signal: new AbortController().signal,
  };
}
function openaiBody() {
  return {
    status: "completed",
    output: [
      { type: "reasoning", summary: [{ text: "INTERNAL_REASONING" }] },
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "Proposition" }],
      },
    ],
  };
}
function localBody() {
  return {
    done: true,
    done_reason: "stop",
    message: { role: "assistant", content: "Proposition", thinking: "INTERNAL_REASONING" },
  };
}

describe("Official inference adapters, injected transport only", () => {
  it("serializes OpenAI Responses without tools, persistence, credentials or workspace identity", async () => {
    const t = transport(openaiBody());
    const request = input();
    request.modelId = "gpt-6-astra";
    const result = await new OpenAIResponsesAdapter("openai", t).generate(request);
    expect(result).toEqual({ text: "Proposition" });
    expect(t.post).toHaveBeenCalledWith(
      "/v1/responses",
      {
        model: "gpt-6-astra",
        input: request.prompt,
        max_output_tokens: 100,
        stream: false,
        store: false,
        tools: [],
        tool_choice: "none",
      },
      request.signal,
    );
    expect(JSON.stringify(result)).not.toContain("INTERNAL_REASONING");
  });
  it("serializes local Ollama chat without streaming, tools or retained model loading", async () => {
    const t = transport(localBody());
    const request = input();
    expect(await new OllamaAdapter("ollama", t).generate(request)).toEqual({ text: "Proposition" });
    expect(t.post).toHaveBeenCalledWith(
      "/api/chat",
      {
        model: request.modelId,
        messages: [{ role: "user", content: request.prompt }],
        stream: false,
        tools: [],
        options: { num_predict: 100 },
        keep_alive: 0,
      },
      request.signal,
    );
  });
  it("collects text messages without assuming the first output item is a message", async () => {
    const body = openaiBody();
    body.output.push({
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "Suite" }],
    });
    expect(await new OpenAIResponsesAdapter("openai", transport(body)).generate(input())).toEqual({
      text: "Proposition\nSuite",
    });
  });
  it.each([
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "function_call", name: "publish_post" }] },
    { status: "completed", output: [{ type: "web_search_call" }] },
    { status: "completed", output: [] },
    { status: "completed", output: [{ type: "message", role: "assistant", status: "in_progress", content: [] }] },
    { status: "completed", output: [{ type: "message", role: "user", status: "completed", content: [] }] },
    { status: "completed", error: { message: "SYNTHETIC_PRIVATE_ERROR" }, output: [] },
  ])("rejects incomplete, malformed or tool output from OpenAI: %j", async (body) => {
    await expect(new OpenAIResponsesAdapter("openai", transport(body)).generate(input())).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("reports explicit refusal without exposing it or triggering fallback", async () => {
    const body = {
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "refusal", refusal: "SYNTHETIC_PRIVATE_ERROR" }],
        },
      ],
    };
    await expect(new OpenAIResponsesAdapter("openai", transport(body)).generate(input())).rejects.toThrow(
      "IDA intelligence: REFUSED",
    );
  });
  it.each([
    { done: false },
    { done_reason: "length" },
    { error: "SYNTHETIC_PRIVATE_ERROR" },
    { message: { role: "assistant", content: "Proposition", tool_calls: [{ function: { name: "publish_post" } }] } },
    { message: { role: "assistant", content: "x".repeat(65_537) } },
  ])("rejects incomplete, oversized or tool output from Ollama", async (patch) => {
    await expect(
      new OllamaAdapter("ollama", transport({ ...localBody(), ...patch })).generate(input()),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it.each([
    [401, "AUTHENTICATION_REQUIRED"],
    [403, "AUTHENTICATION_REQUIRED"],
    [429, "RATE_LIMITED"],
    [503, "UNAVAILABLE"],
    [302, "INVALID_RESPONSE"],
    [500, "INVALID_RESPONSE"],
    [400, "INVALID_RESPONSE"],
  ])("maps HTTP status %s to a stable error without returning the response body", async (status, code) => {
    const t = transport({ error: "SYNTHETIC_PRIVATE_ERROR" }, Number(status));
    await expect(new OpenAIResponsesAdapter("openai", t).generate(input())).rejects.toThrow(
      `IDA intelligence: ${code}`,
    );
    await expect(new OllamaAdapter("ollama", t).generate(input())).rejects.toThrow(`IDA intelligence: ${code}`);
  });
  it("redacts unknown transport failures instead of retrying an ambiguous paid request", async () => {
    const t = transport({});
    t.post.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_ERROR"));
    await expect(new OpenAIResponsesAdapter("openai", t).generate(input())).rejects.toThrow(
      "IDA intelligence: INVALID_RESPONSE",
    );
  });
  it("does not call the transport on cancellation and discards a late response", async () => {
    const t = transport(openaiBody());
    const controller = new AbortController();
    controller.abort();
    await expect(
      new OpenAIResponsesAdapter("openai", t).generate({ ...input(), signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(t.post).not.toHaveBeenCalled();
    const active = new AbortController();
    t.post.mockImplementation(async () => {
      active.abort();
      return { status: 200, body: openaiBody() };
    });
    await expect(
      new OpenAIResponsesAdapter("openai", t).generate({ ...input(), signal: active.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
});
