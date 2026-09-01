import type { ArtistBrain, MediaAsset, OperationalState, SystemService, Track } from "./data";

export interface IdaCommandResult {
  message: string;
  commandRunId?: string;
  state?: string;
}

export interface IdaCommandRunRecord {
  id: string;
  intent: string;
  state: string;
  requestedPermission: string;
  message: string;
  responseMessage: string;
  createdAt: string;
}

export interface IdaCommandRunPage {
  items: IdaCommandRunRecord[];
  nextCursor?: string;
}

export interface IdaCommandRunListInput {
  limit?: number;
  cursor?: string;
}

export interface DashboardSnapshot {
  systemServices: SystemService[];
  tracks: Track[];
  mediaAssets: MediaAsset[];
}

export interface ActivityLogRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

export interface ActivityLogPage {
  items: ActivityLogRecord[];
  nextCursor?: string;
}

export interface ActivityLogListInput {
  limit?: number;
  cursor?: string;
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

export type MediaSearchType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";

export interface MediaSearchInput {
  q?: string;
  status?: MediaAsset["status"];
  type?: MediaSearchType;
  tag?: string;
  limit?: number;
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

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  dueAt?: string;
  status: TaskStatus;
  completedAt?: string;
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  dueAt?: string;
}

export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

export interface ReleaseRecord {
  id: string;
  artistProjectId: string;
  title: string;
  releaseDate?: string;
}

export interface CampaignRecord {
  id: string;
  artistProjectId: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  releaseId?: string;
  releaseTitle?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignCreateInput {
  name: string;
  objective: string;
}

export interface CampaignReleaseUpdateInput {
  releaseId: string | null;
  expectedVersion: number;
}

export type ApprovalRequestState = "REQUESTED";

export type ApprovalDeliveryState = "NOT_CONFIGURED";

export interface ApprovalMedia {
  filename: string;
}

export interface ApprovalQueueItem {
  approvalId: string;
  variantId: string;
  postId: string;
  postTitle: string;
  platform: string;
  media: ApprovalMedia[];
  caption: string;
  hashtags: string[];
  cta?: string;
  objective: string;
  rationale?: string;
  plannedAt?: string;
  timezone: string;
  payloadHash: string;
  requestedAt: string;
  approvalState: ApprovalRequestState;
  deliveryState: ApprovalDeliveryState;
}

export type EditorialCalendarView = "DAY" | "WEEK" | "MONTH";

export type EditorialCalendarItemKind = "INTERNAL_SCHEDULE" | "APPROVED_VARIANT";

export type EditorialCalendarItemState = "SCHEDULED_INTERNAL" | "READY_TO_SCHEDULE";

export interface EditorialCalendarRange {
  from: string;
  to: string;
  view: EditorialCalendarView;
  timezone: string;
}

export interface EditorialCalendarItem {
  id: string;
  kind: EditorialCalendarItemKind;
  variantId: string;
  postId: string;
  postTitle: string;
  platform: string;
  scheduledAt: string;
  timezone: string;
  state: EditorialCalendarItemState;
  approvalId: string;
  payloadHash: string;
}

export interface EditorialCalendarSnapshot {
  range: EditorialCalendarRange;
  items: EditorialCalendarItem[];
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

function toIdaCommandRun(record: Record<string, unknown>): IdaCommandRunRecord {
  const id = readString(record.id);
  const intent = readString(record.intent);
  const state = readString(record.state);
  const requestedPermission = readString(record.requestedPermission);
  const message = readString(record.message);
  const responseMessage = readString(record.responseMessage);
  const createdAt = readString(record.createdAt);

  if (
    !id ||
    !intent ||
    !state ||
    !requestedPermission ||
    !message ||
    !responseMessage ||
    !createdAt ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    throw new IdaApiError("Une commande enregistrée par IDA est invalide.");
  }

  return { id, intent, state, requestedPermission, message, responseMessage, createdAt };
}

function toIdaCommandRunPage(payload: unknown): IdaCommandRunPage {
  const data = readDataObject(payload, "/v1/ida/command-runs");

  if (!Array.isArray(data.items) || !data.items.every(isRecord)) {
    throw new IdaApiError("La réponse /v1/ida/command-runs n’a pas le format attendu.");
  }

  const nextCursor = readString(data.nextCursor);

  return {
    items: data.items.map(toIdaCommandRun),
    ...(nextCursor === undefined ? {} : { nextCursor }),
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

export async function fetchIdaCommandRuns(input: IdaCommandRunListInput = {}): Promise<IdaCommandRunPage> {
  const query = new URLSearchParams();
  query.set("limit", String(input.limit ?? 12));

  if (input.cursor) {
    query.set("cursor", input.cursor);
  }

  return toIdaCommandRunPage(await getApiJson(`/v1/ida/command-runs?${query.toString()}`));
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

function taskStatus(value: unknown): TaskStatus {
  if (value === "TODO" || value === "IN_PROGRESS" || value === "DONE" || value === "CANCELLED") {
    return value;
  }

  // Le contrat historique documente `DONE`; accepter `COMPLETED` permet au
  // client de rester compatible avec un fournisseur qui emploie ce libellé.
  if (value === "COMPLETED") {
    return "DONE";
  }

  throw new IdaApiError("L’état de tâche retourné par IDA API est invalide.");
}

function campaignStatus(value: unknown): CampaignStatus {
  if (value === "DRAFT" || value === "ACTIVE" || value === "PAUSED" || value === "COMPLETED" || value === "ARCHIVED") {
    return value;
  }

  throw new IdaApiError("L’état de campagne retourné par IDA API est invalide.");
}

function approvalRequestState(value: unknown): ApprovalRequestState {
  if (value === "REQUESTED") {
    return "REQUESTED";
  }

  throw new IdaApiError("L’état d’approbation retourné par IDA API est invalide.");
}

function approvalDeliveryState(value: unknown): ApprovalDeliveryState {
  if (value === "NOT_CONFIGURED") {
    return value;
  }

  throw new IdaApiError("L’état de livraison retourné par IDA API est invalide.");
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

function toActivityLog(record: Record<string, unknown>): ActivityLogRecord {
  const id = readString(record.id);
  const action = readString(record.action);
  const entityType = readString(record.entityType);
  const entityId = readString(record.entityId);
  const createdAt = readString(record.createdAt);

  if (!id || !action || !entityType || !entityId || !createdAt || Number.isNaN(Date.parse(createdAt))) {
    throw new IdaApiError("Une entrée de l’historique d’activité est invalide.");
  }

  return { id, action, entityType, entityId, createdAt };
}

function toActivityLogPage(payload: unknown): ActivityLogPage {
  const data = readDataObject(payload, "/v1/activity-logs");

  if (!Array.isArray(data.items) || !data.items.every(isRecord)) {
    throw new IdaApiError("La réponse /v1/activity-logs n’a pas le format attendu.");
  }

  const nextCursor = readString(data.nextCursor);

  return {
    items: data.items.map(toActivityLog),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
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

export async function fetchActivityLogs(input: ActivityLogListInput = {}): Promise<ActivityLogPage> {
  const query = new URLSearchParams();
  query.set("limit", String(input.limit ?? 12));

  if (input.cursor) {
    query.set("cursor", input.cursor);
  }

  return toActivityLogPage(await getApiJson(`/v1/activity-logs?${query.toString()}`));
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

function toTask(record: Record<string, unknown>): TaskRecord {
  const id = readString(record.id);
  const title = readString(record.title);

  if (!id || !title) {
    throw new IdaApiError("La réponse tâche d’IDA API n’a pas le format attendu.");
  }

  return {
    id,
    title,
    description: readString(record.description),
    dueAt: readString(record.dueAt),
    status: taskStatus(record.status),
    completedAt: readString(record.completedAt),
  };
}

export async function fetchTasks(): Promise<TaskRecord[]> {
  return readDataList(await getApiJson("/v1/tasks"), "/v1/tasks").map(toTask);
}

export async function createTask(input: TaskCreateInput): Promise<TaskRecord> {
  const payload = await postApiJson("/v1/tasks", input);

  return toTask(readDataObjectOrDirect(payload, "/v1/tasks"));
}

function toCampaign(record: Record<string, unknown>): CampaignRecord {
  const id = readString(record.id);
  const artistProjectId = readString(record.artistProjectId);
  const name = readString(record.name);
  const objective = readString(record.objective);
  const releaseId = readString(record.releaseId);
  const releaseTitle = readString(record.releaseTitle);
  const version = readNumber(record.version);
  const createdAt = readString(record.createdAt);
  const updatedAt = readString(record.updatedAt);

  if (
    !id ||
    !artistProjectId ||
    !name ||
    !objective ||
    version === undefined ||
    !Number.isInteger(version) ||
    version < 1 ||
    !createdAt ||
    !updatedAt ||
    (releaseTitle !== undefined && releaseId === undefined)
  ) {
    throw new IdaApiError("La réponse campagne d’IDA API n’a pas le format attendu.");
  }

  return {
    id,
    artistProjectId,
    name,
    objective,
    status: campaignStatus(record.status),
    ...(releaseId === undefined ? {} : { releaseId }),
    ...(releaseTitle === undefined ? {} : { releaseTitle }),
    version,
    createdAt,
    updatedAt,
  };
}

function toRelease(record: Record<string, unknown>): ReleaseRecord {
  const id = readString(record.id);
  const artistProjectId = readString(record.artistProjectId);
  const title = readString(record.title);

  if (!id || !artistProjectId || !title) {
    throw new IdaApiError("La réponse release d’IDA API n’a pas le format attendu.");
  }

  const releaseDate = readString(record.releaseDate);

  return {
    id,
    artistProjectId,
    title,
    ...(releaseDate === undefined ? {} : { releaseDate }),
  };
}

export async function fetchCampaigns(): Promise<CampaignRecord[]> {
  return readDataList(await getApiJson("/v1/campaigns"), "/v1/campaigns").map(toCampaign);
}

export async function fetchReleases(): Promise<ReleaseRecord[]> {
  return readDataList(await getApiJson("/v1/releases"), "/v1/releases").map(toRelease);
}

export async function createCampaign(input: CampaignCreateInput): Promise<CampaignRecord> {
  const payload = await postApiJson("/v1/campaigns", input);

  return toCampaign(readDataObjectOrDirect(payload, "/v1/campaigns"));
}

export async function updateCampaignRelease(
  campaignId: string,
  input: CampaignReleaseUpdateInput,
): Promise<CampaignRecord> {
  const payload = await patchApiJson(`/v1/campaigns/${encodeURIComponent(campaignId)}/release`, input);

  return toCampaign(readDataObjectOrDirect(payload, "/v1/campaigns/:campaignId/release"));
}

export async function completeTask(taskId: string): Promise<TaskRecord> {
  const payload = await postApiJson(`/v1/tasks/${encodeURIComponent(taskId)}/complete`);

  return toTask(readDataObjectOrDirect(payload, "/v1/tasks/:taskId/complete"));
}

function approvalHashtags(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,\n]/u)
      .map((hashtag) => hashtag.trim())
      .filter(Boolean);
  }

  return readStringArray(value);
}

function approvalMedia(value: unknown): ApprovalMedia[] {
  if (!Array.isArray(value)) {
    throw new IdaApiError("Les médias retournés par l’Approval Center sont invalides.");
  }

  return value.map((item) => {
    if (typeof item === "string") {
      const filename = readString(item);

      if (!filename) {
        throw new IdaApiError("Un média retourné par l’Approval Center n’a pas de nom sûr.");
      }

      return { filename };
    }

    const media = readRecord(item);
    const filename = readString(media.filename, media.name);

    if (!filename) {
      throw new IdaApiError("Un média retourné par l’Approval Center n’a pas de nom sûr.");
    }

    return { filename };
  });
}

function toApprovalQueueItem(record: Record<string, unknown>): ApprovalQueueItem {
  const approvalId = readString(record.approvalId);
  const variantId = readString(record.variantId);
  const postId = readString(record.postId);
  const postTitle = readString(record.postTitle);
  const platform = readString(record.platform);
  const caption = readString(record.caption);
  const objective = readString(record.objective);
  const timezone = readString(record.timezone);
  const payloadHash = readString(record.payloadHash);
  const requestedAt = readString(record.requestedAt);

  if (
    !approvalId ||
    !variantId ||
    !postId ||
    !postTitle ||
    !platform ||
    !caption ||
    !objective ||
    !timezone ||
    !payloadHash ||
    !requestedAt
  ) {
    throw new IdaApiError("La réponse Approval Center d’IDA API n’a pas le format attendu.");
  }

  return {
    approvalId,
    variantId,
    postId,
    postTitle,
    platform,
    media: approvalMedia(record.media),
    caption,
    hashtags: approvalHashtags(record.hashtags),
    cta: readString(record.cta),
    objective,
    rationale: readString(record.rationale),
    plannedAt: readString(record.plannedAt),
    timezone,
    payloadHash,
    requestedAt,
    approvalState: approvalRequestState(record.approvalState),
    deliveryState: approvalDeliveryState(record.deliveryState),
  };
}

export async function fetchApprovalQueue(): Promise<ApprovalQueueItem[]> {
  return readDataList(await getApiJson("/v1/approvals/queue"), "/v1/approvals/queue").map(toApprovalQueueItem);
}

export async function approvePostVariant(
  variantId: string,
  approvalId: string,
  expectedPayloadHash: string,
): Promise<void> {
  await postApiJson(`/v1/post-variants/${encodeURIComponent(variantId)}/approve`, {
    approvalId,
    expectedPayloadHash,
  });
}

export async function rejectPostVariant(
  variantId: string,
  approvalId: string,
  expectedPayloadHash: string,
): Promise<void> {
  await postApiJson(`/v1/post-variants/${encodeURIComponent(variantId)}/reject`, {
    approvalId,
    expectedPayloadHash,
  });
}

function editorialCalendarView(value: unknown): EditorialCalendarView {
  if (value === "DAY" || value === "WEEK" || value === "MONTH") {
    return value;
  }

  throw new IdaApiError("La vue du calendrier retournée par IDA API est invalide.");
}

function editorialCalendarItemKind(value: unknown): EditorialCalendarItemKind {
  if (value === "INTERNAL_SCHEDULE" || value === "APPROVED_VARIANT") {
    return value;
  }

  throw new IdaApiError("Le type d’élément calendrier retourné par IDA API est invalide.");
}

function editorialCalendarItemState(value: unknown): EditorialCalendarItemState {
  if (value === "SCHEDULED_INTERNAL" || value === "READY_TO_SCHEDULE") {
    return value;
  }

  throw new IdaApiError("L’état calendrier retourné par IDA API est invalide.");
}

function toEditorialCalendarItem(record: Record<string, unknown>): EditorialCalendarItem {
  const id = readString(record.id);
  const variantId = readString(record.variantId);
  const postId = readString(record.postId);
  const postTitle = readString(record.postTitle);
  const platform = readString(record.platform);
  const scheduledAt = readString(record.scheduledAt);
  const timezone = readString(record.timezone);
  const approvalId = readString(record.approvalId);
  const payloadHash = readString(record.payloadHash);

  if (
    !id ||
    !variantId ||
    !postId ||
    !postTitle ||
    !platform ||
    !scheduledAt ||
    !timezone ||
    !approvalId ||
    !payloadHash
  ) {
    throw new IdaApiError("Un élément du calendrier IDA API n’a pas le format attendu.");
  }

  return {
    id,
    kind: editorialCalendarItemKind(record.kind),
    variantId,
    postId,
    postTitle,
    platform,
    scheduledAt,
    timezone,
    state: editorialCalendarItemState(record.state),
    approvalId,
    payloadHash,
  };
}

function toEditorialCalendarSnapshot(payload: unknown): EditorialCalendarSnapshot {
  const data = readDataObject(payload, "/v1/calendar");
  const range = readRecord(data.range);
  const from = readString(range.from);
  const to = readString(range.to);
  const timezone = readString(range.timezone);

  if (!from || !to || !timezone) {
    throw new IdaApiError("La plage calendrier retournée par IDA API n’a pas le format attendu.");
  }

  if (!Array.isArray(data.items)) {
    throw new IdaApiError("La liste calendrier retournée par IDA API est invalide.");
  }

  return {
    range: {
      from,
      to,
      timezone,
      view: editorialCalendarView(range.view),
    },
    items: data.items.map((item) => toEditorialCalendarItem(readRecord(item))),
  };
}

export async function fetchEditorialCalendar(input: {
  view: EditorialCalendarView;
  from?: string;
  to?: string;
}): Promise<EditorialCalendarSnapshot> {
  const query = new URLSearchParams({ view: input.view });

  if ((input.from === undefined) !== (input.to === undefined)) {
    throw new IdaApiError("Les bornes du calendrier doivent être fournies ensemble.");
  }

  if (input.from && input.to) {
    query.set("from", input.from);
    query.set("to", input.to);
  }

  return toEditorialCalendarSnapshot(await getApiJson(`/v1/calendar?${query.toString()}`));
}

export async function scheduleApprovedPostVariant(
  variantId: string,
  approvalId: string,
  expectedPayloadHash: string,
): Promise<void> {
  await postApiJson(`/v1/post-variants/${encodeURIComponent(variantId)}/internal-schedules`, {
    approvalId,
    expectedPayloadHash,
  });
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
    tags,
    sizeLabel: size,
    usageCount,
  };
}

function toMediaAssets(payload: unknown): MediaAsset[] {
  return readDataList(payload, "/v1/media").map(toMediaAsset);
}

export async function fetchMediaAssets(input: MediaSearchInput = {}): Promise<MediaAsset[]> {
  const query = new URLSearchParams();

  if (input.q) {
    query.set("q", input.q);
  }

  if (input.status) {
    query.set("status", input.status);
  }

  if (input.type) {
    query.set("type", input.type);
  }

  if (input.tag) {
    query.set("tag", input.tag);
  }

  query.set("limit", String(input.limit ?? 24));

  return toMediaAssets(await getApiJson(`/v1/media?${query.toString()}`));
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
