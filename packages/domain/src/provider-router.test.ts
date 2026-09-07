import type {
  AIProviderManifest,
  AIProviderState,
  IntelligencePolicy,
  IntelligenceRequest,
} from "@ida/contracts/intelligence";
import { describe, expect, it, vi } from "vitest";
import { type IntelligenceAdapter, IntelligenceError, ProviderRegistry } from "./provider-registry.js";
import { type IntelligenceAudit, ProviderRouter } from "./provider-router.js";

const now = Date.parse("2026-09-07T12:00:00Z");
function required<T>(items: readonly T[], index = 0): T {
  const item = items[index];
  if (item === undefined) throw new Error("Missing test fixture");
  return item;
}
const scope = { userId: "u1", workspaceId: "w1", sessionId: "s1", clientInstanceId: "c1" };
function request(overrides: Partial<IntelligenceRequest> = {}): IntelligenceRequest {
  return {
    scope: { ...scope },
    purpose: "CONTENT_DRAFT",
    prompt: "Propose un texte court.",
    dataClasses: ["PRIVATE_CREATIVE"],
    capabilities: ["TEXT"],
    complexity: 1,
    maxOutputTokens: 100,
    ...overrides,
  };
}
function manifest(key = "local", locality: "LOCAL" | "CLOUD" = "LOCAL"): AIProviderManifest {
  return {
    key,
    version: "1.0.0",
    category: "LLM",
    locality,
    retention: locality === "LOCAL" ? "LOCAL_ONLY" : "REVIEWED_CLOUD",
    acceptedDataClasses: ["PUBLIC", "INTERNAL", "PRIVATE_CREATIVE"],
    models: [
      {
        id: `${key}-text`,
        capabilities: ["TEXT"],
        maxComplexity: 1,
        maxInputChars: 1000,
        maxOutputTokens: 500,
        estimatedCostMicros: locality === "LOCAL" ? 0 : 40,
        estimatedLatencyMs: 10,
      },
    ],
  };
}
function state(overrides: Partial<AIProviderState> = {}): AIProviderState {
  return {
    enabled: true,
    configured: true,
    availability: "READY",
    remainingCalls: 10,
    validUntil: "2026-09-07T13:00:00Z",
    ...overrides,
  };
}
function policy(overrides: Partial<IntelligencePolicy> = {}): IntelligencePolicy {
  return {
    mode: "AI",
    allowedProviderKeys: ["local", "cloud", "other"],
    localFirst: true,
    maxAttempts: 3,
    maxCostMicros: 100,
    maxLatencyMs: 5000,
    cloudConsents: [],
    ...overrides,
  };
}
function consent(providerKey = "cloud"): IntelligencePolicy["cloudConsents"][number] {
  return {
    scope: { ...scope },
    providerKey,
    purpose: "CONTENT_DRAFT",
    dataClasses: ["PRIVATE_CREATIVE"],
    expiresAt: "2026-09-07T13:00:00Z",
  };
}
function fixture(manifests = [manifest(), manifest("cloud", "CLOUD")]) {
  const adapters = manifests.map((entry) => ({
    providerKey: entry.key,
    locality: entry.locality,
    generate: vi.fn<IntelligenceAdapter["generate"]>().mockResolvedValue({ text: `${entry.key} response` }),
  }));
  const registry = new ProviderRegistry(
    manifests.map((entry, index) => ({ manifest: entry, adapter: required(adapters, index) })),
  );
  for (const entry of manifests) registry.configure(entry.key, state());
  let currentPolicy = policy();
  const authorize = vi.fn(async () => currentPolicy);
  const audit = vi.fn(async (_event: IntelligenceAudit) => {});
  const router = new ProviderRouter(registry, authorize, audit, () => now);
  return {
    registry,
    adapters,
    authorize,
    audit,
    router,
    setPolicy: (value: IntelligencePolicy) => {
      currentPolicy = value;
    },
  };
}

describe("Provider Registry", () => {
  it("starts disabled and makes detached snapshots", () => {
    const adapter = { providerKey: "local", locality: "LOCAL" as const, generate: vi.fn() };
    const registry = new ProviderRegistry([{ manifest: manifest(), adapter }]);
    const snapshot = required(registry.list());
    expect(snapshot.state).toMatchObject({ enabled: false, configured: false, remainingCalls: 0 });
    required(snapshot.manifest.models).capabilities.push("REASONING");
    snapshot.state.enabled = true;
    expect(required(required(registry.list()).manifest.models).capabilities).toEqual(["TEXT"]);
    expect(required(registry.list()).state.enabled).toBe(false);
  });
  it("rejects duplicates, mismatched adapter locality and unknown config fields", () => {
    const item = {
      manifest: manifest(),
      adapter: { providerKey: "local", locality: "LOCAL" as const, generate: vi.fn() },
    };
    expect(() => new ProviderRegistry([item, item])).toThrow("CONFIGURATION_INVALID");
    expect(() => new ProviderRegistry([{ ...item, adapter: { ...item.adapter, locality: "CLOUD" } }])).toThrow(
      "CONFIGURATION_INVALID",
    );
    expect(() =>
      fixture().registry.configure("local", { ...state(), endpoint: "untrusted" } as AIProviderState),
    ).toThrow("CONFIGURATION_INVALID");
    expect(() => fixture().registry.configure("unknown", state())).toThrow("CONFIGURATION_INVALID");
  });
  it.each([-1, Number.NaN, Infinity])("rejects invalid quota %s", (remainingCalls) => {
    expect(() => fixture().registry.configure("local", state({ remainingCalls }))).toThrow("CONFIGURATION_INVALID");
  });
});

describe("Provider routing and isolation", () => {
  it("is local-first even with a preferred cloud; explicit preference can change the ranking only", async () => {
    const f = fixture();
    f.setPolicy(policy({ cloudConsents: [consent()], preferredProviderKey: "cloud" }));
    expect(await f.router.generate(request())).toEqual({ text: "local response" });
    f.setPolicy(policy({ localFirst: false, cloudConsents: [consent()], preferredProviderKey: "cloud" }));
    expect(await f.router.generate(request())).toEqual({ text: "cloud response" });
    expect(f.audit.mock.calls.map(([event]) => event.outcome)).toEqual([
      "ATTEMPT",
      "SUCCEEDED",
      "ATTEMPT",
      "SUCCEEDED",
    ]);
  });
  it.each([
    { mode: "NORMAL" as const },
    { allowedProviderKeys: [] },
    { maxCostMicros: -1 },
    { maxCostMicros: Infinity },
  ])("denies invalid or closed policy %j without calls", async (patch) => {
    const f = fixture();
    f.setPolicy(policy(patch));
    await expect(f.router.generate(request())).rejects.toBeInstanceOf(IntelligenceError);
    expect(f.adapters.every((adapter) => adapter.generate.mock.calls.length === 0)).toBe(true);
  });
  it.each([
    { enabled: false },
    { configured: false },
    { availability: "UNAVAILABLE" as const },
    { availability: "UNKNOWN" as const },
    { remainingCalls: 0 },
    { validUntil: "2026-09-07T12:00:00Z" },
  ])("does not choose unready provider %j or silently choose cloud", async (patch) => {
    const f = fixture();
    f.registry.configure("local", state(patch));
    await expect(f.router.generate(request())).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(f.adapters.every((adapter) => adapter.generate.mock.calls.length === 0)).toBe(true);
  });
  it.each(["SECRET", "SENSITIVE_PERSONAL"] as const)("does not transmit %s", async (classification) => {
    const f = fixture();
    f.setPolicy(policy({ cloudConsents: [consent()] }));
    await expect(f.router.generate(request({ dataClasses: [classification] }))).rejects.toBeInstanceOf(
      IntelligenceError,
    );
    expect(f.adapters.every((adapter) => adapter.generate.mock.calls.length === 0)).toBe(true);
  });
  it("rejects unrecognized input fields instead of forwarding tool or secret configuration", async () => {
    const f = fixture();
    await expect(
      f.router.generate({ ...request(), tools: ["publish_post"] } as IntelligenceRequest),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(required(f.adapters).generate).not.toHaveBeenCalled();
  });
  it.each([
    { maxComplexity: 1 },
    { capabilities: ["REASONING"] as ["REASONING"] },
    { maxInputChars: 1 },
    { maxOutputTokens: 1 },
    { estimatedCostMicros: null },
    { estimatedCostMicros: 101 },
    { estimatedLatencyMs: null },
    { estimatedLatencyMs: 6000 },
  ])("filters incompatible model %j", async (patch) => {
    const m = manifest();
    Object.assign(required(m.models), patch);
    const f = fixture([m]);
    await expect(f.router.generate(request({ complexity: "maxComplexity" in patch ? 2 : 1 }))).rejects.toMatchObject({
      code: "NO_COMPATIBLE_MODEL",
    });
    expect(required(f.adapters).generate).not.toHaveBeenCalled();
  });
  it("selects a capable model without changing agents or using the largest by default", async () => {
    const m = manifest();
    m.models.push({
      ...required(m.models),
      id: "reasoning-model",
      maxComplexity: 3,
      capabilities: ["TEXT", "REASONING"],
    });
    const f = fixture([m]);
    await f.router.generate(request({ capabilities: ["TEXT", "REASONING"], complexity: 3 }));
    expect(required(f.adapters).generate).toHaveBeenCalledWith(expect.objectContaining({ modelId: "reasoning-model" }));
    await f.router.generate(request());
    expect(required(f.adapters).generate).toHaveBeenLastCalledWith(expect.objectContaining({ modelId: "local-text" }));
  });
  it("never considers a provider with unknown retention", async () => {
    const f = fixture([{ ...manifest(), retention: "UNKNOWN" }]);
    await expect(f.router.generate(request())).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
  });
  it.each(["provider", "workspace", "user", "session", "device", "purpose", "class", "expiry"])(
    "rejects mismatched cloud consent: %s",
    async (field) => {
      const c = consent();
      if (field === "provider") c.providerKey = "other";
      if (field === "workspace") c.scope.workspaceId = "w2";
      if (field === "user") c.scope.userId = "u2";
      if (field === "session") c.scope.sessionId = "s2";
      if (field === "device") c.scope.clientInstanceId = "c2";
      if (field === "purpose") c.purpose = "ASSISTANT_REPLY";
      if (field === "class") c.dataClasses = ["PUBLIC"];
      if (field === "expiry") c.expiresAt = "2026-09-07T12:00:00Z";
      const f = fixture([manifest("cloud", "CLOUD")]);
      f.setPolicy(policy({ cloudConsents: [c] }));
      await expect(f.router.generate(request())).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
      expect(required(f.adapters).generate).not.toHaveBeenCalled();
    },
  );
});

describe("Controlled fallback", () => {
  it("permits a transient local failure to fall back only to explicitly consented cloud", async () => {
    const f = fixture();
    f.setPolicy(policy({ cloudConsents: [consent()] }));
    required(f.adapters).generate.mockRejectedValue(new IntelligenceError("UNAVAILABLE"));
    expect(await f.router.generate(request())).toEqual({ text: "cloud response" });
    expect(f.registry.list().map((provider) => provider.state.remainingCalls)).toEqual([9, 9]);
  });
  it("does not infer consent even for PUBLIC data", async () => {
    const f = fixture();
    required(f.adapters).generate.mockRejectedValue(new IntelligenceError("UNAVAILABLE"));
    await expect(f.router.generate(request({ dataClasses: ["PUBLIC"] }))).rejects.toMatchObject({
      code: "NO_COMPATIBLE_MODEL",
    });
    expect(required(f.adapters, 1).generate).not.toHaveBeenCalled();
  });
  it.each(["FORBIDDEN", "INVALID_RESPONSE", "REFUSED", "TIMEOUT", "CANCELLED", "AUTHENTICATION_REQUIRED"] as const)(
    "never falls back after %s",
    async (code) => {
      const f = fixture();
      f.setPolicy(policy({ cloudConsents: [consent()] }));
      required(f.adapters).generate.mockRejectedValue(new IntelligenceError(code));
      await expect(f.router.generate(request())).rejects.toMatchObject({ code });
      expect(required(f.adapters, 1).generate).not.toHaveBeenCalled();
    },
  );
  it("charges failed attempts against the same routing envelope", async () => {
    const m = manifest();
    required(m.models).estimatedCostMicros = 70;
    const f = fixture([m, manifest("cloud", "CLOUD")]);
    f.setPolicy(policy({ cloudConsents: [consent()] }));
    required(f.adapters).generate.mockRejectedValue(new IntelligenceError("UNAVAILABLE"));
    await expect(f.router.generate(request())).rejects.toMatchObject({ code: "NO_COMPATIBLE_MODEL" });
    expect(required(f.adapters, 1).generate).not.toHaveBeenCalled();
  });
  it.each(["consent", "mode", "identity", "disabled"])("rechecks %s before fallback", async (change) => {
    const f = fixture();
    f.setPolicy(policy({ cloudConsents: [consent()] }));
    required(f.adapters).generate.mockImplementation(async () => {
      if (change === "consent") f.setPolicy(policy());
      if (change === "mode") f.setPolicy(policy({ mode: "NORMAL" }));
      if (change === "identity") f.authorize.mockRejectedValue(new Error("private authorization context"));
      if (change === "disabled") f.registry.configure("cloud", state({ enabled: false }));
      throw new IntelligenceError("UNAVAILABLE");
    });
    await expect(f.router.generate(request())).rejects.toBeInstanceOf(IntelligenceError);
    expect(required(f.adapters, 1).generate).not.toHaveBeenCalled();
  });
  it("revalidates after async audit and fails closed if audit cannot append", async () => {
    const f = fixture();
    f.audit.mockImplementationOnce(async () => {
      f.setPolicy(policy({ mode: "NORMAL" }));
    });
    await expect(f.router.generate(request())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(required(f.adapters).generate).not.toHaveBeenCalled();
    f.setPolicy(policy());
    f.audit.mockRejectedValue(new Error("private audit details"));
    await expect(f.router.generate(request())).rejects.toMatchObject({ code: "AUDIT_UNAVAILABLE" });
    expect(required(f.adapters).generate).not.toHaveBeenCalled();
  });
  it("reserves the last quota slot atomically across concurrent requests", async () => {
    const f = fixture([manifest()]);
    f.registry.configure("local", state({ remainingCalls: 1 }));
    const results = await Promise.allSettled([f.router.generate(request()), f.router.generate(request())]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(required(f.adapters).generate).toHaveBeenCalledTimes(1);
  });
  it("redacts arbitrary errors and never retries unknown errors", async () => {
    const f = fixture();
    f.setPolicy(policy({ cloudConsents: [consent()] }));
    required(f.adapters).generate.mockRejectedValue(new Error("SYNTHETIC_PRIVATE_MARKER"));
    await expect(f.router.generate(request())).rejects.toThrow("IDA intelligence: UNAVAILABLE");
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain("SYNTHETIC_PRIVATE_MARKER");
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain(request().prompt);
    expect(required(f.adapters, 1).generate).not.toHaveBeenCalled();
  });
  it("redacts even a forged error code from an adapter", async () => {
    const f = fixture();
    const error = new IntelligenceError("UNAVAILABLE");
    Object.defineProperty(error, "code", { value: "SYNTHETIC_PRIVATE_ERROR" });
    required(f.adapters).generate.mockRejectedValue(error);
    await expect(f.router.generate(request())).rejects.toThrow("IDA intelligence: INVALID_RESPONSE");
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain("SYNTHETIC_PRIVATE_ERROR");
  });
  it("denies delivery when consent is revoked during the completion audit", async () => {
    const f = fixture([manifest("cloud", "CLOUD")]);
    f.setPolicy(policy({ cloudConsents: [consent()] }));
    f.audit.mockImplementation(async (event) => {
      if (event.outcome === "SUCCEEDED") f.setPolicy(policy());
    });
    await expect(f.router.generate(request())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("does not trust structured tool output or confirm memory", async () => {
    const f = fixture();
    required(f.adapters).generate.mockResolvedValue({
      text: "publish now",
      tool: "publish_post",
      status: "CONFIRMED",
    } as {
      text: string;
    });
    await expect(f.router.generate(request())).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("rejects a result if authorization was revoked while the provider was running", async () => {
    const f = fixture();
    required(f.adapters).generate.mockImplementation(async () => {
      f.authorize.mockRejectedValue(new Error("session revoked"));
      return { text: "late result" };
    });
    await expect(f.router.generate(request())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("disabling a provider aborts in-flight work even if its transport ignores abort", async () => {
    const f = fixture();
    let receivedSignal: AbortSignal | undefined;
    required(f.adapters).generate.mockImplementation((input) => {
      receivedSignal = input.signal;
      f.registry.configure("local", state({ enabled: false }));
      return new Promise(() => {});
    });
    await expect(f.router.generate(request())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(receivedSignal?.aborted).toBe(true);
    expect(required(f.adapters, 1).generate).not.toHaveBeenCalled();
  });
  it("propagates explicit cancellation without any call when already aborted", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(f.router.generate(request(), controller.signal)).rejects.toMatchObject({ code: "CANCELLED" });
    expect(required(f.adapters).generate).not.toHaveBeenCalled();
  });
  it("times out a hung adapter and ignores any late result without fallback", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      let receivedSignal: AbortSignal | undefined;
      f.setPolicy(policy({ maxLatencyMs: 50 }));
      required(f.adapters).generate.mockImplementation((input) => {
        receivedSignal = input.signal;
        return new Promise(() => {});
      });
      const assertion = expect(f.router.generate(request())).rejects.toMatchObject({ code: "TIMEOUT" });
      await vi.advanceTimersByTimeAsync(51);
      await assertion;
      expect(receivedSignal?.aborted).toBe(true);
      expect(required(f.adapters, 1).generate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
