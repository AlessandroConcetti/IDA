import type {
  AIProviderManifest,
  FreeQuotaObservation,
  IntelligencePolicy,
  IntelligenceRequest,
} from "@ida/contracts/intelligence";
import { describe, expect, it, vi } from "vitest";
import { IntelligenceError, ProviderRegistry } from "./provider-registry.js";
import { ProviderRouter } from "./provider-router.js";
import { QuotaManager } from "./quota-manager.js";

const now = Date.parse("2026-09-14T10:00:00Z");
const scope = { userId: "u", workspaceId: "w", sessionId: "s", clientInstanceId: "c" };
const request: IntelligenceRequest = {
  scope,
  purpose: "ASSISTANT_REPLY",
  prompt: "Bonjour",
  dataClasses: ["PUBLIC"],
  capabilities: ["TEXT"],
  complexity: 1,
  maxOutputTokens: 100,
};
const observation = (remaining = 2): FreeQuotaObservation => ({
  modelIds: ["text"],
  observedAt: new Date(now).toISOString(),
  validUntil: new Date(now + 60_000).toISOString(),
  noPaidOverage: true,
  windows: [
    { kind: "REQUESTS_DAY", remaining, limit: 2, resetAt: new Date(now + 100_000).toISOString() },
    { kind: "TOKENS_MINUTE", remaining: 4000, limit: 4000, resetAt: new Date(now + 60_000).toISOString() },
  ],
});
function fixture(cost: number | null = 0) {
  const manifests: AIProviderManifest[] = ["a", "b"].map((key) => ({
    key,
    version: "1.0.0",
    category: "LLM",
    locality: "CLOUD",
    retention: "REVIEWED_CLOUD",
    acceptedDataClasses: ["PUBLIC", "HIGHLY_SENSITIVE"],
    models: [
      {
        id: "text",
        capabilities: ["TEXT"],
        maxComplexity: 3,
        maxInputChars: 1000,
        maxOutputTokens: 1000,
        estimatedCostMicros: cost,
        estimatedLatencyMs: 1,
      },
    ],
  }));
  const adapters = manifests.map((manifest) => ({
    providerKey: manifest.key,
    locality: "CLOUD" as const,
    generate: vi.fn(async () => ({ text: "Proposition" })),
  }));
  const registry = new ProviderRegistry(
    manifests.map((manifest, index) => {
      const adapter = adapters[index];
      if (!adapter) throw new Error("Missing synthetic adapter");
      return { manifest, adapter };
    }),
  );
  for (const key of ["a", "b"])
    registry.configure(key, {
      enabled: true,
      configured: true,
      availability: "READY",
      remainingCalls: 10,
      validUntil: new Date(now + 200_000).toISOString(),
    });
  const policy: IntelligencePolicy = {
    mode: "AI",
    allowedProviderKeys: ["a", "b"],
    localFirst: true,
    maxAttempts: 2,
    maxCostMicros: 1000,
    maxLatencyMs: 1000,
    cloudConsents: ["a", "b"].map((providerKey) => ({
      scope,
      providerKey,
      purpose: "ASSISTANT_REPLY",
      dataClasses: ["PUBLIC", "HIGHLY_SENSITIVE"],
      expiresAt: new Date(now + 200_000).toISOString(),
    })),
  };
  const audit = vi.fn(async () => {});
  let clock = now;
  const router = new ProviderRouter(
    registry,
    async () => policy,
    audit,
    () => clock,
  );
  return {
    registry,
    adapters,
    policy,
    audit,
    router,
    setClock: (value: number) => {
      clock = value;
    },
  };
}

describe("Free compute fail-closed federation", () => {
  it("never equates a zero estimate and configured key with free quota", async () => {
    const f = fixture();
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(f.adapters.every((adapter) => adapter.generate.mock.calls.length === 0)).toBe(true);
  });
  it.each([1, null])("blocks paid/unknown model cost %s even with observed quota and budget", async (cost) => {
    const f = fixture(cost);
    f.registry.observeFreeQuota("a", observation());
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(f.adapters[0]?.generate).not.toHaveBeenCalled();
  });
  it("reserves shared requests and pessimistic tokens before a call, including failed attempts", async () => {
    const f = fixture();
    f.registry.observeFreeQuota("a", observation());
    f.adapters[0]?.generate.mockRejectedValueOnce(new IntelligenceError("TIMEOUT"));
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "TIMEOUT" });
    const quota = f.registry.list()[0]?.quota.observation;
    expect(quota?.windows.map((window) => window.remaining)).toEqual([1, 3381]);
    expect(f.registry.list()[0]?.health.text?.lastError).toBe("TIMEOUT");
  });
  it("atomically consumes the last free call across concurrent routers", async () => {
    const f = fixture();
    f.registry.observeFreeQuota("a", observation(1));
    const results = await Promise.allSettled([f.router.generate(request), f.router.generate(request)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(f.adapters[0]?.generate).toHaveBeenCalledTimes(1);
  });
  it("detects resets and restart as UNKNOWN without fabricating a refill", async () => {
    const f = fixture();
    f.registry.observeFreeQuota("a", observation());
    f.setClock(now + 60_000);
    await expect(f.router.generate(request)).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(new QuotaManager().snapshot("a").observation).toBeNull();
    expect(f.registry.list()[0]?.quota.observation?.windows[0]?.remaining).toBe(2);
  });
  it("falls back after quota exhaustion only to a separately approved compatible free provider", async () => {
    const f = fixture();
    f.registry.observeFreeQuota("a", observation());
    f.registry.observeFreeQuota("b", observation());
    f.adapters[0]?.generate.mockRejectedValue(new IntelligenceError("RATE_LIMITED"));
    await expect(f.router.generate(request)).resolves.toEqual({ text: "Proposition" });
    expect(f.registry.list()[0]?.quota.exhausted).toBe(true);
    await f.router.generate(request);
    expect(f.adapters[0]?.generate).toHaveBeenCalledTimes(1);
  });
  it.each(["HIGHLY_SENSITIVE", "SECRET"] as const)("does not send %s to cloud", async (classification) => {
    const f = fixture();
    f.registry.observeFreeQuota("a", observation());
    await expect(f.router.generate({ ...request, dataClasses: [classification] })).rejects.toBeInstanceOf(
      IntelligenceError,
    );
    expect(f.adapters[0]?.generate).not.toHaveBeenCalled();
  });
  it("does not downgrade code/tool requirements to a text-only provider", async () => {
    const f = fixture();
    f.registry.observeFreeQuota("a", observation());
    await expect(f.router.generate({ ...request, capabilities: ["CODE", "TOOL_CALLING"] })).rejects.toMatchObject({
      code: "NO_COMPATIBLE_MODEL",
    });
  });
  it("rejects observation with automatic paid overage, wrong model and malformed windows", () => {
    const f = fixture();
    for (const input of [
      { ...observation(), noPaidOverage: false },
      { ...observation(), modelIds: ["unknown"] },
      { ...observation(), windows: [] },
      { ...observation(), windows: [{ ...observation().windows[0], remaining: 3 }] },
    ]) {
      expect(() => f.registry.observeFreeQuota("a", input as FreeQuotaObservation)).toThrow("CONFIGURATION_INVALID");
    }
  });
  it("enforces every window and exact model at reservation, not just in ranking", () => {
    const manager = new QuotaManager();
    manager.observe("a", observation());
    expect(manager.reserve("a", "text", 5000, now)).toBe(false);
    expect(manager.reserve("a", "wrong", 100, now)).toBe(false);
    expect(manager.snapshot("a").observation?.windows[0]?.remaining).toBe(2);
  });
});
