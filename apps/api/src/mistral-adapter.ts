import { type IntelligenceText, intelligenceTextSchema } from "@ida/contracts/intelligence";
import { type IntelligenceAdapter, IntelligenceError } from "@ida/domain";
import type { JsonInferenceTransport } from "./ai-adapters.js";

// Version officielle vérifiée le 15/09/2026 ; aucun alias « latest » ni modèle de repli implicite.
export const mistralTextModelId = "mistral-small-2603";
export const mistralChatPath = "/v1/chat/completions";
type AdapterInput = Parameters<IntelligenceAdapter["generate"]>[0];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Texte seul ; l'adaptateur ne reçoit ni secret ni autorité de facturation. */
export class MistralTextAdapter implements IntelligenceAdapter {
  readonly locality = "CLOUD" as const;
  constructor(
    readonly providerKey: string,
    private readonly transport: JsonInferenceTransport,
  ) {}

  async generate(input: AdapterInput): Promise<IntelligenceText> {
    if (input.signal.aborted) throw new IntelligenceError("CANCELLED");
    if (
      input.modelId !== mistralTextModelId ||
      typeof input.prompt !== "string" ||
      !input.prompt.trim() ||
      input.prompt.length > 8192 ||
      !Number.isSafeInteger(input.maxOutputTokens) ||
      input.maxOutputTokens < 1 ||
      input.maxOutputTokens > 512
    )
      throw new IntelligenceError("INVALID_REQUEST");

    let response: Awaited<ReturnType<JsonInferenceTransport["post"]>>;
    try {
      response = await this.transport.post(
        mistralChatPath,
        {
          model: mistralTextModelId,
          messages: [{ role: "user", content: input.prompt }],
          max_tokens: input.maxOutputTokens,
          n: 1,
          service_tier: "standard_only",
          reasoning_effort: "none",
          stream: false,
          tools: [],
          tool_choice: "none",
        },
        input.signal,
      );
    } catch (error) {
      if (input.signal.aborted) throw new IntelligenceError("CANCELLED");
      // Pas de cause brute ni retry implicite ; seuls les codes internes sont conservés.
      throw new IntelligenceError(error instanceof IntelligenceError ? error.code : "INVALID_RESPONSE");
    }
    if (input.signal.aborted) throw new IntelligenceError("CANCELLED");
    if (response.status === 401 || response.status === 403) throw new IntelligenceError("AUTHENTICATION_REQUIRED");
    if (response.status === 429) throw new IntelligenceError("RATE_LIMITED");
    if (response.status === 503) throw new IntelligenceError("UNAVAILABLE");
    const body = response.body;
    if (
      response.status !== 200 ||
      !record(body) ||
      body.error != null ||
      body.object !== "chat.completion" ||
      body.model !== mistralTextModelId ||
      !Array.isArray(body.choices) ||
      body.choices.length !== 1
    )
      throw new IntelligenceError("INVALID_RESPONSE");
    const choice = body.choices[0];
    if (!record(choice) || choice.index !== 0 || choice.finish_reason !== "stop" || !record(choice.message))
      throw new IntelligenceError("INVALID_RESPONSE");
    const message = choice.message;
    if (message.refusal != null) throw new IntelligenceError("REFUSED");
    if (
      message.role !== "assistant" ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > 32_768 ||
      /<\/?think(?:\s|>)/iu.test(message.content) ||
      message.function_call != null ||
      (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length !== 0))
    )
      throw new IntelligenceError("INVALID_RESPONSE");
    // Les éventuels champs reasoning, usage, identifiants et métadonnées ne sont jamais rendus.
    const parsed = intelligenceTextSchema.safeParse({ text: message.content });
    if (!parsed.success) throw new IntelligenceError("INVALID_RESPONSE");
    return parsed.data;
  }
}
