import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";

const issuedAt = "2026-09-05T10:00:00.000Z";
const expiresAt = "2026-09-05T18:00:00.000Z";
const idleExpiresAt = "2026-09-05T10:30:00.000Z";

async function issueSession(database: DemoDatabase, otherUser = false, clientInstanceId?: string) {
  const session = {
    sessionId: `ses_${randomUUID().replaceAll("-", "")}`,
    tokenDigest: randomBytes(32).toString("hex"),
    userId: otherUser ? "usr_other" : demoContext.userId,
    clientInstanceId: clientInstanceId ?? (otherUser ? "cli_other_windows_web" : demoIdentity.clientInstanceId),
    workspaceId: otherUser ? "wsp_other" : demoContext.workspaceId,
    issuedAt,
    expiresAt,
    idleExpiresAt,
  };
  expect(await database.createLocalAuthSession(session)).toBe(true);
  return session;
}

async function readSessionStates(database: DemoDatabase, sessionId: string) {
  const result = await database.pglite.query<{ identity: string; local: string }>(
    `SELECT identity_session.status AS identity, local_session.status AS local
     FROM identity_sessions identity_session
     INNER JOIN local_auth_sessions local_session ON local_session.session_id = identity_session.id
     WHERE identity_session.id = $1`,
    [sessionId],
  );
  return result.rows[0];
}

async function resolveSession(database: DemoDatabase, session: Awaited<ReturnType<typeof issueSession>>) {
  return database.resolveLocalAuthSession(
    session.tokenDigest,
    session.userId,
    session.clientInstanceId,
    session.workspaceId,
    issuedAt,
    30 * 60 * 1_000,
    false,
  );
}

describe("Révocation persistante des sessions LOCAL_LOCK", () => {
  let database: DemoDatabase;
  beforeAll(async () => {
    database = await DemoDatabase.open({ dataDir: "memory://" });
  });
  afterAll(async () => {
    await database.close();
  });

  const scenarios = [
    { label: "utilisateur suspendu", table: "users", status: "SUSPENDED", scope: "id = $1", ids: [demoContext.userId] },
    { label: "utilisateur révoqué", table: "users", status: "REVOKED", scope: "id = $1", ids: [demoContext.userId] },
    {
      label: "appareil en attente",
      table: "client_instances",
      status: "PENDING",
      scope: "id = $1",
      ids: [demoIdentity.clientInstanceId],
    },
    {
      label: "appareil révoqué",
      table: "client_instances",
      status: "REVOKED",
      scope: "id = $1",
      ids: [demoIdentity.clientInstanceId],
    },
    {
      label: "membership suspendue",
      table: "memberships",
      status: "SUSPENDED",
      scope: "workspace_id = $1 AND user_id = $2",
      ids: [demoContext.workspaceId, demoContext.userId],
    },
    {
      label: "membership révoquée",
      table: "memberships",
      status: "REVOKED",
      scope: "workspace_id = $1 AND user_id = $2",
      ids: [demoContext.workspaceId, demoContext.userId],
    },
    {
      label: "grant révoqué",
      table: "client_workspace_grants",
      status: "REVOKED",
      scope: "client_instance_id = $1 AND workspace_id = $2",
      ids: [demoIdentity.clientInstanceId, demoContext.workspaceId],
    },
  ];

  it.each(scenarios)(
    "ne fait pas revivre le token après $label puis réactivation sans requête intermédiaire",
    async (scenario) => {
      const session = await issueSession(database);
      const unrelated = await issueSession(database, true);
      const hasRevokedAt = scenario.table === "client_instances" || scenario.table === "client_workspace_grants";
      const revocation = hasRevokedAt
        ? `, revoked_at = ${scenario.status === "REVOKED" ? "CURRENT_TIMESTAMP" : "NULL"}`
        : "";

      // Les identifiants SQL viennent uniquement de la matrice statique ci-dessus.
      // Aucun appel au résolveur ni à l'API n'a lieu entre ces deux écritures.
      await database.pglite.query(
        `UPDATE ${scenario.table} SET status = '${scenario.status}'${revocation} WHERE ${scenario.scope}`,
        scenario.ids,
      );
      await database.pglite.query(
        `UPDATE ${scenario.table} SET status = 'ACTIVE'${hasRevokedAt ? ", revoked_at = NULL" : ""} WHERE ${scenario.scope}`,
        scenario.ids,
      );

      expect(await readSessionStates(database, session.sessionId)).toEqual({ identity: "REVOKED", local: "REVOKED" });
      expect(await resolveSession(database, session)).toBeNull();
      expect(await readSessionStates(database, unrelated.sessionId)).toEqual({ identity: "ACTIVE", local: "ACTIVE" });
      expect(await resolveSession(database, unrelated)).not.toBeNull();
      const demoSession = await database.resolveRequestIdentityContext(demoIdentity.sessionId, demoContext.workspaceId);
      expect(demoSession?.session.status).toBe("ACTIVE");

      const audit = await database.pglite.query<{ event_type: string; outcome: string }>(
        "SELECT event_type, outcome FROM identity_security_events WHERE id = $1",
        [`ise_policy_revoke_${session.sessionId}`],
      );
      expect(audit.rows).toEqual([{ event_type: "LOCAL_SESSION_REVOKED", outcome: "SUCCEEDED" }]);
      await expect(
        database.pglite.query(
          "UPDATE local_auth_sessions SET status = 'ACTIVE', revoked_at = NULL WHERE session_id = $1",
          [session.sessionId],
        ),
      ).rejects.toThrow(/ne peut pas être réactivée/u);
      await expect(
        database.pglite.query("UPDATE identity_sessions SET status = 'ACTIVE', revoked_at = NULL WHERE id = $1", [
          session.sessionId,
        ]),
      ).rejects.toThrow(/ne peut pas être réactivée/u);

      // La réactivation autorise une nouvelle authentification, jamais l'ancien token.
      const freshSession = await issueSession(database);
      expect(await resolveSession(database, freshSession)).not.toBeNull();
      expect(await resolveSession(database, session)).toBeNull();
    },
  );

  it.each(["client_instances", "client_workspace_grants", "explicit_lock"])(
    "isole une révocation de %s des autres instances du même propriétaire",
    async (table) => {
      const secondClientId = `cli_${randomUUID().replaceAll("-", "")}`;
      await database.pglite.query(
        `INSERT INTO client_instances (id, user_id, display_name, kind, platform, status)
         VALUES ($1, $2, 'Instance du test', 'WEB_BROWSER', 'WINDOWS', 'ACTIVE')`,
        [secondClientId, demoContext.userId],
      );
      await database.pglite.query(
        `INSERT INTO client_workspace_grants
         (client_instance_id, user_id, workspace_id, access_level, status, granted_by)
         VALUES ($1, $2, $3, 'VIEW_ONLY', 'ACTIVE', $2)`,
        [secondClientId, demoContext.userId, demoContext.workspaceId],
      );
      const primary = await issueSession(database);
      const secondary = await issueSession(database, false, secondClientId);
      const key = table === "client_instances" ? "id" : "client_instance_id";
      if (table === "explicit_lock") {
        await database.revokeLocalAuthSessionsForClient(demoContext.userId, demoIdentity.clientInstanceId, issuedAt);
        await database.revokeLocalAuthSessionsForClient(demoContext.userId, demoIdentity.clientInstanceId, issuedAt);
        const audit = await database.pglite.query("SELECT id FROM identity_security_events WHERE id = $1", [
          `ise_explicit_lock_${primary.sessionId}`,
        ]);
        expect(audit.rows).toHaveLength(1);
      } else {
        await database.pglite.query(
          `UPDATE ${table} SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE ${key} = $1`,
          [demoIdentity.clientInstanceId],
        );
      }
      expect(await readSessionStates(database, primary.sessionId)).toEqual({ identity: "REVOKED", local: "REVOKED" });
      expect(await resolveSession(database, primary)).toBeNull();
      const stillAuthorized = await resolveSession(database, secondary);
      expect(stillAuthorized?.identity.clientGrant.accessLevel).toBe("VIEW_ONLY");
      if (table !== "explicit_lock") {
        await database.pglite.query(`UPDATE ${table} SET status = 'ACTIVE', revoked_at = NULL WHERE ${key} = $1`, [
          demoIdentity.clientInstanceId,
        ]);
      }
      expect(await resolveSession(database, primary)).toBeNull();
      expect(await resolveSession(database, secondary)).not.toBeNull();
    },
  );

  it("annule aussi la révocation de session si la transaction de désactivation est annulée", async () => {
    const session = await issueSession(database);
    await expect(
      database.pglite.transaction(async (transaction) => {
        await transaction.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [demoContext.userId]);
        throw new Error("Annulation volontaire du test");
      }),
    ).rejects.toThrow("Annulation volontaire du test");
    expect(await readSessionStates(database, session.sessionId)).toEqual({ identity: "ACTIVE", local: "ACTIVE" });
    expect(await resolveSession(database, session)).not.toBeNull();
    const audit = await database.pglite.query("SELECT id FROM identity_security_events WHERE id = $1", [
      `ise_policy_revoke_${session.sessionId}`,
    ]);
    expect(audit.rows).toEqual([]);
  });

  it("répare une ancienne base déjà suspendue et conserve la révocation après redémarrage", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-revocation-migration-"));
    let persistent = await DemoDatabase.open({ dataDir });
    try {
      const session = await issueSession(persistent);
      // Simule uniquement la version historique sans garde SQL.
      await persistent.pglite.exec("DROP TRIGGER users_revoke_local_auth ON users");
      await persistent.pglite.query("UPDATE users SET status = 'SUSPENDED' WHERE id = $1", [demoContext.userId]);
      expect(await readSessionStates(persistent, session.sessionId)).toEqual({ identity: "ACTIVE", local: "ACTIVE" });
      await persistent.close();
      persistent = await DemoDatabase.open({ dataDir });
      await persistent.pglite.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [demoContext.userId]);
      expect(await readSessionStates(persistent, session.sessionId)).toEqual({ identity: "REVOKED", local: "REVOKED" });
      expect(await resolveSession(persistent, session)).toBeNull();
      await persistent.close();
      persistent = await DemoDatabase.open({ dataDir });
      expect(await resolveSession(persistent, session)).toBeNull();
    } finally {
      await persistent.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  }, 30_000);
});
