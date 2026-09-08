import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { IntelligenceScope } from "@ida/contracts/intelligence";
import type { MusicContextAudit } from "@ida/contracts/intelligence-audit";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";
import { createPersistentIntelligenceAudit } from "./intelligence-audit.js";
import { ensureIntelligenceAuditSchema } from "./intelligence-audit-schema.js";

const temporaryPrefix = "ida-intelligence-audit-";
const issuedAt = "2026-09-08T10:00:00.000Z";

async function localScope(
  database: DemoDatabase,
  identity: Pick<IntelligenceScope, "userId" | "workspaceId" | "clientInstanceId"> = {
    userId: demoContext.userId,
    workspaceId: demoContext.workspaceId,
    clientInstanceId: demoIdentity.clientInstanceId,
  },
): Promise<IntelligenceScope> {
  const scope = { ...identity, sessionId: `ses_${randomUUID()}` };
  expect(
    await database.createLocalAuthSession({
      ...scope,
      tokenDigest: randomBytes(32).toString("hex"),
      issuedAt,
      expiresAt: "2026-09-08T18:00:00.000Z",
      idleExpiresAt: "2026-09-08T10:30:00.000Z",
    }),
  ).toBe(true);
  return scope;
}

function contextEvent(scope: IntelligenceScope): MusicContextAudit {
  return {
    runId: randomUUID(),
    scope,
    environmentKey: "music",
    agentKey: "agent_music_librarian",
    intent: "SEARCH_TRACK",
    outcome: "ATTEMPT",
  };
}

function contextRow(scope: IntelligenceScope) {
  return {
    workspace_id: scope.workspaceId,
    user_id: scope.userId,
    session_id: scope.sessionId,
    client_instance_id: scope.clientInstanceId,
    kind: "CONTEXT",
    run_id: randomUUID(),
    attempt: 0,
    outcome: "ATTEMPT",
    environment_key: "music",
    agent_key: "agent_music_librarian",
    profile_version: null,
    intent: "SEARCH_TRACK",
    purpose: null,
    provider_key: null,
    model_id: null,
    locality: null,
    manifest_version: null,
    data_classes: ["PRIVATE_CREATIVE"],
    estimated_cost_micros: null,
    event_fingerprint: "a".repeat(64),
  };
}

function inferenceRow(scope: IntelligenceScope) {
  return {
    ...contextRow(scope),
    kind: "INFERENCE",
    attempt: 1,
    environment_key: null,
    agent_key: null,
    intent: null,
    purpose: "ASSISTANT_REPLY",
    provider_key: "ollama",
    model_id: "synthetic-test",
    locality: "LOCAL",
    manifest_version: "0.1.0",
    data_classes: ["PUBLIC"],
    estimated_cost_micros: 0,
  };
}

async function insertRaw(database: DemoDatabase, row: Record<string, unknown>) {
  // Les noms de colonnes proviennent uniquement des objets fixes de ces fixtures.
  const columns = Object.keys(row);
  return database.pglite.query(
    `INSERT INTO intelligence_audit_events (${columns.join(", ")})
     VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
    Object.values(row),
  );
}

async function auditRows(database: DemoDatabase) {
  return (await database.pglite.query("SELECT * FROM intelligence_audit_events ORDER BY id")).rows;
}

async function removeTemporaryDatabase(directory: string) {
  const target = resolve(directory);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith(temporaryPrefix)) {
    throw new Error("Chemin temporaire d'audit hors périmètre.");
  }
  await rm(target, { recursive: true, force: true });
}

describe("Persistent intelligence audit SQL boundary", () => {
  let database: DemoDatabase;
  let scope: IntelligenceScope;
  let foreignScope: IntelligenceScope;

  beforeAll(async () => {
    database = await DemoDatabase.open({ dataDir: "memory://" });
    scope = await localScope(database);
    const foreign = {
      userId: "usr_audit_foreign",
      workspaceId: "wsp_audit_foreign",
      clientInstanceId: "cli_audit_foreign",
    };
    await database.pglite.transaction(async (transaction) => {
      await transaction.query(
        "INSERT INTO users (id, email, display_name, timezone) VALUES ($1, 'audit@example.invalid', 'Audit fixture', 'UTC')",
        [foreign.userId],
      );
      await transaction.query(
        "INSERT INTO workspaces (id, name, timezone, locale, owner_user_id) VALUES ($1, 'Audit fixture', 'UTC', 'fr-FR', $2)",
        [foreign.workspaceId, foreign.userId],
      );
      await transaction.query("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'OWNER')", [
        foreign.workspaceId,
        foreign.userId,
      ]);
      await transaction.query(
        `INSERT INTO client_instances (id, user_id, display_name, kind, platform, status)
         VALUES ($1, $2, 'Audit fixture', 'WEB_BROWSER', 'WINDOWS', 'ACTIVE')`,
        [foreign.clientInstanceId, foreign.userId],
      );
      await transaction.query(
        `INSERT INTO client_workspace_grants (client_instance_id, user_id, workspace_id, access_level, granted_by)
         VALUES ($1, $2, $3, 'TRUSTED', $2)`,
        [foreign.clientInstanceId, foreign.userId, foreign.workspaceId],
      );
    });
    foreignScope = await localScope(database, foreign);
  });

  afterAll(async () => {
    await database?.close();
  });

  it("reapplies its additive migration without changing existing evidence or the activity journal", async () => {
    const event = contextEvent(scope);
    await createPersistentIntelligenceAudit(database, scope).context(event);
    const before = await auditRows(database);
    const activity = (await database.pglite.query("SELECT * FROM activity_logs ORDER BY id")).rows;
    await ensureIntelligenceAuditSchema(database.pglite);
    await ensureIntelligenceAuditSchema(database.pglite);
    expect(await auditRows(database)).toEqual(before);
    expect((await database.pglite.query("SELECT * FROM activity_logs ORDER BY id")).rows).toEqual(activity);
  });

  it.each([
    "UPDATE intelligence_audit_events SET outcome = 'DENIED'",
    "DELETE FROM intelligence_audit_events",
    "TRUNCATE TABLE intelligence_audit_events",
  ])("refuses direct mutation: %s", async (statement) => {
    await createPersistentIntelligenceAudit(database, scope).context(contextEvent(scope));
    const before = await auditRows(database);
    await expect(database.pglite.exec(statement)).rejects.toThrow("IDA audit is append-only");
    expect(await auditRows(database)).toEqual(before);
  });

  it.each(["workspaceId", "userId", "sessionId", "clientInstanceId"] as const)(
    "rejects an existing but unrelated %s at the SQL trigger",
    async (key) => {
      const forged = { ...scope, [key]: foreignScope[key] };
      const before = await auditRows(database);
      await expect(insertRaw(database, contextRow(forged))).rejects.toThrow("IDA audit scope refused");
      expect(await auditRows(database)).toEqual(before);
    },
  );

  it("rejects LOCAL_DEMO through the callback and raw SQL despite its valid identity relationships", async () => {
    const demoScope = { ...scope, sessionId: demoIdentity.sessionId };
    const before = await auditRows(database);
    await expect(
      createPersistentIntelligenceAudit(database, demoScope).context(contextEvent(demoScope)),
    ).rejects.toMatchObject({ code: "AUDIT_UNAVAILABLE", message: "IDA intelligence: AUDIT_UNAVAILABLE" });
    await expect(insertRaw(database, contextRow(demoScope))).rejects.toThrow("IDA audit scope refused");
    expect(await auditRows(database)).toEqual(before);
  });

  it("accepts independently scoped evidence without mixing workspaces", async () => {
    const local = contextEvent(scope);
    const foreign = contextEvent(foreignScope);
    await createPersistentIntelligenceAudit(database, scope).context(local);
    await createPersistentIntelligenceAudit(database, foreignScope).context(foreign);
    const result = await database.pglite.query<{ workspace_id: string; run_id: string }>(
      "SELECT workspace_id, run_id FROM intelligence_audit_events WHERE run_id IN ($1, $2) ORDER BY workspace_id",
      [local.runId, foreign.runId],
    );
    expect(result.rows).toEqual(
      [
        { workspace_id: foreignScope.workspaceId, run_id: foreign.runId },
        { workspace_id: scope.workspaceId, run_id: local.runId },
      ].sort((a, b) => a.workspace_id.localeCompare(b.workspace_id)),
    );
  });

  it("accepts the declared raw context and inference shapes", async () => {
    const context = contextRow(scope);
    const inference = inferenceRow(scope);
    await insertRaw(database, context);
    await insertRaw(database, inference);
    expect(
      (
        await database.pglite.query(
          "SELECT kind FROM intelligence_audit_events WHERE run_id IN ($1, $2) ORDER BY kind",
          [context.run_id, inference.run_id],
        )
      ).rows,
    ).toEqual([{ kind: "CONTEXT" }, { kind: "INFERENCE" }]);
  });

  const invalidContextRows: [string, Record<string, unknown>][] = [
    ["NULL environment", { environment_key: null }],
    ["NULL agent", { agent_key: null }],
    ["NULL intent", { intent: null }],
    ["context with inference metadata", { provider_key: "ollama" }],
    ["context with profile version", { profile_version: "0.1.0" }],
    ["context with inference attempt", { attempt: 1 }],
    ["context with inference outcome", { outcome: "FORBIDDEN" }],
    ["NULL classification", { data_classes: null }],
    ["NULL classification element", { data_classes: [null] }],
    ["SECRET classification", { data_classes: ["SECRET"] }],
    ["empty classifications", { data_classes: [] }],
    ["unknown classification", { data_classes: ["UNREVIEWED"] }],
  ];
  it.each(invalidContextRows)("rejects raw context shape: %s", async (_name, patch) => {
    await expect(insertRaw(database, { ...contextRow(scope), ...patch })).rejects.toThrow();
  });

  const invalidInferenceRows: [string, Record<string, unknown>][] = [
    ["NULL purpose", { purpose: null }],
    ["NULL provider", { provider_key: null }],
    ["NULL model", { model_id: null }],
    ["NULL locality", { locality: null }],
    ["NULL manifest", { manifest_version: null }],
    ["NULL cost", { estimated_cost_micros: null }],
    ["negative cost", { estimated_cost_micros: -1 }],
    ["unsafe integer cost", { estimated_cost_micros: "9007199254740992" }],
    ["malformed manifest", { manifest_version: "0x1x0" }],
    ["URL in model", { model_id: "https://example.invalid/private" }],
    ["duplicate classifications", { data_classes: ["PUBLIC", "PUBLIC"] }],
    ["multidimensional classifications", { data_classes: [["PUBLIC"]] }],
    ["unbounded attempt", { attempt: 4 }],
    ["context outcome", { outcome: "DENIED" }],
    ["environment without agent and profile", { environment_key: "music" }],
    ["agent and profile without environment", { agent_key: "agent_music_librarian", profile_version: "0.1.0" }],
    ["malformed profile", { environment_key: "music", agent_key: "agent_music_librarian", profile_version: "0x1x0" }],
  ];
  it.each(invalidInferenceRows)("rejects raw inference shape: %s", async (_name, patch) => {
    await expect(insertRaw(database, { ...inferenceRow(scope), ...patch })).rejects.toThrow();
  });
});

it("keeps the same immutable evidence and retry identity after closing and reopening its own database", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), temporaryPrefix));
  const dataDir = join(temporaryDirectory, "data");
  let database: DemoDatabase | undefined;
  try {
    database = await DemoDatabase.open({ dataDir });
    const scope = await localScope(database);
    const event = contextEvent(scope);
    const sink = createPersistentIntelligenceAudit(database, scope);
    await sink.context(event);
    await sink.context({ ...event, outcome: "SUCCEEDED" });
    await sink.context({ ...event, outcome: "DENIED" });
    const before = await auditRows(database);
    expect(before).toHaveLength(3);
    await database.close();
    database = undefined;
    database = await DemoDatabase.open({ dataDir });
    expect(await auditRows(database)).toEqual(before);
    await createPersistentIntelligenceAudit(database, scope).context(event);
    expect(await auditRows(database)).toEqual(before);
    await expect(database.pglite.exec("TRUNCATE TABLE intelligence_audit_events")).rejects.toThrow(
      "IDA audit is append-only",
    );
    expect(await auditRows(database)).toEqual(before);
  } finally {
    await database?.close();
    await removeTemporaryDatabase(temporaryDirectory);
  }
});
