import { randomBytes, randomUUID } from "node:crypto";
import type { AIProviderManifest, IntelligencePolicy } from "@ida/contracts/intelligence";
import {
  agentManifests,
  createAgentRegistry,
  listEnvironmentBrainProfiles,
  ProviderRegistry,
  ToolGateway,
} from "@ida/domain";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { intelligenceProposalTool } from "./core-intelligence.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";
import { createLocalMusicProposalService } from "./local-music-proposal.js";

let database: DemoDatabase;
beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://" });
  await database.pglite.query(
    "INSERT INTO artist_projects (id, workspace_id, name, status) VALUES ('prj_pipeline', $1, 'Synthetic pipeline', 'ACTIVE')",
    [demoContext.workspaceId],
  );
});
afterAll(async () => {
  await database?.close();
});
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const scope = {
    userId: demoContext.userId,
    workspaceId: demoContext.workspaceId,
    clientInstanceId: demoIdentity.clientInstanceId,
    sessionId: `ses_${randomUUID()}`,
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
  const titlePrefix = `Pilot ${randomUUID()}`;
  const ids = [randomUUID(), randomUUID()];
  for (const [i, id] of ids.entries())
    await database.pglite.query(
      `INSERT INTO tracks (id, workspace_id, artist_project_id, title, artist_credit, status, description)
      VALUES ($1, $2, 'prj_pipeline', $3, 'Artiste fictif', 'UNRELEASED', 'PRIVATE_HIDDEN_CANARY')`,
      [id, scope.workspaceId, `${titlePrefix} ${i + 1}`],
    );
  const adapter = {
    providerKey: "synthetic",
    locality: "LOCAL" as const,
    generate: vi.fn(async (_input: { prompt: string }) => ({ text: '{"orderedRefs":["R2","R1"]}' })),
  };
  const manifest: AIProviderManifest = {
    key: "synthetic",
    version: "0.1.0",
    category: "LLM",
    locality: "LOCAL",
    retention: "LOCAL_ONLY",
    acceptedDataClasses: ["PRIVATE_CREATIVE"],
    models: [
      {
        id: "fixture",
        capabilities: ["TEXT"],
        maxComplexity: 1,
        maxInputChars: 32000,
        maxOutputTokens: 512,
        estimatedCostMicros: 0,
        estimatedLatencyMs: 1,
      },
    ],
  };
  const registry = new ProviderRegistry([{ manifest, adapter }]);
  registry.configure("synthetic", {
    enabled: true,
    configured: true,
    availability: "READY",
    remainingCalls: 2,
    validUntil: "2026-09-08T11:00:00Z",
  });
  const profile = listEnvironmentBrainProfiles().find((item) => item.environmentKey === "music");
  if (!profile) throw new Error("Missing music fixture");
  profile.status = "ACTIVE";
  profile.modelPolicy.allowedModels = [{ providerKey: "synthetic", modelId: "fixture" }];
  const policy: IntelligencePolicy = {
    mode: "AI",
    allowedProviderKeys: ["synthetic"],
    allowedLocalities: ["LOCAL"],
    localFirst: true,
    maxAttempts: 1,
    maxCostMicros: 0,
    maxLatencyMs: 2000,
    cloudConsents: [],
  };
  const options = {
    database,
    authenticatedScope: scope,
    registry,
    profileVersion: profile.version,
    agents: createAgentRegistry(
      agentManifests.map((entry) => ({
        ...entry,
        status: "ACTIVE",
        allowedTools: [...entry.allowedTools],
        contextSources: [...entry.contextSources],
        supportedIntents: [...entry.supportedIntents],
      })),
    ),
    gateway: new ToolGateway(undefined, [
      intelligenceProposalTool,
      { toolKey: "list_tracks", moduleKey: "MUSIC", permission: "READ" },
      { toolKey: "search_media", moduleKey: "CONTENT", permission: "READ" },
    ]),
    getProfile: () => structuredClone(profile),
    getPolicy: () => structuredClone(policy),
    now: () => new Date("2026-09-08T10:15:00Z"),
  };
  const events = async () =>
    (
      await database.pglite.query<{ kind: string; outcome: string }>(
        "SELECT kind, outcome FROM intelligence_audit_events WHERE session_id = $1 ORDER BY id",
        [scope.sessionId],
      )
    ).rows;
  const business = async () =>
    (
      await database.pglite.query(
        "SELECT (SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM memories) AS memories, (SELECT COUNT(*) FROM activity_logs) AS activity",
      )
    ).rows;
  return {
    scope,
    titlePrefix,
    ids,
    adapter,
    registry,
    profile,
    policy,
    options,
    events,
    business,
    service: createLocalMusicProposalService(options),
  };
}

describe("Complete local music proposal composition, no real inference", () => {
  it("traverses authenticated database, context, router and append-only audit with no business write", async () => {
    const f = await fixture();
    const before = await f.business();
    const result = await f.service.propose(f.scope, { intent: "SEARCH_TRACK", title: f.titlePrefix });
    expect(result.facts.tracks.map((row) => row.id)).toEqual([...f.ids].reverse());
    expect(result.answer).toContain("2 morceaux parmi les résultats sélectionnés");
    expect(await f.events()).toEqual([
      { kind: "CONTEXT", outcome: "ATTEMPT" },
      { kind: "CONTEXT", outcome: "SUCCEEDED" },
      { kind: "INFERENCE", outcome: "ATTEMPT" },
      { kind: "INFERENCE", outcome: "SUCCEEDED" },
    ]);
    expect(await f.business()).toEqual(before);
    expect(f.adapter.generate).toHaveBeenCalledTimes(1);
    const prompt = f.adapter.generate.mock.calls[0]?.[0].prompt ?? "";
    for (const forbidden of [...f.ids, ...Object.values(f.scope), "PRIVATE_HIDDEN_CANARY"])
      expect(prompt).not.toContain(forbidden);
    const audit = JSON.stringify(
      (
        await database.pglite.query("SELECT * FROM intelligence_audit_events WHERE session_id = $1", [
          f.scope.sessionId,
        ])
      ).rows,
    );
    expect(audit).not.toContain(f.titlePrefix);
    expect(audit).not.toContain("PRIVATE_HIDDEN_CANARY");
    expect(f.registry.list()[0]?.state.remainingCalls).toBe(1);
  });
  it("persists an invalid-reference refusal and never accepts the provider's text", async () => {
    const f = await fixture();
    f.adapter.generate.mockResolvedValue({ text: '{"orderedRefs":["R1","R10"]}' });
    await expect(f.service.propose(f.scope, { intent: "SEARCH_TRACK", title: f.titlePrefix })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect((await f.events()).filter((event) => event.kind === "INFERENCE")).toEqual([
      { kind: "INFERENCE", outcome: "ATTEMPT" },
      { kind: "INFERENCE", outcome: "INVALID_RESPONSE" },
    ]);
  });
  it.each(["title", "archive", "session"])("blocks %s changes in SQL while the provider is running", async (change) => {
    const f = await fixture();
    f.adapter.generate.mockImplementation(async () => {
      if (change === "title")
        await database.pglite.query("UPDATE tracks SET title = title || ' changed' WHERE id = $1", [f.ids[0]]);
      if (change === "archive")
        await database.pglite.query("UPDATE tracks SET status = 'ARCHIVED' WHERE id = $1", [f.ids[0]]);
      if (change === "session")
        await database.pglite.query(
          "UPDATE local_auth_sessions SET status = 'REVOKED', revoked_at = '2026-09-08T10:15:00Z' WHERE session_id = $1",
          [f.scope.sessionId],
        );
      return { text: '{"orderedRefs":["R1","R2"]}' };
    });
    await expect(f.service.propose(f.scope, { intent: "SEARCH_TRACK", title: f.titlePrefix })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await f.events()).filter((event) => event.kind === "INFERENCE")).toEqual([
      { kind: "INFERENCE", outcome: "ATTEMPT" },
      { kind: "INFERENCE", outcome: "FORBIDDEN" },
    ]);
  });
  it("does not hold a database transaction open across provider inference", async () => {
    const f = await fixture();
    const original = database.pglite.transaction.bind(database.pglite);
    let active = false;
    vi.spyOn(database.pglite, "transaction").mockImplementation(async (callback) => {
      expect(active).toBe(false);
      active = true;
      try {
        return await original(callback);
      } finally {
        active = false;
      }
    });
    f.adapter.generate.mockImplementation(async () => {
      expect(active).toBe(false);
      await database.pglite.query("SELECT 1");
      return { text: '{"orderedRefs":["R1","R2"]}' };
    });
    expect((await f.service.propose(f.scope, { intent: "SEARCH_TRACK", title: f.titlePrefix })).status).toBe("FOUND");
  });
  it("leaves an empty search deterministic and records no inference", async () => {
    const f = await fixture();
    const result = await f.service.propose(f.scope, { intent: "SEARCH_TRACK", title: `absent-${randomUUID()}` });
    expect(result.status).toBe("NOT_FOUND");
    expect(await f.events()).toEqual([
      { kind: "CONTEXT", outcome: "ATTEMPT" },
      { kind: "CONTEXT", outcome: "SUCCEEDED" },
    ]);
    expect(f.adapter.generate).not.toHaveBeenCalled();
  });
});
