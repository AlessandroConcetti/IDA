import type { PGlite } from "@electric-sql/pglite";
import { environmentKeySchema } from "@ida/contracts/environment-brains";
import { intelligenceAuditOutcomes } from "@ida/contracts/intelligence-audit";

/** Migration additive locale, sans modification des journaux ou données existants. */
export async function ensureIntelligenceAuditSchema(database: PGlite): Promise<void> {
  // Valeurs fermées du code serveur, jamais d'interpolation d'entrée client.
  const outcomes = [...intelligenceAuditOutcomes, "DENIED"].map((value) => `'${value}'`).join(", ");
  const environments = environmentKeySchema.options.map((value) => `'${value}'`).join(", ");
  await database.transaction(async (transaction) => {
    await transaction.exec(`
      CREATE TABLE IF NOT EXISTS intelligence_audit_events (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        session_id TEXT NOT NULL REFERENCES identity_sessions(id),
        client_instance_id TEXT NOT NULL REFERENCES client_instances(id),
        kind TEXT NOT NULL CHECK (kind IN ('CONTEXT', 'INFERENCE')),
        run_id UUID NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt BETWEEN 0 AND 3),
        outcome TEXT NOT NULL CHECK (outcome IN (${outcomes})),
        environment_key TEXT CHECK (environment_key IN (${environments})),
        agent_key TEXT CHECK (agent_key ~ '^agent_[a-z0-9_]+$' AND char_length(agent_key) <= 80),
        profile_version TEXT CHECK (profile_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$' AND char_length(profile_version) <= 32),
        intent TEXT CHECK (intent IN ('SEARCH_TRACK', 'SEARCH_MEDIA')),
        purpose TEXT CHECK (purpose IN ('ASSISTANT_REPLY', 'CONTENT_DRAFT')),
        provider_key TEXT CHECK (provider_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
        model_id TEXT CHECK (model_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$' AND position('://' IN model_id) = 0),
        locality TEXT CHECK (locality IN ('LOCAL', 'CLOUD')),
        manifest_version TEXT CHECK (manifest_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$' AND char_length(manifest_version) <= 32),
        data_classes TEXT[] NOT NULL CHECK (
          cardinality(data_classes) BETWEEN 1 AND 4 AND array_position(data_classes, NULL) IS NULL AND
          array_ndims(data_classes) = 1 AND
          data_classes <@ ARRAY['PUBLIC', 'INTERNAL', 'PRIVATE_CREATIVE', 'SENSITIVE_PERSONAL']::text[] AND
          cardinality(data_classes) = (
            ('PUBLIC' = ANY(data_classes))::int + ('INTERNAL' = ANY(data_classes))::int +
            ('PRIVATE_CREATIVE' = ANY(data_classes))::int + ('SENSITIVE_PERSONAL' = ANY(data_classes))::int
          )
        ),
        estimated_cost_micros BIGINT CHECK (estimated_cost_micros BETWEEN 0 AND 9007199254740991),
        event_fingerprint TEXT NOT NULL CHECK (event_fingerprint ~ '^[a-f0-9]{64}$'),
        UNIQUE (workspace_id, kind, run_id, attempt, outcome),
        CONSTRAINT intelligence_audit_shape CHECK ((
          kind = 'CONTEXT' AND attempt = 0 AND outcome IN ('ATTEMPT', 'SUCCEEDED', 'DENIED') AND
          environment_key IS NOT NULL AND environment_key = 'music' AND
          agent_key IS NOT NULL AND agent_key = 'agent_music_librarian' AND profile_version IS NULL AND
          intent IS NOT NULL AND purpose IS NULL AND provider_key IS NULL AND model_id IS NULL AND
          locality IS NULL AND manifest_version IS NULL AND estimated_cost_micros IS NULL AND
          data_classes = ARRAY['PRIVATE_CREATIVE']::text[]
        ) OR (
          kind = 'INFERENCE' AND attempt BETWEEN 1 AND 3 AND outcome <> 'DENIED' AND intent IS NULL AND
          purpose IS NOT NULL AND provider_key IS NOT NULL AND model_id IS NOT NULL AND locality IS NOT NULL AND
          manifest_version IS NOT NULL AND estimated_cost_micros IS NOT NULL AND (
            (environment_key IS NULL AND agent_key IS NULL AND profile_version IS NULL) OR
            (environment_key IS NOT NULL AND agent_key IS NOT NULL AND profile_version IS NOT NULL)
          )
        ))
      );
      CREATE INDEX IF NOT EXISTS idx_intelligence_audit_workspace_id ON intelligence_audit_events (workspace_id, id DESC);

      CREATE OR REPLACE FUNCTION guard_intelligence_audit_insert() RETURNS TRIGGER AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM identity_sessions session
          JOIN local_auth_sessions local_session ON local_session.session_id = session.id
          JOIN memberships membership ON membership.user_id = session.user_id AND membership.workspace_id = NEW.workspace_id
          JOIN client_workspace_grants client_grant ON client_grant.client_instance_id = session.client_instance_id
            AND client_grant.user_id = session.user_id AND client_grant.workspace_id = membership.workspace_id
          WHERE session.id = NEW.session_id AND session.user_id = NEW.user_id AND session.client_instance_id = NEW.client_instance_id
        ) THEN RAISE EXCEPTION 'IDA audit scope refused'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE OR REPLACE FUNCTION prevent_intelligence_audit_mutation() RETURNS TRIGGER AS $$
      BEGIN RAISE EXCEPTION 'IDA audit is append-only'; END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS intelligence_audit_scope_guard ON intelligence_audit_events;
      CREATE TRIGGER intelligence_audit_scope_guard BEFORE INSERT ON intelligence_audit_events
        FOR EACH ROW EXECUTE FUNCTION guard_intelligence_audit_insert();
      DROP TRIGGER IF EXISTS intelligence_audit_no_mutation ON intelligence_audit_events;
      CREATE TRIGGER intelligence_audit_no_mutation BEFORE UPDATE OR DELETE ON intelligence_audit_events
        FOR EACH ROW EXECUTE FUNCTION prevent_intelligence_audit_mutation();
      DROP TRIGGER IF EXISTS intelligence_audit_no_truncate ON intelligence_audit_events;
      CREATE TRIGGER intelligence_audit_no_truncate BEFORE TRUNCATE ON intelligence_audit_events
        FOR EACH STATEMENT EXECUTE FUNCTION prevent_intelligence_audit_mutation();
    `);
  });
}
