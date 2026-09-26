import {
  activityLogListResponseSchema,
  approvalQueueItemSchema,
  calendarItemSchema,
  calendarRangeSchema,
  trackSchema,
} from "@ida/contracts";
import { z } from "zod";
import type { HomeDeviceResult, HomeDeviceStatus } from "../../../packages/contracts/src/home-device";
import type { WeatherBulletin } from "../../../packages/contracts/src/weather";
import { calendarDateKey } from "./calendar-layout";
import { homeActivityLabel } from "./home-overview";
import { createWorkspaceReadRequest, parseWorkspaceReadResult } from "./mcp-tools-panel";
import { bulletinIsCurrent, weatherLabel } from "./weather-display";

export type HubSection<T> = {
  state: "loading" | "ready" | "empty" | "unavailable";
  data: T | null;
  notice?: string;
  validUntil?: number;
};
export type HubAgendaEntry = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  detail: string;
  timezone: string;
  color: "blue" | "mint" | "amber" | "violet";
};
export type HubMessage = { id: string; title: string; detail: string; preview?: string };
export type HubHomeSummary = {
  configured: boolean;
  label: string;
  lightsOn: number | null;
  lightsTotal: number | null;
  temperature: null;
  security: null;
  observedAt: string | null;
};
export type HubWeatherSummary = {
  temperatureC: number | null;
  description: string;
  location: string;
  code: number | null;
  fetchedAt: string;
  expiresAt: string;
};
export type HubMusic = { id: string; title: string; detail: string; status: string };
export type HubApproval = {
  id: string;
  title: string;
  detail: string;
  variantId: string;
  approvalId: string;
  payloadHash: string;
  state: "REQUESTED";
};
export type HubActivity = { id: string; title: string; detail: string; createdAt: string };
export type HubData = {
  agenda: HubSection<HubAgendaEntry[]>;
  messages: HubSection<HubMessage[]>;
  home: HubSection<HubHomeSummary>;
  weather: HubSection<HubWeatherSummary>;
  music: HubSection<HubMusic>;
  approvals: HubSection<HubApproval[]>;
  activity: HubSection<HubActivity[]>;
};

export function hubUnavailable<T>(notice: string): HubSection<T> {
  return { state: "unavailable", data: null, notice };
}
export function hubReady<T>(data: T, notice?: string): HubSection<T> {
  return { state: Array.isArray(data) && data.length === 0 ? "empty" : "ready", data, ...(notice ? { notice } : {}) };
}
export function initialHubData(): HubData {
  return {
    agenda: hubUnavailable("Lisez vos connexions pour afficher votre journée."),
    messages: hubUnavailable("Lisez vos connexions pour afficher les derniers messages."),
    home: hubUnavailable("Consultez votre connexion Home Assistant."),
    weather: hubUnavailable("Ouvrez la météo pour charger votre bulletin."),
    music: { state: "loading", data: null },
    approvals: { state: "loading", data: null },
    activity: { state: "loading", data: null },
  };
}

/** Display masking only: the real session projection remains owned by the hook. */
export function redactedHubData(): HubData {
  const mask = () => hubUnavailable<never>("Détails masqués dans ce tableau.");
  return {
    agenda: mask(),
    messages: mask(),
    home: mask(),
    weather: mask(),
    music: mask(),
    approvals: mask(),
    activity: mask(),
  };
}

/** Next civil day boundary in the workspace, including 23/25-hour DST days. */
export function hubNextDayBoundary(now: number, timezone: string): number {
  const today = calendarDateKey(now, timezone);
  if (!today) return now;
  let left = Math.floor(now);
  let right = left + 36 * 60 * 60 * 1000;
  while (right - left > 1) {
    const middle = Math.floor((left + right) / 2);
    if (calendarDateKey(middle, timezone) === today) left = middle;
    else right = middle;
  }
  return right;
}

const externalEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.literal("google"),
  start: z.string(),
  end: z.string(),
  calendar: z.string(),
  location: z.string().optional(),
});
const calendarProjectionSchema = z.object({
  data: z.object({
    range: calendarRangeSchema,
    items: z.array(calendarItemSchema),
    externalEvents: z.array(externalEventSchema),
  }),
});

/** Display only today's real entries in the timezone returned by IDA, including overnight events. */
export function parseHubAgenda(payload: unknown, now = Date.now()): HubAgendaEntry[] {
  parseWorkspaceReadResult(payload, { tool: "CALENDAR_READ", view: "WEEK" });
  const { data } = calendarProjectionSchema.parse(payload);
  const timezone = data.range.timezone;
  const today = calendarDateKey(now, timezone);
  const entries: HubAgendaEntry[] = [
    ...data.items.map(
      (item): HubAgendaEntry => ({
        id: `ida:${item.id}`,
        title: item.postTitle,
        start: item.scheduledAt,
        end: null,
        detail: `IDA · ${item.platform}`,
        timezone,
        color: "blue",
      }),
    ),
    ...data.externalEvents.map(
      (item): HubAgendaEntry => ({
        id: `google:${item.id}`,
        title: item.title,
        start: item.start,
        end: item.end,
        detail: [item.calendar, item.location].filter(Boolean).join(" · "),
        timezone,
        color: "mint",
      }),
    ),
  ];
  return entries
    .filter((item) => {
      const startDay = calendarDateKey(item.start, timezone);
      const endDay = item.end ? calendarDateKey(Date.parse(item.end) - 1, timezone) : startDay;
      return (
        !!today &&
        !!startDay &&
        !!endDay &&
        (!item.end || Date.parse(item.end) > Date.parse(item.start)) &&
        startDay <= today &&
        endDay >= today
      );
    })
    .sort((left, right) => Date.parse(left.start) - Date.parse(right.start));
}

export function hubAgendaSection(payload: unknown, now = Date.now()): HubSection<HubAgendaEntry[]> {
  const entries = parseHubAgenda(payload, now);
  const { data } = calendarProjectionSchema.parse(payload);
  return {
    ...hubReady(entries, "Événements reçus pour aujourd’hui."),
    validUntil: hubNextDayBoundary(now, data.range.timezone),
  };
}

export function parseHubMessages(payload: unknown): HubMessage[] {
  const result = parseWorkspaceReadResult(payload, createWorkspaceReadRequest("EMAIL_READ"));
  return result.rows.slice(0, 20).map(({ id, title, detail, text }) => ({
    id,
    title,
    detail,
    ...(text.trim() ? { preview: text } : {}),
  }));
}

export function hubMessagesSection(payload: unknown): HubSection<HubMessage[]> {
  const result = parseWorkspaceReadResult(payload, createWorkspaceReadRequest("EMAIL_READ"));
  return hubReady(
    result.rows.slice(0, 20).map(({ id, title, detail, text }) => ({
      id,
      title,
      detail,
      ...(text.trim() ? { preview: text } : {}),
    })),
    result.source,
  );
}

export function parseHubApprovals(payload: unknown): HubApproval[] {
  const { data } = z.object({ data: z.array(approvalQueueItemSchema) }).parse(payload);
  return data.map((item) => ({
    id: item.approvalId,
    title: item.postTitle,
    detail: `${item.platform} · À examiner`,
    variantId: item.variantId,
    approvalId: item.approvalId,
    payloadHash: item.payloadHash,
    state: item.approvalState,
  }));
}

export function parseHubMusic(payload: unknown): HubMusic | null {
  const { data } = z.object({ data: z.array(trackSchema) }).parse(payload);
  const track = [...data]
    .filter((item) => item.status !== "ARCHIVED")
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  return track ? { id: track.id, title: track.title, detail: track.artistCredit, status: track.status } : null;
}

export function parseHubActivity(payload: unknown): HubActivity[] {
  return activityLogListResponseSchema.parse(payload).data.items.map((item) => ({
    id: item.id,
    title: homeActivityLabel(item.action),
    detail: "Journal IDA",
    createdAt: item.createdAt,
  }));
}

export function hubHomeSummary(
  status: HomeDeviceStatus,
  observation?: HomeDeviceResult,
  now = Date.now(),
): HubSection<HubHomeSummary> {
  if (status.state !== "CONFIGURED") return hubUnavailable("Home Assistant à connecter.");
  const fresh =
    observation &&
    Date.parse(observation.observedAt) <= now + 60_000 &&
    Date.parse(observation.observedAt) > now - 60_000;
  if (!fresh) return hubUnavailable("Connexion prête · lire l’appareil pour connaître son état.");
  const known = observation.state === "ON" || observation.state === "OFF";
  return {
    state: known ? "ready" : "unavailable",
    data: {
      configured: true,
      label: observation.state === "ON" ? "Allumée" : observation.state === "OFF" ? "Éteinte" : "—",
      lightsOn: known ? Number(observation.state === "ON") : null,
      lightsTotal: known ? 1 : null,
      temperature: null,
      security: null,
      observedAt: observation.observedAt,
    },
    notice: known ? "Lampe autorisée · observation ponctuelle" : "État de la lampe indisponible.",
  };
}

export function hubWeatherSummary(
  bulletin: WeatherBulletin | undefined,
  location: string,
  now = Date.now(),
): HubSection<HubWeatherSummary> {
  if (!bulletinIsCurrent(bulletin, now) || !bulletin)
    return hubUnavailable("Ouvrez la météo pour charger votre bulletin.");
  return hubReady({
    temperatureC: bulletin.current.temperature,
    description: weatherLabel(bulletin.current.code),
    location,
    code: bulletin.current.code,
    fetchedAt: bulletin.fetchedAt,
    expiresAt: bulletin.expiresAt,
  });
}
