import type { RequestIdentityContext } from "@ida/contracts";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { DemoDatabase } from "./database.js";
import * as transport from "./home-assistant-transport.js";
import { registerHomeDevice } from "./home-device.js";

const instances: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const app of instances.splice(0)) await app.close();
});
const identity = {
  workspaceId: "wsp_fixture",
  userId: "usr_fixture",
  session: { id: "ses_fixture" },
  clientInstance: { id: "cli_fixture" },
} as RequestIdentityContext;
const at = "2026-09-10T12:00:00.000Z";
async function fixture({
  origin = "https://ha.fixture.invalid",
  workspaceId = "wsp_fixture",
  enabled = true,
  locked = true,
  entityId = "light.fixture",
  address = "192.168.200.10",
  configured = true,
} = {}) {
  const app = Fastify();
  instances.push(app);
  const audit = vi.fn().mockResolvedValue({ rows: [] });
  const read = vi.fn().mockResolvedValue({
    entity_id: "light.fixture",
    state: "on",
    last_updated: at,
    attributes: { private: "omit this" },
  });
  const secret = {
    available: vi.fn().mockResolvedValue(true),
    resolve: vi.fn().mockResolvedValue("SYNTHETIC_FIXTURE_TOKEN"),
  };
  const authorize = vi.fn().mockReturnValue(identity);
  const revalidate = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(transport, "createHomeAssistantHttpsTransport").mockImplementation((_binding, resolveSecret) => ({
    getState: async ({ signal }) => {
      await resolveSecret(signal ?? AbortSignal.timeout(1000));
      return await read();
    },
  }));
  registerHomeDevice(app, { pglite: { query: audit } } as unknown as DemoDatabase, {
    locked,
    authorize,
    revalidate,
    now: () => new Date(at),
    binding: configured ? { workspaceId, origin, address, entityId, enabled, secret } : undefined,
  });
  await app.ready();
  const request = (payload: unknown = { consent: true }) =>
    app.inject({ method: "POST", url: "/v1/home/device/read", payload: payload as Record<string, unknown> });
  return { app, audit, read, secret, authorize, revalidate, request };
}
describe("HOME READ — contrôles et données privées", () => {
  it("le statut n'est pas une connexion ni un déchiffrement", async () => {
    const f = await fixture();
    const status = await f.app.inject("/v1/home/device/status");
    expect(status.json().data.state).toBe("CONFIGURED");
    expect(status.json().data.prerequisites).toEqual({
      configuration: "CONFIGURED",
      tls: "CONFIGURED",
      target: "CONFIGURED",
      credential: "STORED",
      verification: "NOT_PERFORMED",
    });
    expect(f.secret.available).toHaveBeenCalledTimes(1);
    expect(status.body).not.toContain("fixture");
    expect(f.secret.resolve).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  });
  it("montre simultanément TLS, cible et secret manquants sans déchiffrement", async () => {
    const f = await fixture({ origin: "http://ha.fixture.invalid", entityId: "" });
    f.secret.available.mockResolvedValue(false);
    const status = await f.app.inject("/v1/home/device/status");
    expect(status.json().data).toMatchObject({
      state: "TLS_REQUIRED",
      prerequisites: {
        configuration: "CONFIGURED",
        tls: "REQUIRED",
        target: "REQUIRED",
        credential: "MISSING",
        verification: "NOT_PERFORMED",
      },
    });
    expect(f.secret.available).toHaveBeenCalledTimes(1);
    expect(f.secret.resolve).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it("un coffre indisponible donne un diagnostic borné sans exposer son erreur", async () => {
    const f = await fixture();
    f.secret.available.mockRejectedValue(new Error("PRIVATE_VAULT_DETAILS"));
    const status = await f.app.inject("/v1/home/device/status");
    expect(status.json().data.state).toBe("SECRET_REQUIRED");
    expect(status.json().data.prerequisites.credential).toBe("UNAVAILABLE");
    expect(status.body).not.toContain("PRIVATE_VAULT_DETAILS");
    expect(f.secret.available).toHaveBeenCalledTimes(1);
    expect(f.secret.resolve).not.toHaveBeenCalled();
  });
  it.each([{ enabled: false }, { locked: false }, { configured: false }])(
    "ne consulte pas le coffre désactivé/non configuré pour %j",
    async (options) => {
      const f = await fixture(options);
      const status = await f.app.inject("/v1/home/device/status");
      expect(status.json().data.prerequisites.credential).toBe("NOT_CHECKED");
      if (options.configured === false) {
        expect(status.json().data.prerequisites.configuration).toBe("REQUIRED");
        expect(status.json().data.state).toBe("CONNECTION_REQUIRED");
      } else expect(status.json().data.state).toBe("DISABLED");
      expect(f.secret.available).not.toHaveBeenCalled();
      expect(f.secret.resolve).not.toHaveBeenCalled();
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it("révocation pendant le diagnostic : aucune checklist livrée", async () => {
    const f = await fixture();
    f.revalidate.mockRejectedValue(Object.assign(new Error("Connexion requise"), { statusCode: 401 }));
    const status = await f.app.inject("/v1/home/device/status");
    expect(status.statusCode).toBe(401);
    expect(status.json().data).toBeUndefined();
    expect(f.secret.resolve).not.toHaveBeenCalled();
  });
  it.each([{ origin: "http://ha.fixture.invalid" }, { enabled: false }, { locked: false }])(
    "reste fermé avant le coffre pour %j",
    async (options) => {
      const f = await fixture(options);
      expect((await f.request()).statusCode).toBe(503);
      expect(f.secret.available).not.toHaveBeenCalled();
      expect(f.secret.resolve).not.toHaveBeenCalled();
      expect(f.read).not.toHaveBeenCalled();
    },
  );
  it("absence de secret, consentement ou paramètres supplémentaires : pas de lecture", async () => {
    const f = await fixture();
    f.secret.available.mockResolvedValue(false);
    expect((await f.request()).statusCode).toBe(503);
    for (const body of [
      {},
      { consent: false },
      { consent: true, entityId: "light.other" },
      { consent: true, url: "http://unsafe" },
    ])
      expect((await f.request(body)).statusCode).toBe(400);
    expect(f.secret.resolve).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  });
  it("refuse un autre workspace avant consultation du coffre", async () => {
    const f = await fixture({ workspaceId: "wsp_other" });
    expect((await f.request()).statusCode).toBe(403);
    expect((await f.app.inject("/v1/home/device/status")).statusCode).toBe(403);
    expect(f.secret.available).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  });
  it("revalide, audite et projette sans historique domestique ni cache", async () => {
    const f = await fixture();
    const result = await f.request();
    expect(result.statusCode).toBe(200);
    expect(result.json().data).toEqual({ state: "ON", providerUpdatedAt: at, observedAt: at });
    expect(f.revalidate).toHaveBeenCalledTimes(4);
    await f.request();
    expect(f.read).toHaveBeenCalledTimes(2);
    const log = JSON.stringify(f.audit.mock.calls);
    expect(log).not.toMatch(/light\.|TOKEN|192\.168|attributes|ON|providerUpdatedAt/);
    expect(f.audit).toHaveBeenCalledTimes(4);
  });
  it("une panne audit avant lecture bloque le secret", async () => {
    const f = await fixture();
    f.audit.mockRejectedValue(new Error("PRIVATE_SQL"));
    const result = await f.request();
    expect(result.statusCode).toBe(503);
    expect(result.body).not.toContain("PRIVATE_SQL");
    expect(f.secret.resolve).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  });
  it("révocation pendant le coffre : bloque l'appel fournisseur", async () => {
    const f = await fixture();
    f.revalidate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(Object.assign(new Error("Connexion requise"), { statusCode: 401 }));
    expect((await f.request()).statusCode).toBe(401);
    expect(f.secret.resolve).toHaveBeenCalledTimes(1);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("révocation pendant lecture ou audit final en panne : aucun résultat livré", async () => {
    const f = await fixture();
    f.revalidate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(Object.assign(new Error("Connexion requise"), { statusCode: 401 }));
    expect((await f.request()).statusCode).toBe(401);
    f.revalidate.mockResolvedValue(undefined);
    f.audit.mockResolvedValueOnce({ rows: [] }).mockRejectedValue(new Error("PRIVATE_AUDIT"));
    const result = await f.request();
    expect(result.statusCode).toBe(503);
    expect(result.json().data).toBeUndefined();
    expect(result.body).not.toContain("PRIVATE_AUDIT");
  });
  it("refuse les réponses invalides et les dates futures", async () => {
    const f = await fixture();
    for (const data of [
      null,
      { entity_id: "light.other", state: "on", last_updated: at },
      { entity_id: "light.fixture", state: "on", last_updated: "2199-01-01T00:00:00Z" },
    ]) {
      f.read.mockResolvedValueOnce(data);
      expect((await f.request()).statusCode).toBe(503);
    }
  });
  it("borne la concurrence sans doubler les appels", async () => {
    const f = await fixture();
    let finish!: (value: unknown) => void;
    f.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = f.request();
    await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(1));
    expect((await f.request()).statusCode).toBe(429);
    finish({ entity_id: "light.fixture", state: "off", last_updated: at });
    expect((await first).statusCode).toBe(200);
  });
  it("limite 30 consultations horaires sans polling implicite", async () => {
    const f = await fixture();
    for (let n = 0; n < 30; n++) expect((await f.request()).statusCode).toBe(200);
    expect((await f.request()).statusCode).toBe(429);
    expect(f.read).toHaveBeenCalledTimes(30);
  });
});
describe("HOME READ — identité réelle en base éphémère", () => {
  it("anonyme, origine externe, mauvais workspace et session reverrouillée sont refusés", async () => {
    const secret = { available: vi.fn().mockResolvedValue(true), resolve: vi.fn() };
    const app = await createApp({
      dataDir: "memory://",
      identityMode: "LOCAL_LOCK",
      homeAssistant: {
        enabled: true,
        workspaceId: "wsp_other",
        origin: "https://ha.fixture.invalid",
        address: "192.168.200.10",
        entityId: "light.fixture",
        secret,
      },
    });
    instances.push(app);
    const request = (headers = {}) =>
      app.inject({ method: "POST", url: "/v1/home/device/read", payload: { consent: true }, headers });
    expect((await request()).statusCode).toBe(401);
    const setup = await app.inject({
      method: "POST",
      url: "/v1/auth/setup",
      payload: { passphrase: "Credential synthétique domotique tests uniquement" },
    });
    expect(setup.statusCode).toBe(201);
    const cookie = String(setup.headers["set-cookie"]).split(";", 1)[0] ?? "";
    expect(
      (await request({ cookie, origin: "https://outside.invalid", "sec-fetch-site": "cross-site" })).statusCode,
    ).toBe(403);
    expect((await request({ cookie })).statusCode).toBe(403);
    expect(secret.available).not.toHaveBeenCalled();
    expect(secret.resolve).not.toHaveBeenCalled();
    await app.inject({ method: "POST", url: "/v1/auth/lock", headers: { cookie } });
    expect((await request({ cookie })).statusCode).toBe(401);
  });
});
