import { createHash } from "node:crypto";
import { type IntelligenceScope, intelligenceScopeSchema } from "@ida/contracts/intelligence";
import {
  type EnvironmentIntelligenceAudit,
  environmentIntelligenceAuditSchema,
  type IntelligenceAudit,
  intelligenceAuditSchema,
  type MusicContextAudit,
  musicContextAuditSchema,
} from "@ida/contracts/intelligence-audit";
import { IntelligenceError, sameIntelligenceScope } from "@ida/domain";
import type { DemoDatabase } from "./database.js";

/** Puits interne lié à un travail authentifié, jamais une autorisation métier ou une route publique. */
export function createPersistentIntelligenceAudit(database: DemoDatabase, authenticatedScope: IntelligenceScope) {
  const parsedScope = intelligenceScopeSchema.safeParse(authenticatedScope);
  if (!parsedScope.success) throw new IntelligenceError("AUDIT_UNAVAILABLE");
  const boundScope = parsedScope.data;

  async function append(kind: "CONTEXT" | "INFERENCE", raw: unknown, environment = false): Promise<void> {
    try {
      const event =
        kind === "CONTEXT"
          ? musicContextAuditSchema.parse(raw)
          : environment
            ? environmentIntelligenceAuditSchema.parse(raw)
            : intelligenceAuditSchema.parse(raw);
      if (!sameIntelligenceScope(boundScope, event.scope)) throw new IntelligenceError("AUDIT_UNAVAILABLE");
      const inference = "attempt" in event ? event : undefined;
      // Ordre canonique et uniquement les colonnes déclarées ; aucun payload libre en base.
      const row = {
        workspace_id: boundScope.workspaceId,
        user_id: boundScope.userId,
        session_id: boundScope.sessionId,
        client_instance_id: boundScope.clientInstanceId,
        kind,
        run_id: event.runId.toLowerCase(),
        attempt: inference?.attempt ?? 0,
        outcome: event.outcome,
        environment_key: "environmentKey" in event ? event.environmentKey : null,
        agent_key: "agentKey" in event ? event.agentKey : null,
        profile_version: "profileVersion" in event ? event.profileVersion : null,
        intent: "intent" in event ? event.intent : null,
        purpose: inference?.purpose ?? null,
        provider_key: inference?.providerKey ?? null,
        model_id: inference?.modelId ?? null,
        locality: inference?.locality ?? null,
        manifest_version: inference?.manifestVersion ?? null,
        data_classes: inference ? [...inference.dataClasses].sort() : ["PRIVATE_CREATIVE"],
        estimated_cost_micros: inference?.estimatedCostMicros ?? null,
      };
      const fingerprint = createHash("sha256").update(JSON.stringify(row)).digest("hex");
      const columns = Object.keys(row); // Noms statiques de la projection ci-dessus.
      const values = [...Object.values(row), fingerprint];
      await database.pglite.transaction(async (transaction) => {
        const inserted = await transaction.query(
          `INSERT INTO intelligence_audit_events (${columns.join(", ")}, event_fingerprint)
           VALUES (${values.map((_, index) => `$${index + 1}`).join(", ")})
           ON CONFLICT (workspace_id, kind, run_id, attempt, outcome) DO NOTHING RETURNING id`,
          values,
        );
        if (inserted.rows.length > 0) return;
        const existing = await transaction.query<{ event_fingerprint: string }>(
          `SELECT event_fingerprint FROM intelligence_audit_events
           WHERE workspace_id = $1 AND kind = $2 AND run_id = $3 AND attempt = $4 AND outcome = $5`,
          [row.workspace_id, row.kind, row.run_id, row.attempt, row.outcome],
        );
        if (existing.rows[0]?.event_fingerprint !== fingerprint) throw new IntelligenceError("AUDIT_UNAVAILABLE");
      });
    } catch {
      // Échec fermé, sans détails de validation/SQL ni contenu d'une erreur injectée.
      throw new IntelligenceError("AUDIT_UNAVAILABLE");
    }
  }
  return Object.freeze({
    context: (event: MusicContextAudit) => append("CONTEXT", event),
    intelligence: (event: IntelligenceAudit) => append("INFERENCE", event),
    environment: (event: EnvironmentIntelligenceAudit) => append("INFERENCE", event, true),
  });
}
