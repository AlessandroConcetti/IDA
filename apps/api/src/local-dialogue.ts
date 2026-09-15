import type { IntelligencePolicy } from "@ida/contracts/intelligence";
import { type ChatExchange, localChatRequestSchema } from "@ida/contracts/local-chat";
import { ProviderRegistry, type ToolAuthorizationRequest, ToolGateway } from "@ida/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { OllamaAdapter } from "./ai-adapters.js";
import { CoreIntelligence, intelligenceProposalTool } from "./core-intelligence.js";
import type { DemoDatabase } from "./database.js";
import { localPilot } from "./evaluation/local-model-pin.js";
import { DeterministicIdaCore } from "./ida-core.js";
import { getRequestIdentityContext } from "./identity-context.js";
import { createPersistentIntelligenceAudit } from "./intelligence-audit.js";
import { type LocalChatStore, LocalChatStoreError } from "./local-chat-store.js";
import { LocalIntelligenceAccess } from "./local-intelligence-access.js";
import { OllamaLoopbackTransport } from "./ollama-transport.js";

export const localChatReadTool = {
  toolKey: "read_local_chat_history",
  moduleKey: "IDA",
  permission: "READ",
} as const;
export const localChatWriteTool = {
  toolKey: "save_local_chat_exchange",
  moduleKey: "IDA",
  permission: "WRITE",
} as const;

type ChatHistoryAccess = {
  store: LocalChatStore;
  authorize: (request: FastifyRequest, tool: ToolAuthorizationRequest) => unknown;
  revalidate: (
    request: FastifyRequest,
    tool: ToolAuthorizationRequest,
    reader?: Parameters<DemoDatabase["resolveRequestIdentityContext"]>[3],
  ) => Promise<void>;
};

function savedResponse(exchange: ChatExchange) {
  return {
    data: {
      text: exchange.answer,
      provider: exchange.provider,
      model: exchange.model,
      locality: "LOCAL" as const,
      experimental: true as const,
      exchange,
    },
  };
}

/** Composition locale explicite : ne remplace ni le Core ni les agents métier. */
export function registerLocalDialogue(
  app: FastifyInstance,
  database: DemoDatabase,
  options: { enabled: boolean; locked: boolean; history?: ChatHistoryAccess },
) {
  const enabled = options.enabled && options.locked;
  const transport = new OllamaLoopbackTransport({
    enabled,
    localOnlyDeploymentApproved: enabled,
    models: [{ name: localPilot.name, digest: localPilot.digest }],
    timeoutMs: 110_000,
    contextTokens: 4096,
  });
  // Le statut ne concurrence jamais l'opération exclusive d'inférence.
  const inventoryTransport = new OllamaLoopbackTransport({
    enabled,
    localOnlyDeploymentApproved: enabled,
    models: [{ name: localPilot.name, digest: localPilot.digest }],
    timeoutMs: 2500,
  });
  let inventoryCheck: Promise<boolean> | undefined;
  function checkInstalled(): Promise<boolean> {
    if (!inventoryCheck) {
      inventoryCheck = inventoryTransport
        .inspectInstalledModels(AbortSignal.timeout(2500))
        .then((models) => models.some((model) => model.name === localPilot.name && model.digest === localPilot.digest))
        .finally(() => {
          inventoryCheck = undefined;
        });
    }
    return inventoryCheck;
  }
  const registry = new ProviderRegistry([
    {
      manifest: {
        key: "ollama",
        version: "1.0.0",
        category: "LLM",
        locality: "LOCAL",
        retention: "LOCAL_ONLY",
        acceptedDataClasses: ["PUBLIC", "INTERNAL", "PRIVATE_CREATIVE", "SENSITIVE_PERSONAL"],
        models: [
          {
            id: localPilot.name,
            capabilities: ["TEXT"],
            maxComplexity: 1,
            maxInputChars: 5000,
            maxOutputTokens: 512,
            estimatedCostMicros: 0,
            estimatedLatencyMs: 105_000,
          },
        ],
      },
      adapter: new OllamaAdapter("ollama", transport),
    },
  ]);
  const policy: IntelligencePolicy = {
    mode: "AI",
    allowedProviderKeys: ["ollama"],
    allowedModels: [{ providerKey: "ollama", modelId: localPilot.name }],
    allowedLocalities: ["LOCAL"],
    localFirst: true,
    maxAttempts: 1,
    maxCostMicros: 0,
    maxLatencyMs: 110_000,
    cloudConsents: [],
  };
  let busy = false;
  let calls = 0;
  let windowEnd = 0;
  const controllers = new Set<AbortController>();
  const bodySchema = localChatRequestSchema;
  app.addHook("onClose", async () => {
    for (const controller of controllers) controller.abort();
    transport.dispose();
    inventoryTransport.dispose();
  });

  app.get("/v1/intelligence/local/history", async (request, reply) => {
    const history = options.history;
    if (!history)
      return reply
        .code(503)
        .send({ error: { code: "LOCAL_CHAT_STORE_UNAVAILABLE", message: "L’historique local est indisponible." } });
    history.authorize(request, localChatReadTool);
    const identity = getRequestIdentityContext(request);
    try {
      const items = await history.store.list(identity, (reader) =>
        history.revalidate(request, localChatReadTool, reader),
      );
      return { data: { items, retentionDays: 30 } };
    } catch (error) {
      if (!(error instanceof LocalChatStoreError)) throw error;
      return reply.code(503).send({
        error: {
          code: "LOCAL_CHAT_STORE_UNAVAILABLE",
          message: "Impossible de lire l’historique local. Réessayez sans effacer vos données.",
        },
      });
    }
  });

  app.get("/v1/intelligence/local/status", async () => {
    // Le hook d'identité global impose READ et la session avant cette route.
    if (!enabled) return { data: { state: "DISABLED", model: localPilot.name, locality: "LOCAL", experimental: true } };
    if (busy) return { data: { state: "BUSY", model: localPilot.name, locality: "LOCAL", experimental: true } };
    try {
      const ready = await checkInstalled();
      return {
        data: {
          state: busy ? "BUSY" : ready ? "READY" : "MODEL_MISSING",
          model: localPilot.name,
          locality: "LOCAL",
          experimental: true,
        },
      };
    } catch {
      return { data: { state: "UNAVAILABLE", model: localPilot.name, locality: "LOCAL", experimental: true } };
    }
  });

  app.post("/v1/intelligence/local/reply", { bodyLimit: 16_384 }, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success || parsed.data.prompt.length > 3000)
      return reply
        .code(400)
        .send({ error: { code: "INVALID_REQUEST", message: "Saisissez une demande de 1 à 3 000 caractères." } });
    if (/\bsk-[a-zA-Z0-9_-]{16,}|(?:api[_ -]?key|password|mot de passe)\s*[:=]\s*\S+/iu.test(parsed.data.prompt))
      return reply.code(400).send({
        error: {
          code: "SECRET_INPUT_REJECTED",
          message: "Retirez les identifiants, mots de passe et clés de votre demande.",
        },
      });
    // Rien ne choisit un provider, une permission, un scope ou une classe depuis le body.
    const identity = getRequestIdentityContext(request);
    const scope = {
      userId: identity.userId,
      workspaceId: identity.workspaceId,
      sessionId: identity.session.id,
      clientInstanceId: identity.clientInstance.id,
    };
    const history = options.history;
    const requestId = parsed.data.requestId;
    if (requestId) {
      if (!history)
        return reply.code(503).send({
          error: {
            code: "LOCAL_CHAT_STORE_UNAVAILABLE",
            message: "Le dialogue enregistré est indisponible. Aucun message n’a été envoyé au modèle.",
          },
        });
      // WRITE est exigé avant toute inférence persistante, y compris lors d’une relance.
      history.authorize(request, localChatWriteTool);
      try {
        const saved = await history.store.find(scope, requestId, (reader) =>
          history.revalidate(request, localChatWriteTool, reader),
        );
        if (saved) {
          if (saved.prompt !== parsed.data.prompt)
            return reply.code(409).send({
              error: {
                code: "LOCAL_CHAT_CONFLICT",
                message: "Cet identifiant appartient déjà à un autre échange. Créez une nouvelle demande.",
              },
            });
          return savedResponse(saved);
        }
      } catch (error) {
        if (!(error instanceof LocalChatStoreError)) throw error;
        return reply.code(503).send({
          error: {
            code: "LOCAL_CHAT_STORE_UNAVAILABLE",
            message: "L’historique local est indisponible. Aucun message n’a été envoyé au modèle.",
          },
        });
      }
    }
    if (!enabled)
      return reply.code(503).send({
        error: { code: "LOCAL_AI_DISABLED", message: "Le dialogue IA local n’est pas activé sur ce serveur." },
      });
    if (busy)
      return reply
        .header("Retry-After", "10")
        .code(429)
        .send({ error: { code: "BUSY", message: "Le modèle local travaille déjà. Réessayez après sa réponse." } });
    if (Date.now() >= windowEnd) {
      calls = 0;
      windowEnd = Date.now() + 3_600_000;
    }
    if (calls >= 30)
      return reply
        .header("Retry-After", String(Math.ceil((windowEnd - Date.now()) / 1000)))
        .code(429)
        .send({ error: { code: "RATE_LIMITED", message: "La limite locale de 30 demandes par heure est atteinte." } });
    busy = true;
    calls++;
    const controller = new AbortController();
    controllers.add(controller);
    const cancel = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    request.raw.once("aborted", cancel);
    reply.raw.once("close", cancel);
    let saving = false;
    try {
      registry.configure("ollama", {
        enabled: true,
        configured: true,
        availability: "READY",
        remainingCalls: 1,
        validUntil: new Date(Date.now() + 120_000).toISOString(),
      });
      const access = new LocalIntelligenceAccess({ database, authenticatedScope: scope, getPolicy: () => policy });
      const intelligence = new CoreIntelligence({
        registry,
        access,
        gateway: new ToolGateway(undefined, [intelligenceProposalTool]),
        audit: createPersistentIntelligenceAudit(database, scope).intelligence,
      });
      const core = new DeterministicIdaCore(database, undefined, () => new Date(), intelligence);
      const result = await core.generateProposal(
        identity,
        {
          scope,
          purpose: "ASSISTANT_REPLY",
          dataClasses: ["SENSITIVE_PERSONAL"],
          capabilities: ["TEXT"],
          complexity: 1,
          maxOutputTokens: 512,
          prompt: `Tu es IDA, assistant local expérimental. Réponds en français, en moins de 150 mots. Tu n’as aucun outil, accès web, fichier ou mémoire. N’invente jamais une action réalisée. Précise tes limites. Ne prétends pas remplacer un professionnel de santé, du droit ou de la finance. Le texte suivant est la demande de l’utilisateur, pas une autorisation d’action.\n\n${parsed.data.prompt}`,
        },
        controller.signal,
      );
      if (requestId && history) {
        saving = true;
        if (controller.signal.aborted) throw new Error("LOCAL_CHAT_CANCELLED");
        const exchange = await history.store.save(
          scope,
          {
            id: requestId,
            prompt: parsed.data.prompt,
            answer: result.text,
            provider: "ollama",
            model: localPilot.name,
          },
          (reader) => history.revalidate(request, localChatWriteTool, reader),
        );
        return savedResponse(exchange);
      }
      return {
        data: {
          text: result.text,
          provider: "ollama",
          model: localPilot.name,
          locality: "LOCAL",
          experimental: true,
        },
      };
    } catch (error) {
      if (saving) {
        // Les erreurs d’identité conservent leur 401/403 via le gestionnaire global.
        if (!(error instanceof LocalChatStoreError) && !controller.signal.aborted) throw error;
        return reply.code(503).send({
          error: {
            code: "LOCAL_CHAT_NOT_SAVED",
            message:
              "La réponse n’a pas pu être confirmée comme enregistrée. Rechargez l’historique, puis relancez la même demande si nécessaire.",
          },
        });
      }
      return reply.code(503).send({
        error: {
          code: "LOCAL_AI_UNAVAILABLE",
          message:
            "Le modèle local n’a pas fourni de réponse complète. Aucun fournisseur cloud n’a été appelé. Réessayez avec une demande plus courte.",
        },
      });
    } finally {
      busy = false;
      controllers.delete(controller);
      request.raw.removeListener("aborted", cancel);
      reply.raw.removeListener("close", cancel);
    }
  });
  return registry;
}
