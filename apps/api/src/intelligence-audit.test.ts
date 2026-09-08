import { randomBytes, randomUUID } from "node:crypto";
import type {
  AIProviderManifest,
  IntelligencePolicy,
  IntelligenceRequest,
  IntelligenceScope,
} from "@ida/contracts/intelligence";
import type { IntelligenceAudit, MusicContextAudit } from "@ida/contracts/intelligence-audit";
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
import { EnvironmentIntelligence } from "./environment-intelligence.js";
import { createPersistentIntelligenceAudit } from "./intelligence-audit.js";
import { LocalIntelligenceAccess } from "./local-intelligence-access.js";
import { MusicContextBroker } from "./music-context.js";

let database: DemoDatabase;
const now = () => new Date("2026-09-08T10:15:00Z");
beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://" });
});
afterAll(async () => {
  await database?.close();
});
afterEach(() => vi.restoreAllMocks());

async function fixture() {
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
  const sink = createPersistentIntelligenceAudit(database, scope);
  const context: MusicContextAudit = {
    runId: randomUUID(),
    scope: { ...scope },
    environmentKey: "music",
    agentKey: "agent_music_librarian",
    intent: "SEARCH_TRACK",
    outcome: "ATTEMPT",
  };
  const inference: IntelligenceAudit = {
    runId: randomUUID(),
    scope: { ...scope },
    providerKey: "ollama",
    modelId: "synthetic-model",
    purpose: "ASSISTANT_REPLY",
    manifestVersion: "1.0.0",
    locality: "LOCAL",
    dataClasses: ["PRIVATE_CREATIVE"],
    attempt: 1,
    estimatedCostMicros: 0,
    outcome: "ATTEMPT",
  };
  return { scope, sink, context, inference };
}

async function rows(sessionId: string) {
  return (
    await database.pglite.query<Record<string, unknown>>(
      "SELECT * FROM intelligence_audit_events WHERE session_id = $1 ORDER BY id",
      [sessionId],
    )
  ).rows;
}

async function serviceFixture() {
  const f = await fixture();
  const policy: IntelligencePolicy = {
    mode: "AI",
    allowedProviderKeys: ["ollama"],
    localFirst: true,
    maxAttempts: 1,
    maxCostMicros: 0,
    maxLatencyMs: 1000,
    cloudConsents: [],
  };
  const access = new LocalIntelligenceAccess({ database, authenticatedScope: f.scope, now, getPolicy: () => policy });
  const profile = listEnvironmentBrainProfiles().find((entry) => entry.environmentKey === "music");
  if (!profile) throw new Error("Missing fixture");
  profile.status = "ACTIVE";
  profile.modelPolicy.allowedModels = [{ providerKey: "ollama", modelId: "synthetic-model" }];
  const agents = createAgentRegistry(
    agentManifests.map((entry) => ({
      ...entry,
      status: "ACTIVE",
      allowedTools: [...entry.allowedTools],
      contextSources: [...entry.contextSources],
      supportedIntents: [...entry.supportedIntents],
    })),
  );
  const gateway = new ToolGateway(undefined, [
    intelligenceProposalTool,
    { toolKey: "list_tracks", moduleKey: "MUSIC", permission: "READ" },
  ]);
  const adapter = {
    providerKey: "ollama",
    locality: "LOCAL" as const,
    generate: vi.fn(async () => ({ text: "PRIVATE_OUTPUT_CANARY" })),
  };
  const manifest: AIProviderManifest = {
    key: "ollama",
    category: "LLM",
    version: "1.0.0",
    locality: "LOCAL",
    retention: "LOCAL_ONLY",
    acceptedDataClasses: ["PRIVATE_CREATIVE"],
    models: [
      {
        id: "synthetic-model",
        capabilities: ["TEXT"],
        maxComplexity: 1,
        maxInputChars: 1000,
        maxOutputTokens: 100,
        estimatedLatencyMs: 1,
        estimatedCostMicros: 0,
      },
    ],
  };
  const registry = new ProviderRegistry([{ manifest, adapter }]);
  registry.configure("ollama", {
    enabled: true,
    configured: true,
    availability: "READY",
    remainingCalls: 3,
    validUntil: "2026-09-08T11:00:00Z",
  });
  const invocation = {
    environmentKey: "music",
    profileVersion: profile.version,
    agentKey: "agent_music_librarian",
    intent: "SEARCH_TRACK",
    contextSources: ["MUSIC_CATALOG"],
  } as const;
  const options = {
    invocation: { ...invocation, contextSources: [...invocation.contextSources] },
    agents,
    registry,
    access,
    gateway,
    getProfile: () => structuredClone(profile),
    audit: f.sink.environment,
    now,
  };
  const request: IntelligenceRequest = {
    scope: f.scope,
    prompt: "PRIVATE_PROMPT_CANARY",
    purpose: "ASSISTANT_REPLY",
    dataClasses: ["PRIVATE_CREATIVE"],
    capabilities: ["TEXT"],
    complexity: 1,
    maxOutputTokens: 100,
  };
  return { ...f, access, profile, agents, gateway, adapter, registry, options, request };
}

describe("Persistent intelligence audit callbacks", () => {
  it("stores both families without payloads or prompts and preserves environment metadata", async () => {
    const f = await fixture();
    await f.sink.context(f.context);
    await f.sink.intelligence(f.inference);
    await f.sink.environment({
      ...f.inference,
      runId: randomUUID(),
      environmentKey: "music",
      agentKey: "agent_music_librarian",
      profileVersion: "0.1.0",
    });
    const events = await rows(f.scope.sessionId);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      kind: "CONTEXT",
      attempt: 0,
      intent: "SEARCH_TRACK",
      provider_key: null,
      data_classes: ["PRIVATE_CREATIVE"],
    });
    expect(events[1]).toMatchObject({
      kind: "INFERENCE",
      environment_key: null,
      purpose: "ASSISTANT_REPLY",
      model_id: "synthetic-model",
    });
    expect(events[2]).toMatchObject({
      environment_key: "music",
      profile_version: "0.1.0",
      agent_key: "agent_music_librarian",
    });
    expect(Object.keys(events[0] ?? {})).not.toEqual(
      expect.arrayContaining(["prompt", "payload", "query", "text", "token"]),
    );
  });
  it("retries the same event idempotently, including concurrent retries and class ordering", async () => {
    const f = await fixture();
    f.inference.dataClasses = ["PRIVATE_CREATIVE", "PUBLIC"];
    await Promise.all(Array.from({ length: 6 }, () => f.sink.intelligence(structuredClone(f.inference))));
    await f.sink.intelligence({ ...f.inference, dataClasses: ["PUBLIC", "PRIVATE_CREATIVE"] });
    expect(await rows(f.scope.sessionId)).toHaveLength(1);
  });
  it.each(["modelId", "providerKey", "manifestVersion", "estimatedCostMicros", "dataClasses"])(
    "refuses contradictory replay: %s",
    async (key) => {
      const f = await fixture();
      await f.sink.intelligence(f.inference);
      const changed = {
        ...f.inference,
        [key]:
          key === "manifestVersion"
            ? "2.0.0"
            : key === "estimatedCostMicros"
              ? 1
              : key === "dataClasses"
                ? ["PUBLIC"]
                : "other",
      };
      await expect(f.sink.intelligence(changed)).rejects.toMatchObject({ code: "AUDIT_UNAVAILABLE" });
      const persisted = await rows(f.scope.sessionId);
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({
        provider_key: "ollama",
        model_id: "synthetic-model",
        manifest_version: "1.0.0",
      });
    },
  );
  it("retains success followed by late refusal and separates fallback attempts", async () => {
    const f = await fixture();
    for (const outcome of ["ATTEMPT", "SUCCEEDED", "DENIED"] as const) await f.sink.context({ ...f.context, outcome });
    for (const outcome of ["ATTEMPT", "SUCCEEDED", "FORBIDDEN"] as const)
      await f.sink.intelligence({ ...f.inference, outcome });
    await f.sink.intelligence({ ...f.inference, attempt: 2, providerKey: "second" });
    expect((await rows(f.scope.sessionId)).map((row) => row.outcome)).toEqual([
      "ATTEMPT",
      "SUCCEEDED",
      "DENIED",
      "ATTEMPT",
      "SUCCEEDED",
      "FORBIDDEN",
      "ATTEMPT",
    ]);
  });
  it.each(["userId", "workspaceId", "sessionId", "clientInstanceId"] as const)(
    "refuses changed bound %s before SQL",
    async (key) => {
      const f = await fixture();
      const sql = vi.spyOn(database.pglite, "transaction");
      await expect(f.sink.context({ ...f.context, scope: { ...f.scope, [key]: "foreign" } })).rejects.toMatchObject({
        code: "AUDIT_UNAVAILABLE",
      });
      expect(sql).not.toHaveBeenCalled();
    },
  );
  it("keeps an immutable scope binding and copies events before the first await", async () => {
    const f = await fixture();
    const original = { ...f.scope };
    f.scope.workspaceId = "foreign";
    const pending = f.sink.context(f.context);
    f.context.intent = "SEARCH_MEDIA";
    await pending;
    expect((await rows(original.sessionId))[0]).toMatchObject({
      workspace_id: original.workspaceId,
      intent: "SEARCH_TRACK",
    });
  });
  it.each([
    { prompt: "PRIVATE_CANARY" },
    { text: "PRIVATE_CANARY" },
    { token: "PRIVATE_CANARY" },
    { cause: "PRIVATE_CANARY" },
    { createdAt: "2026-09-08T00:00:00Z" },
    { runId: "PRIVATE_CANARY" },
    { attempt: 0 },
    { attempt: 4 },
    { estimatedCostMicros: -1 },
    { estimatedCostMicros: Number.MAX_SAFE_INTEGER + 1 },
    { providerKey: "https://private.invalid" },
    { modelId: "https://private.invalid" },
    { modelId: "x".repeat(129) },
    { manifestVersion: "1x0x0" },
    { dataClasses: ["SECRET"] },
    { dataClasses: ["PUBLIC", "PUBLIC"] },
    { dataClasses: [] },
    { outcome: "PRIVATE_CANARY" },
    { environmentKey: "music" },
    { profileVersion: "0.1.0" },
  ])("rejects invalid or expanded inference event %j without SQL", async (extra) => {
    const f = await fixture();
    const sql = vi.spyOn(database.pglite, "transaction");
    const error = await f.sink.intelligence({ ...f.inference, ...extra } as IntelligenceAudit).catch((value) => value);
    expect(error.message).toBe("IDA intelligence: AUDIT_UNAVAILABLE");
    expect(error.cause).toBeUndefined();
    expect(sql).not.toHaveBeenCalled();
  });
  it("rejects extra context data or incomplete environment metadata", async () => {
    const f = await fixture();
    const sql = vi.spyOn(database.pglite, "transaction");
    await expect(f.sink.context(Object.assign({}, f.context, { filename: "PRIVATE_CANARY" }))).rejects.toMatchObject({
      code: "AUDIT_UNAVAILABLE",
    });
    // @ts-expect-error A partially supplied environment is not an environment audit contract.
    await expect(f.sink.environment({ ...f.inference, environmentKey: "music" })).rejects.toMatchObject({
      code: "AUDIT_UNAVAILABLE",
    });
    expect(sql).not.toHaveBeenCalled();
  });
  it("expunges raw database error details", async () => {
    const f = await fixture();
    vi.spyOn(database.pglite, "transaction").mockRejectedValueOnce(new Error("PRIVATE_SQL_CANARY"));
    const error = await f.sink.context(f.context).catch((value) => value);
    expect(error.message).toBe("IDA intelligence: AUDIT_UNAVAILABLE");
    expect(error.cause).toBeUndefined();
  });
});

describe("Broker/router composition with the real audit sink (synthetic model adapter only)", () => {
  it("records generation while keeping prompt and output out of the database", async () => {
    const f = await serviceFixture();
    expect(await new EnvironmentIntelligence(f.options).generate(f.request)).toEqual({ text: "PRIVATE_OUTPUT_CANARY" });
    const events = await rows(f.scope.sessionId);
    expect(events.map((row) => row.outcome)).toEqual(["ATTEMPT", "SUCCEEDED"]);
    expect(JSON.stringify(events)).not.toContain("CANARY");
  });
  it("persists late FORBIDDEN after a session is revoked during success audit", async () => {
    const f = await serviceFixture();
    const service = new EnvironmentIntelligence({
      ...f.options,
      audit: async (event) => {
        await f.sink.environment(event);
        if (event.outcome === "SUCCEEDED")
          await database.revokeLocalAuthSessionsForClient(
            f.scope.userId,
            f.scope.clientInstanceId,
            now().toISOString(),
          );
      },
    });
    await expect(service.generate(f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await rows(f.scope.sessionId)).map((row) => row.outcome)).toEqual(["ATTEMPT", "SUCCEEDED", "FORBIDDEN"]);
  });
  it.each(["initial", "delivery"])("audit failure at %s blocks call or delivery", async (phase) => {
    const f = await serviceFixture();
    if (phase === "initial")
      vi.spyOn(database.pglite, "transaction").mockRejectedValue(new Error("PRIVATE_SQL_CANARY"));
    else
      f.adapter.generate.mockImplementation(async () => {
        vi.spyOn(database.pglite, "transaction").mockRejectedValue(new Error("PRIVATE_SQL_CANARY"));
        return { text: "PRIVATE_OUTPUT_CANARY" };
      });
    await expect(new EnvironmentIntelligence(f.options).generate(f.request)).rejects.toMatchObject({
      code: "AUDIT_UNAVAILABLE",
    });
    expect(f.adapter.generate).toHaveBeenCalledTimes(phase === "initial" ? 0 : 1);
  });
  it("persists context denial after revocation during a validated-read audit", async () => {
    const f = await serviceFixture();
    const read = vi.fn(async () => ({ tracks: [], media: [] }));
    const broker = new MusicContextBroker({
      access: f.access,
      agents: f.agents,
      gateway: f.gateway,
      store: { read },
      profileVersion: f.profile.version,
      getProfile: () => f.profile,
      now,
      audit: async (event) => {
        await f.sink.context(event);
        if (event.outcome === "SUCCEEDED")
          await database.revokeLocalAuthSessionsForClient(
            f.scope.userId,
            f.scope.clientInstanceId,
            now().toISOString(),
          );
      },
    });
    await expect(broker.read(f.scope, { intent: "SEARCH_TRACK" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(read).toHaveBeenCalledOnce();
    expect((await rows(f.scope.sessionId)).map((row) => row.outcome)).toEqual(["ATTEMPT", "SUCCEEDED", "DENIED"]);
  });
});
