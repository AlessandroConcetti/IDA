import type { RequestIdentityContext } from "@ida/contracts";
import type { AIProviderManifest, IntelligencePolicy, IntelligenceRequest } from "@ida/contracts/intelligence";
import { ProviderRegistry, ToolGateway } from "@ida/domain";
import { describe, expect, it, vi } from "vitest";
import { CoreIntelligence, intelligenceProposalTool } from "./core-intelligence.js";
import { DemoDatabase } from "./database.js";
import { DeterministicIdaCore } from "./ida-core.js";

const now = new Date("2026-09-07T12:00:00Z");
function identity(): RequestIdentityContext {
  return {
    userId: "u1",
    userStatus: "ACTIVE",
    workspaceId: "w1",
    membership: { userId: "u1", workspaceId: "w1", role: "OWNER", status: "ACTIVE" },
    clientInstance: { id: "c1", userId: "u1", kind: "WEB_BROWSER", platform: "WINDOWS", status: "ACTIVE" },
    clientGrant: { clientInstanceId: "c1", workspaceId: "w1", accessLevel: "TRUSTED", status: "ACTIVE" },
    session: {
      id: "s1",
      userId: "u1",
      clientInstanceId: "c1",
      status: "ACTIVE",
      issuedAt: "2026-09-07T11:00:00Z",
      expiresAt: "2026-09-07T13:00:00Z",
    },
  };
}
function fixture(gateway = new ToolGateway(undefined, [intelligenceProposalTool])) {
  const manifest: AIProviderManifest = {
    key: "local",
    version: "1.0.0",
    category: "LLM",
    locality: "LOCAL",
    retention: "LOCAL_ONLY",
    acceptedDataClasses: ["PUBLIC"],
    models: [
      {
        id: "test-model",
        capabilities: ["TEXT"],
        maxComplexity: 1,
        maxInputChars: 100,
        maxOutputTokens: 100,
        estimatedCostMicros: 0,
        estimatedLatencyMs: 1,
      },
    ],
  };
  const adapter = {
    providerKey: "local",
    locality: "LOCAL" as const,
    generate: vi.fn(async () => ({ text: "Une proposition uniquement" })),
  };
  const registry = new ProviderRegistry([{ manifest, adapter }]);
  registry.configure("local", {
    enabled: true,
    configured: true,
    availability: "READY",
    remainingCalls: 10,
    validUntil: "2026-09-07T13:00:00Z",
  });
  const current = identity();
  const policy: IntelligencePolicy = {
    mode: "AI",
    localFirst: true,
    allowedProviderKeys: ["local"],
    maxAttempts: 1,
    maxCostMicros: 0,
    maxLatencyMs: 1000,
    cloudConsents: [],
  };
  const request: IntelligenceRequest = {
    scope: { userId: "u1", workspaceId: "w1", sessionId: "s1", clientInstanceId: "c1" },
    purpose: "ASSISTANT_REPLY",
    prompt: "Bonjour",
    dataClasses: ["PUBLIC"],
    capabilities: ["TEXT"],
    complexity: 1,
    maxOutputTokens: 50,
  };
  const loadCurrent = vi.fn(async () => ({ identity: structuredClone(current), policy }));
  const audit = vi.fn(async () => {});
  const intelligence = new CoreIntelligence({ registry, access: { loadCurrent }, gateway, audit, now: () => now });
  return { adapter, current, request, loadCurrent, intelligence, policy };
}

describe("Core intelligence authorization", () => {
  it("reuses the existing Core through one port without changing deterministic command execution", async () => {
    const f = fixture();
    const database = await DemoDatabase.open({ dataDir: "memory://", seed: false });
    try {
      const core = new DeterministicIdaCore(database, undefined, () => now, f.intelligence);
      expect(await core.generateProposal(f.current, f.request)).toEqual({ text: "Une proposition uniquement" });
      const deniedCore = new DeterministicIdaCore(database, new ToolGateway(), () => now, f.intelligence);
      await expect(deniedCore.generateProposal(f.current, f.request)).rejects.toThrow();
    } finally {
      await database.close();
    }
    expect(f.loadCurrent).toHaveBeenCalledTimes(4);
    expect(f.adapter.generate).toHaveBeenCalledWith({
      modelId: "test-model",
      prompt: "Bonjour",
      maxOutputTokens: 50,
      signal: expect.any(AbortSignal),
    });
  });
  it("is disabled by default in the unchanged application composition", async () => {
    const f = fixture();
    const database = await DemoDatabase.open({ dataDir: "memory://", seed: false });
    try {
      const core = new DeterministicIdaCore(database, undefined, () => now);
      await expect(core.generateProposal(f.current, f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await database.close();
    }
    expect(f.adapter.generate).not.toHaveBeenCalled();
  });
  it("cannot bypass a default-deny Tool Gateway after authentication", async () => {
    const f = fixture(new ToolGateway());
    await expect(f.intelligence.generate(f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.adapter.generate).not.toHaveBeenCalled();
  });
  it.each(["userId", "workspaceId", "sessionId", "clientInstanceId"] as const)("isolates %s", async (key) => {
    const f = fixture();
    f.request.scope[key] = "another";
    await expect(f.intelligence.generate(f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.adapter.generate).not.toHaveBeenCalled();
  });
  it.each(["user", "membership", "device", "grant", "session", "expiration"])(
    "rejects inactive identity: %s",
    async (field) => {
      const f = fixture();
      if (field === "user") f.current.userStatus = "SUSPENDED";
      if (field === "membership") f.current.membership.status = "REVOKED";
      if (field === "device") f.current.clientInstance.status = "PENDING";
      if (field === "grant") f.current.clientGrant.status = "REVOKED";
      if (field === "session") f.current.session.status = "REVOKED";
      if (field === "expiration") f.current.session.expiresAt = "2026-09-07T12:00:00Z";
      await expect(f.intelligence.generate(f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.adapter.generate).not.toHaveBeenCalled();
    },
  );
  it("reloads identity after generation and rejects device revocation before delivery", async () => {
    const f = fixture();
    f.adapter.generate.mockImplementation(async () => {
      f.current.clientInstance.status = "REVOKED";
      return { text: "Proposition tardive" };
    });
    await expect(f.intelligence.generate(f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.loadCurrent).toHaveBeenCalledTimes(3);
  });
  it("does not promote a view-only device and returns plain text, never a tool authorization", async () => {
    const f = fixture();
    f.current.clientGrant.accessLevel = "VIEW_ONLY";
    expect(await f.intelligence.generate(f.request)).toEqual({ text: "Une proposition uniquement" });
    expect(f.current.clientGrant.accessLevel).toBe("VIEW_ONLY");
    expect(
      new ToolGateway(undefined, [intelligenceProposalTool]).authorize({
        toolKey: "publish_post",
        moduleKey: "SOCIAL",
        permission: "PUBLISH",
      }).allowed,
    ).toBe(false);
  });
});
