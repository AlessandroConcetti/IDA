import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { localPilot } from "./evaluation/local-model-pin.js";
import { LocalChatStore, LocalChatStoreError } from "./local-chat-store.js";
import { OllamaLoopbackTransport } from "./ollama-transport.js";

const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function fixture(enabled = true) {
  vi.stubEnv("OLLAMA_NO_CLOUD", "1");
  const open = vi.spyOn(DemoDatabase, "open");
  vi.spyOn(OllamaLoopbackTransport.prototype, "inspectInstalledModels").mockResolvedValue([
    { name: localPilot.name, digest: localPilot.digest, size: localPilot.size },
  ]);
  const inference = vi.spyOn(OllamaLoopbackTransport.prototype, "post").mockResolvedValue({
    status: 200,
    body: { done: true, done_reason: "stop", message: { role: "assistant", content: "Réponse synthétique privée." } },
  });
  const app = await createApp({
    dataDir: "memory://",
    storageDir: "memory://",
    identityMode: "LOCAL_LOCK",
    localDialogueEnabled: enabled,
    weatherEnabled: false,
  });
  apps.push(app);
  const database = (await open.mock.results[0]?.value) as DemoDatabase;
  const setup = await app.inject({
    method: "POST",
    url: "/v1/auth/setup",
    payload: { passphrase: randomBytes(32).toString("base64url") },
  });
  expect(setup.statusCode).toBe(201);
  const cookies = setup.headers["set-cookie"];
  const cookie = (Array.isArray(cookies) ? cookies[0] : cookies)?.split(";", 1)[0] ?? "";
  const headers = { cookie };
  const send = (payload: unknown) =>
    app.inject({
      method: "POST",
      url: "/v1/intelligence/local/reply",
      headers,
      payload: payload as Record<string, unknown>,
    });
  const history = () => app.inject({ method: "GET", url: "/v1/intelligence/local/history", headers });
  return { app, database, inference, send, history, headers };
}

describe("Local chat: real authenticated API and persistence, mocked model only", () => {
  it("saves a completed pair, replays its ID without inference, rejects collision and keeps text out of audit", async () => {
    const f = await fixture();
    const requestId = randomUUID();
    const payload = { requestId, prompt: "Ma demande synthétique privée." };
    const first = await f.send(payload);
    expect(first.statusCode).toBe(200);
    const saved = first.json().data.exchange;
    expect(saved).toMatchObject({ id: requestId, prompt: payload.prompt, answer: "Réponse synthétique privée." });
    expect((await f.send(payload)).json()).toEqual(first.json());
    expect((await f.send({ ...payload, prompt: "Un autre message" })).statusCode).toBe(409);
    expect(f.inference).toHaveBeenCalledOnce();
    const history = await f.history();
    expect(history.statusCode).toBe(200);
    expect(history.headers["cache-control"]).toContain("no-store");
    expect(history.json()).toEqual({ data: { items: [saved], retentionDays: 30 } });
    const activity = await f.database.pglite.query(
      "SELECT action, payload FROM activity_logs WHERE action='chat.exchange.saved'",
    );
    expect(activity.rows).toEqual([{ action: "chat.exchange.saved", payload: {} }]);
    const audit = await f.database.pglite.query("SELECT * FROM intelligence_audit_events");
    expect(JSON.stringify(audit.rows)).not.toMatch(/demande synthétique|Réponse synthétique/u);
  });

  it("rejects anonymous access, hostile origins, injected scope and malformed identifiers before inference", async () => {
    const f = await fixture();
    expect((await f.app.inject({ method: "GET", url: "/v1/intelligence/local/history" })).statusCode).toBe(401);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/v1/intelligence/local/reply",
          headers: { ...f.headers, origin: "https://attacker.invalid" },
          payload: { prompt: "Bonjour", requestId: randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    for (const payload of [
      { prompt: "Bonjour", requestId: "not-a-uuid" },
      { prompt: "Bonjour", requestId: randomUUID(), workspaceId: "someone-else" },
      { prompt: "Bonjour", requestId: randomUUID(), provider: "cloud" },
      { prompt: "mot de passe: synthetic-secret", requestId: randomUUID() },
    ])
      expect((await f.send(payload)).statusCode).toBe(400);
    expect(f.inference).not.toHaveBeenCalled();
    expect((await f.history()).json().data.items).toEqual([]);
  });

  it("requires WRITE before saved generation, but permits READ history", async () => {
    const f = await fixture();
    await f.database.pglite.query("UPDATE memberships SET role='VIEWER'");
    expect((await f.send({ requestId: randomUUID(), prompt: "Bonjour" })).statusCode).toBe(403);
    expect((await f.history()).statusCode).toBe(200);
    expect(f.inference).not.toHaveBeenCalled();
  });

  it("rechecks WRITE after inference: a revoked write grant cannot save or deliver a confirmed response", async () => {
    const f = await fixture();
    f.inference.mockImplementation(async () => {
      await f.database.pglite.query("UPDATE memberships SET role='VIEWER'");
      return {
        status: 200,
        body: { done: true, done_reason: "stop", message: { role: "assistant", content: "Ne pas livrer." } },
      };
    });
    const response = await f.send({ requestId: randomUUID(), prompt: "Bonjour" });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain("Ne pas livrer.");
    expect((await f.history()).json().data.items).toEqual([]);
  });

  it("does not fabricate a saved response on storage failure; retry with the same ID remains possible", async () => {
    const f = await fixture();
    const save = vi.spyOn(LocalChatStore.prototype, "save").mockRejectedValueOnce(new LocalChatStoreError());
    const payload = { requestId: randomUUID(), prompt: "Bonjour" };
    const response = await f.send(payload);
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe("LOCAL_CHAT_NOT_SAVED");
    expect(response.body).not.toContain("Réponse synthétique privée.");
    expect((await f.history()).json().data.items).toEqual([]);
    save.mockRestore();
    expect((await f.send(payload)).statusCode).toBe(200);
    expect((await f.history()).json().data.items).toHaveLength(1);
  });

  it("leaves legacy prompt-only calls transient and failed generations unsaved", async () => {
    const f = await fixture();
    const legacy = await f.send({ prompt: "Bonjour" });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().data.exchange).toBeUndefined();
    f.inference.mockRejectedValueOnce(new Error("PRIVATE_TRANSPORT_FAILURE"));
    const failure = await f.send({ prompt: "Bonjour encore", requestId: randomUUID() });
    expect(failure.statusCode).toBe(503);
    expect(failure.body).not.toContain("PRIVATE_TRANSPORT_FAILURE");
    expect((await f.history()).json().data.items).toEqual([]);
  });

  it("allows history reads with the engine disabled and denies history after session lock", async () => {
    const f = await fixture(false);
    expect((await f.history()).statusCode).toBe(200);
    expect((await f.send({ prompt: "Bonjour", requestId: randomUUID() })).json().error.code).toBe("LOCAL_AI_DISABLED");
    await f.app.inject({ method: "POST", url: "/v1/auth/lock", headers: f.headers });
    expect((await f.history()).statusCode).toBe(401);
    expect(f.inference).not.toHaveBeenCalled();
  });
});
