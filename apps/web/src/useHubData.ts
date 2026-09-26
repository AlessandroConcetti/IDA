import { useCallback, useEffect, useRef, useState } from "react";
import { homeDeviceResultSchema, homeDeviceStatusSchema } from "../../../packages/contracts/src/home-device";
import { weatherCities } from "../../../packages/contracts/src/weather";
import { onWorkspaceInvalidated, requestApi } from "./api-transport";
import {
  type HubData,
  type HubSection,
  hubAgendaSection,
  hubHomeSummary,
  hubMessagesSection,
  hubReady,
  hubUnavailable,
  hubWeatherSummary,
  initialHubData,
  parseHubActivity,
  parseHubApprovals,
  parseHubMusic,
} from "./hub-data";
import { createWorkspaceReadRequest, parseWorkspaceReadStatus } from "./mcp-tools-panel";
import { loadWeatherBulletin, weatherLoadMessage } from "./weather-loader";

const post = (body: unknown, signal: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});
function envelope(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || !("data" in payload)) throw new Error("Invalid response");
  return payload.data;
}

/** Session-memory projections. No provider polling, durable private cache, model invocation or device command. */
export function useHubData() {
  const [data, setData] = useState<HubData>(initialHubData);
  const [refreshing, setRefreshing] = useState(false);
  const active = useRef(false);
  const pending = useRef<AbortController | null>(null);

  const load = useCallback(async (connected = false) => {
    if (!active.current || document.hidden || pending.current) return;
    const controller = new AbortController();
    const signal = controller.signal;
    pending.current = controller;
    setRefreshing(true);
    const current = () => active.current && !signal.aborted && pending.current === controller;
    const write = <K extends keyof HubData>(key: K, value: HubData[K]) => {
      if (current()) setData((previous) => ({ ...previous, [key]: value }));
    };
    async function read<K extends keyof HubData>(key: K, loader: () => Promise<HubData[K]>) {
      write(key, { state: "loading", data: null } as HubData[K]);
      try {
        write(key, await loader());
      } catch {
        write(key, hubUnavailable("Lecture indisponible · réessayez depuis le menu du Hub.") as HubData[K]);
      }
    }
    const city = weatherCities[1];
    try {
      await Promise.allSettled([
        read("weather", async () => {
          try {
            return hubWeatherSummary(await loadWeatherBulletin(city.id, signal), city.name);
          } catch (error) {
            return hubUnavailable(weatherLoadMessage(error));
          }
        }),
        read("music", async () => {
          const item = parseHubMusic(await requestApi("/v1/tracks", { signal }));
          return item ? hubReady(item) : { state: "empty", data: null, notice: "Aucun projet musical disponible." };
        }),
        read("approvals", async () => hubReady(parseHubApprovals(await requestApi("/v1/approvals/queue", { signal })))),
        read("activity", async () =>
          hubReady(parseHubActivity(await requestApi("/v1/activity-logs?limit=4", { signal }))),
        ),
        read("home", async () => {
          const status = homeDeviceStatusSchema.parse(envelope(await requestApi("/v1/home/device/status", { signal })));
          if (!connected || status.state !== "CONFIGURED") return hubHomeSummary(status);
          signal.throwIfAborted();
          const observation = homeDeviceResultSchema.parse(
            envelope(await requestApi("/v1/home/device/read", post({ consent: true }, signal), false, 16_000)),
          );
          return hubHomeSummary(status, observation);
        }),
        ...(connected
          ? [
              (async () => {
                write("agenda", { state: "loading", data: null });
                write("messages", { state: "loading", data: null });
                try {
                  const status = parseWorkspaceReadStatus(await requestApi("/v1/mcp/integrations/status", { signal }));
                  if (!current()) return;
                  const readTool = async (key: "agenda" | "messages", tool: "CALENDAR_READ" | "EMAIL_READ") => {
                    if (status.state !== "CONFIGURED" || !status.tools.includes(tool)) {
                      write(key, hubUnavailable("Connexion à configurer dans IDA."));
                      return;
                    }
                    await read(key, async () => {
                      const input = createWorkspaceReadRequest(tool);
                      const payload = await requestApi("/v1/mcp/integrations/call", post(input, signal), false, 18_000);
                      return key === "agenda" ? hubAgendaSection(payload) : hubMessagesSection(payload);
                    });
                  };
                  // The Tool Gateway can serialize reads; avoid making its two tools contend.
                  await readTool("agenda", "CALENDAR_READ");
                  if (current()) await readTool("messages", "EMAIL_READ");
                } catch {
                  write("agenda", hubUnavailable("Calendrier indisponible · vérifier les connexions."));
                  write("messages", hubUnavailable("Courrier indisponible · vérifier les connexions."));
                }
              })(),
            ]
          : []),
      ]);
    } finally {
      if (current()) {
        pending.current = null;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    active.current = true;
    const clear = () => {
      pending.current?.abort();
      pending.current = null;
      if (!active.current) return;
      setRefreshing(false);
      setData(() => {
        const initial = initialHubData();
        for (const key of Object.keys(initial) as (keyof HubData)[]) {
          if (initial[key].state === "loading")
            initial[key] = hubUnavailable("Revenez dans IDA pour actualiser.") as HubSection<never>;
        }
        return initial;
      });
    };
    const visibility = () => {
      if (document.hidden) clear();
      else void load();
    };
    const unsubscribe = onWorkspaceInvalidated(clear);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", clear);
    void load();
    return () => {
      active.current = false;
      pending.current?.abort();
      pending.current = null;
      unsubscribe();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", clear);
    };
  }, [load]);

  // Expired observations disappear without making fresh network requests.
  useEffect(() => {
    const expiries = [
      data.weather.data ? Date.parse(data.weather.data.expiresAt) : Number.NaN,
      data.home.data?.observedAt ? Date.parse(data.home.data.observedAt) + 60_000 : Number.NaN,
      data.agenda.validUntil ?? Number.NaN,
    ].filter(Number.isFinite);
    if (!expiries.length) return;
    const timer = window.setTimeout(
      () =>
        setData((previous) => {
          const now = Date.now();
          return {
            ...previous,
            weather:
              previous.weather.data && Date.parse(previous.weather.data.expiresAt) <= now
                ? hubUnavailable("Bulletin expiré · actualisez dans Météo.")
                : previous.weather,
            home:
              previous.home.data?.observedAt && Date.parse(previous.home.data.observedAt) + 60_000 <= now
                ? hubUnavailable("Observation expirée · relisez vos connexions.")
                : previous.home,
            agenda:
              previous.agenda.validUntil !== undefined && previous.agenda.validUntil <= now
                ? hubUnavailable("Nouvelle journée · relisez vos connexions pour actualiser l’agenda.")
                : previous.agenda,
          };
        }),
      Math.max(1, Math.min(...expiries) - Date.now() + 10),
    );
    return () => window.clearTimeout(timer);
  }, [data.weather.data, data.home.data, data.agenda.validUntil]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);
  const readConnectedSources = useCallback(() => {
    void load(true);
  }, [load]);
  return { data, refreshing, refresh, readConnectedSources };
}
