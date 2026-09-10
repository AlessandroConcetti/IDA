import type { RequestIdentityContext } from "@ida/contracts";
import { weatherCities } from "@ida/contracts/weather";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import type { DemoDatabase } from "./database.js";
import { registerHomeWeather } from "./home-weather.js";
import { normalizeWeather, OpenMeteoAdapter } from "./weather-adapter.js";
import { forecastFixture, weatherFixtureNow } from "./weather-fixture.js";

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
async function fixture({ enabled = true, locked = true } = {}) {
  const app = Fastify();
  instances.push(app);
  const audit = vi.fn().mockResolvedValue({ rows: [] });
  const read = vi.fn().mockImplementation(async (city, now) => normalizeWeather(forecastFixture(), null, city, now));
  const authorize = vi.fn().mockReturnValue(identity);
  const revalidate = vi.fn().mockResolvedValue(undefined);
  let currentTime = new Date(weatherFixtureNow);
  registerHomeWeather(app, { pglite: { query: audit } } as unknown as DemoDatabase, {
    enabled,
    locked,
    authorize,
    revalidate,
    adapter: { read },
    now: () => new Date(currentTime),
  });
  await app.ready();
  const request = (payload: unknown = { cityId: "geneva", consent: true }) =>
    app.inject({ method: "POST", url: "/v1/home/weather", payload: payload as Record<string, unknown> });
  return {
    app,
    read,
    audit,
    authorize,
    revalidate,
    request,
    advance: (milliseconds: number) => {
      currentTime = new Date(currentTime.getTime() + milliseconds);
    },
  };
}

describe("Météo — autorisation, cache et échecs", () => {
  it("le statut et une requête sans consentement n'activent aucune sortie", async () => {
    const f = await fixture();
    expect((await f.app.inject("/v1/home/weather/status")).statusCode).toBe(200);
    expect((await f.request({ cityId: "geneva" })).statusCode).toBe(400);
    expect((await f.request({ cityId: "geneva", consent: true, workspaceId: "wsp_other" })).statusCode).toBe(400);
    expect(f.read).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it.each([
    { enabled: false, locked: true },
    { enabled: true, locked: false },
  ])("reste fermé avec %j", async (options) => {
    const f = await fixture(options);
    expect((await f.request()).statusCode).toBe(503);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("réutilise seulement un bulletin public mais revalide et audite chaque lecture", async () => {
    const f = await fixture();
    expect((await f.request()).statusCode).toBe(200);
    expect((await f.request()).statusCode).toBe(200);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(f.revalidate).toHaveBeenCalledTimes(6);
    expect(f.audit).toHaveBeenCalledTimes(4);
    const auditText = JSON.stringify(f.audit.mock.calls);
    expect(auditText).toContain("wsp_fixture");
    expect(auditText).not.toContain("geneva");
    expect(auditText).not.toContain("temperature");
    expect(f.read.mock.calls[0]?.[2].aborted).toBe(true);
  });
  it("interdit l'egress quand l'audit préalable échoue", async () => {
    const f = await fixture();
    f.audit.mockRejectedValue(new Error("PRIVATE_SQL_DIAGNOSTIC"));
    const response = await f.request();
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("PRIVATE_SQL_DIAGNOSTIC");
    expect(f.read).not.toHaveBeenCalled();
  });
  it("refuse la livraison après révocation pendant l'appel", async () => {
    const f = await fixture();
    f.revalidate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(Object.assign(new Error("Authentification requise"), { statusCode: 401 }));
    const response = await f.request();
    expect(response.statusCode).toBe(401);
    expect(response.json().data).toBeUndefined();
  });
  it("borne les appels concurrents et annule le transport survivant sur échec", async () => {
    const f = await fixture();
    let reject!: (error: Error) => void;
    f.read.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const first = f.request();
    await vi.waitFor(() => expect(f.read).toHaveBeenCalledTimes(1));
    expect((await f.request()).statusCode).toBe(429);
    reject(new Error("PRIVATE_PROVIDER_TEXT"));
    const response = await first;
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("PRIVATE_PROVIDER_TEXT");
    expect(f.read.mock.calls[0]?.[2].aborted).toBe(true);
    expect((await f.request()).statusCode).toBe(200);
  });
  it("refuse les bulletins périmés et d'une autre ville", async () => {
    const f = await fixture();
    const data = normalizeWeather(forecastFixture(), null, weatherCities[0], weatherFixtureNow);
    f.read.mockResolvedValueOnce({ ...data, cityId: "paris" });
    expect((await f.request()).statusCode).toBe(503);
    f.read.mockResolvedValueOnce({ ...data, expiresAt: weatherFixtureNow.toISOString() });
    expect((await f.request()).statusCode).toBe(503);
  });
  it("applique le quota même sur cache hit", async () => {
    const f = await fixture();
    for (let index = 0; index < 30; index++) expect((await f.request()).statusCode).toBe(200);
    expect((await f.request()).statusCode).toBe(429);
    expect(f.read).toHaveBeenCalledTimes(1);
  });
});

describe("Météo — intégration Identity réelle en base éphémère", () => {
  it("refuse anonyme/origine externe et revalide après verrouillage", async () => {
    const read = vi
      .spyOn(OpenMeteoAdapter.prototype, "read")
      .mockImplementation(async (city, now) => normalizeWeather(forecastFixture(), null, city, now));
    const app = await createApp({
      dataDir: "memory://",
      identityMode: "LOCAL_LOCK",
      weatherEnabled: true,
      now: () => new Date(weatherFixtureNow),
    });
    instances.push(app);
    const body = { cityId: "geneva", consent: true };
    expect((await app.inject({ method: "POST", url: "/v1/home/weather", payload: body })).statusCode).toBe(401);
    // Uniquement cette base memory:// de test, jamais le verrou de l'utilisateur.
    const setup = await app.inject({
      method: "POST",
      url: "/v1/auth/setup",
      payload: { passphrase: "Credential synthétique météo tests uniquement" },
    });
    expect(setup.statusCode).toBe(201);
    const cookie = String(setup.headers["set-cookie"]).split(";", 1)[0] ?? "";
    expect(
      (await app.inject({ method: "GET", url: "/v1/home/weather/status", headers: { cookie } })).json().data.enabled,
    ).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/home/weather",
          headers: { cookie, origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    const result = await app.inject({ method: "POST", url: "/v1/home/weather", headers: { cookie }, payload: body });
    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    await app.inject({ method: "POST", url: "/v1/auth/lock", headers: { cookie } });
    expect(
      (await app.inject({ method: "POST", url: "/v1/home/weather", headers: { cookie }, payload: body })).statusCode,
    ).toBe(401);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
