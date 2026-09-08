import { type ClientRequest, type IncomingMessage, request } from "node:http";
import { IntelligenceError } from "@ida/domain";
import type { JsonInferenceTransport } from "./ai-adapters.js";

type JsonResponse = Awaited<ReturnType<JsonInferenceTransport["post"]>>;
type ModelPin = { name: string; digest: string };
export type InstalledOllamaModel = ModelPin & { size: number };

/** Configuration serveur revue, jamais un body HTTP client ou une sortie de modèle. */
export type OllamaTransportConfig = {
  enabled?: boolean;
  // Attestation d'exploitation, PAS une détection de la configuration du daemon.
  localOnlyDeploymentApproved?: boolean;
  models?: readonly ModelPin[];
  port?: number;
  timeoutMs?: number;
  contextTokens?: number;
};

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REQUEST_BYTES = 192 * 1024;
const modelName = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)?:[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const digestPattern = /^[a-f0-9]{64}$/;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function localModelName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 160 &&
    modelName.test(value) &&
    !/(?:^|[:/_.-])cloud(?:$|[:/_.-])/i.test(value)
  );
}
function boundedInteger(value: unknown, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= max;
}
function cancelled(signal: AbortSignal): IntelligenceError {
  return new IntelligenceError(
    signal.reason instanceof IntelligenceError && signal.reason.code === "TIMEOUT" ? "TIMEOUT" : "CANCELLED",
  );
}

/**
 * Transport Node réel, non composé dans la démo. Aucun DNS, proxy, redirect,
 * téléchargement ou démarrage de processus. Le daemon doit être contrôlé et
 * démarré sans cloud ; une socket loopback ne prouve pas son absence d'egress.
 */
export class OllamaLoopbackTransport implements JsonInferenceTransport {
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly contextTokens: number;
  private readonly enabled: boolean;
  private readonly localOnlyApproved: boolean;
  private readonly pins = new Map<string, string>();
  private active?: AbortController;
  private disposed = false;

  constructor(config: OllamaTransportConfig = {}) {
    if (
      !record(config) ||
      Object.keys(config).some(
        (key) =>
          !["enabled", "localOnlyDeploymentApproved", "models", "port", "timeoutMs", "contextTokens"].includes(key),
      ) ||
      (config.enabled !== undefined && typeof config.enabled !== "boolean") ||
      (config.localOnlyDeploymentApproved !== undefined && typeof config.localOnlyDeploymentApproved !== "boolean") ||
      (config.port !== undefined && !boundedInteger(config.port, 65535)) ||
      (config.timeoutMs !== undefined && !boundedInteger(config.timeoutMs, 120_000)) ||
      (config.contextTokens !== undefined &&
        (!boundedInteger(config.contextTokens, 8192) || config.contextTokens < 512)) ||
      (config.models !== undefined && (!Array.isArray(config.models) || config.models.length > 16))
    )
      throw new IntelligenceError("CONFIGURATION_INVALID");
    this.port = config.port ?? 11434;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.contextTokens = config.contextTokens ?? 4096;
    this.enabled = config.enabled === true;
    this.localOnlyApproved = config.localOnlyDeploymentApproved === true;
    for (const model of config.models ?? []) {
      if (
        !record(model) ||
        !exactKeys(model, ["name", "digest"]) ||
        !localModelName(model.name) ||
        typeof model.digest !== "string" ||
        !digestPattern.test(model.digest) ||
        this.pins.has(model.name)
      )
        throw new IntelligenceError("CONFIGURATION_INVALID");
      this.pins.set(model.name, model.digest);
    }
  }

  /** Arrêt définitif de cette instance et fermeture de l'échange actif. */
  dispose(): void {
    this.disposed = true;
    this.active?.abort();
  }

  /** Lecture seule explicite : aucun chargement ni approbation automatique. */
  inspectInstalledModels(signal: AbortSignal): Promise<InstalledOllamaModel[]> {
    return this.operation(signal, (activeSignal) => this.inventory(activeSignal));
  }

  async post(path: string, body: Record<string, unknown>, signal: AbortSignal): Promise<JsonResponse> {
    if (
      path !== "/api/chat" ||
      !record(body) ||
      !exactKeys(body, ["model", "messages", "stream", "tools", "options", "keep_alive"])
    ) {
      throw new IntelligenceError("INVALID_REQUEST");
    }
    const message = Array.isArray(body.messages) && body.messages.length === 1 ? body.messages[0] : undefined;
    if (
      !localModelName(body.model) ||
      !this.pins.has(body.model) ||
      !record(message) ||
      !exactKeys(message, ["role", "content"]) ||
      message.role !== "user" ||
      typeof message.content !== "string" ||
      message.content.length < 1 ||
      message.content.length > 32_000 ||
      body.stream !== false ||
      !Array.isArray(body.tools) ||
      body.tools.length !== 0 ||
      body.keep_alive !== 0 ||
      !record(body.options) ||
      !exactKeys(body.options, ["num_predict"]) ||
      !boundedInteger(body.options.num_predict, 8192)
    )
      throw new IntelligenceError("INVALID_REQUEST");
    // Copier avant tout await : aucune mutation de l'appelant pendant GET /tags.
    const name = body.model;
    const payload = JSON.stringify({
      model: name,
      messages: [{ role: "user", content: message.content }],
      stream: false,
      tools: [],
      options: { num_predict: body.options.num_predict, num_ctx: this.contextTokens },
      keep_alive: 0,
    });
    if (Buffer.byteLength(payload) > MAX_REQUEST_BYTES) throw new IntelligenceError("INVALID_REQUEST");
    return this.operation(signal, async (activeSignal) => {
      const installed = await this.inventory(activeSignal);
      if (!installed.some((model) => model.name === name && model.digest === this.pins.get(name))) {
        throw new IntelligenceError("NO_COMPATIBLE_MODEL");
      }
      return this.exchange("POST", "/api/chat", activeSignal, payload);
    });
  }

  private async operation<T>(signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.disposed || !this.enabled || !this.localOnlyApproved) throw new IntelligenceError("FORBIDDEN");
    if (signal.aborted) throw new IntelligenceError("CANCELLED");
    // Une seule opération, inventaire inclus ; pas de file de prompts en attente.
    if (this.active) throw new IntelligenceError("RATE_LIMITED");
    const controller = new AbortController();
    this.active = controller;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new IntelligenceError("TIMEOUT")), this.timeoutMs);
    try {
      const result = await run(controller.signal);
      if (controller.signal.aborted) throw cancelled(controller.signal);
      return result;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      this.active = undefined;
    }
  }

  private async inventory(signal: AbortSignal): Promise<InstalledOllamaModel[]> {
    const response = await this.exchange("GET", "/api/tags", signal);
    if (
      response.status !== 200 ||
      !record(response.body) ||
      !Array.isArray(response.body.models) ||
      response.body.models.length > 128
    ) {
      throw new IntelligenceError("INVALID_RESPONSE");
    }
    const names = new Set<string>();
    const models: InstalledOllamaModel[] = [];
    for (const item of response.body.models) {
      if (!record(item) || typeof item.name !== "string" || names.has(item.name))
        throw new IntelligenceError("INVALID_RESPONSE");
      names.add(item.name);
      if (!localModelName(item.name)) continue; // Modèles distants/non pris en charge exclus, pas approuvés.
      if (
        typeof item.digest !== "string" ||
        !digestPattern.test(item.digest) ||
        !boundedInteger(item.size, Number.MAX_SAFE_INTEGER) ||
        (item.model !== undefined && item.model !== item.name) ||
        item.remote_model != null ||
        item.remote_host != null
      )
        throw new IntelligenceError("INVALID_RESPONSE");
      // Jamais les templates, paramètres, détails, chemins ou erreurs du daemon.
      models.push({ name: item.name, digest: item.digest, size: item.size });
    }
    return models;
  }

  private exchange(
    method: "GET" | "POST",
    path: "/api/tags" | "/api/chat",
    signal: AbortSignal,
    payload?: string,
  ): Promise<JsonResponse> {
    if (signal.aborted) return Promise.reject(cancelled(signal));
    return new Promise((resolve, reject) => {
      let req: ClientRequest | undefined;
      let response: IncomingMessage | undefined;
      let settled = false;
      const finish = (error?: IntelligenceError, result?: JsonResponse) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
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
            hostname: "127.0.0.1",
            family: 4,
            port: this.port,
            method,
            path,
            agent: false,
            maxHeaderSize: 8192,
            headers: {
              accept: "application/json",
              "accept-encoding": "identity",
              connection: "close",
              ...(payload === undefined
                ? {}
                : { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }),
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
            // Jamais de suivi de Location ni de corps/en-têtes d'erreur retournés.
            if (incoming.statusCode !== 200) {
              if (incoming.statusCode && [401, 403, 429, 503].includes(incoming.statusCode)) {
                finish(undefined, { status: incoming.statusCode, body: null });
              } else invalid();
              return;
            }
            const contentType = incoming.headers["content-type"] ?? "";
            const contentLength = incoming.headers["content-length"];
            if (
              !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType) ||
              (incoming.headers["content-encoding"] !== undefined &&
                incoming.headers["content-encoding"] !== "identity") ||
              (contentLength !== undefined &&
                (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES))
            ) {
              invalid();
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            incoming.on("data", (chunk: Buffer) => {
              if (settled) return;
              bytes += chunk.length;
              if (bytes > MAX_RESPONSE_BYTES) {
                invalid();
                return;
              }
              chunks.push(chunk);
            });
            incoming.on("end", () => {
              if (settled) return;
              try {
                const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
                finish(undefined, { status: 200, body: JSON.parse(text) });
              } catch {
                invalid();
              }
            });
          },
        );
        req.on("error", invalid); // Ni cause réseau brute, ni retry implicite.
        req.on("upgrade", (_response, socket) => {
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
