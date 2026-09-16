import type { ClientRequest, IncomingMessage } from "node:http";
import { request } from "node:https";
import { IntelligenceError } from "@ida/domain";
import type { JsonInferenceTransport } from "./ai-adapters.js";
import type { ConnectorSecret } from "./connector-vault.js";
import { mistralChatPath, mistralTextModelId } from "./mistral-adapter.js";

export type MistralTransportConfig = {
  secret?: ConnectorSecret;
  enabled?: boolean;
  // Attestation serveur revue, jamais déduite de la clé ou d'un tarif public.
  reviewedFreePlan?: boolean;
};
type JsonResponse = Awaited<ReturnType<JsonInferenceTransport["post"]>>;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_RESPONSE_BYTES = 128 * 1024;
const DEADLINE_MS = 30_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function cancelled(signal: AbortSignal): IntelligenceError {
  return new IntelligenceError(
    signal.reason instanceof IntelligenceError && signal.reason.code === "TIMEOUT" ? "TIMEOUT" : "CANCELLED",
  );
}

/** Destination HTTPS fixe. Aucun appel, déchiffrement ou démarrage implicite. */
export class MistralHttpsTransport implements JsonInferenceTransport {
  private readonly enabled: boolean;
  private readonly reviewedFreePlan: boolean;
  private readonly secret?: ConnectorSecret;
  private active?: AbortController;
  private disposed = false;

  constructor(config: MistralTransportConfig = {}) {
    if (
      !record(config) ||
      Object.keys(config).some((key) => !["secret", "enabled", "reviewedFreePlan"].includes(key)) ||
      (config.enabled !== undefined && typeof config.enabled !== "boolean") ||
      (config.reviewedFreePlan !== undefined && typeof config.reviewedFreePlan !== "boolean") ||
      (config.secret !== undefined &&
        (!record(config.secret) ||
          typeof config.secret.available !== "function" ||
          typeof config.secret.resolve !== "function"))
    )
      throw new IntelligenceError("CONFIGURATION_INVALID");
    this.enabled = config.enabled === true;
    this.reviewedFreePlan = config.reviewedFreePlan === true;
    this.secret = config.secret;
  }

  /** Métadonnée du coffre uniquement : ne prouve ni validité de clé, ni plan, ni quota. */
  async available(): Promise<boolean> {
    if (this.disposed || !this.secret) return false;
    try {
      return (await this.secret.available()) === true && !this.disposed;
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.active?.abort();
  }

  async post(path: string, body: Record<string, unknown>, signal: AbortSignal): Promise<JsonResponse> {
    if (
      path !== mistralChatPath ||
      !record(body) ||
      !exactKeys(body, [
        "model",
        "messages",
        "max_tokens",
        "n",
        "service_tier",
        "reasoning_effort",
        "stream",
        "tools",
        "tool_choice",
      ])
    )
      throw new IntelligenceError("INVALID_REQUEST");
    const message = Array.isArray(body.messages) && body.messages.length === 1 ? body.messages[0] : undefined;
    if (
      body.model !== mistralTextModelId ||
      !record(message) ||
      !exactKeys(message, ["role", "content"]) ||
      message.role !== "user" ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > 8192 ||
      !Number.isSafeInteger(body.max_tokens) ||
      Number(body.max_tokens) < 1 ||
      Number(body.max_tokens) > 512 ||
      body.n !== 1 ||
      body.service_tier !== "standard_only" ||
      body.reasoning_effort !== "none" ||
      body.stream !== false ||
      !Array.isArray(body.tools) ||
      body.tools.length !== 0 ||
      body.tool_choice !== "none"
    )
      throw new IntelligenceError("INVALID_REQUEST");
    // Copie avant tout await, sans URL, identité ou en-têtes fournis par l'appelant.
    const payload = JSON.stringify({
      model: mistralTextModelId,
      messages: [{ role: "user", content: message.content }],
      max_tokens: body.max_tokens,
      n: 1,
      service_tier: "standard_only",
      reasoning_effort: "none",
      stream: false,
      tools: [],
      tool_choice: "none",
    });
    if (Buffer.byteLength(payload) > MAX_REQUEST_BYTES) throw new IntelligenceError("INVALID_REQUEST");
    if (this.disposed || !this.enabled || !this.reviewedFreePlan) throw new IntelligenceError("FORBIDDEN");
    if (signal.aborted) throw new IntelligenceError("CANCELLED");
    if (!this.secret) throw new IntelligenceError("AUTHENTICATION_REQUIRED");
    if (this.active) throw new IntelligenceError("RATE_LIMITED");
    const secret = this.secret;
    const controller = new AbortController();
    this.active = controller;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new IntelligenceError("TIMEOUT")), DEADLINE_MS);
    let abortListener: (() => void) | undefined;
    try {
      const interrupted = new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(cancelled(controller.signal));
        controller.signal.addEventListener("abort", abortListener, { once: true });
      });
      const operation = async () => {
        let token: string;
        try {
          token = await secret.resolve(controller.signal);
        } catch {
          throw new IntelligenceError("AUTHENTICATION_REQUIRED");
        }
        if (controller.signal.aborted) throw cancelled(controller.signal);
        if (typeof token !== "string" || !/^[A-Za-z0-9._~-]{16,8192}$/u.test(token))
          throw new IntelligenceError("AUTHENTICATION_REQUIRED");
        return this.exchange(payload, token, controller.signal);
      };
      return await Promise.race([interrupted, operation()]);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      if (this.active === controller) this.active = undefined;
    }
  }

  private exchange(payload: string, token: string, signal: AbortSignal): Promise<JsonResponse> {
    if (signal.aborted) return Promise.reject(cancelled(signal));
    return new Promise((resolve, reject) => {
      let req: ClientRequest | undefined;
      let response: IncomingMessage | undefined;
      const chunks: Buffer[] = [];
      let settled = false;
      const finish = (error?: IntelligenceError, result?: JsonResponse) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        chunks.length = 0;
        response?.destroy();
        req?.destroy();
        if (error) reject(error);
        else if (result) resolve(result);
      };
      const invalid = () => finish(new IntelligenceError("INVALID_RESPONSE"));
      const abort = () => finish(cancelled(signal));
      signal.addEventListener("abort", abort, { once: true });
      try {
        req = request(
          {
            protocol: "https:",
            hostname: "api.mistral.ai",
            port: 443,
            method: "POST",
            path: mistralChatPath,
            agent: false,
            rejectUnauthorized: true,
            maxHeaderSize: 8192,
            headers: {
              accept: "application/json",
              "accept-encoding": "identity",
              connection: "close",
              "content-type": "application/json",
              "content-length": Buffer.byteLength(payload),
              authorization: `Bearer ${token}`,
            },
          },
          (incoming) => {
            response = incoming;
            if (settled) {
              incoming.destroy();
              return;
            }
            incoming.on("error", invalid);
            incoming.on("aborted", invalid);
            incoming.on("close", () => {
              if (!incoming.complete) invalid();
            });
            // Aucun suivi de Location, ni restitution du corps/des en-têtes d'erreur.
            if (incoming.statusCode !== 200) {
              if (incoming.statusCode && [401, 403, 429, 503].includes(incoming.statusCode))
                finish(undefined, { status: incoming.statusCode, body: null });
              else invalid();
              return;
            }
            const contentLength = incoming.headers["content-length"];
            if (
              !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(incoming.headers["content-type"] ?? "") ||
              (incoming.headers["content-encoding"] !== undefined &&
                incoming.headers["content-encoding"] !== "identity") ||
              (contentLength !== undefined &&
                (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES))
            ) {
              invalid();
              return;
            }
            let bytes = 0;
            incoming.on("data", (chunk: Buffer) => {
              if (settled) return;
              if (!Buffer.isBuffer(chunk) || bytes + chunk.length > MAX_RESPONSE_BYTES) {
                invalid();
                return;
              }
              bytes += chunk.length;
              chunks.push(chunk);
            });
            incoming.on("end", () => {
              if (settled) return;
              try {
                if (!incoming.complete || (contentLength !== undefined && Number(contentLength) !== bytes)) {
                  invalid();
                  return;
                }
                const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
                finish(undefined, { status: 200, body: JSON.parse(text) });
              } catch {
                invalid();
              }
            });
          },
        );
        req.on("error", invalid);
        req.on("upgrade", (_incoming, socket) => {
          socket.destroy();
          invalid();
        });
        req.end(payload);
      } catch {
        invalid();
      }
    });
  }
}
