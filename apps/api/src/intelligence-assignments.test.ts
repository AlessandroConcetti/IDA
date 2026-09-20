import { readFile } from "node:fs/promises";
import type { IntelligenceNetwork, NetworkProvider } from "@ida/contracts/intelligence-network";
import { describe, expect, it, vi } from "vitest";
import {
  buildIntelligenceAssignments,
  type IntelligenceAssignmentContext,
  providerAssignmentRole,
} from "./intelligence-assignments.js";

function provider(key: string, overrides: Partial<NetworkProvider> = {}): NetworkProvider {
  const local = key === "ollama";
  return {
    key,
    name: key,
    model: `${key}-fixture`,
    role: "Synthetic fixture",
    lifecycle: "REGISTERED",
    status: "AVAILABLE_FREE",
    locality: local ? "LOCAL" : "CLOUD",
    cost: local ? "LOCAL" : "FREE_LIMITED",
    freeTier: local ? "NOT_APPLICABLE" : "CONDITIONAL",
    capabilities: ["TEXT"],
    privacy: "Synthetic fixture only",
    conditions: "Synthetic fixture only",
    allocationRemaining: 3,
    quota: local
      ? null
      : {
          modelIds: [`${key}-fixture`],
          observedAt: "2026-09-20T10:00:00Z",
          validUntil: "2026-09-20T11:00:00Z",
          noPaidOverage: true,
          windows: [{ kind: "REQUESTS_MINUTE", limit: 3, remaining: 3, resetAt: "2026-09-20T10:01:00Z" }],
        },
    estimatedCostMicros: 0,
    latencyMs: 100,
    lastSuccess: null,
    lastError: null,
    verifiedAt: null,
    sources: [],
    ...overrides,
  };
}

function network(providers: NetworkProvider[]): IntelligenceNetwork {
  return { generatedAt: "2026-09-20T10:00:01Z", policy: "LOCAL_FIRST_FREE_ONLY_NO_AUTO_PAYMENT", providers, tasks: [] };
}

const consented: IntelligenceAssignmentContext = {
  dataClasses: ["PUBLIC"],
  cloudConsentProviderKeys: ["mistral", "gemini", "ovhcloud", "groq", "cloudflare", "nvidia", "openrouter", "cerebras"],
};

function assignment(snapshot: IntelligenceNetwork, key: string, context = consented) {
  const result = buildIntelligenceAssignments(snapshot, context).assignments.find((entry) => entry.key === key);
  if (!result) throw new Error(`Missing assignment ${key}`);
  return result;
}

describe("Advisory intelligence assignments", () => {
  it("covers the existing worlds, with separate code requirements for Fabrique", async () => {
    const source = await readFile(new URL("../../web/src/worlds.ts", import.meta.url), "utf8");
    const worlds = [...source.matchAll(/id: "([a-z]+)"/gu)].map((match) => match[1]);
    const result = buildIntelligenceAssignments(network([]), consented);
    expect([...new Set(result.assignments.map((entry) => entry.environmentKey))].sort()).toEqual(worlds.sort());
    expect(result.mode).toBe("ADVISORY_ONLY");
    expect(result.assignments.every((entry) => entry.state === "PREPARED" && entry.selectedModel === null)).toBe(true);
    expect(assignment(network([]), "fabrique_code").requires).toEqual(["TEXT", "CODE"]);
  });

  it("uses declared model ids and deliberate provider preferences for public text", () => {
    const snapshot = network([
      provider("ollama"),
      provider("groq"),
      provider("mistral", { model: "actual-mistral-model" }),
      provider("gemini"),
      provider("cloudflare"),
    ]);
    expect(assignment(snapshot, "music_text").selectedModel).toEqual({
      providerKey: "mistral",
      modelId: "actual-mistral-model",
    });
    expect(assignment(snapshot, "social_draft").selectedModel?.providerKey).toBe("mistral");
    expect(assignment(snapshot, "research_summary").selectedModel?.providerKey).toBe("gemini");
    expect(assignment(snapshot, "workspace_triage").selectedModel?.providerKey).toBe("groq");
    expect(assignment(snapshot, "travel_itinerary").selectedModel?.providerKey).toBe("gemini");
  });

  it("keeps home, health, finance, legal, administration and car strictly local even for public input", () => {
    const snapshot = network([provider("ollama"), provider("mistral"), provider("gemini"), provider("groq")]);
    for (const key of [
      "home_dialogue",
      "health_notes",
      "finance_summary",
      "legal_notes",
      "admin_summary",
      "idacar_notes",
    ]) {
      const result = assignment(snapshot, key);
      expect(result.candidates.map((entry) => entry.providerKey)).toEqual(["ollama"]);
      expect(result.selectedModel?.providerKey).toBe("ollama");
    }
  });

  it.each(["INTERNAL", "PRIVATE_CREATIVE", "PERSONAL", "SENSITIVE", "HIGHLY_SENSITIVE", "SENSITIVE_PERSONAL"] as const)(
    "excludes all cloud providers for %s even with consent",
    (dataClass) => {
      const snapshot = network([
        provider("ollama"),
        provider("mistral"),
        provider("gemini"),
        provider("groq"),
        provider("nvidia", { capabilities: ["TEXT", "CODE"] }),
      ]);
      const result = buildIntelligenceAssignments(snapshot, { ...consented, dataClasses: ["PUBLIC", dataClass] });
      expect(
        result.assignments.every(
          (entry) => entry.selectedModel === null || entry.selectedModel.providerKey === "ollama",
        ),
      ).toBe(true);
      expect(
        result.assignments
          .flatMap((entry) => entry.candidates)
          .filter((entry) => entry.providerKey !== "ollama")
          .every((entry) => entry.models.length === 0),
      ).toBe(true);
      expect(assignment(snapshot, "music_text", { ...consented, dataClasses: [dataClass] }).candidates[0]?.reason).toBe(
        "LOCAL_ONLY",
      );
    },
  );

  it("requires explicit provider-specific cloud consent, while preserving a local fallback", () => {
    const snapshot = network([provider("ollama"), provider("gemini"), provider("mistral")]);
    const context = { dataClasses: ["PUBLIC"] as const, cloudConsentProviderKeys: ["mistral"] };
    expect(assignment(snapshot, "research_summary", context).selectedModel?.providerKey).toBe("ollama");
    expect(assignment(snapshot, "research_summary", context).candidates[0]?.reason).toBe("CLOUD_CONSENT_REQUIRED");
    expect(assignment(snapshot, "music_text", context).selectedModel?.providerKey).toBe("mistral");
  });

  it("fails closed for secrets, missing classes and invalid classes", () => {
    const snapshot = network([provider("ollama"), provider("mistral")]);
    for (const dataClasses of [["SECRET"], [], ["unknown"]]) {
      const result = buildIntelligenceAssignments(snapshot, {
        ...consented,
        dataClasses: dataClasses as IntelligenceAssignmentContext["dataClasses"],
      });
      expect(result.assignments.every((entry) => entry.state === "PREPARED" && entry.selectedModel === null)).toBe(
        true,
      );
      expect(result.assignments.flatMap((entry) => entry.candidates).every((entry) => entry.models.length === 0)).toBe(
        true,
      );
    }
  });

  it.each(["AVAILABLE_PAID", "QUOTA_EXCEEDED", "NOT_CONFIGURED", "UNAVAILABLE", "BLOCKED", "UNKNOWN"] as const)(
    "never presents %s as usable",
    (status) => {
      const result = assignment(network([provider("mistral", { status })]), "music_text");
      expect(result.state).toBe("PREPARED");
      expect(result.selectedModel).toBeNull();
    },
  );

  it.each(["PREPARED", "NEEDS_REVIEW"] as const)(
    "does not promote %s metadata even when a status claims availability",
    (lifecycle) => {
      const result = assignment(network([provider("gemini", { lifecycle })]), "research_summary");
      expect(result.candidates[0]?.reason).toBe("NOT_REGISTERED");
      expect(result.selectedModel).toBeNull();
    },
  );

  it("requires both zero estimated cost and a reviewed local/free cost class", () => {
    for (const overrides of [
      { estimatedCostMicros: null },
      { estimatedCostMicros: 1 },
      { cost: "UNKNOWN" as const },
      { cost: "PAID" as const },
      { allocationRemaining: 0 },
      { allocationRemaining: null },
    ]) {
      expect(assignment(network([provider("mistral", overrides)]), "music_text").selectedModel).toBeNull();
    }
    expect(assignment(network([provider("ollama", { cost: "UNKNOWN" })]), "home_dialogue").selectedModel).toBeNull();
  });

  it("never infers code, vision, image, audio, tools or web research from a provider name", () => {
    const snapshot = network([
      provider("mistral"),
      provider("gemini", { capabilities: ["VISION"] }),
      provider("nvidia"),
      provider("openrouter"),
    ]);
    expect(assignment(snapshot, "fabrique_code").state).toBe("PREPARED");
    expect(assignment(snapshot, "research_summary").state).toBe("PREPARED");
    expect(
      buildIntelligenceAssignments(snapshot, consented).assignments.every((entry) =>
        entry.requires.every((capability) => capability === "TEXT" || capability === "CODE"),
      ),
    ).toBe(true);
  });

  it("selects a declared code model only, including when another model of the same provider is text-only", () => {
    const snapshot = network([
      provider("mistral"),
      provider("nvidia"),
      provider("nvidia", { model: "actual-code-model", capabilities: ["TEXT", "CODE"] }),
      provider("openrouter", { model: "reviewed-code:free", capabilities: ["TEXT", "CODE"] }),
    ]);
    expect(assignment(snapshot, "fabrique_code").selectedModel).toEqual({
      providerKey: "nvidia",
      modelId: "actual-code-model",
    });
    const nvidiaCode = snapshot.providers[2];
    if (!nvidiaCode) throw new Error("Missing NVIDIA fixture");
    nvidiaCode.status = "QUOTA_EXCEEDED";
    expect(assignment(snapshot, "fabrique_code").selectedModel).toEqual({
      providerKey: "openrouter",
      modelId: "reviewed-code:free",
    });
  });

  it("uses only observed ready fallbacks and leaves unverified OVHcloud unavailable", () => {
    const snapshot = network([
      provider("gemini", { status: "BLOCKED" }),
      provider("ovhcloud", { status: "UNAVAILABLE", lastError: "RATE_LIMITED" }),
      provider("groq"),
    ]);
    expect(assignment(snapshot, "research_summary").selectedModel?.providerKey).toBe("groq");
    const ovhcloud = snapshot.providers[1];
    if (!ovhcloud) throw new Error("Missing OVHcloud fixture");
    ovhcloud.status = "AVAILABLE_FREE";
    expect(assignment(snapshot, "research_summary").selectedModel?.providerKey).toBe("ovhcloud");
  });

  it("keeps Cerebras trials and every unassigned provider in a non-usable reserve", () => {
    const result = buildIntelligenceAssignments(
      network([provider("cerebras"), provider("openai"), provider("qwen")]),
      consented,
    );
    expect(result.reserves.map((entry) => entry.providerKey)).toEqual(["cerebras", "openai", "qwen"]);
    expect(result.reserves.every((entry) => entry.state === "PREPARED" && entry.reason === "RESERVED")).toBe(true);
    expect(result.assignments.every((entry) => entry.selectedModel === null)).toBe(true);
  });

  it("exports honest bounded roles for every preferred provider and reserved provider", () => {
    for (const key of ["ollama", "mistral", "gemini", "ovhcloud", "groq", "cloudflare", "nvidia", "openrouter"]) {
      expect(providerAssignmentRole(key)).toContain("Affectation indicative");
      expect(providerAssignmentRole(key).length).toBeLessThanOrEqual(200);
    }
    expect(providerAssignmentRole("nvidia")).toContain("fabrique");
    expect(providerAssignmentRole("cerebras")).toContain("essai à revoir");
    expect(providerAssignmentRole("unknown")).toContain("aucune affectation active");
  });

  it("never mutates inputs, invokes the network or reserves allocation", () => {
    const snapshot = network([provider("ollama"), provider("mistral")]);
    const before = structuredClone(snapshot);
    const context = structuredClone(consented);
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
    try {
      const result = buildIntelligenceAssignments(snapshot, context);
      const selected = result.assignments[3]?.selectedModel;
      const candidate = result.assignments[3]?.candidates[0]?.models[0];
      if (!selected || !candidate) throw new Error("Missing assignment fixture");
      selected.modelId = "mutated-output";
      candidate.modelId = "another-mutation";
      expect(snapshot).toEqual(before);
      expect(context).toEqual(consented);
      expect(buildIntelligenceAssignments(snapshot, context).assignments[3]?.selectedModel?.modelId).toBe(
        "mistral-fixture",
      );
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
