import { randomBytes, randomUUID } from "node:crypto";
import type { IntelligencePolicy, IntelligenceScope } from "@ida/contracts/intelligence";
import {
  agentManifests,
  createAgentRegistry,
  IdentityAccessPolicy,
  listEnvironmentBrainProfiles,
  ToolGateway,
} from "@ida/domain";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";
import { LocalIntelligenceAccess } from "./local-intelligence-access.js";
import { MusicContextBroker } from "./music-context.js";
import { createMusicContextStore } from "./music-context-store.js";

const policy: IntelligencePolicy = {
  mode: "AI",
  allowedProviderKeys: ["ollama"],
  localFirst: true,
  maxAttempts: 1,
  maxCostMicros: 0,
  maxLatencyMs: 1000,
  cloudConsents: [],
};
let database: DemoDatabase;
beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://" });
});
afterAll(async () => {
  await database?.close();
});
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const clock = { date: new Date("2026-09-08T10:15:00Z") };
  const scope: IntelligenceScope = {
    userId: demoContext.userId,
    workspaceId: demoContext.workspaceId,
    clientInstanceId: demoIdentity.clientInstanceId,
    sessionId: `ses_${randomUUID().replaceAll("-", "")}`,
  };
  expect(
    await database.createLocalAuthSession({
      ...scope,
      tokenDigest: randomBytes(32).toString("hex"),
      issuedAt: "2026-09-08T10:00:00Z",
      expiresAt: "2026-09-08T18:00:00Z",
      idleExpiresAt: "2026-09-08T10:30:00Z",
    }),
  ).toBe(true);
  const getPolicy = vi.fn(() => structuredClone(policy));
  const options = { database, authenticatedScope: scope, getPolicy, now: () => clock.date };
  return { scope, clock, getPolicy, options, access: new LocalIntelligenceAccess(options) };
}

describe("Fresh intelligence authority for already authenticated LOCAL_LOCK work", () => {
  it("caps effective expiry at idle time without refreshing inactivity or exposing the token digest", async () => {
    const f = await fixture();
    const result = await f.access.loadCurrent(f.scope);
    expect(result.identity.session.expiresAt).toBe("2026-09-08T10:30:00.000Z");
    expect(JSON.stringify(result)).not.toContain("token");
    f.clock.date = new Date("2026-09-08T10:29:59Z");
    await f.access.loadCurrent(f.scope);
    const rows = await database.pglite.query<{ unchanged: boolean }>(
      `SELECT idle_expires_at = '2026-09-08T10:30:00Z'::timestamptz
        AND last_seen_at = '2026-09-08T10:00:00Z'::timestamptz AS unchanged
       FROM local_auth_sessions WHERE session_id = $1`,
      [f.scope.sessionId],
    );
    expect(rows.rows).toEqual([{ unchanged: true }]);
  });
  it.each(["idle", "absolute", "revoked"])("rejects %s local session", async (scenario) => {
    const f = await fixture();
    if (scenario === "idle") f.clock.date = new Date("2026-09-08T10:30:00Z");
    if (scenario === "absolute") {
      await database.pglite.query("UPDATE identity_sessions SET expires_at = $2 WHERE id = $1", [
        f.scope.sessionId,
        "2026-09-08T10:10:00Z",
      ]);
    }
    if (scenario === "revoked") {
      await database.pglite.query(
        "UPDATE local_auth_sessions SET status = 'REVOKED', revoked_at = $2 WHERE session_id = $1",
        [f.scope.sessionId, f.clock.date.toISOString()],
      );
    }
    await expect(f.access.loadCurrent(f.scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["userId", "workspaceId", "sessionId", "clientInstanceId"] as const)(
    "cannot change authenticated %s",
    async (key) => {
      const f = await fixture();
      await expect(f.access.loadCurrent({ ...f.scope, [key]: "foreign" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.getPolicy).not.toHaveBeenCalled();
      const forged = { ...f.scope, [key]: "foreign" };
      const another = new LocalIntelligenceAccess({ ...f.options, authenticatedScope: forged });
      await expect(another.loadCurrent(forged)).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
  it("refuses the long-lived LOCAL_DEMO session but leaves the existing demo resolver unchanged", async () => {
    const scope = {
      userId: demoContext.userId,
      workspaceId: demoContext.workspaceId,
      sessionId: demoIdentity.sessionId,
      clientInstanceId: demoIdentity.clientInstanceId,
    };
    const access = new LocalIntelligenceAccess({ database, authenticatedScope: scope, getPolicy: () => policy });
    await expect(access.loadCurrent(scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const demo = await database.resolveRequestIdentityContext(scope.sessionId, scope.workspaceId);
    expect(demo?.session.status).toBe("ACTIVE");
    expect(demo?.session.expiresAt).toBe(demoIdentity.expiresAt);
  });
  it("reads the current runtime policy after waiting for identity", async () => {
    const f = await fixture();
    const resolve = database.resolveRequestIdentityContext.bind(database);
    vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
      const result = await resolve(...args);
      f.getPolicy.mockReturnValue({ ...policy, mode: "NORMAL" });
      return result;
    });
    expect((await f.access.loadCurrent(f.scope)).policy.mode).toBe("NORMAL");
  });
  it("expunges policy errors and rejects malformed policy", async () => {
    const f = await fixture();
    f.getPolicy.mockImplementationOnce(() => {
      throw new Error("PRIVATE_POLICY_DETAIL");
    });
    await expect(f.access.loadCurrent(f.scope)).rejects.toThrow("IDA intelligence: FORBIDDEN");
    f.getPolicy.mockReturnValueOnce({ ...policy, maxAttempts: 4 });
    await expect(f.access.loadCurrent(f.scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // @ts-expect-error No asynchronous policy loader may hide an additional authority wait.
    f.getPolicy.mockReturnValueOnce(Promise.resolve(policy));
    await expect(f.access.loadCurrent(f.scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects idle expiration during the database wait", async () => {
    const f = await fixture();
    const resolve = database.resolveRequestIdentityContext.bind(database);
    vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
      const result = await resolve(...args);
      f.clock.date = new Date("2026-09-08T10:30:00Z");
      return result;
    });
    await expect(f.access.loadCurrent(f.scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.getPolicy).not.toHaveBeenCalled();
  });
  it("cannot reuse a rotated session or mutate its bound scope", async () => {
    const old = await fixture();
    const fresh = await fixture();
    await expect(old.access.loadCurrent(old.scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const original = { ...fresh.scope };
    fresh.options.authenticatedScope.workspaceId = "forged";
    expect((await fresh.access.loadCurrent(original)).identity.workspaceId).toBe(original.workspaceId);
    await expect(fresh.access.loadCurrent(fresh.scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each([
    {
      table: "users",
      where: "id = $1",
      id: demoContext.userId,
      revoke: "status = 'SUSPENDED'",
      restore: "status = 'ACTIVE'",
    },
    {
      table: "client_instances",
      where: "id = $1",
      id: demoIdentity.clientInstanceId,
      revoke: "status = 'PENDING'",
      restore: "status = 'ACTIVE'",
    },
    {
      table: "memberships",
      where: "workspace_id = $1",
      id: demoContext.workspaceId,
      revoke: "status = 'SUSPENDED'",
      restore: "status = 'ACTIVE'",
    },
    {
      table: "client_workspace_grants",
      where: "client_instance_id = $1",
      id: demoIdentity.clientInstanceId,
      revoke: "status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP",
      restore: "status = 'ACTIVE', revoked_at = NULL",
    },
  ])("checks current $table restrictions", async (scenario) => {
    const f = await fixture();
    // All SQL identifiers/expressions come from this fixed synthetic test matrix.
    await database.pglite.query(`UPDATE ${scenario.table} SET ${scenario.revoke} WHERE ${scenario.where}`, [
      scenario.id,
    ]);
    try {
      await expect(f.access.loadCurrent(f.scope)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await database.pglite.query(`UPDATE ${scenario.table} SET ${scenario.restore} WHERE ${scenario.where}`, [
        scenario.id,
      ]);
    }
  });
  it("keeps a VIEW_ONLY device restricted after authentication", async () => {
    const f = await fixture();
    await database.pglite.query(
      "UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1 AND workspace_id = $2",
      [f.scope.clientInstanceId, f.scope.workspaceId],
    );
    try {
      const result = await f.access.loadCurrent(f.scope);
      expect(result.identity.clientGrant.accessLevel).toBe("VIEW_ONLY");
      expect(
        new IdentityAccessPolicy().evaluate({ context: result.identity, permission: "WRITE", now: f.clock.date })
          .allowed,
      ).toBe(false);
    } finally {
      await database.pglite.query(
        "UPDATE client_workspace_grants SET access_level = 'TRUSTED' WHERE client_instance_id = $1 AND workspace_id = $2",
        [f.scope.clientInstanceId, f.scope.workspaceId],
      );
    }
  });
  it("composes real identity, broker, gateway and SQL, then blocks reuse after local lock", async () => {
    const f = await fixture();
    const profile = listEnvironmentBrainProfiles().find((entry) => entry.environmentKey === "music");
    if (!profile) throw new Error("Missing profile fixture");
    profile.status = "ACTIVE";
    profile.modelPolicy.allowedModels = [{ providerKey: "ollama", modelId: "synthetic-test" }];
    const store = createMusicContextStore(database);
    const read = vi.spyOn(store, "read");
    const broker = new MusicContextBroker({
      profileVersion: profile.version,
      access: f.access,
      store,
      now: f.options.now,
      agents: createAgentRegistry(
        agentManifests.map((entry) => ({
          ...entry,
          status: "ACTIVE",
          allowedTools: [...entry.allowedTools],
          contextSources: [...entry.contextSources],
          supportedIntents: [...entry.supportedIntents],
        })),
      ),
      gateway: new ToolGateway(undefined, [{ toolKey: "list_tracks", moduleKey: "MUSIC", permission: "READ" }]),
      getProfile: () => structuredClone(profile),
      audit: async () => {},
    });
    const snapshot = await broker.read(f.scope, { intent: "SEARCH_TRACK", limit: 2 });
    expect(snapshot.facts.tracks.length).toBeGreaterThan(0);
    expect(snapshot.facts.tracks.length).toBeLessThanOrEqual(2);
    expect(snapshot.facts.media).toEqual([]);
    expect(snapshot.dataClasses).toEqual(["PRIVATE_CREATIVE"]);
    await database.revokeLocalAuthSessionsForClient(
      f.scope.userId,
      f.scope.clientInstanceId,
      f.clock.date.toISOString(),
    );
    await expect(broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
