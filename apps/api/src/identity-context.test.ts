import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IdentityAccessPolicy } from "@ida/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";
import {
  attachRequestIdentityContext,
  getRequestIdentityContext,
  LocalDemoAuthenticationError,
  LocalDemoIdentityContextResolver,
} from "./identity-context.js";

const now = () => new Date("2026-09-03T13:00:00.000Z");

function multipartFile(
  filename: string,
  contentType: string,
  value: Buffer,
): {
  headers: Record<string, string>;
  payload: Buffer;
} {
  const boundary = `----ida-identity-test-${randomUUID()}`;

  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      ),
      value,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

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
    await expect(database.getRequestIdentityProfile("usr_other", demoContext.workspaceId)).resolves.toBeNull();
    await expect(database.getRequestIdentityProfile("usr_other", "wsp_other")).resolves.toMatchObject({
      userId: "usr_other",
      email: "other@ida.local",
      workspaceId: "wsp_other",
      workspaceName: "Other workspace",
      membershipRole: "OWNER",
    });
    const resolved = await new LocalDemoIdentityContextResolver(database, now).resolve();
    expect(resolved).toEqual(context);
    for (const value of [
      resolved,
      resolved.membership,
      resolved.clientInstance,
      resolved.clientGrant,
      resolved.session,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }

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

  it("accepte une réduction de droits mais refuse une dérive d'identité de l'instance locale", async () => {
    const resolver = new LocalDemoIdentityContextResolver(database, now);
    const expectRefused = async () => {
      await expect(resolver.resolve()).rejects.toBeInstanceOf(LocalDemoAuthenticationError);
    };

    await database.pglite.query(`UPDATE memberships SET role = 'EDITOR' WHERE workspace_id = $1 AND user_id = $2`, [
      demoContext.workspaceId,
      demoContext.userId,
    ]);
    await expect(resolver.resolve()).resolves.toMatchObject({ membership: { role: "EDITOR" } });

    await database.pglite.query(
      `UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1 AND workspace_id = $2`,
      [demoIdentity.clientInstanceId, demoContext.workspaceId],
    );
    await expect(resolver.resolve()).resolves.toMatchObject({ clientGrant: { accessLevel: "VIEW_ONLY" } });

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
        -- Cette fixture recrée une version antérieure à Identity et à son audit IA.
        DROP TABLE intelligence_audit_events;
        DROP TRIGGER memberships_revoke_local_auth ON memberships;
        DROP TRIGGER users_revoke_local_auth ON users;
        DROP TABLE identity_security_events;
        DROP TABLE local_auth_sessions;
        DROP TABLE local_owner_credentials;
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
            AND table_name IN (
              'client_instances', 'identity_sessions', 'client_workspace_grants',
              'local_owner_credentials', 'local_auth_sessions', 'identity_security_events',
              'intelligence_audit_events'
            )
        `,
      );

      expect(migrated.rows).toEqual([{ userStatus: "ACTIVE", membershipStatus: "ACTIVE" }]);
      expect(identityTables.rows[0]?.count).toBe(7);
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
      const accessStatus = await app.inject({ method: "GET", url: "/v1/auth/status" });
      const v1RootWithQuery = await app.inject({ method: "GET", url: "/v1?probe=1" });
      const preflight = await app.inject({
        method: "OPTIONS",
        url: "/v1/tasks",
        headers: {
          origin: "http://127.0.0.1:5173",
          "access-control-request-method": "POST",
        },
      });
      const ordinaryOptions = await app.inject({ method: "OPTIONS", url: "/v1/tasks" });

      expect(health.statusCode).toBe(200);
      expect(me.statusCode).toBe(401);
      expect(accessStatus.statusCode).toBe(401);
      expect(v1RootWithQuery.statusCode).toBe(401);
      expect(preflight.statusCode).toBe(204);
      expect(ordinaryOptions.statusCode).toBe(400);
      expect(ordinaryOptions.body).not.toMatch(/task|workspace|session/iu);
      expect(me.json()).toEqual({
        error: { code: "AUTHENTICATION_REQUIRED", message: "Authentification requise." },
      });
      expect(me.body).not.toMatch(/session|instance|membership|grant|workspace/iu);
    } finally {
      await app.close();
    }
  });

  it("attache un contexte immuable et applique les droits de la requête aux lectures et écritures", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-request-context-"));
    let database: DemoDatabase | undefined;
    let app: Awaited<ReturnType<typeof createApp>> | undefined;

    try {
      database = await DemoDatabase.open({ dataDir });
      await database.pglite.query(`UPDATE memberships SET role = 'EDITOR' WHERE workspace_id = $1 AND user_id = $2`, [
        demoContext.workspaceId,
        demoContext.userId,
      ]);
      await database.pglite.query(
        `UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1 AND workspace_id = $2`,
        [demoIdentity.clientInstanceId, demoContext.workspaceId],
      );
      await database.pglite.query(`UPDATE users SET email = $1, display_name = $2, timezone = $3 WHERE id = $4`, [
        "ida-owner@example.test",
        "IDA Owner",
        "Europe/London",
        demoContext.userId,
      ]);
      await database.pglite.query(`UPDATE workspaces SET name = $1, locale = $2 WHERE id = $3`, [
        "Studio sécurisé",
        "fr-CA",
        demoContext.workspaceId,
      ]);
      await database.close();
      database = undefined;

      app = await createApp({ dataDir, seed: false, now });
      app.get("/v1/__request-context-test", async (request) => {
        const identity = getRequestIdentityContext(request);
        let replacementBlocked = false;

        try {
          attachRequestIdentityContext(request, identity);
        } catch {
          replacementBlocked = true;
        }

        return {
          data: {
            present: true,
            replacementBlocked,
            frozen:
              Object.isFrozen(identity) &&
              Object.isFrozen(identity.membership) &&
              Object.isFrozen(identity.clientInstance) &&
              Object.isFrozen(identity.clientGrant) &&
              Object.isFrozen(identity.session),
          },
        };
      });

      const context = await app.inject({ method: "GET", url: "/v1/__request-context-test" });
      const me = await app.inject({ method: "GET", url: "/v1/me" });
      const accessStatus = await app.inject({ method: "GET", url: "/v1/auth/status" });
      const tasksBefore = await app.inject({ method: "GET", url: "/v1/tasks?workspaceId=wsp_other&userId=usr_other" });
      const createTask = await app.inject({
        method: "POST",
        url: "/v1/tasks",
        payload: { title: "Cette tâche ne doit pas être créée" },
      });
      const tasksAfter = await app.inject({ method: "GET", url: "/v1/tasks" });
      const approvalsBefore = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
      const approval = (
        approvalsBefore.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> }
      ).data[0];
      const approve = await app.inject({
        method: "POST",
        url: `/v1/post-variants/${approval?.variantId}/approve`,
        payload: { approvalId: approval?.approvalId, expectedPayloadHash: approval?.payloadHash },
      });
      const approvalsAfter = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
      const commandRunsBefore = await app.inject({ method: "GET", url: "/v1/ida/command-runs" });
      const command = await app.inject({
        method: "POST",
        url: "/v1/ida/commands",
        payload: { message: "Qu’est-ce que j’ai aujourd’hui ?" },
      });
      const commandRunsAfter = await app.inject({ method: "GET", url: "/v1/ida/command-runs" });

      expect(context.statusCode).toBe(200);
      expect(accessStatus.json()).toEqual({ data: { mode: "LOCAL_DEMO", state: "UNLOCKED" } });
      expect(accessStatus.headers["set-cookie"]).toBeUndefined();
      expect(context.json()).toEqual({ data: { present: true, replacementBlocked: true, frozen: true } });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({
        data: {
          id: demoContext.userId,
          email: "ida-owner@example.test",
          displayName: "IDA Owner",
          timezone: "Europe/London",
          workspace: {
            id: demoContext.workspaceId,
            name: "Studio sécurisé",
            locale: "fr-CA",
            role: "EDITOR",
          },
          client: { accessLevel: "VIEW_ONLY" },
          authorization: { effectivePermissions: ["READ"] },
        },
      });
      expect(tasksBefore.statusCode).toBe(200);
      expect(tasksBefore.json()).toEqual(tasksAfter.json());
      const tasks = tasksBefore.json().data as Array<{ workspaceId: string }>;
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.every((task) => task.workspaceId === demoContext.workspaceId)).toBe(true);
      expect(createTask.statusCode).toBe(403);
      expect(createTask.json()).toEqual({
        error: { code: "AUTHORIZATION_DENIED", message: "Cette action n’est pas autorisée." },
      });
      expect(approvalsBefore.statusCode).toBe(200);
      expect(approval).toBeDefined();
      expect(approve.statusCode).toBe(403);
      expect(approve.json()).toEqual({
        error: { code: "AUTHORIZATION_DENIED", message: "Cette action n’est pas autorisée." },
      });
      expect(approvalsAfter.json()).toEqual(approvalsBefore.json());
      expect(command.statusCode).toBe(200);
      expect(command.json()).toMatchObject({ data: { kind: "TODAY", command: { requestedPermission: "READ" } } });
      expect(commandRunsBefore.json()).toEqual(commandRunsAfter.json());
    } finally {
      await app?.close();
      await database?.close().catch(() => undefined);
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("refuse toutes les familles de mutation à une instance VIEW_ONLY sans aucun effet de bord", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-view-only-mutations-"));
    const storageDir = await mkdtemp(join(tmpdir(), "ida-view-only-storage-"));
    let database: DemoDatabase | undefined;
    let app: Awaited<ReturnType<typeof createApp>> | undefined;

    try {
      database = await DemoDatabase.open({ dataDir });
      await database.pglite.query(
        `UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1 AND workspace_id = $2`,
        [demoIdentity.clientInstanceId, demoContext.workspaceId],
      );
      await database.close();
      database = undefined;

      app = await createApp({ dataDir, storageDir, seed: false, now });
      const readUrls = [
        "/v1/artist-profile",
        "/v1/releases",
        "/v1/campaigns",
        "/v1/tracks",
        "/v1/media",
        "/v1/memories",
        "/v1/approvals/queue",
        "/v1/calendar",
        "/v1/tasks",
        "/v1/activity-logs?limit=30",
      ];
      const readSnapshot = async () =>
        Promise.all(
          readUrls.map(async (url) => {
            const response = await app?.inject({ method: "GET", url });
            expect(response?.statusCode, url).toBe(200);
            return response?.body;
          }),
        );
      const before = await readSnapshot();
      const payloadHash = `sha256:${"a".repeat(64)}`;
      const denied = [
        {
          label: "Artist Brain",
          response: await app.inject({ method: "PATCH", url: "/v1/artist-profile", payload: { tone: "Interdit" } }),
        },
        {
          label: "release",
          response: await app.inject({
            method: "POST",
            url: "/v1/releases",
            payload: { title: "Interdite", releaseType: "SINGLE", status: "DRAFT", tags: [] },
          }),
        },
        {
          label: "track",
          response: await app.inject({
            method: "POST",
            url: "/v1/tracks",
            payload: { title: "Interdit", artistCredit: "IDA", status: "DEMO", tags: [] },
          }),
        },
        {
          label: "campagne",
          response: await app.inject({
            method: "POST",
            url: "/v1/campaigns",
            payload: { name: "Interdite", objective: "Ne jamais créer" },
          }),
        },
        {
          label: "lien release de campagne",
          response: await app.inject({
            method: "PATCH",
            url: "/v1/campaigns/cmp_absent/release",
            payload: { releaseId: "rel_lumiere_noire", expectedVersion: 1 },
          }),
        },
        {
          label: "lien track de campagne",
          response: await app.inject({
            method: "PATCH",
            url: "/v1/campaigns/cmp_absent/track",
            payload: { trackId: "trk_lumiere_noire", expectedVersion: 1 },
          }),
        },
        {
          label: "import média",
          response: await app.inject({
            method: "POST",
            url: "/v1/media",
            ...multipartFile("blocked.png", "image/png", Buffer.from("blocked-media")),
          }),
        },
        {
          label: "proposition mémoire",
          response: await app.inject({
            method: "POST",
            url: "/v1/memories/proposals",
            payload: { content: "Cette préférence ne doit pas être créée." },
          }),
        },
        {
          label: "confirmation mémoire",
          response: await app.inject({ method: "POST", url: "/v1/memories/mem_absent/confirm" }),
        },
        {
          label: "rejet mémoire",
          response: await app.inject({ method: "POST", url: "/v1/memories/mem_absent/reject" }),
        },
        {
          label: "approbation",
          response: await app.inject({
            method: "POST",
            url: "/v1/post-variants/variant_absent/approve",
            payload: { approvalId: "approval_absent", expectedPayloadHash: payloadHash },
          }),
        },
        {
          label: "rejet de variante",
          response: await app.inject({
            method: "POST",
            url: "/v1/post-variants/variant_absent/reject",
            payload: { approvalId: "approval_absent", expectedPayloadHash: payloadHash },
          }),
        },
        {
          label: "planification interne",
          response: await app.inject({
            method: "POST",
            url: "/v1/post-variants/variant_absent/internal-schedules",
            payload: { approvalId: "approval_absent", expectedPayloadHash: payloadHash },
          }),
        },
        {
          label: "annulation interne",
          response: await app.inject({ method: "POST", url: "/v1/internal-post-schedules/sch_absent/cancel" }),
        },
        {
          label: "création de tâche",
          response: await app.inject({ method: "POST", url: "/v1/tasks", payload: { title: "Interdite" } }),
        },
        {
          label: "finalisation de tâche",
          response: await app.inject({ method: "POST", url: "/v1/tasks/tsk_absent/complete" }),
        },
      ];

      for (const { label, response } of denied) {
        expect(response.statusCode, label).toBe(403);
        expect(response.json(), label).toEqual({
          error: { code: "AUTHORIZATION_DENIED", message: "Cette action n’est pas autorisée." },
        });
      }

      expect(await readSnapshot()).toEqual(before);
      expect(await readdir(storageDir)).toEqual([]);
    } finally {
      await app?.close();
      await database?.close().catch(() => undefined);
      await rm(dataDir, { recursive: true, force: true });
      await rm(storageDir, { recursive: true, force: true });
    }
  });
});
