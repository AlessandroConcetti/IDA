import { randomBytes, randomUUID } from "node:crypto";
import type { IntelligencePolicy, IntelligenceScope } from "@ida/contracts/intelligence";
import type { MusicContextQuery } from "@ida/contracts/music-context";
import { IdentityAccessPolicy } from "@ida/domain";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";
import { LocalMusicContextAuthority } from "./local-music-context-authority.js";

const policy: IntelligencePolicy = {
  mode: "AI",
  allowedProviderKeys: ["ollama"],
  localFirst: true,
  maxAttempts: 1,
  maxCostMicros: 0,
  maxLatencyMs: 1000,
  cloudConsents: [],
};
const query: MusicContextQuery = { intent: "SEARCH_TRACK", title: "Authority", limit: 10 };
let database: DemoDatabase;

beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://" });
  await database.pglite.query(
    "INSERT INTO workspaces (id, name, timezone, locale, owner_user_id) VALUES ('wsp_authority_foreign', 'Synthetic foreign', 'UTC', 'fr', $1)",
    [demoContext.userId],
  );
  await database.pglite.query(
    `INSERT INTO artist_projects (id, workspace_id, name, status) VALUES
      ('prj_authority_main', $1, 'Synthetic main', 'ACTIVE'),
      ('prj_authority_foreign', 'wsp_authority_foreign', 'Synthetic foreign', 'ACTIVE')`,
    [demoContext.workspaceId],
  );
  for (const [id, title, status, foreign] of [
    ["tr_authority_exact", "Authority 100%", "UNRELEASED", false],
    ["tr_authority_decoy", "Authority 100X", "DEMO", false],
    ["tr_authority_archived", "Authority 000 archived", "ARCHIVED", false],
    ["tr_authority_foreign", "Authority 000 foreign", "UNRELEASED", true],
  ] as const) {
    await database.pglite.query(
      `INSERT INTO tracks (id, workspace_id, artist_project_id, title, artist_credit,
        genre, bpm, musical_key, status, description, label, tags, updated_at)
        VALUES ($1, $2, $3, $4, 'Synthetic artist', NULL, 123.5, 'Am', $5,
          'PRIVATE_DESCRIPTION', 'PRIVATE_LABEL', '["PRIVATE_TAG"]'::json, '2026-09-08T12:00:00.123+02:00')`,
      [
        id,
        foreign ? "wsp_authority_foreign" : demoContext.workspaceId,
        foreign ? "prj_authority_foreign" : "prj_authority_main",
        title,
        status,
      ],
    );
  }
  for (const [id, mediaType, status, foreign, createdAt] of [
    ["ma_authority_exact", "VIDEO", "UNUSED", false, "2040-01-01T00:00:00Z"],
    ["ma_authority_image", "IMAGE", "UNUSED", false, "2041-01-01T00:00:00Z"],
    ["ma_authority_used", "VIDEO", "USED", false, "2041-01-01T00:00:00Z"],
    ["ma_authority_archived", "VIDEO", "ARCHIVED", false, "2042-01-01T00:00:00Z"],
    ["ma_authority_foreign", "VIDEO", "UNUSED", true, "2043-01-01T00:00:00Z"],
  ] as const) {
    await database.pglite.query(
      `INSERT INTO media_assets (id, workspace_id, artist_project_id, filename, media_type,
        mime_type, byte_size, sha256, storage_key, status, description, created_at, updated_at)
        VALUES ($1, $2, $3, 'PRIVATE_FILENAME.mp4', $4, 'video/mp4', 100, $5,
          'PRIVATE_STORAGE', $6, 'PRIVATE_MEDIA_DESCRIPTION', $7, '2026-09-08T10:00:00.123Z')`,
      [
        id,
        foreign ? "wsp_authority_foreign" : demoContext.workspaceId,
        foreign ? "prj_authority_foreign" : "prj_authority_main",
        mediaType,
        `PRIVATE_HASH_${id}`,
        status,
        createdAt,
      ],
    );
  }
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
  return { scope, clock, getPolicy, options, authority: new LocalMusicContextAuthority(options) };
}

describe("Transactional local music context authority", () => {
  it("reads current identity and bounded facts without exposing private columns or tokens", async () => {
    const f = await fixture();
    const result = await f.authority.loadCurrent(f.scope, { ...query, limit: 1 });
    expect(result.identity.workspaceId).toBe(f.scope.workspaceId);
    expect(result.identity.session.id).toBe(f.scope.sessionId);
    expect(result.identity.session.expiresAt).toBe("2026-09-08T10:30:00.000Z");
    expect(result.policy).toEqual(policy);
    expect(result.facts).toEqual({
      tracks: [
        {
          id: "tr_authority_exact",
          title: "Authority 100%",
          artistCredit: "Synthetic artist",
          genre: null,
          bpm: 123.5,
          musicalKey: "Am",
          status: "UNRELEASED",
          updatedAt: "2026-09-08T10:00:00.123Z",
        },
      ],
      media: [],
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|token/);
  });

  it("shares the actual repeatable-read, read-only transaction reader between identity and facts", async () => {
    const f = await fixture();
    const original = database.resolveRequestIdentityContext.bind(database);
    let observedSql: string[] = [];
    vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
      const reader = args[3];
      expect(reader).toBeDefined();
      expect(reader).not.toBe(database.pglite);
      if (!reader) throw new Error("Missing transaction reader");
      const settings = await reader.query<{ isolation: string; readOnly: string }>(
        "SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS \"readOnly\"",
      );
      expect(settings.rows).toEqual([{ isolation: "repeatable read", readOnly: "on" }]);
      const sql = vi.spyOn(reader, "query");
      const result = await original(...args);
      observedSql = sql.mock.calls.map(([statement]) => statement);
      // Capture the following facts query on this same reader as well.
      f.getPolicy.mockImplementation(() => {
        observedSql = sql.mock.calls.map(([statement]) => statement);
        return structuredClone(policy);
      });
      return result;
    });
    await f.authority.loadCurrent(f.scope, query);
    expect(observedSql.some((statement) => /FROM identity_sessions/.test(statement))).toBe(true);
    expect(observedSql.some((statement) => /FROM tracks\s+WHERE/.test(statement))).toBe(true);
    expect(observedSql.every((statement) => /^\s*SELECT\b/i.test(statement))).toBe(true);
  });

  it("uses literal title filtering and excludes archived or foreign tracks", async () => {
    const f = await fixture();
    const all = await f.authority.loadCurrent(f.scope, query);
    expect(all.facts.tracks.map((track) => track.id)).toEqual(["tr_authority_exact", "tr_authority_decoy"]);
    const literal = await f.authority.loadCurrent(f.scope, { ...query, title: "100%" });
    expect(literal.facts.tracks.map((track) => track.id)).toEqual(["tr_authority_exact"]);
    expect((await f.authority.loadCurrent(f.scope, { ...query, title: "' OR TRUE --" })).facts.tracks).toEqual([]);
  });

  it("filters media status/type within the bound workspace before limiting", async () => {
    const f = await fixture();
    const result = await f.authority.loadCurrent(f.scope, {
      intent: "SEARCH_MEDIA",
      mediaType: "VIDEO",
      status: "UNUSED",
      limit: 1,
    });
    expect(result.facts).toEqual({
      tracks: [],
      media: [
        {
          id: "ma_authority_exact",
          mediaType: "VIDEO",
          status: "UNUSED",
          updatedAt: "2026-09-08T10:00:00.123Z",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|token/);
  });

  it.each(["userId", "workspaceId", "sessionId", "clientInstanceId"] as const)(
    "rejects forged %s before starting a transaction",
    async (field) => {
      const f = await fixture();
      const transaction = vi.spyOn(database.pglite, "transaction");
      await expect(f.authority.loadCurrent({ ...f.scope, [field]: "foreign" }, query)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(transaction).not.toHaveBeenCalled();
      expect(f.getPolicy).not.toHaveBeenCalled();
    },
  );

  it.each([
    { intent: "SEARCH_TRACK", limit: 11 },
    { intent: "SEARCH_TRACK", title: "", limit: 1 },
    { intent: "SEARCH_TRACK", workspaceId: "foreign", limit: 1 },
    { intent: "SEARCH_MEDIA", status: "ARCHIVED", limit: 1 },
  ])("rejects malformed query %j before SQL", async (raw) => {
    const f = await fixture();
    const transaction = vi.spyOn(database.pglite, "transaction");
    await expect(f.authority.loadCurrent(f.scope, raw as MusicContextQuery)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses LOCAL_DEMO without changing the existing demo identity", async () => {
    const f = await fixture();
    const scope = { ...f.scope, sessionId: demoIdentity.sessionId };
    const authority = new LocalMusicContextAuthority({ ...f.options, authenticatedScope: scope });
    await expect(authority.loadCurrent(scope, query)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await database.resolveRequestIdentityContext(scope.sessionId, scope.workspaceId))?.session.status).toBe(
      "ACTIVE",
    );
  });

  it.each(["idle", "absolute", "revoked"])("rejects a session that is %s", async (scenario) => {
    const f = await fixture();
    if (scenario === "idle") f.clock.date = new Date("2026-09-08T10:30:00Z");
    if (scenario === "absolute")
      await database.pglite.query("UPDATE identity_sessions SET expires_at = '2026-09-08T10:10:00Z' WHERE id = $1", [
        f.scope.sessionId,
      ]);
    if (scenario === "revoked")
      await database.revokeLocalAuthSessionsForClient(
        f.scope.userId,
        f.scope.clientInstanceId,
        f.clock.date.toISOString(),
      );
    await expect(f.authority.loadCurrent(f.scope, query)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.getPolicy).not.toHaveBeenCalled();
  });

  it("never refreshes idle expiration or last-seen time", async () => {
    const f = await fixture();
    await f.authority.loadCurrent(f.scope, query);
    f.clock.date = new Date("2026-09-08T10:29:59Z");
    await f.authority.loadCurrent(f.scope, query);
    const result = await database.pglite.query<{ unchanged: boolean }>(
      `SELECT idle_expires_at = '2026-09-08T10:30:00Z'::timestamptz
        AND last_seen_at = '2026-09-08T10:00:00Z'::timestamptz AS unchanged
        FROM local_auth_sessions WHERE session_id = $1`,
      [f.scope.sessionId],
    );
    expect(result.rows).toEqual([{ unchanged: true }]);
  });

  it("preserves READ-only device restrictions after successful authentication", async () => {
    const f = await fixture();
    await database.pglite.query(
      "UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1 AND workspace_id = $2",
      [f.scope.clientInstanceId, f.scope.workspaceId],
    );
    try {
      const result = await f.authority.loadCurrent(f.scope, query);
      const access = new IdentityAccessPolicy();
      expect(result.identity.clientGrant.accessLevel).toBe("VIEW_ONLY");
      expect(access.evaluate({ context: result.identity, permission: "READ", now: f.clock.date }).allowed).toBe(true);
      expect(access.evaluate({ context: result.identity, permission: "WRITE", now: f.clock.date }).allowed).toBe(false);
    } finally {
      await database.pglite.query(
        "UPDATE client_workspace_grants SET access_level = 'TRUSTED' WHERE client_instance_id = $1 AND workspace_id = $2",
        [f.scope.clientInstanceId, f.scope.workspaceId],
      );
    }
  });

  it("reads runtime policy again after the database transaction completes", async () => {
    const f = await fixture();
    const original = database.pglite.transaction.bind(database.pglite);
    let completed = false;
    vi.spyOn(database.pglite, "transaction").mockImplementation(async (callback) => {
      const snapshot = await original(callback);
      completed = true;
      return snapshot;
    });
    f.getPolicy.mockImplementation(() => ({ ...policy, mode: completed ? "NORMAL" : "AI" }));
    expect((await f.authority.loadCurrent(f.scope, query)).policy.mode).toBe("NORMAL");
    expect(completed).toBe(true);
  });

  it("rejects expiration at transaction completion", async () => {
    const f = await fixture();
    const original = database.pglite.transaction.bind(database.pglite);
    vi.spyOn(database.pglite, "transaction").mockImplementation(async (callback) => {
      const snapshot = await original(callback);
      f.clock.date = new Date("2026-09-08T10:30:00Z");
      return snapshot;
    });
    await expect(f.authority.loadCurrent(f.scope, query)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("redacts database errors and policy exceptions without returning partial facts", async () => {
    const f = await fixture();
    vi.spyOn(database.pglite, "transaction").mockRejectedValueOnce(new Error("PRIVATE_SQL_DETAIL"));
    await expect(f.authority.loadCurrent(f.scope, query)).rejects.toThrow("IDA intelligence: FORBIDDEN");
    f.getPolicy.mockImplementationOnce(() => {
      throw new Error("PRIVATE_POLICY_DETAIL");
    });
    await expect(f.authority.loadCurrent(f.scope, query)).rejects.toThrow("IDA intelligence: FORBIDDEN");
  });

  it("keeps the authenticated scope detached from caller mutations", async () => {
    const f = await fixture();
    const original = { ...f.scope };
    f.scope.workspaceId = "forged";
    await expect(f.authority.loadCurrent(f.scope, query)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await f.authority.loadCurrent(original, query)).identity.workspaceId).toBe(original.workspaceId);
  });
});
