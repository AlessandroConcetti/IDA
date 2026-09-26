import {
  type WeatherBulletin,
  type WeatherCity,
  weatherBulletinSchema,
  weatherCities,
} from "../../../packages/contracts/src/weather";
import { IdaApiError, onWorkspaceInvalidated, requestApi } from "./api-transport";
import { cachedWeather, rememberWeather } from "./assistant-reads";
import { bulletinIsCurrent } from "./weather-display";

export class WeatherLoadError extends Error {
  constructor(
    message: string,
    readonly disabled = false,
  ) {
    super(message);
    this.name = "WeatherLoadError";
  }
}

export function weatherLoadMessage(error: unknown): string {
  return error instanceof WeatherLoadError || error instanceof IdaApiError
    ? error.message
    : "Météo indisponible · réessayez avec Actualiser.";
}

type Dependencies = {
  request: typeof requestApi;
  cached: (cityId: string) => WeatherBulletin | undefined;
  remember: (bulletin: WeatherBulletin) => void;
  now: () => number;
};
type PendingWeather = {
  controller: AbortController;
  promise: Promise<WeatherBulletin>;
  consumers: Set<symbol>;
  settled: boolean;
};

/** Public city weather only. Shared requests are cancelled once their last visible consumer leaves. */
export function createWeatherLoader(deps: Dependencies) {
  const pending = new Map<string, PendingWeather>();

  function load(cityId: WeatherCity["id"], signal: AbortSignal, force = false): Promise<WeatherBulletin> {
    if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    if (!weatherCities.some((city) => city.id === cityId))
      return Promise.reject(new WeatherLoadError("Ville météo non disponible."));
    const cached = deps.cached(cityId);
    if (!force && bulletinIsCurrent(cached, deps.now())) return Promise.resolve(cached as WeatherBulletin);

    let task = pending.get(cityId);
    if (!task) {
      const controller = new AbortController();
      const read = async () => {
        const status = await deps.request("/v1/home/weather/status", { signal: controller.signal });
        controller.signal.throwIfAborted();
        if (
          !status ||
          typeof status !== "object" ||
          !("data" in status) ||
          !status.data ||
          typeof status.data !== "object" ||
          !("enabled" in status.data) ||
          typeof status.data.enabled !== "boolean"
        )
          throw new WeatherLoadError("Statut météo indisponible · réessayez avec Actualiser.");
        if (!status.data.enabled) throw new WeatherLoadError("Service météo désactivé dans IDA.", true);
        const payload = await deps.request(
          "/v1/home/weather",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cityId }),
            signal: controller.signal,
          },
          false,
          15_000,
        );
        controller.signal.throwIfAborted();
        const parsed = weatherBulletinSchema.safeParse(
          payload && typeof payload === "object" && "data" in payload ? payload.data : undefined,
        );
        if (!parsed.success || parsed.data.cityId !== cityId || !bulletinIsCurrent(parsed.data, deps.now()))
          throw new WeatherLoadError("Bulletin météo incomplet ou expiré · réessayez avec Actualiser.");
        deps.remember(parsed.data);
        return parsed.data;
      };
      task = { controller, promise: read(), consumers: new Set(), settled: false };
      pending.set(cityId, task);
      const created = task;
      const settle = () => {
        created.settled = true;
        if (pending.get(cityId) === created) pending.delete(cityId);
      };
      void task.promise.then(settle, settle);
    }
    const shared = task;
    const consumer = Symbol(cityId);
    shared.consumers.add(consumer);
    return new Promise<WeatherBulletin>((resolve, reject) => {
      const release = () => {
        signal.removeEventListener("abort", abort);
        shared.consumers.delete(consumer);
        if (!shared.settled && shared.consumers.size === 0) {
          shared.controller.abort();
          if (pending.get(cityId) === shared) pending.delete(cityId);
        }
      };
      const abort = () => {
        release();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", abort, { once: true });
      void shared.promise.then(
        (bulletin) => {
          release();
          if (!signal.aborted) resolve(bulletin);
        },
        (error: unknown) => {
          release();
          reject(error);
        },
      );
      if (signal.aborted) abort();
    });
  }

  function cancelAll() {
    for (const task of pending.values()) task.controller.abort();
    pending.clear();
  }
  return { load, cancelAll };
}

const weatherLoader = createWeatherLoader({
  request: requestApi,
  cached: cachedWeather,
  remember: rememberWeather,
  now: Date.now,
});
onWorkspaceInvalidated(weatherLoader.cancelAll);

export const loadWeatherBulletin = weatherLoader.load;
