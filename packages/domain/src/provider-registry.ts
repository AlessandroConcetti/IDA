import {
  type AIProviderManifest,
  type AIProviderState,
  aiProviderManifestSchema,
  aiProviderStateSchema,
  type FreeQuotaObservation,
  freeQuotaObservationSchema,
  type IntelligenceText,
  intelligenceErrorCodes,
} from "@ida/contracts/intelligence";
import { QuotaManager, type QuotaSnapshot } from "./quota-manager.js";

export type IntelligenceErrorCode = (typeof intelligenceErrorCodes)[number];

// Jamais de message/cause brut d'un fournisseur : ils peuvent contenir les entrées.
export class IntelligenceError extends Error {
  readonly code: IntelligenceErrorCode;
  constructor(code: IntelligenceErrorCode) {
    const safeCode = intelligenceErrorCodes.includes(code) ? code : "INVALID_RESPONSE";
    super(`IDA intelligence: ${safeCode}`);
    this.code = safeCode;
    this.name = "IntelligenceError";
  }
}

export interface IntelligenceAdapter {
  readonly providerKey: string;
  readonly locality: "LOCAL" | "CLOUD";
  generate(input: {
    modelId: string;
    prompt: string;
    maxOutputTokens: number;
    signal: AbortSignal;
  }): Promise<IntelligenceText>;
}

export type ProviderCandidate = {
  manifest: AIProviderManifest;
  state: AIProviderState;
  revision: number;
  quota: QuotaSnapshot;
  health: Record<string, { available: boolean; lastSuccess: string | null; lastError: IntelligenceErrorCode | null }>;
};

type Registration = {
  manifest: AIProviderManifest;
  adapter: IntelligenceAdapter;
  state: AIProviderState;
  revision: number;
  controller: AbortController;
  health: ProviderCandidate["health"];
};

/** Registre statique en code serveur, selon le même principe que l'AgentRegistry. */
export class ProviderRegistry {
  private readonly entries = new Map<string, Registration>();
  private readonly quotas = new QuotaManager();

  constructor(providers: readonly { manifest: AIProviderManifest; adapter: IntelligenceAdapter }[] = []) {
    for (const provider of providers) {
      const parsed = aiProviderManifestSchema.safeParse(provider.manifest);
      if (!parsed.success) throw new IntelligenceError("CONFIGURATION_INVALID");
      const manifest = parsed.data;
      if (
        this.entries.has(manifest.key) ||
        provider.adapter.providerKey !== manifest.key ||
        provider.adapter.locality !== manifest.locality ||
        new Set(manifest.models.map((model) => model.id)).size !== manifest.models.length ||
        (manifest.locality === "CLOUD" && manifest.retention === "LOCAL_ONLY") ||
        (manifest.locality === "LOCAL" && manifest.retention === "REVIEWED_CLOUD")
      ) {
        throw new IntelligenceError("CONFIGURATION_INVALID");
      }
      this.entries.set(manifest.key, {
        manifest,
        adapter: provider.adapter,
        revision: 0,
        controller: new AbortController(),
        health: {},
        state: {
          enabled: false,
          configured: false,
          availability: "UNKNOWN",
          remainingCalls: 0,
          validUntil: "1970-01-01T00:00:00.000Z",
        },
      });
    }
  }

  list(): ProviderCandidate[] {
    return [...this.entries.values()].map(({ manifest, state, revision, health }) =>
      structuredClone({ manifest, state, revision, health, quota: this.quotas.snapshot(manifest.key) }),
    );
  }

  /** Configuration serveur uniquement. Toute révision annule les appels en vol. */
  configure(providerKey: string, state: AIProviderState): void {
    const entry = this.entries.get(providerKey);
    const parsed = aiProviderStateSchema.safeParse(state);
    if (!entry || !parsed.success) throw new IntelligenceError("CONFIGURATION_INVALID");
    entry.controller.abort();
    entry.controller = new AbortController();
    entry.state = parsed.data;
    entry.health = {};
    entry.revision += 1;
  }

  /** Pas d'endpoint HTTP pour cette autorité. Une revue des conditions/arrêt de facturation est préalable. */
  observeFreeQuota(providerKey: string, observation: FreeQuotaObservation): void {
    const entry = this.entries.get(providerKey);
    const parsed = freeQuotaObservationSchema.safeParse(observation);
    if (
      !entry ||
      !parsed.success ||
      entry.manifest.locality !== "CLOUD" ||
      !parsed.data.modelIds.every((id) => entry.manifest.models.some((model) => model.id === id))
    )
      throw new IntelligenceError("CONFIGURATION_INVALID");
    try {
      this.quotas.observe(providerKey, parsed.data);
    } catch {
      throw new IntelligenceError("CONFIGURATION_INVALID");
    }
    entry.controller.abort();
    entry.controller = new AbortController();
    entry.revision += 1;
  }

  recordOutcome(
    candidate: ProviderCandidate,
    modelId: string,
    outcome: "SUCCEEDED" | IntelligenceErrorCode,
    now: number,
  ): void {
    const entry = this.entries.get(candidate.manifest.key);
    if (!entry || entry.revision !== candidate.revision || !Number.isFinite(now)) return;
    const previous = entry.health[modelId];
    entry.health[modelId] = {
      available: outcome === "SUCCEEDED" || outcome === "CANCELLED",
      lastSuccess: outcome === "SUCCEEDED" ? new Date(now).toISOString() : (previous?.lastSuccess ?? null),
      lastError: outcome === "SUCCEEDED" ? null : outcome,
    };
    if (outcome === "RATE_LIMITED") this.quotas.exhaust(entry.manifest.key);
  }

  /** Réservation synchrone : deux requêtes ne peuvent consommer le dernier appel. */
  reserve(
    candidate: ProviderCandidate,
    nowMs: number,
    modelId: string,
    tokens: number,
  ): {
    adapter: IntelligenceAdapter;
    invalidated: AbortSignal;
  } {
    const entry = this.entries.get(candidate.manifest.key);
    if (
      !entry ||
      entry.revision !== candidate.revision ||
      !entry.state.enabled ||
      !entry.state.configured ||
      entry.state.availability !== "READY" ||
      Date.parse(entry.state.validUntil) <= nowMs ||
      entry.state.remainingCalls < 1
    ) {
      throw new IntelligenceError("UNAVAILABLE");
    }
    const model = entry.manifest.models.find((item) => item.id === modelId);
    if (model?.estimatedCostMicros !== 0 || entry.health[modelId]?.available === false)
      throw new IntelligenceError("UNAVAILABLE");
    if (entry.manifest.locality === "CLOUD" && !this.quotas.reserve(entry.manifest.key, modelId, tokens, nowMs))
      throw new IntelligenceError("UNAVAILABLE");
    entry.state.remainingCalls -= 1;
    return { adapter: entry.adapter, invalidated: entry.controller.signal };
  }
}
