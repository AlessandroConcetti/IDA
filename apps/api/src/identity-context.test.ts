import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityAccessPolicy } from "@ida/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";
import { LocalDemoAuthenticationError, LocalDemoIdentityContextResolver } from "./identity-context.js";

const now = () => new Date("2026-09-03T13:00:00.000Z");

describe("Identity locale persistée", () => {
  let database: DemoDatabase;

  beforeEach(async () => {
    database = await DemoDatabase.open({ dataDir: "memory://" });
  });

  afterEach(async () => {
    await database.close();
  });

  it("résout uniquement la session et le workspace liés côté serveur sans projeter de secret", async () => {
    const context = await database.resolveRequestIdentityContext(demoIdentity.sessionId, demoContext.workspaceId);

    expect(context).toMatchObject({
      userId: demoContext.userId,
      userStatus: "ACTIVE",
      workspaceId: demoContext.workspaceId,
      membership: { role: "OWNER", status: "ACTIVE" },
      clientInstance: {
        id: demoIdentity.clientInstanceId,
        kind: "WEB_BROWSER",
        platform: "WINDOWS",
        status: "ACTIVE",
      },
      clientGrant: { accessLevel: "TRUSTED", status: "ACTIVE" },
      session: { id: demoIdentity.sessionId, status: "ACTIVE" },
    });
    expect(JSON.stringify(context)).not.toMatch(/email|token|secret|privateKey|credential/iu);
    await expect(new LocalDemoIdentityContextResolver(database, now).resolve()).resolves.toEqual(context);

    await expect(database.resolveRequestIdentityContext(demoIdentity.sessionId, "wsp_other")).resolves.toBeNull();
    await expect(
      database.resolveRequestIdentityContext("ses_other_windows_web", demoContext.workspaceId),
    ).resolves.toBeNull();
  });

  it("refuse structurellement une session ou un grant reliant des propriétaires incompatibles", async () => {
    await expect(
      database.pglite.query(
        `
          INSERT INTO identity_sessions (
            id, user_id, client_instance_id, status, issued_at, expires_at
          ) VALUES (
            'ses_invalid_owner', 'usr_other', $1, 'ACTIVE',
            '2026-09-03T12:00:00.000Z', '2026-09-03T14:00:00.000Z'
          )
        `,
        [demoIdentity.clientInstanceId],
      ),
    ).rejects.toThrow();

    await expect(
      database.pglite.query(
        `
          INSERT INTO client_workspace_grants (
            client_instance_id, user_id, workspace_id, access_level, status, granted_by
          ) VALUES ($1, $2, 'wsp_other', 'TRUSTED', 'ACTIVE', $2)
        `,
        [demoIdentity.clientInstanceId, demoContext.userId],
      ),
    ).rejects.toThrow();
  });

  it("échoue fermé après suspension, révocation ou expiration de chaque couche Identity", async () => {
    const resolver = new LocalDemoIdentityContextResolver(database, now);
    const expectRefused = async () => {
      await expect(resolver.resolve()).rejects.toBeInstanceOf(LocalDemoAuthenticationError);
    };

    await database.pglite.query(`UPDATE users SET status = 'SUSPENDED' WHERE id = $1`, [demoContext.userId]);
    await expectRefused();
    await database.pglite.query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [demoContext.userId]);

    await database.pglite.query(`UPDATE memberships SET status = 'REVOKED' WHERE workspace_id = $1 AND user_id = $2`, [
      demoContext.workspaceId,
      demoContext.userId,
    ]);
    await expectRefused();
    await database.pglite.query(`UPDATE memberships SET status = 'ACTIVE' WHERE workspace_id = $1 AND user_id = $2`, [
      demoContext.workspaceId,
      demoContext.userId,
    ]);

    await database.pglite.query(
      `UPDATE client_workspace_grants SET status = 'REVOKED', revoked_at = $3 WHERE client_instance_id = $1 AND workspace_id = $2`,
      [demoIdentity.clientInstanceId, demoContext.workspaceId, now().toISOString()],
    );
    await expectRefused();
    await database.pglite.query(
      `UPDATE client_workspace_grants SET status = 'ACTIVE', revoked_at = NULL WHERE client_instance_id = $1 AND workspace_id = $2`,
      [demoIdentity.clientInstanceId, demoContext.workspaceId],
    );

    await database.pglite.query(`UPDATE client_instances SET status = 'REVOKED', revoked_at = $2 WHERE id = $1`, [
      demoIdentity.clientInstanceId,
      now().toISOString(),
    ]);
    await expectRefused();
    await database.pglite.query(`UPDATE client_instances SET status = 'ACTIVE', revoked_at = NULL WHERE id = $1`, [
      demoIdentity.clientInstanceId,
    ]);

    await database.pglite.query(`UPDATE identity_sessions SET status = 'REVOKED', revoked_at = $2 WHERE id = $1`, [
      demoIdentity.sessionId,
      now().toISOString(),
    ]);
    await expectRefused();
    await database.pglite.query(`UPDATE identity_sessions SET status = 'ACTIVE', revoked_at = NULL WHERE id = $1`, [
      demoIdentity.sessionId,
    ]);

    await database.pglite.query(`UPDATE identity_sessions SET expires_at = $2 WHERE id = $1`, [
      demoIdentity.sessionId,
      now().toISOString(),
    ]);
    await expectRefused();
  });

  it("refuse toute dérive du profil serveur OWNER/TRUSTED attendu par la démo", async () => {
    const resolver = new LocalDemoIdentityContextResolver(database, now);
    const expectRefused = async () => {
      await expect(resolver.resolve()).rejects.toBeInstanceOf(LocalDemoAuthenticationError);
    };

    await database.pglite.query(`UPDATE memberships SET role = 'EDITOR' WHERE workspace_id = $1 AND user_id = $2`, [
      demoContext.workspaceId,
      demoContext.userId,
    ]);
    await expectRefused();
    await database.pglite.query(`UPDATE memberships SET role = 'OWNER' WHERE workspace_id = $1 AND user_id = $2`, [
      demoContext.workspaceId,
      demoContext.userId,
    ]);

    await database.pglite.query(
      `UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1 AND workspace_id = $2`,
      [demoIdentity.clientInstanceId, demoContext.workspaceId],
    );
    await expectRefused();
    await database.pglite.query(
      `UPDATE client_workspace_grants SET access_level = 'TRUSTED' WHERE client_instance_id = $1 AND workspace_id = $2`,
      [demoIdentity.clientInstanceId, demoContext.workspaceId],
    );

    await database.pglite.query(`UPDATE client_instances SET kind = 'PWA' WHERE id = $1`, [
      demoIdentity.clientInstanceId,
    ]);
    await expectRefused();
    await database.pglite.query(`UPDATE client_instances SET kind = 'WEB_BROWSER' WHERE id = $1`, [
      demoIdentity.clientInstanceId,
    ]);

    await database.pglite.query(`UPDATE client_instances SET platform = 'LINUX' WHERE id = $1`, [
      demoIdentity.clientInstanceId,
    ]);
    await expectRefused();
  });

  it("révoque un navigateur iOS sans retirer la session de l'application native", async () => {
    await database.pglite.query(
      `
        INSERT INTO client_instances (id, user_id, display_name, kind, platform, status)
        VALUES
          ('cli_ios_safari', $1, 'Safari iPhone', 'WEB_BROWSER', 'IOS', 'ACTIVE'),
          ('cli_ios_native', $1, 'IDA iPhone', 'NATIVE_MOBILE', 'IOS', 'ACTIVE')
      `,
      [demoContext.userId],
    );
    await database.pglite.query(
      `
        INSERT INTO client_workspace_grants (
          client_instance_id, user_id, workspace_id, access_level, status, granted_by
        ) VALUES
          ('cli_ios_safari', $1, $2, 'TRUSTED', 'ACTIVE', $1),
          ('cli_ios_native', $1, $2, 'TRUSTED', 'ACTIVE', $1)
      `,
      [demoContext.userId, demoContext.workspaceId],
    );
    await database.pglite.query(
      `
        INSERT INTO identity_sessions (id, user_id, client_instance_id, status, issued_at, expires_at)
        VALUES
          ('ses_ios_safari', $1, 'cli_ios_safari', 'ACTIVE', $2, $3),
          ('ses_ios_native', $1, 'cli_ios_native', 'ACTIVE', $2, $3)
      `,
      [demoContext.userId, demoIdentity.issuedAt, demoIdentity.expiresAt],
    );
    await database.pglite.query(`UPDATE client_instances SET status = 'REVOKED', revoked_at = $2 WHERE id = $1`, [
      "cli_ios_safari",
      now().toISOString(),
    ]);

    const webContext = await database.resolveRequestIdentityContext("ses_ios_safari", demoContext.workspaceId);
    const nativeContext = await database.resolveRequestIdentityContext("ses_ios_native", demoContext.workspaceId);
    const policy = new IdentityAccessPolicy();

    expect(webContext).not.toBeNull();
    expect(nativeContext).not.toBeNull();
    if (webContext === null || nativeContext === null) {
      throw new Error("Les contextes Identity attendus sont absents.");
    }

    expect(policy.evaluate({ context: webContext, permission: "READ", now: now() })).toMatchObject({
      allowed: false,
      code: "CLIENT_INSTANCE_NOT_ACTIVE",
    });
    expect(policy.evaluate({ context: nativeContext, permission: "READ", now: now() })).toMatchObject({
      allowed: true,
    });
  });
});

describe("Migration et frontière HTTP Identity", () => {
  it("migre additivement une base antérieure sans effacer ses utilisateurs ou memberships", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-identity-migration-"));
    let database: DemoDatabase | undefined;

    try {
      database = await DemoDatabase.open({ dataDir });
      await database.pglite.exec(`
        DROP TABLE client_workspace_grants;
        DROP TABLE identity_sessions;
        DROP TABLE client_instances;
        ALTER TABLE memberships DROP CONSTRAINT memberships_status_check;
        ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
        ALTER TABLE memberships DROP COLUMN status;
        ALTER TABLE users DROP CONSTRAINT users_status_check;
        ALTER TABLE users DROP COLUMN status;
      `);
      await database.close();
      database = await DemoDatabase.open({ dataDir, seed: false });

      const migrated = await database.pglite.query<{ userStatus: string; membershipStatus: string }>(
        `
          SELECT ida_user.status AS "userStatus", membership.status AS "membershipStatus"
          FROM users ida_user
          INNER JOIN memberships membership ON membership.user_id = ida_user.id
          WHERE ida_user.id = $1 AND membership.workspace_id = $2
        `,
        [demoContext.userId, demoContext.workspaceId],
      );
      const identityTables = await database.pglite.query<{ count: number }>(
        `
          SELECT COUNT(*)::integer AS count
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name IN ('client_instances', 'identity_sessions', 'client_workspace_grants')
        `,
      );

      expect(migrated.rows).toEqual([{ userStatus: "ACTIVE", membershipStatus: "ACTIVE" }]);
      expect(identityTables.rows[0]?.count).toBe(3);
    } finally {
      await database?.close().catch(() => undefined);
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("laisse le health check disponible mais ferme toutes les routes /v1 sans session locale", async () => {
    const app = await createApp({ dataDir: "memory://", seed: false, now });

    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      const me = await app.inject({ method: "GET", url: "/v1/me" });

      expect(health.statusCode).toBe(200);
      expect(me.statusCode).toBe(401);
      expect(me.json()).toEqual({
        error: { code: "AUTHENTICATION_REQUIRED", message: "Authentification requise." },
      });
      expect(me.body).not.toMatch(/session|instance|membership|grant|workspace/iu);
    } finally {
      await app.close();
    }
  });
});
