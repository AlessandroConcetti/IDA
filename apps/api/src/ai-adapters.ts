import { type IntelligenceText, intelligenceTextSchema } from "@ida/contracts/intelligence";
import { type IntelligenceAdapter, IntelligenceError } from "@ida/domain";

/**
 * Port serveur uniquement. Le transport fixe la destination revue, refuse
 * redirections/URLs clientes, borne la réponse et résout les secrets hors prompts.
 * OllamaLoopbackTransport est disponible ; l'egress du daemon reste à contrôler
 * au déploiement. Aucune activation réseau ni lecture d'env par ces adaptateurs.
 */
export interface JsonInferenceTransport {
  post(path: string, body: Record<string, unknown>, signal: AbortSignal): Promise<{ status: number; body: unknown }>;
}

type AdapterInput = Parameters<IntelligenceAdapter["generate"]>[0];
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function post(
  transport: JsonInferenceTransport,
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (signal.aborted) throw new IntelligenceError("CANCELLED");
  let response: Awaited<ReturnType<JsonInferenceTransport["post"]>>;
  try {
    response = await transport.post(path, body, signal);
  } catch {
    // Une erreur réseau inconnue peut masquer un appel déjà facturé : pas de retry implicite.
    throw new IntelligenceError(signal.aborted ? "CANCELLED" : "INVALID_RESPONSE");
  }
  if (signal.aborted) throw new IntelligenceError("CANCELLED");
  if (response.status === 401 || response.status === 403) throw new IntelligenceError("AUTHENTICATION_REQUIRED");
  if (response.status === 429) throw new IntelligenceError("RATE_LIMITED");
  if (response.status === 503) throw new IntelligenceError("UNAVAILABLE");
  if (response.status !== 200 || !record(response.body)) throw new IntelligenceError("INVALID_RESPONSE");
  return response.body;
}
function textResult(text: string): IntelligenceText {
  const parsed = intelligenceTextSchema.safeParse({ text });
  if (!parsed.success) throw new IntelligenceError("INVALID_RESPONSE");
  return parsed.data;
}

/** OpenAI officiel /v1/responses ; Astra reste un modelId, jamais un nouveau Core. */
export class OpenAIResponsesAdapter implements IntelligenceAdapter {
  readonly locality = "CLOUD" as const;
  constructor(
    readonly providerKey: string,
    private readonly transport: JsonInferenceTransport,
  ) {}
  async generate(input: AdapterInput): Promise<IntelligenceText> {
    const body = await post(
      this.transport,
      "/v1/responses",
      {
        model: input.modelId,
        input: input.prompt,
        max_output_tokens: input.maxOutputTokens,
        store: false,
        stream: false,
        tools: [],
        tool_choice: "none",
      },
      input.signal,
    );
    if (body.status !== "completed" || body.error != null || !Array.isArray(body.output) || body.output.length > 100) {
      throw new IntelligenceError("INVALID_RESPONSE");
    }
    const parts: string[] = [];
    for (const item of body.output) {
      if (!record(item)) throw new IntelligenceError("INVALID_RESPONSE");
      if (item.type === "reasoning") continue; // Ne pas exposer le raisonnement interne.
      if (
        item.type !== "message" ||
        item.role !== "assistant" ||
        item.status !== "completed" ||
        !Array.isArray(item.content) ||
        item.content.length > 100
      )
        throw new IntelligenceError("INVALID_RESPONSE");
      for (const content of item.content) {
        if (!record(content)) throw new IntelligenceError("INVALID_RESPONSE");
        if (content.type === "refusal") throw new IntelligenceError("REFUSED");
        if (content.type !== "output_text" || typeof content.text !== "string" || content.text.length > 65_536) {
          throw new IntelligenceError("INVALID_RESPONSE");
        }
        parts.push(content.text);
      }
    }
    return textResult(parts.join("\n"));
  }
}

/** Port Ollama /api/chat pour un modèle installé localement, jamais ollama.com. */
export class OllamaAdapter implements IntelligenceAdapter {
  readonly locality = "LOCAL" as const;
  constructor(
    readonly providerKey: string,
    private readonly transport: JsonInferenceTransport,
  ) {}
  async generate(input: AdapterInput): Promise<IntelligenceText> {
    const body = await post(
      this.transport,
      "/api/chat",
      {
        model: input.modelId,
        messages: [{ role: "user", content: input.prompt }],
        stream: false,
        tools: [],
        options: { num_predict: input.maxOutputTokens },
        keep_alive: 0,
      },
      input.signal,
    );
    if (
      body.done !== true ||
      body.done_reason !== "stop" ||
      body.error != null ||
      !record(body.message) ||
      body.message.role !== "assistant" ||
      typeof body.message.content !== "string" ||
      (body.message.tool_calls !== undefined &&
        (!Array.isArray(body.message.tool_calls) || body.message.tool_calls.length !== 0))
    ) {
      throw new IntelligenceError("INVALID_RESPONSE");
    }
    return textResult(body.message.content);
  }
}
