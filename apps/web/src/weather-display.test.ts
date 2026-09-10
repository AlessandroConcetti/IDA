import { describe, expect, it } from "vitest";
import { weatherCities } from "../../../packages/contracts/src/weather";
import { normalizeWeather } from "../../api/src/weather-adapter";
import { forecastFixture, weatherFixtureNow } from "../../api/src/weather-fixture";
import { aqiLabel, bulletinIsCurrent, weatherLabel, weatherNumber, weatherTime, windCompass } from "./weather-display";

describe("Affichage météo fiable", () => {
  it("ne convertit jamais une valeur inconnue en zéro ou en ciel dégagé", () => {
    expect(weatherNumber(null, "°")).toBe("—");
    expect(weatherNumber(0, "°")).toBe("0°");
    expect(weatherLabel(null)).toBe("Conditions non renseignées");
    expect(weatherLabel(99)).toBe("Orage");
    expect(aqiLabel(undefined)).toBe("Non disponible");
  });
  it("respecte les bornes de l'indice européen", () => {
    expect(aqiLabel(20)).toBe("Bonne");
    expect(aqiLabel(21)).toBe("Correcte");
    expect(aqiLabel(101)).toBe("Extrêmement mauvaise");
  });
  it("formate dans le fuseau de la ville, pas celui de l'appareil", () => {
    expect(weatherTime("2026-09-10T08:00:00Z", "Asia/Tokyo")).toBe("17:00");
    expect(windCompass(360)).toBe("N");
    expect(windCompass(null)).toBe("—");
  });
  it("masque un bulletin expiré et refuse les dates futures", () => {
    const data = normalizeWeather(forecastFixture(), null, weatherCities[0], weatherFixtureNow);
    expect(bulletinIsCurrent(data, weatherFixtureNow.getTime())).toBe(true);
    expect(bulletinIsCurrent(data, Date.parse(data.expiresAt))).toBe(false);
    expect(bulletinIsCurrent(data, weatherFixtureNow.getTime() - 120_000)).toBe(false);
  });
});
