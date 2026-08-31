import type { ArtistBrain, MediaAsset, OperationalState, SystemService, Track } from "./data";

export interface IdaCommandResult {
  message: string;
  commandRunId?: string;
  state?: string;
}

export interface DashboardSnapshot {
  systemServices: SystemService[];
  tracks: Track[];
  mediaAssets: MediaAsset[];
}

export interface TrackCreateInput {
  title: string;
  artistCredit: string;
  genre?: string;
  bpm?: number;
  musicalKey?: string;
  releaseDate?: string;
  label?: string;
  status: Track["status"];
  tags?: string[];
  description?: string;
}

export type MemoryCategory =
  | "ARTIST_MEMORY"
  | "CONTENT_MEMORY"
  | "CAMPAIGN_MEMORY"
  | "SOCIAL_MEMORY"
  | "PREFERENCE_MEMORY"
  | "SYSTEM_MEMORY";

export type MemoryState = "PENDING" | "CONFIRMED" | "REJECTED";

export interface MemoryRecord {
  id: string;
  category: MemoryCategory;
  content: string;
  state: MemoryState;
  createdAt: string;
  updatedAt: string;
}

export interface MediaUploadInput {
  file: File;
  description?: string;
  tags?: string;
}

export class IdaApiError extends Error {
  public readonly status?: number;

  public constructor(message: string, status?: number) {
    super(message);
    this.name = "IdaApiError";
    this.status = status;
  }
}

const configuredApiUrl = import.meta.env.VITE_IDA_API_URL?.trim() ?? "";

// An empty base URL deliberately targets the shared API on the current origin.
// `VITE_IDA_API_URL` is only needed when web and API use separate origins.
export const apiBaseUrl = configuredApiUrl.replace(/\/+$/, "");
export const isApiConfigured = true;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `ida-web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractResult(payload: unknown): IdaCommandResult {
  const envelope = isRecord(payload) ? payload : {};
  const data = isRecord(envelope.data) ? envelope.data : envelope;
  const message = readString(data.message, data.response, data.summary, envelope.message);

  return {
    message: message ?? "IDA a reçu la commande. Le résultat détaillé sera disponible dans l’historique.",
    commandRunId: readString(data.commandRunId, envelope.commandRunId),
    state: readString(data.state, envelope.state),
  };
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const data = isRecord(payload.data) ? payload.data : {};
    const error = isRecord(payload.error) ? payload.error : {};
    const detail = readString(payload.detail, payload.message, data.detail, data.message, error.detail, error.message);

    if (detail) {
      return detail;
    }
  }

  return `IDA API a répondu avec le statut ${status}.`;
}

export async function submitIdaCommand(text: string): Promise<IdaCommandResult> {
  return extractResult(
    await postApiJson("/v1/ida/commands", {
      message: text,
      source: "web",
    }),
  );
}

async function postApiJson(path: string, body?: unknown): Promise<unknown> {
  if (!isApiConfigured) {
    throw new IdaApiError("VITE_IDA_API_URL n’est pas configurée.");
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        Accept: "application/json",
        "X-Request-Id": createRequestId(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new IdaApiError("IDA API est indisponible.");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new IdaApiError(extractErrorMessage(payload, response.status), response.status);
  }

  return payload;
}

async function postApiFormData(path: string, body: FormData): Promise<unknown> {
  if (!isApiConfigured) {
    throw new IdaApiError("VITE_IDA_API_URL n’est pas configurée.");
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Request-Id": createRequestId(),
      },
      body,
    });
  } catch {
    throw new IdaApiError("IDA API est indisponible.");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new IdaApiError(extractErrorMessage(payload, response.status), response.status);
  }

  return payload;
}

async function getApiJson(path: string): Promise<unknown> {
  if (!isApiConfigured) {
    throw new IdaApiError("VITE_IDA_API_URL n’est pas configurée.");
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: {
        Accept: "application/json",
        "X-Request-Id": createRequestId(),
      },
    });
  } catch {
    throw new IdaApiError("IDA API est indisponible.");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new IdaApiError(extractErrorMessage(payload, response.status), response.status);
  }

  return payload;
}

async function patchApiJson(path: string, body: unknown): Promise<unknown> {
  if (!isApiConfigured) {
    throw new IdaApiError("VITE_IDA_API_URL n’est pas configurée.");
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Request-Id": createRequestId(),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new IdaApiError("IDA API est indisponible.");
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new IdaApiError(extractErrorMessage(payload, response.status), response.status);
  }

  return payload;
}

function readDataObject(payload: unknown, endpoint: string): Record<string, unknown> {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new IdaApiError(`La réponse ${endpoint} n’a pas le format attendu.`);
  }

  return payload.data;
}

function readDataObjectOrDirect(payload: unknown, endpoint: string): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new IdaApiError(`La réponse ${endpoint} n’a pas le format attendu.`);
  }

  if (isRecord(payload.data)) {
    return payload.data;
  }

  return payload;
}

function readDataList(payload: unknown, endpoint: string): Record<string, unknown>[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new IdaApiError(`La réponse ${endpoint} n’a pas le format attendu.`);
  }

  return payload.data.filter(isRecord);
}

function operationalState(value: unknown): OperationalState {
  if (value === "ONLINE" || value === "WARNING" || value === "ERROR" || value === "DISCONNECTED") {
    return value;
  }

  return "WARNING";
}

function trackStatus(value: unknown): Track["status"] {
  if (
    value === "DEMO" ||
    value === "UNRELEASED" ||
    value === "SCHEDULED" ||
    value === "RELEASED" ||
    value === "ARCHIVED"
  ) {
    return value;
  }

  return "DEMO";
}

function mediaStatus(value: unknown): MediaAsset["status"] {
  if (
    value === "UNUSED" ||
    value === "USED" ||
    value === "SCHEDULED" ||
    value === "PUBLISHED" ||
    value === "ARCHIVED"
  ) {
    return value;
  }

  return "UNUSED";
}

function mediaKind(value: unknown): MediaAsset["kind"] {
  if (value === "VIDEO" || value === "IMAGE" || value === "AUDIO") {
    return value;
  }

  return "FILE";
}

function memoryCategory(value: unknown): MemoryCategory {
  if (
    value === "ARTIST_MEMORY" ||
    value === "CONTENT_MEMORY" ||
    value === "CAMPAIGN_MEMORY" ||
    value === "SOCIAL_MEMORY" ||
    value === "PREFERENCE_MEMORY" ||
    value === "SYSTEM_MEMORY"
  ) {
    return value;
  }

  throw new IdaApiError("La catégorie de mémoire retournée par IDA API est invalide.");
}

function memoryState(value: unknown): MemoryState {
  if (value === "PENDING" || value === "CONFIRMED" || value === "REJECTED") {
    return value;
  }

  throw new IdaApiError("L’état de mémoire retourné par IDA API est invalide.");
}

function displaySystemName(component: unknown): string {
  const labels: Record<string, string> = {
    AI: "AI",
    DATABASE: "Database",
    STORAGE: "Storage",
    SOCIAL_ACCOUNTS: "Social accounts",
    SCHEDULER: "Scheduler",
    NOTIFICATIONS: "Notifications",
  };
  const key = readString(component);

  return key ? (labels[key] ?? key) : "System";
}

function toSystemServices(payload: unknown): SystemService[] {
  const records = readDataList(payload, "/v1/system/status");

  if (records.length === 0) {
    throw new IdaApiError("IDA API ne retourne aucun état système.");
  }

  return records.map((record) => ({
    name: displaySystemName(record.component),
    state: operationalState(record.state),
    detail: readString(record.message) ?? "État rapporté par IDA API",
  }));
}

function toArtistBrain(payload: unknown): ArtistBrain {
  const profile = readDataObject(payload, "/v1/artist-profile");

  return {
    identity: readString(profile.identity) ?? "Identité artistique à préciser.",
    genres: readStringArray(profile.genres),
    influences: readStringArray(profile.influences),
    tone: readString(profile.tone) ?? "Ton éditorial à préciser.",
    preferredVocabulary: readStringArray(profile.preferredVocabulary),
    forbiddenVocabulary: readStringArray(profile.forbiddenVocabulary),
    goals: readStringArray(profile.goals),
    audience: readString(profile.audience) ?? "Audience à préciser.",
    platformPreferences: readRecord(profile.platformPreferences),
  };
}

export async function fetchArtistBrain(): Promise<ArtistBrain> {
  return toArtistBrain(await getApiJson("/v1/artist-profile"));
}

export async function updateArtistBrain(profile: ArtistBrain): Promise<ArtistBrain> {
  return toArtistBrain(await patchApiJson("/v1/artist-profile", profile));
}

function toMemory(record: Record<string, unknown>): MemoryRecord {
  const id = readString(record.id);
  const content = readString(record.content);
  const createdAt = readString(record.createdAt);
  const updatedAt = readString(record.updatedAt);

  if (!id || !content || !createdAt || !updatedAt) {
    throw new IdaApiError("La réponse mémoire d’IDA API n’a pas le format attendu.");
  }

  return {
    id,
    category: memoryCategory(record.category),
    content,
    state: memoryState(record.state),
    createdAt,
    updatedAt,
  };
}

export async function fetchMemories(): Promise<MemoryRecord[]> {
  return readDataList(await getApiJson("/v1/memories"), "/v1/memories").map(toMemory);
}

export async function proposePreferenceMemory(content: string): Promise<MemoryRecord> {
  const payload = await postApiJson("/v1/memories/proposals", { content });

  return toMemory(readDataObjectOrDirect(payload, "/v1/memories/proposals"));
}

export async function confirmMemory(memoryId: string): Promise<MemoryRecord> {
  const payload = await postApiJson(`/v1/memories/${encodeURIComponent(memoryId)}/confirm`);

  return toMemory(readDataObjectOrDirect(payload, "/v1/memories/:id/confirm"));
}

export async function rejectMemory(memoryId: string): Promise<MemoryRecord> {
  const payload = await postApiJson(`/v1/memories/${encodeURIComponent(memoryId)}/reject`);

  return toMemory(readDataObjectOrDirect(payload, "/v1/memories/:id/reject"));
}

function toTrack(record: Record<string, unknown>): Track {
  const status = trackStatus(record.status);
  const releaseDate = readString(record.releaseDate);
  const bpm = readNumber(record.bpm);

  return {
    title: readString(record.title) ?? "Untitled track",
    project: readString(record.label, record.artistCredit, record.genre) ?? "Artist workspace",
    status,
    bpm,
    key: readString(record.musicalKey) ?? "Key not set",
    freshness: releaseDate ? `Release ${releaseDate}` : status === "RELEASED" ? "Released catalogue" : "API track",
  };
}

function toTracks(payload: unknown): Track[] {
  return readDataList(payload, "/v1/tracks").map(toTrack);
}

export async function createTrack(input: TrackCreateInput): Promise<Track> {
  const payload = await postApiJson("/v1/tracks", input);

  return toTrack(readDataObjectOrDirect(payload, "/v1/tracks"));
}

function formatFileSize(value: unknown): string | undefined {
  const bytes = readNumber(value);

  if (bytes === undefined || bytes < 0) {
    return undefined;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toMediaAsset(record: Record<string, unknown>, index = 0): MediaAsset {
  const tones: MediaAsset["tone"][] = ["violet", "blue", "coral"];

  const description = readString(record.description);
  const tags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
    : [];
  const usageCount = readNumber(record.usageCount) ?? 0;
  const size = formatFileSize(record.size);
  const detail =
    description ??
    (tags.length > 0 ? tags.join(" · ") : (size ?? `${usageCount} utilisation${usageCount === 1 ? "" : "s"}`));

  return {
    id: readString(record.id),
    filename: readString(record.filename) ?? "untitled-asset",
    kind: mediaKind(record.type),
    status: mediaStatus(record.status),
    detail,
    tone: tones[index % tones.length] ?? "violet",
  };
}

function toMediaAssets(payload: unknown): MediaAsset[] {
  return readDataList(payload, "/v1/media").map(toMediaAsset);
}

export async function uploadMediaAsset(input: MediaUploadInput): Promise<MediaAsset> {
  const body = new FormData();
  body.append("file", input.file, input.file.name);

  if (input.description) {
    body.append("description", input.description);
  }

  if (input.tags) {
    body.append("tags", input.tags);
  }

  const payload = await postApiFormData("/v1/media", body);

  return toMediaAsset(readDataObjectOrDirect(payload, "/v1/media"));
}

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [systemPayload, tracksPayload, mediaPayload] = await Promise.all([
    getApiJson("/v1/system/status"),
    getApiJson("/v1/tracks"),
    getApiJson("/v1/media"),
  ]);

  return {
    systemServices: toSystemServices(systemPayload),
    tracks: toTracks(tracksPayload),
    mediaAssets: toMediaAssets(mediaPayload),
  };
}
