import { readFile } from "node:fs/promises";
import type { RequestIdentityContext } from "@ida/contracts";
import type { EnvironmentBrainProfile, EnvironmentInvocation } from "@ida/contracts/environment-brains";
import type { AIProviderManifest, IntelligencePolicy, IntelligenceRequest } from "@ida/contracts/intelligence";
import {
  agentManifests,
  createAgentRegistry,
  listEnvironmentBrainProfiles,
  ProviderRegistry,
  ToolGateway,
} from "@ida/domain";
import { describe, expect, it, vi } from "vitest";
import { intelligenceProposalTool } from "./core-intelligence.js";
import { EnvironmentIntelligence } from "./environment-intelligence.js";

function fixture() {
  const profile = listEnvironmentBrainProfiles().find((entry) => entry.environmentKey === "music");
  if (!profile) throw new Error("Missing music profile fixture");
  profile.status = "ACTIVE";
  profile.modelPolicy.allowedModels = [{ providerKey: "ollama", modelId: "music-model" }];
  const invocation: EnvironmentInvocation = {
    environmentKey: "music",
    profileVersion: "0.1.0",
    agentKey: "agent_music_librarian",
    intent: "SEARCH_TRACK",
    contextSources: ["MUSIC_CATALOG"],
  };
  const scope = { userId: "u1", workspaceId: "w1", sessionId: "s1", clientInstanceId: "c1" };
  const identity: RequestIdentityContext = {
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
  const policy: IntelligencePolicy = {
    mode: "AI",
    localFirst: true,
    allowedProviderKeys: ["ollama"],
    maxAttempts: 1,
    maxCostMicros: 0,
    maxLatencyMs: 1000,
    cloudConsents: [],
  };
  const request: IntelligenceRequest = {
    scope,
    purpose: "ASSISTANT_REPLY",
    prompt: "Catalogue synthétique",
    dataClasses: ["PRIVATE_CREATIVE"],
    capabilities: ["TEXT"],
    complexity: 1,
    maxOutputTokens: 100,
  };
  const adapter = {
    providerKey: "ollama",
    locality: "LOCAL" as const,
    generate: vi.fn(async () => ({ text: "Réponse de test" })),
  };
  const manifest: AIProviderManifest = {
    key: "ollama",
    version: "1.0.0",
    category: "LLM",
    locality: "LOCAL",
    retention: "LOCAL_ONLY",
    acceptedDataClasses: ["PRIVATE_CREATIVE"],
    models: [
      {
        id: "music-model",
        capabilities: ["TEXT"],
        maxComplexity: 1,
        maxInputChars: 1000,
        maxOutputTokens: 100,
        estimatedCostMicros: 0,
        estimatedLatencyMs: 1,
      },
    ],
  };
  const registry = new ProviderRegistry([{ manifest, adapter }]);
  registry.configure("ollama", {
    enabled: true,
    configured: true,
    availability: "READY",
    remainingCalls: 3,
    validUntil: "2026-09-07T13:00:00Z",
  });
  const getProfile = vi.fn(
    (_scope: typeof scope, _key: EnvironmentInvocation["environmentKey"]): EnvironmentBrainProfile =>
      structuredClone(profile),
  );
  const loadCurrent = vi.fn(async (_scope: typeof scope) => ({
    identity: structuredClone(identity),
    policy: structuredClone(policy),
  }));
  const audit = vi.fn(async () => {});
  const options = {
    invocation,
    registry,
    agents: createAgentRegistry(
      agentManifests.map((entry) => ({
        ...entry,
        status: "ACTIVE",
        allowedTools: [...entry.allowedTools],
        contextSources: [...entry.contextSources],
        supportedIntents: [...entry.supportedIntents],
      })),
    ),
    access: { loadCurrent },
    gateway: new ToolGateway(undefined, [intelligenceProposalTool]),
    getProfile,
    audit,
    now: () => new Date("2026-09-07T12:00:00Z"),
  };
  return {
    options,
    service: new EnvironmentIntelligence(options),
    request,
    profile,
    adapter,
    getProfile,
    loadCurrent,
    policy,
    identity,
    registry,
    audit,
  };
}

describe("Environment-scoped intelligence port", () => {
  it("keeps profiles aligned with the existing world wheel without creating a second catalog", async () => {
    const source = await readFile(new URL("../../web/src/worlds.ts", import.meta.url), "utf8");
    const ids = [...source.matchAll(/id: "([a-z]+)"/gu)].map((match) => match[1]);
    // La Fabrique est un espace documentaire sans cerveau autonome activé.
    expect(ids).toContain("fabrique");
    expect(ids.filter((id) => id !== "fabrique").sort()).toEqual(
      listEnvironmentBrainProfiles()
        .map((profile) => profile.environmentKey)
        .sort(),
    );
  });
  it("reuses Core/Identity/Gateway/Router and audits environment without sending it to the model", async () => {
    const f = fixture();
    expect(await f.service.generate(f.request)).toEqual({ text: "Réponse de test" });
    expect(f.getProfile).toHaveBeenCalledTimes(4);
    expect(f.getProfile).toHaveBeenCalledWith(f.request.scope, "music");
    expect(f.loadCurrent).toHaveBeenCalledTimes(4);
    expect(f.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        environmentKey: "music",
        agentKey: "agent_music_librarian",
        profileVersion: "0.1.0",
        outcome: "SUCCEEDED",
      }),
    );
    expect(f.adapter.generate).toHaveBeenCalledWith({
      modelId: "music-model",
      prompt: f.request.prompt,
      maxOutputTokens: 100,
      signal: expect.any(AbortSignal),
    });
  });
  it.each(["disabled", "new_version", "identity", "source"])(
    "denies delivery when %s changes during generation",
    async (change) => {
      const f = fixture();
      f.adapter.generate.mockImplementation(async () => {
        if (change === "disabled") f.profile.status = "DISABLED";
        if (change === "new_version") f.profile.version = "0.2.0";
        if (change === "identity") f.identity.clientGrant.status = "REVOKED";
        if (change === "source") f.profile.contextSources = [];
        return { text: "Late result" };
      });
      await expect(f.service.generate(f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
  it("rejects an invalid caller identity before consulting the profile authority", async () => {
    const f = fixture();
    f.request.scope.workspaceId = "another-workspace";
    await expect(f.service.generate(f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.getProfile).not.toHaveBeenCalled();
    expect(f.adapter.generate).not.toHaveBeenCalled();
  });
  it("does not duplicate provider quotas for a second environment facade", async () => {
    const f = fixture();
    const second = new EnvironmentIntelligence(f.options);
    await f.service.generate(f.request);
    await second.generate(f.request);
    expect(f.registry.list()[0]?.state.remainingCalls).toBe(1);
  });
  it("starts no model for the default PLANNED profile", async () => {
    const f = fixture();
    f.profile.status = "PLANNED";
    await expect(f.service.generate(f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.adapter.generate).not.toHaveBeenCalled();
  });
  it.each(["profile", "identity"])("denies %s revoked while the access source is pending", async (revoked) => {
    const f = fixture();
    let resume!: () => void;
    const pendingAccess = new Promise<void>((resolve) => {
      resume = resolve;
    });
    f.loadCurrent.mockImplementationOnce(async () => {
      await pendingAccess;
      return { identity: structuredClone(f.identity), policy: structuredClone(f.policy) };
    });
    const result = f.service.generate(f.request);
    const denied = expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.loadCurrent).toHaveBeenCalledTimes(1);
    expect(f.getProfile).not.toHaveBeenCalled();
    if (revoked === "profile") f.profile.status = "DISABLED";
    else f.identity.clientGrant.status = "REVOKED";
    resume();
    await denied;
    expect(f.getProfile).toHaveBeenCalledTimes(revoked === "profile" ? 1 : 0);
    expect(f.adapter.generate).not.toHaveBeenCalled();
    expect(f.registry.list()[0]?.state.remainingCalls).toBe(3);
  });
  it("rejects an accidental asynchronous profile authority without calling a model", async () => {
    const f = fixture();
    f.getProfile.mockReturnValue(Promise.resolve(structuredClone(f.profile)) as unknown as EnvironmentBrainProfile);
    await expect(f.service.generate(f.request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.getProfile).toHaveBeenCalledTimes(1);
    expect(f.adapter.generate).not.toHaveBeenCalled();
    expect(f.registry.list()[0]?.state.remainingCalls).toBe(3);
  });
});
