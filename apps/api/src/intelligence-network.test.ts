import { intelligenceNetworkResponseSchema } from "@ida/contracts/intelligence-network";
import { ProviderRegistry } from "@ida/domain";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoIdentity } from "./demo-context.js";
import { buildIntelligenceNetwork } from "./intelligence-network.js";

describe("Intelligence Network read-only API", () => {
  let database: DemoDatabase;
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => {
    database = await DemoDatabase.open({ dataDir: "memory://" });
    vi.spyOn(DemoDatabase, "open").mockResolvedValueOnce(database);
    app = await createApp({ dataDir: "memory://" });
    vi.restoreAllMocks();
  });
  afterAll(() => app.close());
  it("reads real registry metadata without inference or any provider connection", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    try {
      const response = await app.inject({ method: "GET", url: "/v1/intelligence/network" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      const snapshot = intelligenceNetworkResponseSchema.parse(response.json()).data;
      expect(snapshot.providers.find((entry) => entry.key === "ollama")).toMatchObject({
        lifecycle: "REGISTERED",
        status: "NOT_CONFIGURED",
        quota: null,
      });
      expect(snapshot.providers).toHaveLength(14);
      expect(
        snapshot.providers.every((entry) => entry.status !== "AVAILABLE_FREE" && entry.status !== "AVAILABLE_PAID"),
      ).toBe(true);
      expect(snapshot.tasks.every((task) => task.availableModels.length === 0)).toBe(true);
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
  it("exposes no activation/payment endpoint", async () => {
    expect(
      (await app.inject({ method: "POST", url: "/v1/intelligence/network", payload: { enable: "gemini" } })).statusCode,
    ).toBe(404);
  });
  it("rejects a revoked session instead of returning a cached snapshot", async () => {
    await database.pglite.query("UPDATE identity_sessions SET status='REVOKED', revoked_at=now() WHERE id=$1", [
      demoIdentity.sessionId,
    ]);
    try {
      expect((await app.inject({ method: "GET", url: "/v1/intelligence/network" })).statusCode).toBe(401);
    } finally {
      await database.pglite.query("UPDATE identity_sessions SET status='ACTIVE', revoked_at=NULL WHERE id=$1", [
        demoIdentity.sessionId,
      ]);
    }
  });
  it("keeps prepared offers disconnected and returns detached metadata", () => {
    const registry = new ProviderRegistry();
    const snapshot = buildIntelligenceNetwork(registry);
    const first = snapshot.providers[0];
    if (!first) throw new Error("Missing prepared metadata");
    first.status = "AVAILABLE_FREE";
    expect(buildIntelligenceNetwork(registry).providers[0]?.status).toBe("BLOCKED");
    expect(registry.list()).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toMatch(/apiKey|password|prompt|workspaceId|sessionId/u);
  });
});
