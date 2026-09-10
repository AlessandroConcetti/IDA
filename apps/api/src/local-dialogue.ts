import type { FastifyInstance } from "fastify";
import { type IntelligencePolicy, intelligenceRequestSchema } from "@ida/contracts/intelligence";
import { ProviderRegistry, ToolGateway } from "@ida/domain";
import { OllamaAdapter } from "./ai-adapters.js";
import { CoreIntelligence, intelligenceProposalTool } from "./core-intelligence.js";
import type { DemoDatabase } from "./database.js";
import { localPilot } from "./evaluation/local-model-pin.js";
import { getRequestIdentityContext } from "./identity-context.js";
import { DeterministicIdaCore } from "./ida-core.js";
import { createPersistentIntelligenceAudit } from "./intelligence-audit.js";
import { LocalIntelligenceAccess } from "./local-intelligence-access.js";
import { OllamaLoopbackTransport } from "./ollama-transport.js";

/** Composition locale explicite : ne remplace ni le Core ni les agents métier. */
export function registerLocalDialogue(
  app: FastifyInstance,
  database: DemoDatabase,
  options: { enabled: boolean; locked: boolean },
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
  const bodySchema = intelligenceRequestSchema.pick({ prompt: true }).strict();
  app.addHook("onClose", async () => {
    for (const controller of controllers) controller.abort();
    transport.dispose();
    inventoryTransport.dispose();
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
    if (!enabled)
      return reply.code(503).send({
        error: { code: "LOCAL_AI_DISABLED", message: "Le dialogue IA local n’est pas activé sur ce serveur." },
      });
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
      return {
        data: {
          text: result.text,
          provider: "ollama",
          model: localPilot.name,
          locality: "LOCAL",
          experimental: true,
        },
      };
    } catch {
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
}
