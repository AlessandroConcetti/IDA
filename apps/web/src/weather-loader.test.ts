import { describe, expect, it, vi } from "vitest";
import { type WeatherBulletin, weatherCities } from "../../../packages/contracts/src/weather";
import { normalizeWeather } from "../../api/src/weather-adapter";
import { forecastFixture, weatherFixtureNow } from "../../api/src/weather-fixture";
import { createWeatherLoader, WeatherLoadError, weatherLoadMessage } from "./weather-loader";

const city = weatherCities[1];
const bulletin = () => normalizeWeather(forecastFixture(), null, city, weatherFixtureNow);
const signal = () => new AbortController().signal;
function fixture(response = bulletin()) {
  const cache = new Map<string, WeatherBulletin>();
  const request = vi.fn(
    async (path: string, _init?: RequestInit): Promise<unknown> =>
      path.endsWith("/status") ? { data: { enabled: true } } : { data: response },
  );
  const remember = vi.fn((data: WeatherBulletin) => cache.set(data.cityId, data));
  const loader = createWeatherLoader({
    request,
    cached: (cityId) => cache.get(cityId),
    remember,
    now: () => weatherFixtureNow.getTime(),
  });
  return { loader, request, cache, remember };
}
function deferred() {
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Chargement météo partagé Hub / outil météo", () => {
  it("réutilise un bulletin public encore valide sans appel réseau", async () => {
    const f = fixture();
    f.cache.set(city.id, bulletin());
    expect(await f.loader.load(city.id, signal())).toEqual(bulletin());
    expect(f.request).not.toHaveBeenCalled();
  });

  it("vérifie l'activation puis envoie uniquement l'identifiant de ville et partage le cache", async () => {
    const f = fixture();
    expect(await f.loader.load(city.id, signal())).toEqual(bulletin());
    expect(f.request).toHaveBeenCalledTimes(2);
    const [path, init] = f.request.mock.calls[1] ?? [];
    expect(path).toBe("/v1/home/weather");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ cityId: city.id });
    await f.loader.load(city.id, signal());
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.remember).toHaveBeenCalledOnce();
  });

  it("Actualiser ignore le cache sans déclencher une boucle ou une requête supplémentaire", async () => {
    const f = fixture();
    f.cache.set(city.id, bulletin());
    await f.loader.load(city.id, signal(), true);
    await Promise.resolve();
    expect(f.request).toHaveBeenCalledTimes(2);
  });

  it("remplace un cache expiré et isole chaque ville", async () => {
    const f = fixture();
    f.cache.set(city.id, { ...bulletin(), expiresAt: weatherFixtureNow.toISOString() });
    f.request.mockImplementation(async (path, init) =>
      path.endsWith("/status")
        ? { data: { enabled: true } }
        : { data: { ...bulletin(), cityId: JSON.parse(String(init?.body)).cityId } },
    );
    await f.loader.load(city.id, signal());
    await f.loader.load(weatherCities[0].id, signal());
    expect(f.request).toHaveBeenCalledTimes(4);
    expect(f.cache.get(city.id)?.cityId).toBe(city.id);
    expect(f.cache.get(weatherCities[0].id)?.cityId).toBe(weatherCities[0].id);
  });

  it("refuse le service désactivé et n'appelle aucun fournisseur", async () => {
    const f = fixture();
    f.request.mockResolvedValue({ data: { enabled: false } });
    await expect(f.loader.load(city.id, signal())).rejects.toMatchObject({ disabled: true });
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(f.remember).not.toHaveBeenCalled();
  });

  it("échoue fermé si le statut ne contient pas un booléen enabled", async () => {
    const f = fixture();
    f.request.mockResolvedValue({ data: { enabled: "true" } });
    await expect(f.loader.load(city.id, signal())).rejects.toThrow("Statut météo indisponible");
    expect(f.request).toHaveBeenCalledTimes(1);
  });

  it("déduplique deux consommateurs simultanés et n'annule pas celui qui reste visible", async () => {
    const f = fixture();
    const delayed = deferred();
    f.request.mockImplementation(async (path) =>
      path.endsWith("/status") ? { data: { enabled: true } } : delayed.promise,
    );
    const first = new AbortController();
    const second = new AbortController();
    const firstRead = f.loader.load(city.id, first.signal);
    const secondRead = f.loader.load(city.id, second.signal);
    const cancelled = expect(firstRead).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    first.abort();
    await cancelled;
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.request.mock.calls[1]?.[1]?.signal?.aborted).toBe(false);
    delayed.resolve({ data: bulletin() });
    expect(await secondRead).toEqual(bulletin());
    expect(f.remember).toHaveBeenCalledOnce();
  });

  it("annule le transport quand le dernier consommateur part et ignore une réponse tardive", async () => {
    const f = fixture();
    const delayed = deferred();
    f.request.mockImplementation(async (path) =>
      path.endsWith("/status") ? { data: { enabled: true } } : delayed.promise,
    );
    const controller = new AbortController();
    const read = f.loader.load(city.id, controller.signal);
    const cancelled = expect(read).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await cancelled;
    expect(f.request.mock.calls[1]?.[1]?.signal?.aborted).toBe(true);
    delayed.resolve({ data: bulletin() });
    await Promise.resolve();
    await Promise.resolve();
    expect(f.remember).not.toHaveBeenCalled();
  });

  it("invalide les lectures en cours lors d'un changement de workspace", async () => {
    const f = fixture();
    const delayed = deferred();
    f.request.mockImplementation(async () => delayed.promise);
    const read = f.loader.load(city.id, signal());
    const cancelled = expect(read).rejects.toMatchObject({ name: "AbortError" });
    f.loader.cancelAll();
    delayed.resolve({ data: { enabled: true } });
    await cancelled;
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(f.remember).not.toHaveBeenCalled();
  });

  it("ne lance rien pour un consommateur déjà annulé", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(f.loader.load(city.id, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.request).not.toHaveBeenCalled();
  });

  it("une ancienne réponse annulée ne retire pas une nouvelle lecture de la déduplication", async () => {
    const f = fixture();
    const oldStatus = deferred();
    const newStatus = deferred();
    f.request.mockImplementationOnce(async () => oldStatus.promise);
    f.request.mockImplementationOnce(async () => newStatus.promise);
    const first = new AbortController();
    const oldRead = f.loader.load(city.id, first.signal);
    const cancelled = expect(oldRead).rejects.toMatchObject({ name: "AbortError" });
    first.abort();
    await cancelled;
    const newRead = f.loader.load(city.id, signal());
    oldStatus.resolve({ data: { enabled: true } });
    await Promise.resolve();
    await Promise.resolve();
    const joined = f.loader.load(city.id, signal());
    newStatus.resolve({ data: { enabled: true } });
    expect(await newRead).toEqual(bulletin());
    expect(await joined).toEqual(bulletin());
    expect(f.request).toHaveBeenCalledTimes(3);
  });

  it("ne réessaie jamais automatiquement après une erreur", async () => {
    const f = fixture();
    f.request.mockRejectedValue(new Error("offline"));
    await expect(f.loader.load(city.id, signal())).rejects.toThrow("offline");
    await Promise.resolve();
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(weatherLoadMessage(new Error("untrusted response"))).toBe("Météo indisponible · réessayez avec Actualiser.");
    expect(weatherLoadMessage(new WeatherLoadError("Service indisponible"))).toBe("Service indisponible");
  });

  it.each(["expired", "future", "wrong-city", "malformed"])(
    "refuse un bulletin %s sans l'enregistrer",
    async (variant) => {
      const f = fixture();
      const data = {
        ...bulletin(),
        ...(variant === "expired" ? { expiresAt: weatherFixtureNow.toISOString() } : {}),
        ...(variant === "future" ? { fetchedAt: new Date(weatherFixtureNow.getTime() + 120_000).toISOString() } : {}),
        ...(variant === "wrong-city" ? { cityId: weatherCities[0].id } : {}),
        ...(variant === "malformed" ? { current: null } : {}),
      };
      f.request.mockImplementation(async (path) => (path.endsWith("/status") ? { data: { enabled: true } } : { data }));
      await expect(f.loader.load(city.id, signal())).rejects.toThrow("Bulletin météo incomplet ou expiré");
      expect(f.remember).not.toHaveBeenCalled();
    },
  );
});
