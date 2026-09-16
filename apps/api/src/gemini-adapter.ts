import { type IntelligenceText, intelligenceTextSchema } from "@ida/contracts/intelligence";
import { type IntelligenceAdapter, IntelligenceError } from "@ida/domain";
import type { JsonInferenceTransport } from "./ai-adapters.js";

export const geminiTextModelId = "gemini-3.8-flash";
export const geminiGeneratePath = `/v1beta/models/${geminiTextModelId}:generateContent`;
type AdapterInput = Parameters<IntelligenceAdapter["generate"]>[0];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Texte seul, sans outils, cache explicite, historique distant ou raisonnement affiché. */
export class GeminiTextAdapter implements IntelligenceAdapter {
  readonly locality = "CLOUD" as const;
  constructor(
    readonly providerKey: string,
    private readonly transport: JsonInferenceTransport,
  ) {}

  async generate(input: AdapterInput): Promise<IntelligenceText> {
    if (input.signal.aborted) throw new IntelligenceError("CANCELLED");
    if (
      input.modelId !== geminiTextModelId ||
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
        geminiGeneratePath,
        {
          contents: [{ role: "user", parts: [{ text: input.prompt }] }],
          generationConfig: {
            maxOutputTokens: input.maxOutputTokens,
            thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false },
          },
          store: false,
        },
        input.signal,
      );
    } catch (error) {
      if (input.signal.aborted) throw new IntelligenceError("CANCELLED");
      throw new IntelligenceError(error instanceof IntelligenceError ? error.code : "INVALID_RESPONSE");
    }
    if (input.signal.aborted) throw new IntelligenceError("CANCELLED");
    if (response.status === 401 || response.status === 403) throw new IntelligenceError("AUTHENTICATION_REQUIRED");
    if (response.status === 429) throw new IntelligenceError("RATE_LIMITED");
    if (response.status === 503) throw new IntelligenceError("UNAVAILABLE");
    const body = response.body;
    if (response.status !== 200 || !record(body) || body.error != null) throw new IntelligenceError("INVALID_RESPONSE");
    if (record(body.promptFeedback) && body.promptFeedback.blockReason != null) throw new IntelligenceError("REFUSED");
    if (body.modelVersion !== geminiTextModelId || !Array.isArray(body.candidates) || body.candidates.length !== 1)
      throw new IntelligenceError("INVALID_RESPONSE");
    const candidate = body.candidates[0];
    if (!record(candidate)) throw new IntelligenceError("INVALID_RESPONSE");
    if (
      Array.isArray(candidate.safetyRatings) &&
      candidate.safetyRatings.some((rating) => record(rating) && rating.blocked === true)
    )
      throw new IntelligenceError("REFUSED");
    if (["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(String(candidate.finishReason)))
      throw new IntelligenceError("REFUSED");
    if (
      (candidate.index !== undefined && candidate.index !== 0) ||
      candidate.finishReason !== "STOP" ||
      !record(candidate.content) ||
      candidate.content.role !== "model" ||
      !Array.isArray(candidate.content.parts) ||
      candidate.content.parts.length < 1 ||
      candidate.content.parts.length > 100
    )
      throw new IntelligenceError("INVALID_RESPONSE");

    const parts: string[] = [];
    let length = 0;
    for (const part of candidate.content.parts) {
      if (
        !record(part) ||
        Object.keys(part).some((key) => !["text", "thought", "thoughtSignature"].includes(key)) ||
        typeof part.text !== "string" ||
        (part.thought !== undefined && typeof part.thought !== "boolean") ||
        (part.thoughtSignature !== undefined && typeof part.thoughtSignature !== "string")
      )
        throw new IntelligenceError("INVALID_RESPONSE");
      // Les pensées / signatures ne sont ni affichées ni reprises dans une requête.
      if (part.thought === true) continue;
      length += part.text.length;
      if (length > 32_768 || /<\/?think(?:\s|>)/iu.test(part.text)) throw new IntelligenceError("INVALID_RESPONSE");
      parts.push(part.text);
    }
    const text = parts.join("");
    if (!text.trim() || /<\/?think(?:\s|>)/iu.test(text)) throw new IntelligenceError("INVALID_RESPONSE");
    const parsed = intelligenceTextSchema.safeParse({ text });
    if (!parsed.success) throw new IntelligenceError("INVALID_RESPONSE");
    return parsed.data;
  }
}
