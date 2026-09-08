import {
  type IntelligencePolicy,
  type IntelligenceRequest,
  type IntelligenceScope,
  type IntelligenceText,
  intelligencePolicySchema,
  intelligenceRequestSchema,
  intelligenceTextSchema,
} from "@ida/contracts/intelligence";
import type { IntelligenceAudit } from "@ida/contracts/intelligence-audit";
import { IntelligenceError, type ProviderCandidate, type ProviderRegistry } from "./provider-registry.js";

export type { IntelligenceAudit } from "@ida/contracts/intelligence-audit";

export interface IntelligencePort {
  generate(request: IntelligenceRequest, signal?: AbortSignal): Promise<IntelligenceText>;
}

export function sameIntelligenceScope(a: IntelligenceScope, b: IntelligenceScope): boolean {
  return (
    a.userId === b.userId &&
    a.workspaceId === b.workspaceId &&
    a.sessionId === b.sessionId &&
    a.clientInstanceId === b.clientInstanceId
  );
}

function permitted(
  provider: ProviderCandidate,
  request: IntelligenceRequest,
  policy: IntelligencePolicy,
  now: number,
): boolean {
  const { manifest, state } = provider;
  if (
    policy.mode !== "AI" ||
    request.dataClasses.includes("SECRET") ||
    !policy.allowedProviderKeys.includes(manifest.key) ||
    (policy.allowedLocalities !== undefined && !policy.allowedLocalities.includes(manifest.locality)) ||
    !state.enabled ||
    !state.configured ||
    state.availability !== "READY" ||
    state.remainingCalls < 1 ||
    Date.parse(state.validUntil) <= now ||
    manifest.retention === "UNKNOWN" ||
    !request.dataClasses.every(
      (classification) => classification !== "SECRET" && manifest.acceptedDataClasses.includes(classification),
    )
  )
    return false;
  if (manifest.locality === "LOCAL") return true;
  return policy.cloudConsents.some(
    (consent) =>
      sameIntelligenceScope(consent.scope, request.scope) &&
      consent.providerKey === manifest.key &&
      consent.purpose === request.purpose &&
      Date.parse(consent.expiresAt) > now &&
      request.dataClasses.every(
        (classification) => classification !== "SECRET" && consent.dataClasses.includes(classification),
      ),
  );
}

function modelPermitted(providerKey: string, modelId: string, policy: IntelligencePolicy): boolean {
  return (
    policy.allowedModels === undefined ||
    policy.allowedModels.some((model) => model.providerKey === providerKey && model.modelId === modelId)
  );
}

/** Contraintes dures avant classement ; aucune préférence ne les assouplit. */
export function selectModels(
  providers: ProviderCandidate[],
  request: IntelligenceRequest,
  policy: IntelligencePolicy,
  now: number,
  spentMicros: number,
  attempted: Set<string>,
) {
  return providers
    .filter((provider) => !attempted.has(provider.manifest.key) && permitted(provider, request, policy, now))
    .flatMap((provider) =>
      provider.manifest.models
        .filter(
          (model) =>
            modelPermitted(provider.manifest.key, model.id, policy) &&
            request.capabilities.every((capability) => model.capabilities.includes(capability)) &&
            model.maxComplexity >= request.complexity &&
            model.maxInputChars >= request.prompt.length &&
            model.maxOutputTokens >= request.maxOutputTokens &&
            model.estimatedCostMicros !== null &&
            model.estimatedCostMicros <= policy.maxCostMicros - spentMicros &&
            model.estimatedLatencyMs !== null &&
            model.estimatedLatencyMs <= policy.maxLatencyMs,
        )
        .map((model) => ({ provider, model })),
    )
    .sort((a, b) => {
      const localRank = (candidate: typeof a) =>
        policy.localFirst && candidate.provider.manifest.locality === "CLOUD" ? 1 : 0;
      const preferenceRank = (candidate: typeof a) =>
        candidate.provider.manifest.key === policy.preferredProviderKey ? 0 : 1;
      return (
        localRank(a) - localRank(b) ||
        preferenceRank(a) - preferenceRank(b) ||
        // La complexité demandée est un minimum ; éviter le modèle surdimensionné.
        a.model.maxComplexity - b.model.maxComplexity ||
        (a.model.estimatedCostMicros ?? 0) - (b.model.estimatedCostMicros ?? 0) ||
        (a.model.estimatedLatencyMs ?? 0) - (b.model.estimatedLatencyMs ?? 0) ||
        a.provider.manifest.key.localeCompare(b.provider.manifest.key) ||
        a.model.id.localeCompare(b.model.id)
      );
    });
}

export class ProviderRouter implements IntelligencePort {
  constructor(
    private readonly registry: ProviderRegistry,
    // Obligatoire : recharger l'identité ET la policy depuis l'autorité serveur.
    private readonly authorize: (request: IntelligenceRequest) => Promise<IntelligencePolicy>,
    private readonly audit: (event: IntelligenceAudit) => Promise<void>,
    private readonly now: () => number = Date.now,
    // Validation métier synchrone, sans effet : ne confère aucun droit et ne transforme pas la sortie.
    private readonly acceptOutput?: (output: IntelligenceText) => boolean,
  ) {}

  private async policy(request: IntelligenceRequest): Promise<IntelligencePolicy> {
    try {
      const parsed = intelligencePolicySchema.safeParse(await this.authorize(structuredClone(request)));
      if (!parsed.success || parsed.data.mode !== "AI" || request.dataClasses.includes("SECRET")) {
        throw new IntelligenceError("FORBIDDEN");
      }
      return parsed.data;
    } catch {
      throw new IntelligenceError("FORBIDDEN");
    }
  }

  private async log(event: IntelligenceAudit): Promise<void> {
    try {
      await this.audit(structuredClone(event));
    } catch {
      throw new IntelligenceError("AUDIT_UNAVAILABLE");
    }
  }

  async generate(raw: IntelligenceRequest, signal?: AbortSignal): Promise<IntelligenceText> {
    const parsed = intelligenceRequestSchema.safeParse(raw);
    if (!parsed.success) throw new IntelligenceError("INVALID_REQUEST");
    const request = parsed.data;
    const runId = crypto.randomUUID();
    const attempted = new Set<string>();
    let spentMicros = 0;
    const startedAt = this.now();
    let deadline = Number.POSITIVE_INFINITY;
    let costLimit = Number.POSITIVE_INFINITY;
    let attemptLimit = 3;
    for (;;) {
      if (signal?.aborted) throw new IntelligenceError("CANCELLED");
      const policy = await this.policy(request);
      // Les limites peuvent être resserrées, jamais augmentées en cours de fallback.
      deadline = Math.min(deadline, startedAt + policy.maxLatencyMs);
      costLimit = Math.min(costLimit, policy.maxCostMicros);
      attemptLimit = Math.min(attemptLimit, policy.maxAttempts);
      if (this.now() >= deadline) throw new IntelligenceError("TIMEOUT");
      if (attempted.size >= attemptLimit) throw new IntelligenceError("NO_COMPATIBLE_MODEL");
      const selected = selectModels(
        this.registry.list(),
        request,
        {
          ...policy,
          maxCostMicros: costLimit,
          maxLatencyMs: Math.min(policy.maxLatencyMs, deadline - this.now()),
        },
        this.now(),
        spentMicros,
        attempted,
      )[0];
      if (!selected) throw new IntelligenceError("NO_COMPATIBLE_MODEL");
      const { provider, model } = selected;
      const event: IntelligenceAudit = {
        runId,
        scope: request.scope,
        purpose: request.purpose,
        providerKey: provider.manifest.key,
        modelId: model.id,
        locality: provider.manifest.locality,
        manifestVersion: provider.manifest.version,
        dataClasses: request.dataClasses,
        attempt: attempted.size + 1,
        estimatedCostMicros: model.estimatedCostMicros ?? 0,
        outcome: "ATTEMPT",
      };
      await this.log(event);
      // L'audit est asynchrone : revalider les droits et le choix juste avant l'appel.
      const currentPolicy = await this.policy(request);
      if (
        !permitted(provider, request, currentPolicy, this.now()) ||
        !modelPermitted(provider.manifest.key, model.id, currentPolicy) ||
        currentPolicy.maxCostMicros < spentMicros + event.estimatedCostMicros ||
        currentPolicy.maxAttempts <= attempted.size
      )
        throw new IntelligenceError("FORBIDDEN");
      deadline = Math.min(deadline, startedAt + currentPolicy.maxLatencyMs);
      costLimit = Math.min(costLimit, currentPolicy.maxCostMicros);
      attemptLimit = Math.min(attemptLimit, currentPolicy.maxAttempts);
      if (signal?.aborted) throw new IntelligenceError("CANCELLED");
      if (this.now() >= deadline) throw new IntelligenceError("TIMEOUT");
      const reserved = this.registry.reserve(provider, this.now());
      attempted.add(provider.manifest.key);
      spentMicros += event.estimatedCostMicros;
      const controller = new AbortController();
      const cancel = () => controller.abort(new IntelligenceError("CANCELLED"));
      const invalidate = () => controller.abort(new IntelligenceError("FORBIDDEN"));
      signal?.addEventListener("abort", cancel, { once: true });
      reserved.invalidated.addEventListener("abort", invalidate, { once: true });
      if (signal?.aborted) cancel();
      if (reserved.invalidated.aborted) invalidate();
      const timer = setTimeout(() => controller.abort(new IntelligenceError("TIMEOUT")), deadline - this.now());
      let abortListener: (() => void) | undefined;
      try {
        const cancelled = new Promise<never>((_resolve, reject) => {
          abortListener = () => reject(controller.signal.reason);
          if (controller.signal.aborted) abortListener();
          else controller.signal.addEventListener("abort", abortListener, { once: true });
        });
        const output = await Promise.race([
          cancelled,
          Promise.resolve().then(() => {
            if (controller.signal.aborted) throw controller.signal.reason;
            return reserved.adapter.generate({
              modelId: model.id,
              prompt: request.prompt,
              maxOutputTokens: request.maxOutputTokens,
              signal: controller.signal,
            });
          }),
        ]);
        const result = intelligenceTextSchema.safeParse(output);
        if (!result.success) throw new IntelligenceError("INVALID_RESPONSE");
        if (this.acceptOutput) {
          try {
            const accepted: unknown = this.acceptOutput(structuredClone(result.data));
            // Une extension async accidentelle est refusée, y compris sans rejet non géré.
            if (accepted instanceof Promise) void accepted.catch(() => {});
            if (accepted !== true) throw new Error("Rejected output");
          } catch {
            throw new IntelligenceError("INVALID_RESPONSE");
          }
        }
        const finalPolicy = await this.policy(request);
        if (controller.signal.aborted) throw controller.signal.reason;
        // Le dernier appel réservé peut avoir épuisé remainingCalls, ce qui n'invalide pas son résultat.
        if (
          !permitted(
            { ...provider, state: { ...provider.state, remainingCalls: 1 } },
            request,
            finalPolicy,
            this.now(),
          ) ||
          !modelPermitted(provider.manifest.key, model.id, finalPolicy)
        ) {
          throw new IntelligenceError("FORBIDDEN");
        }
        await this.log({ ...event, outcome: "SUCCEEDED" });
        // Une révocation peut aussi arriver pendant l'écriture de l'audit.
        const deliveryPolicy = await this.policy(request);
        if (
          !permitted(
            { ...provider, state: { ...provider.state, remainingCalls: 1 } },
            request,
            deliveryPolicy,
            this.now(),
          ) ||
          !modelPermitted(provider.manifest.key, model.id, deliveryPolicy)
        ) {
          throw new IntelligenceError("FORBIDDEN");
        }
        if (controller.signal.aborted) throw controller.signal.reason;
        return result.data;
      } catch (error) {
        const safe =
          error instanceof IntelligenceError ? new IntelligenceError(error.code) : new IntelligenceError("UNAVAILABLE");
        await this.log({ ...event, outcome: safe.code });
        // Pas de retry après refus, erreur de validation, autorisation, annulation ou timeout ambigu.
        if (!(error instanceof IntelligenceError) || !["UNAVAILABLE", "RATE_LIMITED"].includes(safe.code)) throw safe;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        reserved.invalidated.removeEventListener("abort", invalidate);
        if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      }
    }
  }
}
