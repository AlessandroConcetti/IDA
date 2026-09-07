import type { EnvironmentBrainProfile, EnvironmentInvocation } from "@ida/contracts/environment-brains";
import { environmentBrainProfileSchema, environmentKeySchema } from "@ida/contracts/environment-brains";
import type { IntelligencePolicy, IntelligenceRequest } from "@ida/contracts/intelligence";
import { describe, expect, it } from "vitest";
import { agentManifests, createAgentRegistry } from "./agent-registry.js";
import { constrainEnvironmentPolicy, listEnvironmentBrainProfiles } from "./environment-brains.js";

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
  const agents = createAgentRegistry(
    agentManifests.map((entry) => ({
      ...entry,
      allowedTools: [...entry.allowedTools],
      contextSources: [...entry.contextSources],
      supportedIntents: [...entry.supportedIntents],
      status: "ACTIVE",
    })),
  );
  const request: IntelligenceRequest = {
    scope: { userId: "u1", workspaceId: "w1", clientInstanceId: "c1", sessionId: "s1" },
    purpose: "ASSISTANT_REPLY",
    prompt: "Quel morceau préparer ?",
    dataClasses: ["PRIVATE_CREATIVE"],
    capabilities: ["TEXT"],
    complexity: 1,
    maxOutputTokens: 100,
  };
  const policy: IntelligencePolicy = {
    mode: "AI",
    allowedProviderKeys: ["ollama", "cloud"],
    localFirst: false,
    maxAttempts: 3,
    maxCostMicros: 1000,
    maxLatencyMs: 1000,
    cloudConsents: [
      {
        scope: request.scope,
        providerKey: "cloud",
        purpose: "ASSISTANT_REPLY",
        dataClasses: ["PRIVATE_CREATIVE"],
        expiresAt: "2099-01-01T00:00:00Z",
      },
    ],
  };
  const apply = () => constrainEnvironmentPolicy(profile, invocation, request, policy, agents);
  return { profile, invocation, agents, request, policy, apply };
}

describe("Environment brain profiles", () => {
  it("prepares exactly the 12 worlds without starting agents or selecting imaginary models", () => {
    const profiles = listEnvironmentBrainProfiles();
    expect(profiles.map((profile) => profile.environmentKey).sort()).toEqual([...environmentKeySchema.options].sort());
    expect(new Set(profiles.map((profile) => profile.environmentKey)).size).toBe(12);
    for (const profile of profiles) {
      expect(profile.status).toBe("PLANNED");
      expect(profile.plannedRoles.length).toBeGreaterThan(0);
      expect(profile.modelPolicy).toEqual({ mode: "LOCAL_ONLY", allowedModels: [], maxCostMicros: 0 });
      expect(profile.memoryPolicy).toBe("CONFIRMED_ONLY");
      expect(profile.improvementPolicy).toBe("HUMAN_REVIEWED");
      for (const key of profile.agentKeys) expect(createAgentRegistry().get(key)?.status).toBe("PLANNED");
    }
    const first = profiles[0];
    if (!first) throw new Error("Missing fixture");
    first.plannedRoles.push("mutated");
    expect(listEnvironmentBrainProfiles()[0]?.plannedRoles).not.toContain("mutated");
  });
  it("intersects account/provider policy and enforces zero-cloud local mode", () => {
    const f = fixture();
    const result = f.apply();
    expect(result.allowedProviderKeys).toEqual(["ollama"]);
    expect(result.allowedModels).toEqual([{ providerKey: "ollama", modelId: "music-model" }]);
    expect(result.allowedLocalities).toEqual(["LOCAL"]);
    expect(result.cloudConsents).toEqual([]);
    expect(result.maxCostMicros).toBe(0);
    expect(result.localFirst).toBe(true);
    expect(f.policy.cloudConsents).toHaveLength(1);
  });
  it("does not manufacture permissions when account allowlists are empty or stricter", () => {
    const f = fixture();
    f.policy.allowedProviderKeys = [];
    expect(f.apply().allowedModels).toEqual([]);
    f.policy.allowedProviderKeys = ["ollama"];
    f.policy.allowedModels = [{ providerKey: "ollama", modelId: "another-model" }];
    expect(f.apply().allowedModels).toEqual([]);
    f.policy.allowedLocalities = ["CLOUD"];
    expect(f.apply().allowedLocalities).toEqual([]);
  });
  it("retains account caps in cloud-opt-in profiles without creating a consent", () => {
    const f = fixture();
    f.profile.modelPolicy = {
      mode: "LOCAL_FIRST",
      maxCostMicros: 2000,
      allowedModels: [{ providerKey: "cloud", modelId: "reviewed-model" }],
    };
    f.policy.cloudConsents = [];
    expect(f.apply().maxCostMicros).toBe(1000);
    expect(f.apply().cloudConsents).toEqual([]);
  });
  it.each(["profile", "version", "environment", "agent", "intent", "context", "data"])(
    "denies incompatible %s",
    (field) => {
      const f = fixture();
      if (field === "profile") f.profile.status = "DISABLED";
      if (field === "version") f.invocation.profileVersion = "0.2.0";
      if (field === "environment") f.invocation.environmentKey = "finance";
      if (field === "agent") f.invocation.agentKey = "agent_unregistered";
      if (field === "intent") f.invocation.intent = "SAVE_MEMORY";
      if (field === "context") f.invocation.contextSources = ["SYSTEM_STATUS"];
      if (field === "data") f.request.dataClasses = ["SENSITIVE_PERSONAL"];
      expect(f.apply).toThrow("FORBIDDEN");
    },
  );
  it("does not grant an agent a context source merely because the environment grants it", () => {
    const f = fixture();
    f.profile.contextSources.push("TASK_CONTEXT");
    f.invocation.contextSources = ["TASK_CONTEXT"];
    expect(f.apply).toThrow("FORBIDDEN");
  });
  it("does not grant a source merely because the agent grants it", () => {
    const f = fixture();
    f.profile.contextSources = ["PREFERENCE_MEMORY"];
    expect(f.apply).toThrow("FORBIDDEN");
  });
  it("does not activate existing PLANNED agents with an ACTIVE profile", () => {
    const f = fixture();
    expect(() =>
      constrainEnvironmentPolicy(f.profile, f.invocation, f.request, f.policy, createAgentRegistry()),
    ).toThrow("FORBIDDEN");
  });
  it.each([
    { memoryPolicy: "AUTOMATIC" },
    { improvementPolicy: "SELF_DEPLOY" },
    { apiKey: "SYNTHETIC_ONLY" },
    { environmentKey: "unknown" },
    { modelPolicy: { mode: "LOCAL_ONLY", allowedModels: [], maxCostMicros: 10 } },
  ])("rejects unsafe or unreviewed profile configuration", (patch) => {
    expect(environmentBrainProfileSchema.safeParse({ ...fixture().profile, ...patch }).success).toBe(false);
  });
  it("requires concrete model and agent references before marking a profile ACTIVE", () => {
    const f = fixture();
    f.profile.modelPolicy.allowedModels = [];
    expect(environmentBrainProfileSchema.safeParse(f.profile).success).toBe(false);
    expect(environmentBrainProfileSchema.safeParse({ ...f.profile, status: "PLANNED" }).success).toBe(true);
    expect(
      environmentBrainProfileSchema.safeParse({ ...fixture().profile, agentKeys: [] } as EnvironmentBrainProfile)
        .success,
    ).toBe(false);
  });
});
