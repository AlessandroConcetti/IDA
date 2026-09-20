import {
  type IntelligenceNetwork,
  intelligenceNetworkResponseSchema,
  type NetworkProvider,
} from "@ida/contracts/intelligence-network";
import { type ProviderCandidate, type ProviderRegistry, QuotaManager } from "@ida/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { providerAssignmentRole } from "./intelligence-assignments.js";
import { preparedIntelligenceOffers } from "./intelligence-offers.js";

export const intelligenceNetworkReadTool = {
  toolKey: "read_intelligence_network",
  moduleKey: "IDA",
  permission: "READ",
} as const;

function status(
  provider: ProviderCandidate,
  model: ProviderCandidate["manifest"]["models"][number],
  now: number,
): NetworkProvider["status"] {
  if (!provider.state.configured) return "NOT_CONFIGURED";
  if (!provider.state.enabled || provider.manifest.retention === "UNKNOWN") return "BLOCKED";
  if (model.estimatedCostMicros !== 0) return model.estimatedCostMicros === null ? "UNKNOWN" : "BLOCKED";
  if (provider.state.availability === "UNAVAILABLE" || provider.health[model.id]?.available === false)
    return provider.quota.exhausted ? "QUOTA_EXCEEDED" : "UNAVAILABLE";
  if (provider.state.availability !== "READY" || Date.parse(provider.state.validUntil) <= now) return "UNKNOWN";
  if (provider.state.remainingCalls < 1) return "QUOTA_EXCEEDED";
  return provider.manifest.locality === "LOCAL" ? "AVAILABLE_FREE" : QuotaManager.status(provider.quota, model.id, now);
}

const taskDefinitions: Array<Pick<IntelligenceNetwork["tasks"][number], "task" | "requires" | "transport">> = [
  { task: "Dialogue, synthèse et traduction", requires: ["TEXT"], transport: "TEXT_READY" },
  { task: "Code", requires: ["TEXT", "CODE"], transport: "TEXT_READY" },
  { task: "Raisonnement", requires: ["REASONING"], transport: "TEXT_READY" },
  { task: "Analyse documentaire longue", requires: ["TEXT", "LONG_CONTEXT"], transport: "TEXT_READY" },
  { task: "Sorties structurées", requires: ["STRUCTURED_OUTPUT"], transport: "TEXT_READY" },
  { task: "Propositions d’outils (sans exécution)", requires: ["TOOL_CALLING"], transport: "TEXT_READY" },
  { task: "Recherche web avec sources", requires: ["TEXT", "TOOL_CALLING"], transport: "PREPARED" },
  { task: "Vision", requires: ["VISION"], transport: "PREPARED" },
  { task: "Embeddings", requires: ["EMBEDDINGS"], transport: "PREPARED" },
  { task: "Images", requires: ["IMAGE_GENERATION"], transport: "PREPARED" },
  { task: "Audio", requires: ["AUDIO"], transport: "PREPARED" },
  { task: "Transcription", requires: ["STT"], transport: "PREPARED" },
  { task: "Voix", requires: ["TTS"], transport: "PREPARED" },
];

export function buildIntelligenceNetwork(registry: ProviderRegistry, now = new Date()): IntelligenceNetwork {
  const providers: NetworkProvider[] = registry.list().flatMap((provider) =>
    provider.manifest.models.map((model) => ({
      key: provider.manifest.key,
      name: provider.manifest.key,
      model: model.id,
      role: providerAssignmentRole(provider.manifest.key),
      lifecycle: "REGISTERED" as const,
      status: status(provider, model, now.getTime()),
      locality: provider.manifest.locality,
      cost:
        provider.manifest.locality === "LOCAL"
          ? ("LOCAL" as const)
          : model.estimatedCostMicros === 0 && provider.quota.observation
            ? ("FREE_LIMITED" as const)
            : model.estimatedCostMicros
              ? ("PAID" as const)
              : ("UNKNOWN" as const),
      freeTier:
        provider.manifest.locality === "LOCAL"
          ? ("NOT_APPLICABLE" as const)
          : provider.quota.observation
            ? ("CONDITIONAL" as const)
            : ("UNKNOWN" as const),
      capabilities: model.capabilities,
      privacy: `${provider.manifest.retention}. Classes admissibles : ${provider.manifest.acceptedDataClasses.join(", ")}. Identité et consentements revérifiés à chaque appel.`,
      conditions:
        "État technique observé, pas autorisation d’usage. Allocation IDA partagée distincte du quota fournisseur. Aucun paiement automatique. Aucun test réseau exécuté par ce tableau. Le dialogue local réserve une allocation par demande ; son état ne garantit pas une disponibilité permanente.",
      allocationRemaining: provider.state.remainingCalls,
      quota: provider.quota.observation,
      estimatedCostMicros: model.estimatedCostMicros,
      latencyMs: model.estimatedLatencyMs,
      lastSuccess: provider.health[model.id]?.lastSuccess ?? null,
      lastError: provider.health[model.id]?.lastError ?? null,
      verifiedAt: null,
      sources: [],
    })),
  );
  providers.push(
    ...structuredClone(preparedIntelligenceOffers).filter(
      (offer) => !providers.some((provider) => provider.key === offer.key),
    ),
  );
  return intelligenceNetworkResponseSchema.parse({
    data: {
      generatedAt: now.toISOString(),
      policy: "LOCAL_FIRST_FREE_ONLY_NO_AUTO_PAYMENT",
      providers,
      tasks: taskDefinitions.map((task) => ({
        ...task,
        availableModels:
          task.transport === "PREPARED"
            ? []
            : providers
                .filter(
                  (provider) =>
                    provider.lifecycle === "REGISTERED" &&
                    provider.status === "AVAILABLE_FREE" &&
                    task.requires.every((capability) => provider.capabilities.includes(capability)),
                )
                .map((provider) => `${provider.key}/${provider.model}`),
      })),
    },
  }).data;
}

export function registerIntelligenceNetwork(
  app: FastifyInstance,
  registry: ProviderRegistry,
  options: {
    authorize: (request: FastifyRequest) => unknown;
    revalidate: (request: FastifyRequest) => Promise<void>;
    now: () => Date;
  },
) {
  app.get("/v1/intelligence/network", async (request, reply) => {
    options.authorize(request);
    await options.revalidate(request);
    reply.header("Cache-Control", "no-store");
    return { data: buildIntelligenceNetwork(registry, options.now()) };
  });
}
