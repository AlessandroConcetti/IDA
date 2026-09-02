import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import {
  activityLogCursorSchema,
  activityLogListQuerySchema,
  activityLogListResponseSchema,
  activityLogSchema,
  agentManifestSchema,
  approvalQueueItemSchema,
  artistProfileSchema,
  artistProfileUpdateSchema,
  type CalendarView,
  calendarItemSchema,
  calendarQuerySchema,
  calendarRangeSchema,
  calendarResponseSchema,
  campaignCreateSchema,
  campaignReleaseLinkParamsSchema,
  campaignReleaseLinkSchema,
  campaignSchema,
  contentRotationQuerySchema,
  contentRotationResponseSchema,
  dashboardSummaryQuerySchema,
  dashboardSummaryResponseSchema,
  idaCommandRunCursorSchema,
  idaCommandRunListQuerySchema,
  idaCommandRunListResponseSchema,
  idaCommandRunSchema,
  internalPostScheduleCancelParamsSchema,
  internalPostScheduleCancelRequestSchema,
  internalPostScheduleSchema,
  mediaAssetSchema,
  mediaImportSchema,
  mediaListQuerySchema,
  mediaPreviewParamsSchema,
  memoryDecisionParamsSchema,
  memoryDecisionRequestSchema,
  memoryProposalCreateSchema,
  memorySchema,
  postVariantDecisionParamsSchema,
  postVariantDecisionRequestSchema,
  postVariantDecisionSchema,
  postVariantInternalScheduleRequestSchema,
  releaseCreateSchema,
  releaseSchema,
  socialPlatformCapabilitySchema,
  taskCompleteParamsSchema,
  taskCompleteRequestSchema,
  taskCreateSchema,
  taskSchema,
  trackCreateSchema,
  trackSchema,
} from "@ida/contracts";
import { createAgentRegistry, createModuleRegistry, ToolGateway, ToolPolicyError } from "@ida/domain";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { toContentRotationCandidateResponse } from "./content-rotation.js";
import {
  type ActivityLogEntry,
  type ApprovalDecision,
  type ApprovalQueueItem,
  type ArtistProfile,
  type CalendarItem,
  type Campaign,
  type CommandRunHistoryEntry,
  DemoDatabase,
  type DemoDatabaseOptions,
  type InternalPostSchedule,
  type MediaAsset,
  type Memory,
  type MemoryDecision,
  type PostVariantDecision,
  type PrivateMediaFile,
  type Release,
  type Task,
  type Track,
} from "./database.js";
import { demoContext, demoWorkspace } from "./demo-context.js";
import { CommandInputError, DeterministicIdaCore } from "./ida-core.js";
import { defaultCalendarRange, getWorkspaceDayRange, type ResolvedCalendarRange } from "./workspace-time.js";

export type CreateAppOptions = DemoDatabaseOptions & {
  now?: () => Date;
  storageDir?: string;
};

type AppError = Error & {
  statusCode?: number;
  code?: string;
};

type MediaImportFields = {
  description?: string;
  tags?: string;
};

type ParsedMediaImport = {
  buffer: Buffer;
  filename: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";
  mimeType: string;
  extension: string;
  description?: string;
  tags: string[];
};

type StoredPrivateMedia = {
  storageKey: string;
  filePath: string;
};

type MediaByteRange = {
  start: number;
  end: number;
};

const mediaMaxBytes = 25 * 1024 * 1024;
const mediaMultipartLimits = {
  fieldNameSize: 32,
  fieldSize: 8 * 1024,
  fields: 2,
  fileSize: mediaMaxBytes,
  files: 1,
  parts: 3,
} as const;
const defaultStorageDir = fileURLToPath(new URL("../.storage", import.meta.url));

const supportedMediaFiles: ReadonlyArray<{
  mediaType: ParsedMediaImport["mediaType"];
  mimeType: string;
  extension: string;
}> = [
  { mediaType: "IMAGE", mimeType: "image/jpeg", extension: ".jpg" },
  { mediaType: "IMAGE", mimeType: "image/jpeg", extension: ".jpeg" },
  { mediaType: "IMAGE", mimeType: "image/png", extension: ".png" },
  { mediaType: "IMAGE", mimeType: "image/webp", extension: ".webp" },
  { mediaType: "IMAGE", mimeType: "image/gif", extension: ".gif" },
  { mediaType: "VIDEO", mimeType: "video/mp4", extension: ".mp4" },
  { mediaType: "VIDEO", mimeType: "video/quicktime", extension: ".mov" },
  { mediaType: "VIDEO", mimeType: "video/webm", extension: ".webm" },
  { mediaType: "AUDIO", mimeType: "audio/mpeg", extension: ".mp3" },
  { mediaType: "AUDIO", mimeType: "audio/wav", extension: ".wav" },
  { mediaType: "AUDIO", mimeType: "audio/x-wav", extension: ".wav" },
  { mediaType: "AUDIO", mimeType: "audio/flac", extension: ".flac" },
  { mediaType: "AUDIO", mimeType: "audio/ogg", extension: ".ogg" },
  { mediaType: "AUDIO", mimeType: "audio/aac", extension: ".aac" },
  { mediaType: "AUDIO", mimeType: "audio/mp4", extension: ".m4a" },
  { mediaType: "DOCUMENT", mimeType: "application/pdf", extension: ".pdf" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function timestampFromDate(value: string | null, fallback: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return new Date(`${value}T00:00:00.000Z`).toISOString() || fallback;
}

const maximumCalendarWindowMilliseconds = 62 * 24 * 60 * 60 * 1_000;

function resolveCalendarRange(
  query: { view?: CalendarView; from?: string; to?: string },
  now: Date,
  timezone: string,
): ResolvedCalendarRange {
  const view = query.view ?? "WEEK";

  if (query.from === undefined || query.to === undefined) {
    try {
      return defaultCalendarRange(now, timezone, view);
    } catch {
      throw new CalendarQueryInputError();
    }
  }

  const fromMilliseconds = Date.parse(query.from);
  const toMilliseconds = Date.parse(query.to);

  if (
    !Number.isFinite(fromMilliseconds) ||
    !Number.isFinite(toMilliseconds) ||
    toMilliseconds <= fromMilliseconds ||
    toMilliseconds - fromMilliseconds > maximumCalendarWindowMilliseconds
  ) {
    throw new CalendarQueryInputError();
  }

  return {
    view,
    from: new Date(fromMilliseconds).toISOString(),
    to: new Date(toMilliseconds).toISOString(),
    timezone,
  };
}

class ArtistProfileInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_ARTIST_PROFILE";

  constructor() {
    super("Les champs transmis pour l’Artist Brain sont invalides.");
  }
}

class TrackInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_TRACK";

  constructor() {
    super("Les champs transmis pour le morceau sont invalides.");
  }
}

class ReleaseInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_RELEASE";

  constructor() {
    super("Les champs transmis pour la release sont invalides.");
  }
}

class MemoryProposalInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_MEMORY_PROPOSAL";

  constructor() {
    super("Les champs transmis pour la proposition de mémoire sont invalides.");
  }
}

class MemoryDecisionInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_MEMORY_DECISION";

  constructor() {
    super("La décision de mémoire est invalide.");
  }
}

class TaskInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_TASK";

  constructor() {
    super("Les champs transmis pour la tâche sont invalides.");
  }
}

class TaskCompletionInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_TASK_COMPLETION";

  constructor() {
    super("La finalisation de la tâche est invalide.");
  }
}

class CampaignInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_CAMPAIGN";

  constructor() {
    super("Les champs transmis pour la campagne sont invalides.");
  }
}

class CampaignReleaseLinkInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_CAMPAIGN_RELEASE";

  constructor() {
    super("Le rattachement de la campagne à la release est invalide.");
  }
}

class ApprovalDecisionInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_APPROVAL_DECISION";

  constructor() {
    super("La décision d'approbation est invalide.");
  }
}

class InternalPostScheduleInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_INTERNAL_SCHEDULE";

  constructor() {
    super("La demande de planification interne est invalide.");
  }
}

class InternalPostScheduleCancellationInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_INTERNAL_SCHEDULE_CANCELLATION";

  constructor() {
    super("La demande d'annulation de planification interne est invalide.");
  }
}

class CalendarQueryInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_CALENDAR_QUERY";

  constructor() {
    super("La fenêtre du calendrier est invalide.");
  }
}

class MediaListQueryInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_MEDIA_QUERY";

  constructor() {
    super("Les filtres de la Content Library sont invalides.");
  }
}

class MediaPreviewParamsInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_MEDIA_PREVIEW";

  constructor() {
    super("L’identifiant de prévisualisation du média est invalide.");
  }
}

class ContentRotationQueryInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_CONTENT_ROTATION_QUERY";

  constructor() {
    super("Les paramètres de rotation de contenus sont invalides.");
  }
}

class ActivityLogQueryInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_ACTIVITY_LOG_QUERY";

  constructor() {
    super("La pagination de l'historique d'activité est invalide.");
  }
}

class DashboardSummaryQueryInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_DASHBOARD_SUMMARY_QUERY";

  constructor() {
    super("Les paramètres du résumé du Command Center sont invalides.");
  }
}

class CommandRunHistoryQueryInputError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_COMMAND_HISTORY_QUERY";

  constructor() {
    super("La pagination de l’historique des commandes est invalide.");
  }
}

class MediaImportError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function normalizeTag(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("fr-FR");
}

function parseMediaTags(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }

  const tags = value.split(",").map(normalizeTag);

  if (tags.some((tag) => tag.length === 0)) {
    throw new MediaImportError(400, "INVALID_MEDIA_IMPORT", "Les tags doivent être séparés par des virgules.");
  }

  return [...new Set(tags)];
}

function resolveSupportedMedia(
  filename: string,
  mimeType: string,
): {
  filename: string;
  mediaType: ParsedMediaImport["mediaType"];
  extension: string;
} {
  const normalizedFilename = basename(filename.replaceAll("\\", "/")).trim();

  if (
    normalizedFilename.length === 0 ||
    normalizedFilename.length > 255 ||
    normalizedFilename === "." ||
    normalizedFilename === ".."
  ) {
    throw new MediaImportError(400, "INVALID_MEDIA_IMPORT", "Le nom du fichier importé est invalide.");
  }

  const extension = extname(normalizedFilename).toLocaleLowerCase("en-US");
  const supported = supportedMediaFiles.find(
    (candidate) => candidate.mimeType === mimeType.toLocaleLowerCase("en-US") && candidate.extension === extension,
  );

  if (!supported) {
    throw new MediaImportError(
      415,
      "UNSUPPORTED_MEDIA_FILE",
      "Le type MIME et l’extension du fichier ne sont pas autorisés.",
    );
  }

  return { filename: normalizedFilename, mediaType: supported.mediaType, extension };
}

function toMediaAssetResponse(asset: MediaAsset) {
  return mediaAssetSchema.parse({
    id: asset.id,
    workspaceId: demoContext.workspaceId,
    artistProjectId: optionalString(asset.projectId),
    filename: asset.filename,
    type: asset.mediaType,
    mimeType: asset.mimeType,
    size: asset.byteSize,
    hash: asset.sha256,
    tags: asset.tags,
    description: optionalString(asset.description),
    status: asset.status,
    previewAvailable: asset.previewAvailable,
    usageCount: asset.usageCount,
    lastUsedAt: asset.lastUsedAt ?? undefined,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  });
}

async function parseMediaImport(request: FastifyRequest): Promise<ParsedMediaImport> {
  if (!request.isMultipart()) {
    throw new MediaImportError(415, "INVALID_MEDIA_IMPORT", "Un formulaire multipart contenant un fichier est requis.");
  }

  const fields: MediaImportFields = {};
  let file:
    | {
        buffer: Buffer;
        filename: string;
        mimeType: string;
      }
    | undefined;
  let invalidStructure = false;

  for await (const part of request.parts({ limits: mediaMultipartLimits })) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();

      if (part.fieldname !== "file" || file) {
        invalidStructure = true;
        continue;
      }

      file = { buffer, filename: part.filename, mimeType: part.mimetype };
      continue;
    }

    if (
      (part.fieldname !== "description" && part.fieldname !== "tags") ||
      part.fieldnameTruncated ||
      part.valueTruncated ||
      typeof part.value !== "string" ||
      fields[part.fieldname] !== undefined
    ) {
      invalidStructure = true;
      continue;
    }

    fields[part.fieldname] = part.value;
  }

  if (invalidStructure) {
    throw new MediaImportError(
      400,
      "INVALID_MEDIA_IMPORT",
      "Seuls les champs file, description et tags sont acceptés une seule fois.",
    );
  }

  if (!file) {
    throw new MediaImportError(400, "FILE_REQUIRED", "Un fichier est requis pour l’import.");
  }

  if (file.buffer.byteLength > mediaMaxBytes) {
    throw new MediaImportError(413, "MEDIA_FILE_TOO_LARGE", "Le fichier dépasse la limite de 25 MiB.");
  }

  const metadata = mediaImportSchema.safeParse({
    description: fields.description,
    tags: parseMediaTags(fields.tags),
  });

  if (!metadata.success) {
    throw new MediaImportError(400, "INVALID_MEDIA_IMPORT", "Les métadonnées du média sont invalides.");
  }

  const supported = resolveSupportedMedia(file.filename, file.mimeType);

  return {
    buffer: file.buffer,
    filename: supported.filename,
    mediaType: supported.mediaType,
    mimeType: file.mimeType.toLocaleLowerCase("en-US"),
    extension: supported.extension,
    description: metadata.data.description,
    tags: metadata.data.tags,
  };
}

async function writePrivateMedia(
  storageDir: string,
  workspaceId: string,
  sha256: string,
  extension: string,
  buffer: Buffer,
): Promise<StoredPrivateMedia> {
  if (!/^[a-f0-9]{64}$/.test(sha256) || !/^wsp_[a-z0-9_]+$/i.test(workspaceId)) {
    throw new Error("Impossible de construire une clé de stockage privée valide.");
  }

  const storageKey = `${workspaceId}/${sha256.slice(0, 2)}/${sha256}-${randomUUID().replaceAll("-", "")}${extension}`;
  const storageRoot = resolve(storageDir);
  const filePath = resolve(storageRoot, ...storageKey.split("/"));
  const locationWithinStorage = relative(storageRoot, filePath);

  if (
    locationWithinStorage.length === 0 ||
    locationWithinStorage === ".." ||
    locationWithinStorage.startsWith(`..${sep}`) ||
    isAbsolute(locationWithinStorage)
  ) {
    throw new Error("La clé de stockage privée sort du répertoire autorisé.");
  }

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer, { flag: "wx" });

  return { storageKey, filePath };
}

function resolvePrivateMediaPreviewPath(
  storageDir: string,
  workspaceId: string,
  media: PrivateMediaFile,
): string | undefined {
  const storageSegments = media.storageKey.split("/");
  const storageFilename = storageSegments[2];
  const mediaExtension = storageFilename ? extname(storageFilename).toLocaleLowerCase("en-US") : "";
  const storedObjectId = storageFilename?.slice(media.sha256.length + 1, -mediaExtension.length);
  const supported = supportedMediaFiles.some(
    (candidate) =>
      candidate.mediaType === media.mediaType &&
      candidate.mimeType === media.mimeType.toLocaleLowerCase("en-US") &&
      candidate.extension === mediaExtension,
  );

  if (
    !/^[a-f0-9]{64}$/.test(media.sha256) ||
    storageSegments.length !== 3 ||
    storageSegments[0] !== workspaceId ||
    storageSegments[1] !== media.sha256.slice(0, 2) ||
    !storageFilename?.startsWith(`${media.sha256}-`) ||
    !storedObjectId ||
    !/^[a-f0-9]{32}$/.test(storedObjectId) ||
    !supported
  ) {
    return undefined;
  }

  const storageRoot = resolve(storageDir);
  const filePath = resolve(storageRoot, ...storageSegments);
  const locationWithinStorage = relative(storageRoot, filePath);

  if (
    locationWithinStorage.length === 0 ||
    locationWithinStorage === ".." ||
    locationWithinStorage.startsWith(`..${sep}`) ||
    isAbsolute(locationWithinStorage)
  ) {
    return undefined;
  }

  return filePath;
}

function isMissingPrivateMedia(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

async function readPrivateMediaPreview(
  storageDir: string,
  workspaceId: string,
  media: PrivateMediaFile,
): Promise<Buffer | undefined> {
  const filePath = resolvePrivateMediaPreviewPath(storageDir, workspaceId, media);

  if (!filePath || media.byteSize < 0 || media.byteSize > mediaMaxBytes) {
    return undefined;
  }

  try {
    const details = await lstat(filePath);

    if (!details.isFile() || details.isSymbolicLink() || details.size !== media.byteSize) {
      return undefined;
    }

    const buffer = await readFile(filePath);

    if (buffer.byteLength !== media.byteSize) {
      return undefined;
    }

    return createHash("sha256").update(buffer).digest("hex") === media.sha256 ? buffer : undefined;
  } catch (error: unknown) {
    if (isMissingPrivateMedia(error)) {
      return undefined;
    }

    throw error;
  }
}

function parseMediaByteRange(value: string | undefined, byteSize: number): MediaByteRange | "invalid" | undefined {
  if (!value) {
    return undefined;
  }

  const header = value.trim();

  if (!header.startsWith("bytes=") || header.includes(",") || byteSize <= 0) {
    return "invalid";
  }

  const range = header.slice("bytes=".length);
  const separator = range.indexOf("-");

  if (separator === -1 || separator !== range.lastIndexOf("-")) {
    return "invalid";
  }

  const rawStart = range.slice(0, separator);
  const rawEnd = range.slice(separator + 1);
  const isInteger = (part: string) => /^\d+$/u.test(part) && Number.isSafeInteger(Number(part));

  if (rawStart.length === 0) {
    if (!isInteger(rawEnd) || Number(rawEnd) === 0) {
      return "invalid";
    }

    const suffixLength = Number(rawEnd);

    return { start: Math.max(byteSize - suffixLength, 0), end: byteSize - 1 };
  }

  if (!isInteger(rawStart) || (rawEnd.length > 0 && !isInteger(rawEnd))) {
    return "invalid";
  }

  const start = Number(rawStart);

  if (start >= byteSize) {
    return "invalid";
  }

  const requestedEnd = rawEnd.length === 0 ? byteSize - 1 : Number(rawEnd);

  if (requestedEnd < start) {
    return "invalid";
  }

  return { start, end: Math.min(requestedEnd, byteSize - 1) };
}

async function removePrivateMedia(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error: unknown) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

function toArtistProfileResponse(profile: ArtistProfile) {
  return artistProfileSchema.parse({
    id: profile.id,
    workspaceId: demoContext.workspaceId,
    artistProjectId: profile.projectId,
    identity: profile.identity,
    genres: profile.genres,
    influences: profile.influences,
    tone: profile.tone,
    preferredVocabulary: profile.preferredVocabulary,
    forbiddenVocabulary: profile.forbiddenVocabulary,
    goals: profile.goals,
    audience: profile.audience,
    platformPreferences: profile.platformPreferences,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  });
}

function toTrackResponse(track: Track) {
  return trackSchema.parse({
    id: track.id,
    workspaceId: demoContext.workspaceId,
    artistProjectId: track.projectId,
    releaseId: optionalString(track.releaseId),
    title: track.title,
    artistCredit: track.artistCredit,
    genre: optionalString(track.genre),
    bpm: track.bpm ?? undefined,
    musicalKey: optionalString(track.musicalKey),
    releaseDate: optionalString(track.releaseDate),
    label: optionalString(track.label),
    status: track.status,
    links: [],
    tags: track.tags,
    description: optionalString(track.description),
    createdAt: track.createdAt,
    updatedAt: track.updatedAt,
  });
}

function toReleaseResponse(release: Release) {
  return releaseSchema.parse({
    id: release.id,
    workspaceId: demoContext.workspaceId,
    artistProjectId: release.projectId,
    title: release.title,
    releaseType: release.releaseType,
    releaseDate: optionalString(release.releaseDate),
    label: optionalString(release.label),
    status: release.status,
    description: optionalString(release.description),
    links: [],
    tags: release.tags,
    createdAt: release.createdAt,
    updatedAt: release.updatedAt,
  });
}

function toCampaignResponse(campaign: Campaign) {
  return campaignSchema.parse({
    id: campaign.id,
    workspaceId: demoContext.workspaceId,
    artistProjectId: campaign.projectId,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
    releaseId: optionalString(campaign.releaseId),
    releaseTitle: optionalString(campaign.releaseTitle),
    version: campaign.version,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  });
}

function toActivityLogResponse(activity: ActivityLogEntry) {
  return activityLogSchema.parse({
    id: activity.id,
    action: activity.action,
    entityType: activity.entityType,
    entityId: activity.entityId,
    createdAt: activity.createdAt,
  });
}

function encodeActivityLogCursor(cursor: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(activityLogCursorSchema.parse(cursor)), "utf8").toString("base64url");
}

function decodeActivityLogCursor(cursor: string) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    const parsed = activityLogCursorSchema.safeParse(decoded);

    if (!parsed.success) {
      throw new Error("Cursor invalide.");
    }

    return parsed.data;
  } catch {
    throw new ActivityLogQueryInputError();
  }
}

function toCommandRunHistoryResponse(commandRun: CommandRunHistoryEntry) {
  return idaCommandRunSchema.parse({
    id: commandRun.id,
    intent: commandRun.intent,
    state: commandRun.state,
    requestedPermission: commandRun.requestedPermission,
    message: commandRun.message,
    responseMessage: commandRun.responseMessage,
    createdAt: commandRun.createdAt,
  });
}

function encodeCommandRunHistoryCursor(cursor: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(idaCommandRunCursorSchema.parse(cursor)), "utf8").toString("base64url");
}

function decodeCommandRunHistoryCursor(cursor: string) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    const parsed = idaCommandRunCursorSchema.safeParse(decoded);

    if (!parsed.success) {
      throw new Error("Cursor invalide.");
    }

    return parsed.data;
  } catch {
    throw new CommandRunHistoryQueryInputError();
  }
}

function toMemoryResponse(memory: Memory) {
  return memorySchema.parse({
    id: memory.id,
    workspaceId: demoContext.workspaceId,
    category: memory.category,
    content: memory.content,
    state: memory.state,
    confirmedBy: optionalString(memory.confirmedBy),
    confirmedAt: memory.confirmedAt ?? undefined,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
  });
}

function toTaskResponse(task: Task) {
  return taskSchema.parse({
    id: task.id,
    workspaceId: demoContext.workspaceId,
    title: task.title,
    description: optionalString(task.description),
    status: task.status,
    dueAt: task.dueAt ?? undefined,
    completedBy: optionalString(task.completedBy),
    completedAt: task.completedAt ?? undefined,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  });
}

function toApprovalQueueItemResponse(item: ApprovalQueueItem) {
  return approvalQueueItemSchema.parse({
    approvalId: item.approvalId,
    variantId: item.variantId,
    postId: item.postId,
    postTitle: item.postTitle,
    platform: item.platform,
    media: item.media.map((media) => ({
      id: media.id,
      filename: media.filename,
      type: media.type,
      status: media.status,
    })),
    caption: item.caption,
    hashtags: item.hashtags,
    cta: optionalString(item.cta),
    objective: item.objective,
    rationale: optionalString(item.rationale),
    plannedAt: item.plannedAt ?? undefined,
    timezone: item.timezone,
    payloadHash: item.payloadHash,
    approvalState: item.approvalState,
    deliveryState: item.deliveryState,
    requestedAt: item.requestedAt,
  });
}

function toPostVariantDecisionResponse(decision: PostVariantDecision) {
  return postVariantDecisionSchema.parse({
    approvalId: decision.approvalId,
    variantId: decision.variantId,
    approvalState: decision.approvalState,
    deliveryState: decision.deliveryState,
    payloadHash: decision.payloadHash,
    decidedAt: decision.decidedAt,
  });
}

function toCalendarItemResponse(item: CalendarItem) {
  return calendarItemSchema.parse({
    id: item.id,
    kind: item.kind,
    variantId: item.variantId,
    postId: item.postId,
    postTitle: item.postTitle,
    platform: item.platform,
    scheduledAt: item.scheduledAt,
    timezone: item.timezone,
    state: item.state,
    approvalId: item.approvalId,
    payloadHash: item.payloadHash,
  });
}

function toInternalPostScheduleResponse(schedule: InternalPostSchedule) {
  return internalPostScheduleSchema.parse({
    id: schedule.id,
    variantId: schedule.variantId,
    postId: schedule.postId,
    platform: schedule.platform,
    scheduledAt: schedule.scheduledAt,
    timezone: schedule.timezone,
    state: schedule.state,
    approvalId: schedule.approvalId,
    payloadHash: schedule.payloadHash,
    deliveryState: schedule.deliveryState,
  });
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const database = await DemoDatabase.open(options);
  const storageDir = options.storageDir ?? defaultStorageDir;
  const serverNow = options.now ?? (() => new Date());
  const core = new DeterministicIdaCore(database, undefined, serverNow);
  const agents = createAgentRegistry();
  const modules = createModuleRegistry();
  const toolGateway = new ToolGateway(undefined, [
    { toolKey: "update_artist_profile", moduleKey: "MEMORY", permission: "WRITE" },
    { toolKey: "propose_preference_memory", moduleKey: "MEMORY", permission: "WRITE" },
    { toolKey: "confirm_memory", moduleKey: "MEMORY", permission: "WRITE" },
    { toolKey: "reject_memory", moduleKey: "MEMORY", permission: "WRITE" },
    { toolKey: "create_task", moduleKey: "TASKS", permission: "WRITE" },
    { toolKey: "complete_task", moduleKey: "TASKS", permission: "WRITE" },
    { toolKey: "create_release", moduleKey: "MUSIC", permission: "WRITE" },
    { toolKey: "create_track", moduleKey: "MUSIC", permission: "WRITE" },
    { toolKey: "create_campaign", moduleKey: "CAMPAIGNS", permission: "WRITE" },
    { toolKey: "link_campaign_release", moduleKey: "CAMPAIGNS", permission: "WRITE" },
    { toolKey: "import_media", moduleKey: "CONTENT", permission: "WRITE" },
    { toolKey: "decide_post_variant", moduleKey: "CONTENT", permission: "APPROVAL_REQUIRED" },
    { toolKey: "schedule_approved_post_variant", moduleKey: "CALENDAR", permission: "APPROVAL_REQUIRED" },
    { toolKey: "cancel_internal_post_schedule", moduleKey: "CALENDAR", permission: "WRITE" },
  ]);

  await app.register(cors, {
    origin: "http://127.0.0.1:5173",
    methods: ["GET", "PATCH", "POST", "OPTIONS"],
  });
  await app.register(multipart, {
    limits: mediaMultipartLimits,
    throwFileSizeLimit: true,
  });

  app.addHook("onClose", async () => {
    await database.close();
  });

  app.setErrorHandler((error: AppError, _request, reply) => {
    if (error instanceof CommandInputError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof ToolPolicyError) {
      return reply.status(403).send({
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof MemoryProposalInputError || error instanceof MemoryDecisionInputError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    if (
      error instanceof ReleaseInputError ||
      error instanceof TaskInputError ||
      error instanceof TaskCompletionInputError ||
      error instanceof CampaignInputError ||
      error instanceof CampaignReleaseLinkInputError
    ) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof ApprovalDecisionInputError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    if (
      error instanceof InternalPostScheduleInputError ||
      error instanceof InternalPostScheduleCancellationInputError ||
      error instanceof CalendarQueryInputError ||
      error instanceof MediaListQueryInputError ||
      error instanceof MediaPreviewParamsInputError ||
      error instanceof ContentRotationQueryInputError ||
      error instanceof ActivityLogQueryInputError ||
      error instanceof DashboardSummaryQueryInputError ||
      error instanceof CommandRunHistoryQueryInputError
    ) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    if (error instanceof MediaImportError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    if (error.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send({
        error: { code: "MEDIA_FILE_TOO_LARGE", message: "Le fichier dépasse la limite de 25 MiB." },
      });
    }

    if (error.code === "FST_FILES_LIMIT" || error.code === "FST_FIELDS_LIMIT" || error.code === "FST_PARTS_LIMIT") {
      return reply.status(400).send({
        error: { code: "INVALID_MEDIA_IMPORT", message: "Le formulaire multipart dépasse les limites autorisées." },
      });
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    return reply.status(statusCode).send({
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: statusCode === 500 ? "Une erreur interne est survenue." : error.message,
      },
    });
  });

  const decideMemory = async (request: FastifyRequest, reply: FastifyReply, decision: MemoryDecision) => {
    const params = memoryDecisionParamsSchema.safeParse(request.params);
    // Une requête sans corps est autorisée ; un JSON `null` reste en revanche
    // un corps invalide au même titre qu'une tentative d'injecter un état ou un
    // workspace. Cela garde le contrat de décision réellement vide.
    const body = memoryDecisionRequestSchema.safeParse(request.body === undefined ? {} : request.body);

    if (!params.success || !body.success) {
      throw new MemoryDecisionInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: decision === "CONFIRMED" ? "confirm_memory" : "reject_memory",
      moduleKey: "MEMORY",
      permission: "WRITE",
    });

    const result = await database.decideMemory(
      demoContext.workspaceId,
      demoContext.userId,
      params.data.memoryId,
      decision,
    );

    if (result.kind === "not-found") {
      return reply.status(404).send({
        error: { code: "MEMORY_NOT_FOUND", message: "Mémoire introuvable dans ce workspace." },
      });
    }

    if (result.kind === "already-decided") {
      return reply.status(409).send({
        error: {
          code: "MEMORY_DECISION_FINAL",
          message: "Cette mémoire a déjà reçu une décision finale et ne peut plus être modifiée.",
        },
      });
    }

    return { data: toMemoryResponse(result.memory) };
  };

  const completeTask = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = taskCompleteParamsSchema.safeParse(request.params);
    // Une requête sans corps est autorisée ; tout corps JSON, y compris null,
    // est invalide afin que la route /complete reste l'unique transition.
    const body = taskCompleteRequestSchema.safeParse(request.body === undefined ? {} : request.body);

    if (!params.success || !body.success) {
      throw new TaskCompletionInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: "complete_task",
      moduleKey: "TASKS",
      permission: "WRITE",
    });

    const result = await database.completeTask(demoContext.workspaceId, demoContext.userId, params.data.taskId);

    if (result.kind === "not-found") {
      return reply.status(404).send({
        error: { code: "TASK_NOT_FOUND", message: "Tâche introuvable dans ce workspace." },
      });
    }

    if (result.kind === "already-completed") {
      return { data: toTaskResponse(result.task) };
    }

    if (result.kind === "not-actionable") {
      return reply.status(409).send({
        error: {
          code: "TASK_NOT_ACTIONABLE",
          message: "Cette tâche possède un état final qui ne peut pas être complété.",
        },
      });
    }

    return { data: toTaskResponse(result.task) };
  };

  const decidePostVariant = async (request: FastifyRequest, reply: FastifyReply, decision: ApprovalDecision) => {
    const params = postVariantDecisionParamsSchema.safeParse(request.params);
    const body = postVariantDecisionRequestSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      throw new ApprovalDecisionInputError();
    }

    // Résoudre d'abord la précondition dans le scope serveur. Cela vérifie que
    // l'approvalId et le hash désignent encore la version courante avant de
    // construire une preuve humaine ; aucun champ du client ne devient preuve.
    const precondition = await database.preparePostVariantDecision(
      demoContext.workspaceId,
      params.data.variantId,
      body.data.approvalId,
      body.data.expectedPayloadHash,
      decision,
    );

    if (precondition.kind === "not-found") {
      return reply.status(404).send({
        error: { code: "POST_VARIANT_NOT_FOUND", message: "Variante introuvable dans ce workspace." },
      });
    }

    if (precondition.kind === "stale") {
      return reply.status(409).send({
        error: {
          code: "APPROVAL_STALE_PAYLOAD",
          message: "L'approbation ou le contenu à valider ne correspond plus à la version courante.",
        },
      });
    }

    if (precondition.kind === "opposite-decision") {
      return reply.status(409).send({
        error: {
          code: "APPROVAL_DECISION_FINAL",
          message: "Cette variante possède déjà une décision finale immuable.",
        },
      });
    }

    if (precondition.kind === "already-decided") {
      return { data: toPostVariantDecisionResponse(precondition.decision) };
    }

    // La preuve remise au ToolGateway est ensuite construite à partir de
    // l'approbation *résolue côté serveur*, du contexte serveur et d'un instant
    // serveur. Le runtime LOCAL_DEMO ne prétend pas encore fournir une
    // authentification de production.
    toolGateway.assertAuthorized({
      toolKey: "decide_post_variant",
      moduleKey: "CONTENT",
      permission: "APPROVAL_REQUIRED",
      explicitApproval: {
        approvalId: precondition.approvalId,
        approvedBy: demoContext.userId,
        approvedAt: serverNow().toISOString(),
      },
    });

    const result = await database.decidePostVariant(
      demoContext.workspaceId,
      demoContext.userId,
      params.data.variantId,
      body.data.approvalId,
      body.data.expectedPayloadHash,
      decision,
    );

    if (result.kind === "not-found") {
      return reply.status(404).send({
        error: { code: "POST_VARIANT_NOT_FOUND", message: "Variante introuvable dans ce workspace." },
      });
    }

    if (result.kind === "stale") {
      return reply.status(409).send({
        error: {
          code: "APPROVAL_STALE_PAYLOAD",
          message: "L'approbation ou le contenu à valider ne correspond plus à la version courante.",
        },
      });
    }

    if (result.kind === "opposite-decision") {
      return reply.status(409).send({
        error: {
          code: "APPROVAL_DECISION_FINAL",
          message: "Cette variante possède déjà une décision finale immuable.",
        },
      });
    }

    return { data: toPostVariantDecisionResponse(result.decision) };
  };

  const scheduleApprovedPostVariant = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = postVariantDecisionParamsSchema.safeParse(request.params);
    const body = postVariantInternalScheduleRequestSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      throw new InternalPostScheduleInputError();
    }

    // Une seule horloge injectée est capturée pour la précondition, la preuve
    // d'autorisation et la revérification transactionnelle. Le client ne peut
    // jamais fournir l'horaire ou le fuseau de la planification.
    const actionNow = serverNow().toISOString();
    const precondition = await database.prepareInternalPostSchedule(
      demoContext.workspaceId,
      params.data.variantId,
      body.data.approvalId,
      body.data.expectedPayloadHash,
      actionNow,
    );

    if (precondition.kind === "not-found") {
      return reply.status(404).send({
        error: { code: "POST_VARIANT_NOT_FOUND", message: "Variante introuvable dans ce workspace." },
      });
    }

    if (precondition.kind === "stale") {
      return reply.status(409).send({
        error: {
          code: "SCHEDULE_STALE_APPROVAL",
          message: "L'approbation ou le payload ne correspond plus à la variante approuvée courante.",
        },
      });
    }

    if (precondition.kind === "time-unavailable") {
      return reply.status(409).send({
        error: {
          code: "SCHEDULE_TIME_UNAVAILABLE",
          message: "La date proposée est absente, invalide ou déjà écoulée.",
        },
      });
    }

    if (precondition.kind === "conflict") {
      return reply.status(409).send({
        error: { code: "SCHEDULE_CONFLICT", message: "Ce créneau de planification interne est déjà occupé." },
      });
    }

    if (precondition.kind === "already-scheduled") {
      return { data: toInternalPostScheduleResponse(precondition.schedule) };
    }

    // La preuve est créée uniquement à partir de l'approbation déjà résolue
    // dans le workspace serveur. Les deux valeurs sont immuables après la
    // décision APPROVED et ne viennent jamais du corps HTTP.
    if (!precondition.snapshot.approvalDecidedBy || !precondition.snapshot.approvalDecidedAt) {
      return reply.status(409).send({
        error: {
          code: "SCHEDULE_STALE_APPROVAL",
          message: "L'approbation approuvée ne possède plus de preuve humaine exploitable.",
        },
      });
    }

    toolGateway.assertAuthorized({
      toolKey: "schedule_approved_post_variant",
      moduleKey: "CALENDAR",
      permission: "APPROVAL_REQUIRED",
      explicitApproval: {
        approvalId: precondition.snapshot.approvalId,
        approvedBy: precondition.snapshot.approvalDecidedBy,
        approvedAt: precondition.snapshot.approvalDecidedAt,
      },
    });

    const result = await database.createInternalPostSchedule(
      demoContext.workspaceId,
      demoContext.userId,
      params.data.variantId,
      body.data.approvalId,
      body.data.expectedPayloadHash,
      actionNow,
    );

    if (result.kind === "not-found") {
      return reply.status(404).send({
        error: { code: "POST_VARIANT_NOT_FOUND", message: "Variante introuvable dans ce workspace." },
      });
    }

    if (result.kind === "stale") {
      return reply.status(409).send({
        error: {
          code: "SCHEDULE_STALE_APPROVAL",
          message: "L'approbation ou le payload ne correspond plus à la variante approuvée courante.",
        },
      });
    }

    if (result.kind === "time-unavailable") {
      return reply.status(409).send({
        error: {
          code: "SCHEDULE_TIME_UNAVAILABLE",
          message: "La date proposée est absente, invalide ou déjà écoulée.",
        },
      });
    }

    if (result.kind === "conflict") {
      return reply.status(409).send({
        error: { code: "SCHEDULE_CONFLICT", message: "Ce créneau de planification interne est déjà occupé." },
      });
    }

    if (result.kind === "already-scheduled") {
      return { data: toInternalPostScheduleResponse(result.schedule) };
    }

    return reply.status(201).send({ data: toInternalPostScheduleResponse(result.schedule) });
  };

  const cancelInternalPostSchedule = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = internalPostScheduleCancelParamsSchema.safeParse(request.params);
    // La route ne porte aucune donnée client : elle ne peut donc ni modifier
    // l'instant/auteur serveur, ni réécrire le snapshot déjà planifié.
    const body = internalPostScheduleCancelRequestSchema.safeParse(request.body === undefined ? {} : request.body);

    if (!params.success || !body.success) {
      throw new InternalPostScheduleCancellationInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: "cancel_internal_post_schedule",
      moduleKey: "CALENDAR",
      permission: "WRITE",
    });

    const result = await database.cancelInternalPostSchedule(
      demoContext.workspaceId,
      demoContext.userId,
      params.data.scheduleId,
      serverNow().toISOString(),
    );

    if (result.kind === "not-found") {
      return reply.status(404).send({
        error: { code: "INTERNAL_SCHEDULE_NOT_FOUND", message: "Planification interne introuvable dans ce workspace." },
      });
    }

    if (result.kind === "not-cancellable") {
      return reply.status(409).send({
        error: {
          code: "INTERNAL_SCHEDULE_NOT_CANCELLABLE",
          message: "Cette planification interne ne peut pas être annulée dans son état actuel.",
        },
      });
    }

    return { data: toInternalPostScheduleResponse(result.schedule) };
  };

  app.get("/health", async () => ({
    status: "ok",
    service: "ida-api",
    mode: demoContext.mode,
    database: "ready",
  }));

  app.get("/v1/me", async () => ({
    data: {
      id: demoContext.userId,
      email: "aless@ida.local",
      displayName: "Aless",
      timezone: demoWorkspace.timezone,
      workspace: {
        ...demoWorkspace,
        role: demoContext.membershipRole,
      },
      authentication: {
        mode: demoContext.mode,
        message: "Contexte local de démonstration ; aucune authentification réelle n’est active.",
      },
    },
  }));

  app.get("/v1/modules", async () => ({ data: modules.list() }));

  // Ce registre rend visibles les contrats d'agents revus, mais n'expose ni
  // prompt, ni secret, ni activation. Une déclaration d'outil ne crée jamais
  // une capacité exécutable : le registre bloque tout agent non ACTIVE.
  app.get("/v1/agents", async () => ({
    data: agents.list().map((agent) => agentManifestSchema.parse(agent)),
  }));

  app.get("/v1/system/status", async () => ({ data: core.getSystemStatus() }));

  app.get("/v1/dashboard/summary", async (request) => {
    const query = dashboardSummaryQuerySchema.safeParse(request.query);

    if (!query.success) {
      throw new DashboardSummaryQueryInputError();
    }

    // La date de référence est calculée côté serveur dans le fuseau du
    // workspace ; le client ne peut ni forcer un scope, ni déplacer la date.
    const timezone = await database.getWorkspaceTimezone(demoContext.workspaceId);

    if (!timezone) {
      throw new DashboardSummaryQueryInputError();
    }

    const now = serverNow();
    const dayRange = getWorkspaceDayRange(now, timezone);
    const counts = await database.getCommandCenterSummary(demoContext.workspaceId, dayRange.workspaceDate);

    return dashboardSummaryResponseSchema.parse({
      data: {
        generatedAt: now.toISOString(),
        workspaceDate: dayRange.workspaceDate,
        timezone,
        ...counts,
      },
    });
  });

  app.get("/v1/activity-logs", async (request) => {
    const query = activityLogListQuerySchema.safeParse(request.query);

    if (!query.success) {
      throw new ActivityLogQueryInputError();
    }

    // La requête ne peut ni choisir un workspace, ni demander le JSON payload
    // d'audit. Le curseur est un tuple opaque validé avant toute requête SQL.
    const page = await database.listActivityLogs(demoContext.workspaceId, {
      limit: query.data.limit,
      ...(query.data.cursor ? { cursor: decodeActivityLogCursor(query.data.cursor) } : {}),
    });

    return activityLogListResponseSchema.parse({
      data: {
        items: page.items.map(toActivityLogResponse),
        ...(page.nextCursor ? { nextCursor: encodeActivityLogCursor(page.nextCursor) } : {}),
      },
    });
  });

  app.get("/v1/artist-profile", async (_request, reply) => {
    const profile = await database.getArtistProfile(demoContext.workspaceId);

    if (!profile) {
      return reply
        .status(404)
        .send({ error: { code: "ARTIST_PROFILE_NOT_FOUND", message: "Profil artistique introuvable." } });
    }

    return {
      data: toArtistProfileResponse(profile),
    };
  });

  app.patch("/v1/artist-profile", async (request, reply) => {
    const update = artistProfileUpdateSchema.safeParse(request.body);

    if (!update.success) {
      throw new ArtistProfileInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: "update_artist_profile",
      moduleKey: "MEMORY",
      permission: "WRITE",
    });

    // Le workspace est imposé par le contexte serveur local ; le client ne peut
    // ni choisir un autre workspace, ni déplacer le profil vers un projet tiers.
    const profile = await database.updateArtistProfile(demoContext.workspaceId, update.data);

    if (!profile) {
      return reply
        .status(404)
        .send({ error: { code: "ARTIST_PROFILE_NOT_FOUND", message: "Profil artistique introuvable." } });
    }

    return { data: toArtistProfileResponse(profile) };
  });

  app.get("/v1/releases", async () => {
    const releases = await database.listReleases(demoContext.workspaceId);

    return {
      data: releases.map(toReleaseResponse),
    };
  });

  app.post("/v1/releases", async (request, reply) => {
    const input = releaseCreateSchema.safeParse(request.body);

    if (!input.success) {
      throw new ReleaseInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: "create_release",
      moduleKey: "MUSIC",
      permission: "WRITE",
    });

    // Scope, projet, acteur, identifiant, timestamps et relations restent
    // imposés par le serveur. Cette écriture ne relie encore aucun track ou
    // média et ne crée aucun appel externe.
    const release = await database.createRelease(demoContext.workspaceId, demoContext.userId, input.data);

    if (!release) {
      return reply.status(404).send({
        error: { code: "ARTIST_PROJECT_NOT_FOUND", message: "Projet artistique introuvable." },
      });
    }

    return reply.status(201).send({ data: toReleaseResponse(release) });
  });

  app.get("/v1/campaigns", async () => {
    const campaigns = await database.listCampaigns(demoContext.workspaceId);

    return { data: campaigns.map(toCampaignResponse) };
  });

  app.post("/v1/campaigns", async (request, reply) => {
    const input = campaignCreateSchema.safeParse(request.body);

    if (!input.success) {
      throw new CampaignInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: "create_campaign",
      moduleKey: "CAMPAIGNS",
      permission: "WRITE",
    });

    // Cette route n'enregistre qu'un brief interne DRAFT. Scope, projet,
    // acteur, identifiant et état sont toujours dérivés côté serveur ; aucun
    // contenu, calendrier, compte social ou action externe n'est touché.
    const result = await database.createCampaign(demoContext.workspaceId, demoContext.userId, input.data);

    if (result.kind === "project-not-found") {
      return reply.status(404).send({
        error: { code: "ARTIST_PROJECT_NOT_FOUND", message: "Projet artistique introuvable." },
      });
    }

    if (result.kind === "duplicate") {
      return reply.status(409).send({
        error: { code: "CAMPAIGN_ALREADY_EXISTS", message: "Une campagne avec ce nom existe déjà dans ce workspace." },
      });
    }

    return reply.status(201).send({ data: toCampaignResponse(result.campaign) });
  });

  app.patch("/v1/campaigns/:campaignId/release", async (request, reply) => {
    const params = campaignReleaseLinkParamsSchema.safeParse(request.params);
    const input = campaignReleaseLinkSchema.safeParse(request.body);

    if (!params.success || !input.success) {
      throw new CampaignReleaseLinkInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: "link_campaign_release",
      moduleKey: "CAMPAIGNS",
      permission: "WRITE",
    });

    // Le serveur résout la campagne, puis la release dans le même workspace et
    // le même projet artistique. Cette mutation ne planifie, ne publie et ne
    // relie aucun contenu ou compte social.
    const result = await database.linkCampaignRelease(
      demoContext.workspaceId,
      demoContext.userId,
      params.data.campaignId,
      input.data,
    );

    if (result.kind === "campaign-not-found") {
      return reply.status(404).send({
        error: { code: "CAMPAIGN_NOT_FOUND", message: "Campagne introuvable dans ce workspace." },
      });
    }

    if (result.kind === "release-not-found") {
      return reply.status(404).send({
        error: { code: "RELEASE_NOT_FOUND", message: "Release introuvable pour cette campagne." },
      });
    }

    if (result.kind === "stale") {
      return reply.status(409).send({
        error: {
          code: "CAMPAIGN_STALE",
          message: "La campagne a été modifiée depuis sa dernière lecture. Recharge-la avant de modifier son lien.",
        },
      });
    }

    return { data: toCampaignResponse(result.campaign) };
  });

  app.get("/v1/tracks", async () => {
    const tracks = await database.listTracks(demoContext.workspaceId);

    return {
      data: tracks.map(toTrackResponse),
    };
  });

  app.post("/v1/tracks", async (request, reply) => {
    const input = trackCreateSchema.safeParse(request.body);

    if (!input.success) {
      throw new TrackInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: "create_track",
      moduleKey: "MUSIC",
      permission: "WRITE",
    });

    // Le client ne transmet aucun scope : workspace, projet et acteur sont
    // résolus par le contexte serveur local avant l'écriture.
    const track = await database.createTrack(demoContext.workspaceId, demoContext.userId, input.data);

    if (!track) {
      return reply.status(404).send({
        error: { code: "ARTIST_PROJECT_NOT_FOUND", message: "Projet artistique introuvable." },
      });
    }

    return reply.status(201).send({ data: toTrackResponse(track) });
  });

  app.get("/v1/media", async (request) => {
    const rawQuery = isRecord(request.query) ? request.query : {};
    // Ne lire que les clés de filtre reconnues. Un workspace transmis par le
    // client est donc volontairement ignoré : le scope vient du contexte
    // serveur, jamais de l'URL.
    const query = mediaListQuerySchema.safeParse({
      q: rawQuery.q,
      status: typeof rawQuery.status === "string" ? rawQuery.status.toLocaleUpperCase("en-US") : rawQuery.status,
      type: typeof rawQuery.type === "string" ? rawQuery.type.toLocaleUpperCase("en-US") : rawQuery.type,
      tag: rawQuery.tag,
      limit: rawQuery.limit,
    });

    if (!query.success) {
      throw new MediaListQueryInputError();
    }

    const media = await database.listMedia(demoContext.workspaceId, query.data);

    return {
      data: media.map(toMediaAssetResponse),
    };
  });

  app.get("/v1/media/:mediaId/preview", async (request, reply) => {
    const params = mediaPreviewParamsSchema.safeParse(request.params);

    if (!params.success) {
      throw new MediaPreviewParamsInputError();
    }

    const media = await database.findPrivateMediaFile(demoContext.workspaceId, params.data.mediaId);
    const buffer = media ? await readPrivateMediaPreview(storageDir, demoContext.workspaceId, media) : undefined;

    // Même réponse pour une ressource inexistante, hors workspace, non
    // prévisualisable ou manquante du stockage. Aucun détail de stockage n'est
    // renvoyé et cette lecture ne génère ni audit ni effet de bord.
    if (!media || !buffer) {
      return reply.status(404).send({
        error: { code: "MEDIA_PREVIEW_NOT_FOUND", message: "Aucun aperçu privé n’est disponible pour ce média." },
      });
    }

    const byteRange = parseMediaByteRange(request.headers.range, buffer.byteLength);

    if (byteRange === "invalid") {
      reply.header("Content-Range", `bytes */${buffer.byteLength}`);
      return reply.status(416).send({
        error: { code: "MEDIA_PREVIEW_RANGE_INVALID", message: "La plage demandée pour cet aperçu est invalide." },
      });
    }

    const content = byteRange ? buffer.subarray(byteRange.start, byteRange.end + 1) : buffer;

    reply
      .header("Accept-Ranges", "bytes")
      .header("Cache-Control", "private, no-store")
      .header("Content-Disposition", "inline")
      .header("Content-Length", String(content.byteLength))
      .header("X-Content-Type-Options", "nosniff")
      .type(media.mimeType);

    if (byteRange) {
      reply.header("Content-Range", `bytes ${byteRange.start}-${byteRange.end}/${buffer.byteLength}`);
      return reply.status(206).send(content);
    }

    return reply.status(200).send(content);
  });

  app.get("/v1/content/rotation", async (request) => {
    const query = contentRotationQuerySchema.safeParse(request.query);

    if (!query.success) {
      throw new ContentRotationQueryInputError();
    }

    const candidates = await database.listContentRotationCandidates(demoContext.workspaceId, query.data.limit ?? 12);

    return contentRotationResponseSchema.parse({
      data: {
        candidates: candidates.map(toContentRotationCandidateResponse),
      },
    });
  });

  app.post("/v1/media", async (request, reply) => {
    const input = await parseMediaImport(request);

    toolGateway.assertAuthorized({
      toolKey: "import_media",
      moduleKey: "CONTENT",
      permission: "WRITE",
    });

    const sha256 = createHash("sha256").update(input.buffer).digest("hex");

    // Le hash est vérifié avant tout accès au stockage afin qu'un doublon
    // exact n'ajoute ni second enregistrement, ni second fichier privé.
    if (await database.hasMediaWithHash(demoContext.workspaceId, sha256)) {
      return reply.status(409).send({
        error: { code: "DUPLICATE_MEDIA", message: "Ce fichier est déjà présent dans la bibliothèque." },
      });
    }

    const stored = await writePrivateMedia(storageDir, demoContext.workspaceId, sha256, input.extension, input.buffer);

    try {
      const result = await database.createMedia(demoContext.workspaceId, demoContext.userId, input, {
        filename: input.filename,
        mediaType: input.mediaType,
        mimeType: input.mimeType,
        byteSize: input.buffer.byteLength,
        sha256,
        storageKey: stored.storageKey,
      });

      if (result.kind === "duplicate") {
        await removePrivateMedia(stored.filePath);
        return reply.status(409).send({
          error: { code: "DUPLICATE_MEDIA", message: "Ce fichier est déjà présent dans la bibliothèque." },
        });
      }

      if (result.kind === "project-not-found") {
        await removePrivateMedia(stored.filePath);
        return reply.status(404).send({
          error: { code: "ARTIST_PROJECT_NOT_FOUND", message: "Projet artistique introuvable." },
        });
      }

      return reply.status(201).send({ data: toMediaAssetResponse(result.asset) });
    } catch (error) {
      await removePrivateMedia(stored.filePath).catch(() => undefined);
      throw error;
    }
  });

  app.get("/v1/memories", async () => {
    const memories = await database.listMemories(demoContext.workspaceId);

    return { data: memories.map(toMemoryResponse) };
  });

  app.post("/v1/memories/proposals", async (request, reply) => {
    const input = memoryProposalCreateSchema.safeParse(request.body);

    if (!input.success) {
      throw new MemoryProposalInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: "propose_preference_memory",
      moduleKey: "MEMORY",
      permission: "WRITE",
    });

    // Le client ne peut proposer que le texte. La catégorie, l'état PENDING,
    // le workspace, l'acteur et l'identifiant sont toujours imposés ici.
    const memory = await database.createMemoryProposal(demoContext.workspaceId, demoContext.userId, input.data);

    return reply.status(201).send({ data: toMemoryResponse(memory) });
  });

  app.post("/v1/memories/:memoryId/confirm", async (request, reply) => decideMemory(request, reply, "CONFIRMED"));

  app.post("/v1/memories/:memoryId/reject", async (request, reply) => decideMemory(request, reply, "REJECTED"));

  app.get("/v1/approvals/queue", async () => {
    const approvals = await database.listApprovalQueue(demoContext.workspaceId);

    return { data: approvals.map(toApprovalQueueItemResponse) };
  });

  app.get("/v1/calendar", async (request) => {
    const query = calendarQuerySchema.safeParse(request.query);

    if (!query.success) {
      throw new CalendarQueryInputError();
    }

    const timezone = await database.getWorkspaceTimezone(demoContext.workspaceId);

    if (!timezone) {
      throw new CalendarQueryInputError();
    }

    const range = resolveCalendarRange(query.data, serverNow(), timezone);
    const items = await database.listCalendarItems(demoContext.workspaceId, range.from, range.to);

    return calendarResponseSchema.parse({
      data: {
        range: calendarRangeSchema.parse(range),
        items: items.map(toCalendarItemResponse),
      },
    });
  });

  app.post("/v1/post-variants/:variantId/approve", async (request, reply) =>
    decidePostVariant(request, reply, "APPROVED"),
  );

  app.post("/v1/post-variants/:variantId/reject", async (request, reply) =>
    decidePostVariant(request, reply, "REJECTED"),
  );

  app.post("/v1/post-variants/:variantId/internal-schedules", async (request, reply) =>
    scheduleApprovedPostVariant(request, reply),
  );

  app.post("/v1/internal-post-schedules/:scheduleId/cancel", async (request, reply) =>
    cancelInternalPostSchedule(request, reply),
  );

  app.get("/v1/tasks", async () => {
    const tasks = await database.listTasks(demoContext.workspaceId);

    return { data: tasks.map(toTaskResponse) };
  });

  app.post("/v1/tasks", async (request, reply) => {
    const input = taskCreateSchema.safeParse(request.body);

    if (!input.success) {
      throw new TaskInputError();
    }

    toolGateway.assertAuthorized({
      toolKey: "create_task",
      moduleKey: "TASKS",
      permission: "WRITE",
    });

    // Le serveur impose l'ID, le workspace, l'acteur et TODO : le client ne
    // peut pas créer une tâche déjà finalisée ou dans un autre périmètre.
    const task = await database.createTask(demoContext.workspaceId, demoContext.userId, input.data);

    return reply.status(201).send({ data: toTaskResponse(task) });
  });

  app.post("/v1/tasks/:taskId/complete", async (request, reply) => completeTask(request, reply));

  app.get("/v1/social/platforms", async () => {
    const platforms = await database.listSocialPlatforms();

    return {
      data: platforms.map((platform) =>
        socialPlatformCapabilitySchema.parse({
          platform: platform.key,
          apiVersion: "documented-capability",
          oauthSupported: platform.oauthSupported,
          draftSupported: platform.draftSupported,
          scheduleSupported: platform.scheduleSupported,
          publishSupported: platform.publishSupported,
          analyticsSupported: platform.analyticsSupported,
          requiresHumanApproval: true,
          requiresPlatformReview: true,
          notes: ["Capacité déclarative de démonstration, à vérifier avant toute intégration réelle."],
          verifiedAt: timestampFromDate(platform.verifiedAt, "2026-08-30T00:00:00.000Z"),
        }),
      ),
    };
  });

  app.get("/v1/ida/command-runs", async (request) => {
    const query = idaCommandRunListQuerySchema.safeParse(request.query);

    if (!query.success) {
      throw new CommandRunHistoryQueryInputError();
    }

    // L'historique ne peut pas sélectionner un workspace ou un acteur, ni
    // demander le résultat complet d'un outil. Le curseur est validé avant
    // la requête.
    const page = await database.listCommandRuns(demoContext.workspaceId, demoContext.userId, {
      limit: query.data.limit,
      ...(query.data.cursor ? { cursor: decodeCommandRunHistoryCursor(query.data.cursor) } : {}),
    });

    return idaCommandRunListResponseSchema.parse({
      data: {
        items: page.items.map(toCommandRunHistoryResponse),
        ...(page.nextCursor ? { nextCursor: encodeCommandRunHistoryCursor(page.nextCursor) } : {}),
      },
    });
  });

  app.post("/v1/ida/commands", async (request) => ({ data: await core.execute(request.body) }));

  return app;
}
