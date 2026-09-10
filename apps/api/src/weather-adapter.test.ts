import { weatherCities, weatherReadSchema } from "@ida/contracts/weather";
import { describe, expect, it, vi } from "vitest";
import { normalizeWeather, readWeatherJson } from "./weather-adapter.js";
import { airFixture, forecastFixture, weatherFixtureNow } from "./weather-fixture.js";

describe("Météo — contrat et adapter borné", () => {
  it("normalise unités, UTC et dates locales sans conserver les champs externes", () => {
    const data = normalizeWeather(
      { ...forecastFixture(), injected: "UNTRUSTED_TEXT" },
      airFixture(),
      weatherCities[0],
      weatherFixtureNow,
    );
    expect(data.current.temperature).toBe(17);
    expect(data.daily[0]?.date).toBe("2026-09-10");
    expect(data.current.at).toBe("2026-09-10T08:15:00.000Z");
    expect(data.expiresAt).toBe("2026-09-10T08:25:00.000Z");
    expect(data.air?.europeanAqi).toBe(25);
    expect(JSON.stringify(data)).not.toContain("UNTRUSTED_TEXT");
  });
  it("conserve les valeurs null comme inconnues et isole l'échec air", () => {
    const raw = forecastFixture();
    const data = normalizeWeather(
      { ...raw, current: { ...raw.current, temperature_2m: null } },
      { bad: true },
      weatherCities[0],
      weatherFixtureNow,
    );
    expect(data.current.temperature).toBeNull();
    expect(data.air).toBeNull();
  });
  it("rejette unités incorrectes, tableaux désalignés, mesures hors bornes et bulletin périmé", () => {
    const a = forecastFixture();
    a.current_units.temperature_2m = "°F";
    const b = forecastFixture();
    b.hourly.temperature_2m.pop();
    const c = forecastFixture();
    c.current.relative_humidity_2m = 999;
    const d = forecastFixture();
    d.current.time -= 86400;
    for (const raw of [a, b, c, d])
      expect(() => normalizeWeather(raw, null, weatherCities[0], weatherFixtureNow)).toThrow();
  });
  it("rejette ville libre, absence de consentement, URL, workspace et coordonnées", () => {
    for (const raw of [
      { cityId: "geneva" },
      { cityId: "geneva", consent: false },
      { cityId: "anything", consent: true },
      { cityId: "geneva", consent: true, url: "http://127.0.0.1" },
      { cityId: "geneva", consent: true, workspaceId: "another" },
      { cityId: "geneva", consent: true, latitude: 46 },
    ])
      expect(weatherReadSchema.safeParse(raw).success).toBe(false);
    expect(weatherReadSchema.safeParse({ cityId: "geneva", consent: true }).success).toBe(true);
  });
  it("refuse une destination non approuvée avant fetch", async () => {
    const fetcher = vi.fn();
    for (const url of [
      "http://api.open-meteo.com/v1/forecast",
      "https://api.open-meteo.com.evil.test/v1/forecast",
      "https://user:secret@api.open-meteo.com/v1/forecast",
      "https://api.open-meteo.com/other",
    ])
      await expect(readWeatherJson(new URL(url), AbortSignal.timeout(1000), fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("utilise GET sans credentials et refuse les redirections", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response('{"ok":true}', { headers: { "content-type": "application/json" } }));
    await expect(
      readWeatherJson(new URL("https://api.open-meteo.com/v1/forecast"), AbortSignal.timeout(1000), fetcher),
    ).resolves.toEqual({ ok: true });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", credentials: "omit", redirect: "error" });
  });
  it("rejette HTML, erreurs HTTP et tailles excessives avec ou sans Content-Length", async () => {
    for (const response of [
      new Response("<html/>", { headers: { "content-type": "text/html" } }),
      new Response("provider internal", { status: 500 }),
      new Response("{}", { headers: { "content-type": "application/json", "content-length": "999999" } }),
      new Response("a".repeat(128 * 1024 + 1), { headers: { "content-type": "application/json" } }),
    ]) {
      await expect(
        readWeatherJson(
          new URL("https://api.open-meteo.com/v1/forecast"),
          AbortSignal.timeout(1000),
          vi.fn().mockResolvedValue(response),
        ),
      ).rejects.toThrow();
    }
  });
});
