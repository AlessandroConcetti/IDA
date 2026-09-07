import {
  type AIProviderManifest,
  type IntelligencePolicy,
  type IntelligenceRequest,
  intelligencePolicySchema,
} from "@ida/contracts/intelligence";
import { describe, expect, it, vi } from "vitest";
import { type IntelligenceAdapter, IntelligenceError, ProviderRegistry } from "./provider-registry.js";
import { type IntelligenceAudit, ProviderRouter } from "./provider-router.js";

const now = Date.parse("2026-09-07T12:00:00Z");
const scope = { userId: "u1", workspaceId: "w1", sessionId: "s1", clientInstanceId: "c1" };
const request: IntelligenceRequest = {
  scope,
  purpose: "ASSISTANT_REPLY",
  prompt: "Proposition synthétique.",
  dataClasses: ["PUBLIC"],
  capabilities: ["TEXT"],
  complexity: 1,
  maxOutputTokens: 50,
};

function manifest(key: string, locality: "LOCAL" | "CLOUD" = "LOCAL"): AIProviderManifest {
  return {
    key,
    version: "1.0.0",
    category: "LLM",
    locality,
    retention: locality === "LOCAL" ? "LOCAL_ONLY" : "REVIEWED_CLOUD",
    acceptedDataClasses: ["PUBLIC"],
    models: ["general:latest", "music:latest"].map((id) => ({
      id,
      capabilities: ["TEXT"],
      maxComplexity: 1,
      maxInputChars: 1000,
      maxOutputTokens: 100,
      estimatedCostMicros: 0,
      estimatedLatencyMs: 1,
    })),
  };
}

function fixture(manifests = [manifest("ollama"), manifest("backup"), manifest("cloud", "CLOUD")]) {
  const adapters = manifests.map((entry) => ({
    providerKey: entry.key,
    locality: entry.locality,
    generate: vi.fn<IntelligenceAdapter["generate"]>().mockResolvedValue({ text: "Réponse synthétique." }),
  }));
  const adapter = (key: string) => {
    const value = adapters.find((entry) => entry.providerKey === key);
    if (!value) throw new Error("Missing synthetic provider");
    return value;
  };
  const registry = new ProviderRegistry(manifests.map((entry) => ({ manifest: entry, adapter: adapter(entry.key) })));
  for (const entry of manifests) {
    registry.configure(entry.key, {
      enabled: true,
      configured: true,
      availability: "READY",
      remainingCalls: 10,
      validUntil: "2026-09-07T13:00:00Z",
    });
  }
  const policy: IntelligencePolicy = {
    mode: "AI",
    allowedProviderKeys: manifests.map((entry) => entry.key),
    localFirst: true,
    preferredProviderKey: "ollama",
    maxAttempts: 3,
    maxCostMicros: 0,
    maxLatencyMs: 1000,
    cloudConsents: [
      {
        scope,
        providerKey: "cloud",
        purpose: request.purpose,
        dataClasses: ["PUBLIC"],
        expiresAt: "2026-09-07T13:00:00Z",
      },
    ],
  };
  const audit = vi.fn(async (_event: IntelligenceAudit) => {});
  const router = new ProviderRouter(
    registry,
    async () => policy,
    audit,
    () => now,
  );
  return { adapter, adapters, policy, audit, router };
}

describe("Server model and locality restrictions", () => {
  it("preserves model selection when optional restrictions are absent", async () => {
    const f = fixture();
    await f.router.generate(request);
    expect(f.adapter("ollama").generate).toHaveBeenCalledWith(expect.objectContaining({ modelId: "general:latest" }));
  });

  it("selects the exact allowed model within one Ollama provider", async () => {
    const f = fixture();
    f.policy.allowedModels = [{ providerKey: "ollama", modelId: "music:latest" }];
    await f.router.generate(request);
    f.policy.allowedModels = [{ providerKey: "ollama", modelId: "general:latest" }];
    await f.router.generate(request);
    expect(f.adapter("ollama").generate.mock.calls.map(([input]) => input.modelId)).toEqual([
      "music:latest",
      "general:latest",
    ]);
    expect(f.adapter("backup").generate).not.toHaveBeenCalled();
    expect(f.adapter("cloud").generate).not.toHaveBeenCalled();
  });

  it.each([
    { providerKey: "backup", modelId: "music:latest" },
    { providerKey: "ollama", modelId: "Music:latest" },
    { providerKey: "ollama", modelId: "music" },
  ])("requires an exact provider/model pair: %j", async (allowedModel) => {
    const f = fixture([manifest("ollama")]);
    f.policy.allowedModels = [allowedModel];
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(f.adapter("ollama").generate).not.toHaveBeenCalled();
  });

  it("blocks a consented zero-cost cloud model when only LOCAL is allowed", async () => {
    const f = fixture([manifest("cloud", "CLOUD")]);
    f.policy.localFirst = false;
    f.policy.preferredProviderKey = "cloud";
    f.policy.allowedLocalities = ["LOCAL"];
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(f.adapter("cloud").generate).not.toHaveBeenCalled();
  });

  it.each(["allowedModels", "allowedLocalities"] as const)("treats empty %s as deny-all", async (field) => {
    const f = fixture();
    f.policy[field] = [];
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(f.adapters.every((entry) => entry.generate.mock.calls.length === 0)).toBe(true);
  });

  it.each([
    { allowedModels: [{ providerKey: "ollama", modelId: "music:latest", endpoint: "forbidden" }] },
    { allowedModels: [{ providerKey: "ollama", modelId: "invalid model" }] },
    { allowedModels: [{ providerKey: "ollama" }] },
    { allowedModels: null },
    { allowedLocalities: ["REMOTE"] },
    { allowedLocalities: null },
  ])("rejects malformed server restrictions: %j", (patch) => {
    expect(intelligencePolicySchema.safeParse({ ...fixture().policy, ...patch }).success).toBe(false);
  });

  it.each(["model", "locality"] as const)("rechecks revoked %s after the attempt audit", async (restriction) => {
    const f = fixture();
    f.audit.mockImplementationOnce(async () => {
      if (restriction === "model") f.policy.allowedModels = [{ providerKey: "backup", modelId: "general:latest" }];
      else f.policy.allowedLocalities = ["CLOUD"];
    });
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.adapters.every((entry) => entry.generate.mock.calls.length === 0)).toBe(true);
  });

  it.each(["model", "locality"] as const)("rejects a %s revoked while generation is running", async (restriction) => {
    const f = fixture();
    f.adapter("ollama").generate.mockImplementation(async () => {
      if (restriction === "model") f.policy.allowedModels = [{ providerKey: "backup", modelId: "general:latest" }];
      else f.policy.allowedLocalities = ["CLOUD"];
      return { text: "Réponse devenue interdite." };
    });
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.audit.mock.calls.map(([event]) => event.outcome)).toEqual(["ATTEMPT", "FORBIDDEN"]);
    expect(f.adapter("backup").generate).not.toHaveBeenCalled();
    expect(f.adapter("cloud").generate).not.toHaveBeenCalled();
  });

  it.each(["model", "locality"] as const)("rejects a %s revoked during the completion audit", async (restriction) => {
    const f = fixture();
    f.audit.mockImplementation(async (event) => {
      if (event.outcome !== "SUCCEEDED") return;
      if (restriction === "model") f.policy.allowedModels = [{ providerKey: "backup", modelId: "general:latest" }];
      else f.policy.allowedLocalities = ["CLOUD"];
    });
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.audit.mock.calls.map(([event]) => event.outcome)).toEqual(["ATTEMPT", "SUCCEEDED", "FORBIDDEN"]);
    expect(f.adapter("backup").generate).not.toHaveBeenCalled();
    expect(f.adapter("cloud").generate).not.toHaveBeenCalled();
  });

  it("never falls back to a model outside the server allowlist", async () => {
    const f = fixture();
    f.policy.allowedModels = [{ providerKey: "ollama", modelId: "music:latest" }];
    f.adapter("ollama").generate.mockRejectedValue(new IntelligenceError("UNAVAILABLE"));
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(f.adapter("ollama").generate).toHaveBeenCalledTimes(1);
    expect(f.adapter("backup").generate).not.toHaveBeenCalled();
    expect(f.adapter("cloud").generate).not.toHaveBeenCalled();
  });

  it.each(["model", "locality"] as const)("rechecks tightened %s restrictions before fallback", async (restriction) => {
    const f = fixture([manifest("ollama"), manifest("cloud", "CLOUD")]);
    f.adapter("ollama").generate.mockImplementation(async () => {
      if (restriction === "model") f.policy.allowedModels = [{ providerKey: "ollama", modelId: "general:latest" }];
      else f.policy.allowedLocalities = ["LOCAL"];
      throw new IntelligenceError("UNAVAILABLE");
    });
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(f.adapter("ollama").generate).toHaveBeenCalledTimes(1);
    expect(f.adapter("cloud").generate).not.toHaveBeenCalled();
  });
});
