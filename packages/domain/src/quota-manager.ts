import { type FreeQuotaObservation, freeQuotaObservationSchema } from "@ida/contracts/intelligence";

export type QuotaSnapshot = { observation: FreeQuotaObservation | null; exhausted: boolean };

/** Allocation conservatrice commune à tous les modèles autorisés d'un provider.
 * Aucun fetch, compte, horloge de recharge ou crédit automatique. Les réservations ne sont pas remboursées.
 */
export class QuotaManager {
  private readonly quotas = new Map<string, QuotaSnapshot>();

  observe(providerKey: string, input: FreeQuotaObservation): void {
    const observation = freeQuotaObservationSchema.parse(input);
    this.quotas.set(providerKey, { observation, exhausted: false });
  }

  snapshot(providerKey: string): QuotaSnapshot {
    return structuredClone(this.quotas.get(providerKey) ?? { observation: null, exhausted: false });
  }

  static status(
    snapshot: QuotaSnapshot,
    modelId: string,
    now: number,
    tokens = 0,
  ): "AVAILABLE_FREE" | "QUOTA_EXCEEDED" | "UNKNOWN" {
    const quota = snapshot.observation;
    // Même après reset, une nouvelle observation est nécessaire. Un ancien quota n'est jamais rechargé.
    if (
      !Number.isFinite(now) ||
      !Number.isSafeInteger(tokens) ||
      tokens < 0 ||
      !quota ||
      !quota.modelIds.includes(modelId) ||
      Date.parse(quota.observedAt) > now ||
      Date.parse(quota.validUntil) <= now ||
      quota.windows.some((window) => Date.parse(window.resetAt) <= now)
    )
      return "UNKNOWN";
    if (
      snapshot.exhausted ||
      quota.windows.some((window) => window.remaining < (window.kind.startsWith("REQUESTS") ? 1 : Math.max(1, tokens)))
    )
      return "QUOTA_EXCEEDED";
    return "AVAILABLE_FREE";
  }

  reserve(providerKey: string, modelId: string, tokens: number, now: number): boolean {
    const quota = this.quotas.get(providerKey);
    if (!quota?.observation || QuotaManager.status(quota, modelId, now, tokens) !== "AVAILABLE_FREE") return false;
    for (const window of quota.observation.windows)
      window.remaining -= window.kind.startsWith("REQUESTS") ? 1 : Math.max(1, tokens);
    return true;
  }

  exhaust(providerKey: string): void {
    const quota = this.quotas.get(providerKey);
    if (quota) quota.exhausted = true;
  }
}
