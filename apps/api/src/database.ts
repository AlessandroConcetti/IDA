import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type {
  ArtistProfile as ArtistProfileContract,
  ArtistProfileUpdate,
  MediaImport,
  MediaListQuery,
  MemoryProposalCreate,
  TaskCreate,
  TrackCreate,
} from "@ida/contracts";

import { demoContext, demoWorkspace } from "./demo-context.js";

export const mediaStatuses = ["UNUSED", "USED", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;

export type MediaStatus = (typeof mediaStatuses)[number];

export type DemoDatabaseOptions = {
  dataDir?: string;
  seed?: boolean;
};

export type ArtistProfile = {
  id: string;
  projectId: string;
  projectName: string;
  displayName: string;
  identity: string;
  genres: string[];
  influences: string[];
  tone: string;
  preferredVocabulary: string[];
  forbiddenVocabulary: string[];
  audience: string;
  goals: string[];
  platformPreferences: ArtistProfileContract["platformPreferences"];
  createdAt: string;
  updatedAt: string;
};

export type Release = {
  id: string;
  projectId: string;
  title: string;
  releaseType: string;
  releaseDate: string | null;
  label: string | null;
  status: string;
  description: string | null;
};

export type Track = {
  id: string;
  projectId: string;
  releaseId: string | null;
  title: string;
  artistCredit: string;
  genre: string | null;
  bpm: number | null;
  musicalKey: string | null;
  releaseDate: string | null;
  label: string | null;
  status: string;
  tags: string[];
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaAsset = {
  id: string;
  projectId: string | null;
  filename: string;
  mediaType: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  status: MediaStatus;
  description: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  projectName: string | null;
  releaseTitle: string | null;
  trackTitle: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type MediaImportFile = {
  filename: string;
  mediaType: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
};

export type CreateMediaResult =
  | { kind: "created"; asset: MediaAsset }
  | { kind: "duplicate" }
  | { kind: "project-not-found" };

export type Memory = {
  id: string;
  category: string;
  content: string;
  state: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoryDecision = "CONFIRMED" | "REJECTED";

export type MemoryDecisionResult =
  | { kind: "updated"; memory: Memory }
  | { kind: "not-found" }
  | { kind: "already-decided"; state: string };

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskCompletionResult =
  | { kind: "completed"; task: Task }
  | { kind: "already-completed"; task: Task }
  | { kind: "not-found" }
  | { kind: "not-actionable"; status: string };

export type ApprovalMedia = {
  id: string;
  filename: string;
  type: string;
  status: MediaStatus;
};

export type ApprovalQueueItem = {
  approvalId: string;
  variantId: string;
  postId: string;
  postTitle: string;
  platform: string;
  media: ApprovalMedia[];
  caption: string;
  hashtags: string[];
  cta: string | null;
  objective: string;
  rationale: string | null;
  plannedAt: string | null;
  timezone: string;
  payloadHash: string;
  approvalState: "REQUESTED";
  deliveryState: "NOT_CONFIGURED";
  requestedAt: string;
};

export type ApprovalDecision = "APPROVED" | "REJECTED";

export type PostVariantDecision = {
  approvalId: string;
  variantId: string;
  approvalState: ApprovalDecision;
  deliveryState: "NOT_CONFIGURED";
  payloadHash: string;
  decidedAt: string;
};

export type ApprovalDecisionResult =
  | { kind: "decided"; decision: PostVariantDecision }
  | { kind: "already-decided"; decision: PostVariantDecision }
  | { kind: "not-found" }
  | { kind: "stale" }
  | { kind: "opposite-decision" };

export type ApprovalDecisionPreconditionResult =
  | { kind: "ready"; approvalId: string; payloadHash: string }
  | { kind: "already-decided"; decision: PostVariantDecision }
  | { kind: "not-found" }
  | { kind: "stale" }
  | { kind: "opposite-decision" };

// Le scheduler interne possède son propre modèle. Il ne réutilise jamais la
// table historique `scheduled_posts`, qui reste une projection Today de la
// démo locale et ne porte pas le snapshot d'une variante approuvée.
export type InternalPostSchedule = {
  id: string;
  variantId: string;
  postId: string;
  platform: string;
  platformId: string;
  scheduledAt: string;
  timezone: string;
  state: "SCHEDULED" | "CANCELLED";
  approvalId: string;
  payloadHash: string;
  deliveryState: "NOT_CONFIGURED";
};

export type CalendarItem = {
  id: string;
  kind: "INTERNAL_SCHEDULE" | "APPROVED_VARIANT";
  variantId: string;
  postId: string;
  postTitle: string;
  platform: string;
  scheduledAt: string;
  timezone: string;
  state: "SCHEDULED_INTERNAL" | "READY_TO_SCHEDULE";
  approvalId: string;
  payloadHash: string;
};

export type InternalScheduleSnapshot = {
  approvalId: string;
  approvalState: string;
  approvalPayloadHash: string;
  approvalDecidedBy: string | null;
  approvalDecidedAt: string | null;
  variantId: string;
  variantApprovalState: string;
  variantPayloadHash: string;
  postId: string;
  postTitle: string;
  platform: string;
  platformId: string;
  plannedAt: string | null;
  timezone: string;
  currentPayloadHash: string;
};

export type InternalPostSchedulePreconditionResult =
  | { kind: "ready"; snapshot: InternalScheduleSnapshot }
  | { kind: "already-scheduled"; schedule: InternalPostSchedule }
  | { kind: "not-found" }
  | { kind: "stale" }
  | { kind: "time-unavailable" }
  | { kind: "conflict" };

export type InternalPostScheduleCreateResult =
  | { kind: "created"; schedule: InternalPostSchedule }
  | { kind: "already-scheduled"; schedule: InternalPostSchedule }
  | { kind: "not-found" }
  | { kind: "stale" }
  | { kind: "time-unavailable" }
  | { kind: "conflict" };

export type TodayItem = {
  id: string;
  kind: "TASK" | "SCHEDULED_POST";
  title: string;
  dueAt: string;
  status: string;
};

export type SocialPlatform = {
  id: string;
  key: string;
  name: string;
  oauthSupported: boolean;
  draftSupported: boolean;
  scheduleSupported: boolean;
  publishSupported: boolean;
  analyticsSupported: boolean;
  verifiedAt: string;
};

type ScalarRow = Record<string, unknown>;

const defaultDataDir = fileURLToPath(new URL("../.data", import.meta.url));

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asDateString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return asString(value).slice(0, 10);
}

function asTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const stringValue = asString(value);
  const parsed = new Date(stringValue);

  return Number.isNaN(parsed.getTime()) ? stringValue : parsed.toISOString();
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString);
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(asString) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function asRecordArray(value: unknown): ScalarRow[] {
  if (typeof value === "string") {
    try {
      return asRecordArray(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return Array.isArray(value)
    ? value.filter((item): item is ScalarRow => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function asPlatformPreferences(value: unknown): ArtistProfileContract["platformPreferences"] {
  if (typeof value === "string") {
    try {
      return asPlatformPreferences(JSON.parse(value));
    } catch {
      return {};
    }
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as ArtistProfileContract["platformPreferences"];
  }

  return {};
}

function isPersistentDirectory(dataDir: string): boolean {
  return !dataDir.startsWith("memory://");
}

function toTrack(row: ScalarRow): Track {
  return {
    id: asString(row.id),
    projectId: asString(row.projectId),
    releaseId: asNullableString(row.releaseId),
    title: asString(row.title),
    artistCredit: asString(row.artistCredit),
    genre: asNullableString(row.genre),
    bpm: row.bpm === null || row.bpm === undefined ? null : asNumber(row.bpm),
    musicalKey: asNullableString(row.musicalKey),
    releaseDate: asDateString(row.releaseDate),
    label: asNullableString(row.label),
    status: asString(row.status),
    tags: asStringArray(row.tags),
    description: asNullableString(row.description),
    createdAt: asTimestamp(row.createdAt) ?? "1970-01-01T00:00:00.000Z",
    updatedAt: asTimestamp(row.updatedAt) ?? "1970-01-01T00:00:00.000Z",
  };
}

function toMediaAsset(row: ScalarRow): MediaAsset {
  return {
    id: asString(row.id),
    projectId: asNullableString(row.projectId),
    filename: asString(row.filename),
    mediaType: asString(row.mediaType),
    mimeType: asString(row.mimeType),
    byteSize: asNumber(row.byteSize),
    sha256: asString(row.sha256),
    status: asString(row.status) as MediaStatus,
    description: asNullableString(row.description),
    usageCount: asNumber(row.usageCount),
    lastUsedAt: asTimestamp(row.lastUsedAt),
    projectName: asNullableString(row.projectName),
    releaseTitle: asNullableString(row.releaseTitle),
    trackTitle: asNullableString(row.trackTitle),
    tags: asStringArray(row.tags),
    createdAt: asTimestamp(row.createdAt) ?? "1970-01-01T00:00:00.000Z",
    updatedAt: asTimestamp(row.updatedAt) ?? "1970-01-01T00:00:00.000Z",
  };
}

function toMemory(row: ScalarRow): Memory {
  return {
    id: asString(row.id),
    category: asString(row.category),
    content: asString(row.content),
    state: asString(row.state),
    confirmedBy: asNullableString(row.confirmedBy),
    confirmedAt: asTimestamp(row.confirmedAt),
    createdAt: asTimestamp(row.createdAt) ?? "1970-01-01T00:00:00.000Z",
    updatedAt: asTimestamp(row.updatedAt) ?? "1970-01-01T00:00:00.000Z",
  };
}

function toTask(row: ScalarRow): Task {
  return {
    id: asString(row.id),
    title: asString(row.title),
    description: asNullableString(row.description),
    status: asString(row.status),
    dueAt: asTimestamp(row.dueAt),
    completedBy: asNullableString(row.completedBy),
    completedAt: asTimestamp(row.completedAt),
    createdAt: asTimestamp(row.createdAt) ?? "1970-01-01T00:00:00.000Z",
    updatedAt: asTimestamp(row.updatedAt) ?? "1970-01-01T00:00:00.000Z",
  };
}

function toApprovalMedia(row: ScalarRow): ApprovalMedia {
  return {
    id: asString(row.id),
    filename: asString(row.filename),
    type: asString(row.type),
    status: asString(row.status) as MediaStatus,
  };
}

function toApprovalQueueItem(row: ScalarRow): ApprovalQueueItem {
  return {
    approvalId: asString(row.approvalId),
    variantId: asString(row.variantId),
    postId: asString(row.postId),
    postTitle: asString(row.postTitle),
    platform: asString(row.platform),
    media: asRecordArray(row.media).map(toApprovalMedia),
    caption: asString(row.caption),
    hashtags: asStringArray(row.hashtags),
    cta: asNullableString(row.cta),
    objective: asString(row.objective),
    rationale: asNullableString(row.rationale),
    plannedAt: asTimestamp(row.plannedAt),
    timezone: asString(row.timezone),
    payloadHash: asString(row.payloadHash),
    approvalState: "REQUESTED",
    deliveryState: "NOT_CONFIGURED",
    requestedAt: asTimestamp(row.requestedAt) ?? "1970-01-01T00:00:00.000Z",
  };
}

function toPostVariantDecision(row: ScalarRow): PostVariantDecision {
  return {
    approvalId: asString(row.approvalId),
    variantId: asString(row.variantId),
    approvalState: asString(row.approvalState) as ApprovalDecision,
    deliveryState: "NOT_CONFIGURED",
    payloadHash: asString(row.payloadHash),
    decidedAt: asTimestamp(row.decidedAt) ?? "1970-01-01T00:00:00.000Z",
  };
}

type QueryRows = (statement: string, values?: unknown[]) => Promise<{ rows: ScalarRow[] }>;

function normalizeApprovalPayloadText(value: string): string {
  return value.normalize("NFKC").trim();
}

function calculatePostVariantPayloadHash(input: {
  postTitle: string;
  objective: string;
  rationale: string | null;
  platform: string;
  caption: string;
  hashtags: string[];
  cta: string | null;
  plannedAt: string | null;
  timezone: string;
  media: ApprovalMedia[];
}): string {
  // La sérialisation est volontairement explicite et ordonnée. Elle relie la
  // décision à tous les champs exposés dans la file, sans contenir de clé de
  // stockage, URL privée ou autre donnée sensible.
  const canonicalPayload = JSON.stringify({
    version: 1,
    postTitle: normalizeApprovalPayloadText(input.postTitle),
    objective: normalizeApprovalPayloadText(input.objective),
    rationale: input.rationale === null ? null : normalizeApprovalPayloadText(input.rationale),
    platform: normalizeApprovalPayloadText(input.platform),
    caption: normalizeApprovalPayloadText(input.caption),
    hashtags: input.hashtags.map(normalizeApprovalPayloadText),
    cta: input.cta === null ? null : normalizeApprovalPayloadText(input.cta),
    plannedAt: input.plannedAt,
    timezone: normalizeApprovalPayloadText(input.timezone),
    media: input.media.map((media) => ({
      id: media.id,
      filename: normalizeApprovalPayloadText(media.filename),
      type: media.type,
      status: media.status,
    })),
  });

  return `sha256:${createHash("sha256").update(canonicalPayload).digest("hex")}`;
}

function toInternalScheduleSnapshot(row: ScalarRow): InternalScheduleSnapshot {
  const plannedAt = asTimestamp(row.plannedAt);

  return {
    approvalId: asString(row.approvalId),
    approvalState: asString(row.approvalState),
    approvalPayloadHash: asString(row.approvalPayloadHash),
    approvalDecidedBy: asNullableString(row.approvalDecidedBy),
    approvalDecidedAt: asTimestamp(row.approvalDecidedAt),
    variantId: asString(row.variantId),
    variantApprovalState: asString(row.variantApprovalState),
    variantPayloadHash: asString(row.variantPayloadHash),
    postId: asString(row.postId),
    postTitle: asString(row.postTitle),
    platform: asString(row.platform),
    platformId: asString(row.platformId),
    plannedAt,
    timezone: asString(row.timezone),
    currentPayloadHash: calculatePostVariantPayloadHash({
      postTitle: asString(row.postTitle),
      objective: asString(row.objective),
      rationale: asNullableString(row.rationale),
      platform: asString(row.platform),
      caption: asString(row.caption),
      hashtags: asStringArray(row.hashtags),
      cta: asNullableString(row.cta),
      plannedAt,
      timezone: asString(row.timezone),
      media: asRecordArray(row.media).map(toApprovalMedia),
    }),
  };
}

function isCurrentApprovedScheduleSnapshot(snapshot: InternalScheduleSnapshot, expectedPayloadHash: string): boolean {
  return (
    snapshot.approvalState === "APPROVED" &&
    snapshot.variantApprovalState === "APPROVED" &&
    snapshot.approvalDecidedBy !== null &&
    snapshot.approvalDecidedAt !== null &&
    snapshot.currentPayloadHash === snapshot.variantPayloadHash &&
    snapshot.approvalPayloadHash === snapshot.variantPayloadHash &&
    expectedPayloadHash === snapshot.variantPayloadHash
  );
}

function isExactActiveSchedule(row: ScalarRow, snapshot: InternalScheduleSnapshot): boolean {
  return (
    asString(row.approvalId) === snapshot.approvalId &&
    asString(row.payloadHash) === snapshot.variantPayloadHash &&
    asString(row.platformId) === snapshot.platformId &&
    asTimestamp(row.scheduledAt) === snapshot.plannedAt &&
    asString(row.timezone) === snapshot.timezone &&
    asString(row.state) === "SCHEDULED"
  );
}

function toInternalPostScheduleFromSnapshot(row: ScalarRow, snapshot: InternalScheduleSnapshot): InternalPostSchedule {
  return {
    id: asString(row.id),
    variantId: snapshot.variantId,
    postId: snapshot.postId,
    platform: snapshot.platform,
    platformId: snapshot.platformId,
    scheduledAt: asTimestamp(row.scheduledAt) ?? "1970-01-01T00:00:00.000Z",
    timezone: asString(row.timezone),
    state: "SCHEDULED",
    approvalId: snapshot.approvalId,
    payloadHash: snapshot.variantPayloadHash,
    deliveryState: "NOT_CONFIGURED",
  };
}

function toCalendarInternalScheduleItem(row: ScalarRow, snapshot: InternalScheduleSnapshot): CalendarItem {
  return {
    id: asString(row.id),
    kind: "INTERNAL_SCHEDULE",
    variantId: snapshot.variantId,
    postId: snapshot.postId,
    postTitle: snapshot.postTitle,
    platform: snapshot.platform,
    scheduledAt: asTimestamp(row.scheduledAt) ?? "1970-01-01T00:00:00.000Z",
    timezone: asString(row.timezone),
    state: "SCHEDULED_INTERNAL",
    approvalId: snapshot.approvalId,
    payloadHash: snapshot.variantPayloadHash,
  };
}

function toCalendarApprovedVariantItem(snapshot: InternalScheduleSnapshot): CalendarItem | null {
  if (!snapshot.plannedAt) {
    return null;
  }

  return {
    id: snapshot.variantId,
    kind: "APPROVED_VARIANT",
    variantId: snapshot.variantId,
    postId: snapshot.postId,
    postTitle: snapshot.postTitle,
    platform: snapshot.platform,
    scheduledAt: snapshot.plannedAt,
    timezone: snapshot.timezone,
    state: "READY_TO_SCHEDULE",
    approvalId: snapshot.approvalId,
    payloadHash: snapshot.variantPayloadHash,
  };
}

function normalizeMediaTag(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("fr-FR");
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, "\\$&");
}

export class DemoDatabase {
  readonly pglite: PGlite;

  private constructor(pglite: PGlite) {
    this.pglite = pglite;
  }

  static async open(options: DemoDatabaseOptions = {}): Promise<DemoDatabase> {
    const dataDir = options.dataDir ?? defaultDataDir;

    if (isPersistentDirectory(dataDir)) {
      await mkdir(dataDir, { recursive: true });
    }

    const database = new DemoDatabase(new PGlite(dataDir));
    await database.pglite.waitReady;
    await database.initialize();

    if (options.seed ?? true) {
      await database.seed();
    }

    return database;
  }

  async close(): Promise<void> {
    await this.pglite.close();
  }

  async getArtistProfile(workspaceId: string): Promise<ArtistProfile | null> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT
          profile.id,
          profile.project_id AS "projectId",
          project.name AS "projectName",
          profile.display_name AS "displayName",
          profile.identity,
          profile.genres,
          profile.influences,
          profile.tone,
          profile.preferred_vocabulary AS "preferredVocabulary",
          profile.forbidden_vocabulary AS "forbiddenVocabulary",
          profile.audience,
          profile.goals,
          profile.platform_preferences AS "platformPreferences",
          profile.created_at AS "createdAt",
          profile.updated_at AS "updatedAt"
        FROM artist_profiles profile
        INNER JOIN artist_projects project ON project.id = profile.project_id
        WHERE profile.workspace_id = $1
          AND project.workspace_id = $1
        LIMIT 1
      `,
      [workspaceId],
    );
    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      id: asString(row.id),
      projectId: asString(row.projectId),
      projectName: asString(row.projectName),
      displayName: asString(row.displayName),
      identity: asString(row.identity),
      genres: asStringArray(row.genres),
      influences: asStringArray(row.influences),
      tone: asString(row.tone),
      preferredVocabulary: asStringArray(row.preferredVocabulary),
      forbiddenVocabulary: asStringArray(row.forbiddenVocabulary),
      audience: asString(row.audience),
      goals: asStringArray(row.goals),
      platformPreferences: asPlatformPreferences(row.platformPreferences),
      createdAt: asTimestamp(row.createdAt) ?? "1970-01-01T00:00:00.000Z",
      updatedAt: asTimestamp(row.updatedAt) ?? "1970-01-01T00:00:00.000Z",
    };
  }

  async updateArtistProfile(workspaceId: string, update: ArtistProfileUpdate): Promise<ArtistProfile | null> {
    const current = await this.getArtistProfile(workspaceId);

    if (!current) {
      return null;
    }

    const result = await this.pglite.query<ScalarRow>(
      `
        UPDATE artist_profiles
        SET
          identity = COALESCE($1::text, identity),
          genres = CASE WHEN $2::text IS NULL THEN genres ELSE $2::json END,
          influences = CASE WHEN $3::text IS NULL THEN influences ELSE $3::json END,
          tone = COALESCE($4::text, tone),
          preferred_vocabulary = CASE WHEN $5::text IS NULL THEN preferred_vocabulary ELSE $5::json END,
          forbidden_vocabulary = CASE WHEN $6::text IS NULL THEN forbidden_vocabulary ELSE $6::json END,
          goals = CASE WHEN $7::text IS NULL THEN goals ELSE $7::json END,
          audience = COALESCE($8::text, audience),
          platform_preferences = CASE WHEN $9::text IS NULL THEN platform_preferences ELSE $9::json END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $10
          AND workspace_id = $11
        RETURNING id
      `,
      [
        update.identity ?? null,
        update.genres === undefined ? null : JSON.stringify(update.genres),
        update.influences === undefined ? null : JSON.stringify(update.influences),
        update.tone ?? null,
        update.preferredVocabulary === undefined ? null : JSON.stringify(update.preferredVocabulary),
        update.forbiddenVocabulary === undefined ? null : JSON.stringify(update.forbiddenVocabulary),
        update.goals === undefined ? null : JSON.stringify(update.goals),
        update.audience ?? null,
        update.platformPreferences === undefined ? null : JSON.stringify(update.platformPreferences),
        current.id,
        workspaceId,
      ],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.getArtistProfile(workspaceId);
  }

  async listReleases(workspaceId: string): Promise<Release[]> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT
          id,
          artist_project_id AS "projectId",
          title,
          release_type AS "releaseType",
          release_date AS "releaseDate",
          label,
          status,
          description
        FROM releases
        WHERE workspace_id = $1
        ORDER BY release_date NULLS LAST, title
      `,
      [workspaceId],
    );

    return result.rows.map((row) => ({
      id: asString(row.id),
      projectId: asString(row.projectId),
      title: asString(row.title),
      releaseType: asString(row.releaseType),
      releaseDate: asDateString(row.releaseDate),
      label: asNullableString(row.label),
      status: asString(row.status),
      description: asNullableString(row.description),
    }));
  }

  async listTracks(workspaceId: string): Promise<Track[]> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT
          id,
          artist_project_id AS "projectId",
          release_id AS "releaseId",
          title,
          artist_credit AS "artistCredit",
          genre,
          bpm,
          musical_key AS "musicalKey",
          release_date AS "releaseDate",
          label,
          status,
          tags,
          description,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tracks
        WHERE workspace_id = $1
        ORDER BY release_date NULLS LAST, title
      `,
      [workspaceId],
    );

    return result.rows.map(toTrack);
  }

  async createTrack(workspaceId: string, actorUserId: string, input: TrackCreate): Promise<Track | null> {
    return this.pglite.transaction(async (transaction) => {
      const projectResult = await transaction.query<ScalarRow>(
        `
          SELECT id
          FROM artist_projects
          WHERE workspace_id = $1
          ORDER BY created_at ASC
          LIMIT 1
        `,
        [workspaceId],
      );
      const project = projectResult.rows[0];

      if (!project) {
        return null;
      }

      const projectId = asString(project.id);

      // Un ID est généré côté serveur et la contrainte primaire conserve la
      // garantie d'unicité même dans le cas extrêmement improbable d'une collision.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const trackId = `trk_${randomUUID().replaceAll("-", "")}`;
        const result = await transaction.query<ScalarRow>(
          `
            INSERT INTO tracks (
              id, workspace_id, artist_project_id, title, artist_credit, genre, bpm,
              musical_key, release_date, label, tags, description, status
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::json, $12, $13
            )
            ON CONFLICT (id) DO NOTHING
            RETURNING
              id,
              artist_project_id AS "projectId",
              release_id AS "releaseId",
              title,
              artist_credit AS "artistCredit",
              genre,
              bpm,
              musical_key AS "musicalKey",
              release_date AS "releaseDate",
              label,
              status,
              tags,
              description,
              created_at AS "createdAt",
              updated_at AS "updatedAt"
          `,
          [
            trackId,
            workspaceId,
            projectId,
            input.title,
            input.artistCredit,
            input.genre ?? null,
            input.bpm ?? null,
            input.musicalKey ?? null,
            input.releaseDate ?? null,
            input.label ?? null,
            JSON.stringify(input.tags),
            input.description ?? null,
            input.status,
          ],
        );
        const row = result.rows[0];

        if (!row) {
          continue;
        }

        const track = toTrack(row);
        await transaction.query(
          `
            INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload)
            VALUES ($1, $2, $3, 'track.created', 'TRACK', $4, $5::json)
          `,
          [
            `act_${randomUUID().replaceAll("-", "")}`,
            workspaceId,
            actorUserId,
            track.id,
            JSON.stringify({ status: track.status, title: track.title }),
          ],
        );

        return track;
      }

      throw new Error("Impossible de générer un identifiant unique pour le morceau.");
    });
  }

  async listMedia(workspaceId: string, filters: MediaListQuery = {}): Promise<MediaAsset[]> {
    const values: unknown[] = [workspaceId];
    const whereClauses = ["asset.workspace_id = $1"];

    if (filters.status) {
      values.push(filters.status);
      whereClauses.push(`asset.status = $${values.length}`);
    }

    if (filters.type) {
      values.push(filters.type);
      whereClauses.push(`asset.media_type = $${values.length}`);
    }

    if (filters.q) {
      values.push(`%${escapeLikePattern(filters.q)}%`);
      const searchPlaceholder = `$${values.length}`;
      whereClauses.push(`(
        asset.filename ILIKE ${searchPlaceholder} ESCAPE '\\'
        OR COALESCE(asset.description, '') ILIKE ${searchPlaceholder} ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM media_asset_tags search_asset_tag
          INNER JOIN media_tags search_tag ON search_tag.id = search_asset_tag.media_tag_id
          WHERE search_asset_tag.media_asset_id = asset.id
            AND search_tag.workspace_id = asset.workspace_id
            AND search_tag.name ILIKE ${searchPlaceholder} ESCAPE '\\'
        )
      )`);
    }

    if (filters.tag) {
      values.push(normalizeMediaTag(filters.tag));
      const tagPlaceholder = `$${values.length}`;
      whereClauses.push(`EXISTS (
        SELECT 1
        FROM media_asset_tags filter_asset_tag
        INNER JOIN media_tags filter_tag ON filter_tag.id = filter_asset_tag.media_tag_id
        WHERE filter_asset_tag.media_asset_id = asset.id
          AND filter_tag.workspace_id = asset.workspace_id
          AND filter_tag.normalized_name = ${tagPlaceholder}
      )`);
    }

    values.push(filters.limit ?? 50);
    const limitPlaceholder = `$${values.length}`;

    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT
          asset.id,
          asset.artist_project_id AS "projectId",
          asset.filename,
          asset.media_type AS "mediaType",
          asset.mime_type AS "mimeType",
          asset.byte_size AS "byteSize",
          asset.sha256,
          asset.status,
          asset.description,
          asset.usage_count AS "usageCount",
          asset.last_used_at AS "lastUsedAt",
          asset.created_at AS "createdAt",
          asset.updated_at AS "updatedAt",
          project.name AS "projectName",
          release.title AS "releaseTitle",
          track.title AS "trackTitle",
          COALESCE(
            json_agg(tag.name ORDER BY tag.name) FILTER (WHERE tag.name IS NOT NULL),
            '[]'::json
          ) AS tags
        FROM media_assets asset
        LEFT JOIN artist_projects project ON project.id = asset.artist_project_id AND project.workspace_id = asset.workspace_id
        LEFT JOIN releases release ON release.id = asset.release_id AND release.workspace_id = asset.workspace_id
        LEFT JOIN tracks track ON track.id = asset.track_id AND track.workspace_id = asset.workspace_id
        LEFT JOIN media_asset_tags asset_tag ON asset_tag.media_asset_id = asset.id
        LEFT JOIN media_tags tag ON tag.id = asset_tag.media_tag_id AND tag.workspace_id = asset.workspace_id
        WHERE ${whereClauses.join("\n          AND ")}
        GROUP BY asset.id, project.name, release.title, track.title
        ORDER BY asset.created_at DESC, asset.id DESC
        LIMIT ${limitPlaceholder}
      `,
      values,
    );

    return result.rows.map(toMediaAsset);
  }

  async hasMediaWithHash(workspaceId: string, sha256: string): Promise<boolean> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT id
        FROM media_assets
        WHERE workspace_id = $1
          AND sha256 = $2
        LIMIT 1
      `,
      [workspaceId, sha256],
    );

    return result.rows.length > 0;
  }

  async createMedia(
    workspaceId: string,
    actorUserId: string,
    input: MediaImport,
    file: MediaImportFile,
  ): Promise<CreateMediaResult> {
    return this.pglite.transaction(async (transaction) => {
      const existing = await transaction.query<ScalarRow>(
        `
          SELECT id
          FROM media_assets
          WHERE workspace_id = $1
            AND sha256 = $2
          LIMIT 1
        `,
        [workspaceId, file.sha256],
      );

      if (existing.rows.length > 0) {
        return { kind: "duplicate" };
      }

      const projectResult = await transaction.query<ScalarRow>(
        `
          SELECT id
          FROM artist_projects
          WHERE workspace_id = $1
          ORDER BY created_at ASC
          LIMIT 1
        `,
        [workspaceId],
      );
      const project = projectResult.rows[0];

      if (!project) {
        return { kind: "project-not-found" };
      }

      const projectId = asString(project.id);
      const mediaId = `med_${randomUUID().replaceAll("-", "")}`;
      const normalizedTags = [...new Set(input.tags.map(normalizeMediaTag))];
      const created = await transaction.query<ScalarRow>(
        `
          INSERT INTO media_assets (
            id, workspace_id, artist_project_id, filename, media_type, mime_type,
            byte_size, sha256, storage_key, status, description
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'UNUSED', $10)
          ON CONFLICT (workspace_id, sha256) DO NOTHING
          RETURNING
            id,
            artist_project_id AS "projectId",
            filename,
            media_type AS "mediaType",
            mime_type AS "mimeType",
            byte_size AS "byteSize",
            sha256,
            status,
            description,
            usage_count AS "usageCount",
            last_used_at AS "lastUsedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [
          mediaId,
          workspaceId,
          projectId,
          file.filename,
          file.mediaType,
          file.mimeType,
          file.byteSize,
          file.sha256,
          file.storageKey,
          input.description ?? null,
        ],
      );
      const row = created.rows[0];

      if (!row) {
        return { kind: "duplicate" };
      }

      const asset = toMediaAsset(row);

      for (const tagName of normalizedTags) {
        const tagResult = await transaction.query<ScalarRow>(
          `
            INSERT INTO media_tags (id, workspace_id, name, normalized_name)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (workspace_id, normalized_name)
            DO UPDATE SET normalized_name = EXCLUDED.normalized_name
            RETURNING id
          `,
          [`tag_${randomUUID().replaceAll("-", "")}`, workspaceId, tagName, tagName],
        );
        const tag = tagResult.rows[0];

        if (!tag) {
          throw new Error("Impossible de rattacher le tag du média.");
        }

        await transaction.query(
          `
            INSERT INTO media_asset_tags (media_asset_id, media_tag_id)
            VALUES ($1, $2)
            ON CONFLICT (media_asset_id, media_tag_id) DO NOTHING
          `,
          [asset.id, asString(tag.id)],
        );
      }

      await transaction.query(
        `
          INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload)
          VALUES ($1, $2, $3, 'media.imported', 'MEDIA_ASSET', $4, $5::json)
        `,
        [
          `act_${randomUUID().replaceAll("-", "")}`,
          workspaceId,
          actorUserId,
          asset.id,
          JSON.stringify({
            filename: asset.filename,
            mediaType: asset.mediaType,
            mimeType: asset.mimeType,
            byteSize: asset.byteSize,
            sha256: asset.sha256,
            tags: normalizedTags,
          }),
        ],
      );

      return { kind: "created", asset: { ...asset, tags: normalizedTags } };
    });
  }

  async listMemories(workspaceId: string): Promise<Memory[]> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT
          id,
          category,
          content,
          state,
          confirmed_by AS "confirmedBy",
          confirmed_at AS "confirmedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM memories
        WHERE workspace_id = $1
        ORDER BY created_at DESC, id ASC
      `,
      [workspaceId],
    );

    return result.rows.map(toMemory);
  }

  async createMemoryProposal(workspaceId: string, actorUserId: string, input: MemoryProposalCreate): Promise<Memory> {
    return this.pglite.transaction(async (transaction) => {
      // L'ID, la catégorie et l'état de départ sont toujours décidés ici, pas
      // par le client. Une proposition n'est jamais une mémoire durable.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const memoryId = `mem_${randomUUID().replaceAll("-", "")}`;
        const result = await transaction.query<ScalarRow>(
          `
            INSERT INTO memories (id, workspace_id, category, content, state)
            VALUES ($1, $2, 'PREFERENCE_MEMORY', $3, 'PENDING')
            ON CONFLICT (id) DO NOTHING
            RETURNING
              id,
              category,
              content,
              state,
              confirmed_by AS "confirmedBy",
              confirmed_at AS "confirmedAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
          `,
          [memoryId, workspaceId, input.content],
        );
        const row = result.rows[0];

        if (!row) {
          continue;
        }

        const memory = toMemory(row);
        await transaction.query(
          `
            INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload)
            VALUES ($1, $2, $3, 'memory.proposed', 'MEMORY', $4, $5::json)
          `,
          [
            `act_${randomUUID().replaceAll("-", "")}`,
            workspaceId,
            actorUserId,
            memory.id,
            JSON.stringify({ category: memory.category, state: memory.state }),
          ],
        );

        return memory;
      }

      throw new Error("Impossible de générer un identifiant unique pour la proposition de mémoire.");
    });
  }

  async decideMemory(
    workspaceId: string,
    actorUserId: string,
    memoryId: string,
    decision: MemoryDecision,
  ): Promise<MemoryDecisionResult> {
    return this.pglite.transaction(async (transaction) => {
      // La clause `state = 'PENDING'` rend la décision atomique : un état final
      // ne peut pas être remplacé par une seconde confirmation ou un refus.
      const update = await transaction.query<ScalarRow>(
        `
          UPDATE memories
          SET
            state = $3,
            confirmed_at = CASE WHEN $3 = 'CONFIRMED' THEN CURRENT_TIMESTAMP ELSE NULL END,
            confirmed_by = CASE WHEN $3 = 'CONFIRMED' THEN $4 ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
            AND workspace_id = $2
            AND state = 'PENDING'
          RETURNING
            id,
            category,
            content,
            state,
            confirmed_by AS "confirmedBy",
            confirmed_at AS "confirmedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [memoryId, workspaceId, decision, actorUserId],
      );
      const row = update.rows[0];

      if (row) {
        const memory = toMemory(row);
        const action = decision === "CONFIRMED" ? "memory.confirmed" : "memory.rejected";

        await transaction.query(
          `
            INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload)
            VALUES ($1, $2, $3, $4, 'MEMORY', $5, $6::json)
          `,
          [
            `act_${randomUUID().replaceAll("-", "")}`,
            workspaceId,
            actorUserId,
            action,
            memory.id,
            JSON.stringify({ state: memory.state }),
          ],
        );

        return { kind: "updated", memory };
      }

      // Une recherche strictement scoped distingue une mémoire absente/hors
      // workspace (404 côté route) d'une décision finale immuable (409).
      const existing = await transaction.query<ScalarRow>(
        `
          SELECT state
          FROM memories
          WHERE id = $1
            AND workspace_id = $2
        `,
        [memoryId, workspaceId],
      );
      const existingMemory = existing.rows[0];

      if (!existingMemory) {
        return { kind: "not-found" };
      }

      return { kind: "already-decided", state: asString(existingMemory.state) };
    });
  }

  async listApprovalQueue(workspaceId: string): Promise<ApprovalQueueItem[]> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT
          approval.id AS "approvalId",
          variant.id AS "variantId",
          post.id AS "postId",
          post.title AS "postTitle",
          platform.key AS platform,
          variant.caption,
          variant.hashtags AS hashtags,
          variant.cta,
          post.objective,
          post.rationale,
          variant.planned_at AS "plannedAt",
          variant.timezone,
          variant.payload_hash AS "payloadHash",
          approval.requested_at AS "requestedAt",
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', media.id,
                  'filename', media.filename,
                  'type', media.media_type,
                  'status', media.status
                )
                ORDER BY link.sort_order ASC, media.id ASC
              )
              FROM post_variant_media link
              INNER JOIN media_assets media ON media.id = link.media_asset_id
              WHERE link.post_variant_id = variant.id
                AND link.workspace_id = variant.workspace_id
                AND media.workspace_id = variant.workspace_id
            ),
            '[]'::json
          ) AS media
        FROM approvals approval
        INNER JOIN post_variants variant ON variant.id = approval.post_variant_id
          AND variant.workspace_id = approval.workspace_id
        INNER JOIN posts post ON post.id = variant.post_id
          AND post.workspace_id = variant.workspace_id
        INNER JOIN social_platforms platform ON platform.id = variant.platform_id
        WHERE post.workspace_id = $1
          AND variant.workspace_id = $1
          AND approval.workspace_id = $1
          AND approval.state = 'REQUESTED'
          AND approval.payload_hash = variant.payload_hash
          AND variant.approval_state = 'REQUESTED'
          AND variant.delivery_state = 'NOT_CONFIGURED'
        ORDER BY variant.planned_at ASC NULLS LAST, approval.requested_at ASC, variant.id ASC
      `,
      [workspaceId],
    );

    return result.rows.map(toApprovalQueueItem);
  }

  async preparePostVariantDecision(
    workspaceId: string,
    variantId: string,
    approvalId: string,
    expectedPayloadHash: string,
    decision: ApprovalDecision,
  ): Promise<ApprovalDecisionPreconditionResult> {
    // Cette lecture précède le ToolGateway : elle transforme les deux valeurs
    // de précondition client en une approbation effectivement résolue dans le
    // workspace serveur. La mutation atomique les revérifie ensuite pour
    // couvrir toute course entre cette étape et l'écriture.
    const scopedVariant = await this.pglite.query<ScalarRow>(
      `
        SELECT variant.id
        FROM post_variants variant
        INNER JOIN posts post ON post.id = variant.post_id
          AND post.workspace_id = variant.workspace_id
        WHERE variant.id = $1
          AND variant.workspace_id = $2
          AND post.workspace_id = $2
      `,
      [variantId, workspaceId],
    );

    if (!scopedVariant.rows[0]) {
      return { kind: "not-found" };
    }

    const current = await this.pglite.query<ScalarRow>(
      `
        SELECT
          approval.id AS "approvalId",
          approval.state AS "approvalState",
          approval.payload_hash AS "approvalPayloadHash",
          approval.decided_by AS "approvalDecidedBy",
          approval.decided_at AS "approvalDecidedAt",
          approval.payload_hash AS "payloadHash",
          approval.decided_at AS "decidedAt",
          variant.id AS "variantId",
          variant.approval_state AS "variantApprovalState",
          variant.delivery_state AS "deliveryState",
          variant.payload_hash AS "variantPayloadHash",
          post.title AS "postTitle",
          post.objective,
          post.rationale,
          platform.key AS platform,
          variant.caption,
          variant.hashtags AS hashtags,
          variant.cta,
          variant.planned_at AS "plannedAt",
          variant.timezone,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', media.id,
                  'filename', media.filename,
                  'type', media.media_type,
                  'status', media.status
                )
                ORDER BY link.sort_order ASC, media.id ASC
              )
              FROM post_variant_media link
              INNER JOIN media_assets media ON media.id = link.media_asset_id
              WHERE link.post_variant_id = variant.id
                AND link.workspace_id = variant.workspace_id
                AND media.workspace_id = variant.workspace_id
            ),
            '[]'::json
          ) AS media
        FROM approvals approval
        INNER JOIN post_variants variant ON variant.id = approval.post_variant_id
          AND variant.workspace_id = approval.workspace_id
        INNER JOIN posts post ON post.id = variant.post_id
          AND post.workspace_id = variant.workspace_id
        INNER JOIN social_platforms platform ON platform.id = variant.platform_id
        WHERE approval.id = $1
          AND approval.post_variant_id = $2
          AND approval.workspace_id = $3
          AND variant.workspace_id = $3
          AND post.workspace_id = $3
        LIMIT 1
      `,
      [approvalId, variantId, workspaceId],
    );
    const row = current.rows[0];

    if (!row) {
      return { kind: "stale" };
    }

    const currentPayloadHash = calculatePostVariantPayloadHash({
      postTitle: asString(row.postTitle),
      objective: asString(row.objective),
      rationale: asNullableString(row.rationale),
      platform: asString(row.platform),
      caption: asString(row.caption),
      hashtags: asStringArray(row.hashtags),
      cta: asNullableString(row.cta),
      plannedAt: asTimestamp(row.plannedAt),
      timezone: asString(row.timezone),
      media: asRecordArray(row.media).map(toApprovalMedia),
    });
    const approvalState = asString(row.approvalState);
    const variantApprovalState = asString(row.variantApprovalState);
    const storedApprovalHash = asString(row.approvalPayloadHash);
    const storedVariantHash = asString(row.variantPayloadHash);

    if (
      currentPayloadHash !== storedVariantHash ||
      storedApprovalHash !== storedVariantHash ||
      expectedPayloadHash !== storedVariantHash
    ) {
      return { kind: "stale" };
    }

    if (approvalState === decision && variantApprovalState === decision) {
      return { kind: "already-decided", decision: toPostVariantDecision(row) };
    }

    if (approvalState !== "REQUESTED" || variantApprovalState !== "REQUESTED") {
      return { kind: "opposite-decision" };
    }

    return {
      kind: "ready",
      approvalId: asString(row.approvalId),
      payloadHash: storedVariantHash,
    };
  }

  async decidePostVariant(
    workspaceId: string,
    actorUserId: string,
    variantId: string,
    approvalId: string,
    expectedPayloadHash: string,
    decision: ApprovalDecision,
  ): Promise<ApprovalDecisionResult> {
    return this.pglite.transaction(async (transaction) => {
      // Vérifier d'abord l'existence de la variante exclusivement dans le
      // workspace du serveur. Ainsi un identifiant étranger ne révèle ni son
      // approbation ni son contenu.
      const scopedVariant = await transaction.query<ScalarRow>(
        `
          SELECT variant.id
          FROM post_variants variant
          INNER JOIN posts post ON post.id = variant.post_id
            AND post.workspace_id = variant.workspace_id
          WHERE variant.id = $1
            AND variant.workspace_id = $2
            AND post.workspace_id = $2
        `,
        [variantId, workspaceId],
      );

      if (!scopedVariant.rows[0]) {
        return { kind: "not-found" };
      }

      const current = await transaction.query<ScalarRow>(
        `
          SELECT
            approval.id AS "approvalId",
            approval.state AS "approvalState",
            approval.payload_hash AS "approvalPayloadHash",
            approval.payload_hash AS "payloadHash",
            approval.decided_at AS "decidedAt",
            variant.id AS "variantId",
            variant.approval_state AS "variantApprovalState",
            variant.delivery_state AS "deliveryState",
            variant.payload_hash AS "variantPayloadHash",
            post.title AS "postTitle",
            post.objective,
            post.rationale,
            platform.key AS platform,
            variant.caption,
            variant.hashtags AS hashtags,
            variant.cta,
            variant.planned_at AS "plannedAt",
            variant.timezone,
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', media.id,
                    'filename', media.filename,
                    'type', media.media_type,
                    'status', media.status
                  )
                  ORDER BY link.sort_order ASC, media.id ASC
                )
                FROM post_variant_media link
                INNER JOIN media_assets media ON media.id = link.media_asset_id
                WHERE link.post_variant_id = variant.id
                  AND link.workspace_id = variant.workspace_id
                  AND media.workspace_id = variant.workspace_id
              ),
              '[]'::json
            ) AS media
          FROM approvals approval
          INNER JOIN post_variants variant ON variant.id = approval.post_variant_id
            AND variant.workspace_id = approval.workspace_id
          INNER JOIN posts post ON post.id = variant.post_id
            AND post.workspace_id = variant.workspace_id
          INNER JOIN social_platforms platform ON platform.id = variant.platform_id
          WHERE approval.id = $1
            AND approval.post_variant_id = $2
            AND approval.workspace_id = $3
            AND variant.workspace_id = $3
            AND post.workspace_id = $3
          LIMIT 1
        `,
        [approvalId, variantId, workspaceId],
      );
      const row = current.rows[0];

      // Une approbation absente, appartenant à une autre variante ou qui ne
      // correspond plus au hash courant est une précondition obsolète. Ce
      // chemin n'écrit rien, même si la variante elle-même est visible.
      if (!row) {
        return { kind: "stale" };
      }

      const currentPayloadHash = calculatePostVariantPayloadHash({
        postTitle: asString(row.postTitle),
        objective: asString(row.objective),
        rationale: asNullableString(row.rationale),
        platform: asString(row.platform),
        caption: asString(row.caption),
        hashtags: asStringArray(row.hashtags),
        cta: asNullableString(row.cta),
        plannedAt: asTimestamp(row.plannedAt),
        timezone: asString(row.timezone),
        media: asRecordArray(row.media).map(toApprovalMedia),
      });
      const approvalState = asString(row.approvalState);
      const variantApprovalState = asString(row.variantApprovalState);
      const storedApprovalHash = asString(row.approvalPayloadHash);
      const storedVariantHash = asString(row.variantPayloadHash);

      if (
        currentPayloadHash !== storedVariantHash ||
        storedApprovalHash !== storedVariantHash ||
        expectedPayloadHash !== storedVariantHash
      ) {
        return { kind: "stale" };
      }

      if (approvalState === decision && variantApprovalState === decision) {
        return { kind: "already-decided", decision: toPostVariantDecision(row) };
      }

      if (approvalState !== "REQUESTED" || variantApprovalState !== "REQUESTED") {
        return { kind: "opposite-decision" };
      }

      // L'état REQUESTED et le hash sont répétés dans le WHERE : deux
      // décisions concurrentes ne pourront donc pas inscrire deux audits.
      const updatedApproval = await transaction.query<ScalarRow>(
        `
          UPDATE approvals approval
          SET
            state = $4,
            decided_at = CURRENT_TIMESTAMP,
            decided_by = $5
          FROM post_variants variant, posts post
          WHERE approval.id = $1
            AND approval.post_variant_id = $2
            AND approval.workspace_id = $3
            AND approval.state = 'REQUESTED'
            AND approval.payload_hash = $6
            AND variant.id = $2
            AND variant.workspace_id = $3
            AND variant.post_id = post.id
            AND post.workspace_id = $3
            AND variant.approval_state = 'REQUESTED'
            AND variant.payload_hash = $6
            AND variant.delivery_state = 'NOT_CONFIGURED'
          RETURNING
            approval.id AS "approvalId",
            approval.post_variant_id AS "variantId",
            approval.state AS "approvalState",
            variant.delivery_state AS "deliveryState",
            approval.payload_hash AS "payloadHash",
            approval.decided_at AS "decidedAt"
        `,
        [approvalId, variantId, workspaceId, decision, actorUserId, expectedPayloadHash],
      );
      const updatedRow = updatedApproval.rows[0];

      if (!updatedRow) {
        // Une transaction concurrente a pu décider entre la lecture et le
        // UPDATE. Relire l'état final donne la même sémantique idempotente que
        // les retries HTTP, sans jamais réécrire les données.
        const finalState = await transaction.query<ScalarRow>(
          `
            SELECT
              approval.id AS "approvalId",
              approval.post_variant_id AS "variantId",
              approval.state AS "approvalState",
              variant.delivery_state AS "deliveryState",
              approval.payload_hash AS "payloadHash",
              approval.decided_at AS "decidedAt"
            FROM approvals approval
            INNER JOIN post_variants variant ON variant.id = approval.post_variant_id
              AND variant.workspace_id = approval.workspace_id
            INNER JOIN posts post ON post.id = variant.post_id
              AND post.workspace_id = variant.workspace_id
            WHERE approval.id = $1
              AND approval.post_variant_id = $2
              AND approval.workspace_id = $3
              AND post.workspace_id = $3
            LIMIT 1
          `,
          [approvalId, variantId, workspaceId],
        );
        const finalRow = finalState.rows[0];

        if (!finalRow || asString(finalRow.payloadHash) !== expectedPayloadHash) {
          return { kind: "stale" };
        }

        if (asString(finalRow.approvalState) === decision) {
          return { kind: "already-decided", decision: toPostVariantDecision(finalRow) };
        }

        return { kind: "opposite-decision" };
      }

      const updatedVariant = await transaction.query<ScalarRow>(
        `
          UPDATE post_variants
          SET approval_state = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
            AND workspace_id = $2
            AND approval_state = 'REQUESTED'
            AND payload_hash = $3
            AND delivery_state = 'NOT_CONFIGURED'
          RETURNING id
        `,
        [variantId, workspaceId, expectedPayloadHash, decision],
      );

      if (!updatedVariant.rows[0]) {
        throw new Error("La transition d'approbation n'a pas pu être appliquée à sa variante.");
      }

      const postVariantDecision = toPostVariantDecision(updatedRow);
      const action = decision === "APPROVED" ? "post_variant.approved" : "post_variant.rejected";

      await transaction.query(
        `
          INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload)
          VALUES ($1, $2, $3, $4, 'POST_VARIANT', $5, $6::json)
        `,
        [
          `act_${randomUUID().replaceAll("-", "")}`,
          workspaceId,
          actorUserId,
          action,
          variantId,
          // Audit volontairement redacted : ni caption, ni hashtags, ni
          // rationale, ni nom/clé de média ne quittent l'état métier.
          JSON.stringify({
            approvalId: postVariantDecision.approvalId,
            payloadHash: postVariantDecision.payloadHash,
            approvalState: postVariantDecision.approvalState,
            deliveryState: postVariantDecision.deliveryState,
          }),
        ],
      );

      return { kind: "decided", decision: postVariantDecision };
    });
  }

  async getWorkspaceTimezone(workspaceId: string): Promise<string | null> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT timezone
        FROM workspaces
        WHERE id = $1
        LIMIT 1
      `,
      [workspaceId],
    );

    const row = result.rows[0];
    return row ? asString(row.timezone) : null;
  }

  private async resolveInternalPostSchedulePrecondition(
    query: QueryRows,
    workspaceId: string,
    variantId: string,
    approvalId: string,
    expectedPayloadHash: string,
    now: string,
  ): Promise<InternalPostSchedulePreconditionResult> {
    // La première lecture reste exclusivement scoped afin qu'un identifiant de
    // variante étranger ne révèle ni son approbation, ni son horaire.
    const scopedVariant = await query(
      `
        SELECT variant.id
        FROM post_variants variant
        INNER JOIN posts post ON post.id = variant.post_id
          AND post.workspace_id = variant.workspace_id
        WHERE variant.id = $1
          AND variant.workspace_id = $2
          AND post.workspace_id = $2
        LIMIT 1
      `,
      [variantId, workspaceId],
    );

    if (!scopedVariant.rows[0]) {
      return { kind: "not-found" };
    }

    const current = await query(
      `
        SELECT
          approval.id AS "approvalId",
          approval.state AS "approvalState",
          approval.payload_hash AS "approvalPayloadHash",
          approval.decided_by AS "approvalDecidedBy",
          approval.decided_at AS "approvalDecidedAt",
          variant.id AS "variantId",
          variant.approval_state AS "variantApprovalState",
          variant.payload_hash AS "variantPayloadHash",
          post.id AS "postId",
          post.title AS "postTitle",
          post.objective,
          post.rationale,
          platform.id AS "platformId",
          platform.key AS platform,
          variant.caption,
          variant.hashtags AS hashtags,
          variant.cta,
          variant.planned_at AS "plannedAt",
          variant.timezone,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', media.id,
                  'filename', media.filename,
                  'type', media.media_type,
                  'status', media.status
                )
                ORDER BY link.sort_order ASC, media.id ASC
              )
              FROM post_variant_media link
              INNER JOIN media_assets media ON media.id = link.media_asset_id
              WHERE link.post_variant_id = variant.id
                AND link.workspace_id = variant.workspace_id
                AND media.workspace_id = variant.workspace_id
            ),
            '[]'::json
          ) AS media
        FROM approvals approval
        INNER JOIN post_variants variant ON variant.id = approval.post_variant_id
          AND variant.workspace_id = approval.workspace_id
        INNER JOIN posts post ON post.id = variant.post_id
          AND post.workspace_id = variant.workspace_id
        INNER JOIN social_platforms platform ON platform.id = variant.platform_id
        WHERE approval.id = $1
          AND approval.post_variant_id = $2
          AND approval.workspace_id = $3
          AND variant.workspace_id = $3
          AND post.workspace_id = $3
        LIMIT 1
      `,
      [approvalId, variantId, workspaceId],
    );
    const row = current.rows[0];

    if (!row) {
      return { kind: "stale" };
    }

    const snapshot = toInternalScheduleSnapshot(row);

    if (!isCurrentApprovedScheduleSnapshot(snapshot, expectedPayloadHash)) {
      return { kind: "stale" };
    }

    // Un retry exact reste idempotent même une fois l'horaire écoulé. Il est
    // cependant révoqué si le snapshot ou l'approbation ne sont plus courants,
    // ce qui a déjà été vérifié juste au-dessus.
    const activeSchedule = await query(
      `
        SELECT
          id,
          approval_id AS "approvalId",
          approved_payload_hash AS "payloadHash",
          scheduled_at AS "scheduledAt",
          timezone,
          platform_id AS "platformId",
          state
        FROM internal_post_schedules
        WHERE workspace_id = $1
          AND post_variant_id = $2
          AND state = 'SCHEDULED'
        LIMIT 1
      `,
      [workspaceId, variantId],
    );
    const activeRow = activeSchedule.rows[0];

    if (activeRow) {
      if (isExactActiveSchedule(activeRow, snapshot)) {
        return { kind: "already-scheduled", schedule: toInternalPostScheduleFromSnapshot(activeRow, snapshot) };
      }

      // Même si le snapshot historique a été invalidé, une ligne active ne
      // peut pas être remplacée silencieusement : une future annulation devra
      // être une transition explicite et auditée.
      return { kind: "conflict" };
    }

    const plannedAtMilliseconds = snapshot.plannedAt ? Date.parse(snapshot.plannedAt) : Number.NaN;
    const nowMilliseconds = Date.parse(now);

    if (
      !snapshot.plannedAt ||
      !Number.isFinite(plannedAtMilliseconds) ||
      !Number.isFinite(nowMilliseconds) ||
      plannedAtMilliseconds <= nowMilliseconds
    ) {
      return { kind: "time-unavailable" };
    }

    return { kind: "ready", snapshot };
  }

  async prepareInternalPostSchedule(
    workspaceId: string,
    variantId: string,
    approvalId: string,
    expectedPayloadHash: string,
    now: string,
  ): Promise<InternalPostSchedulePreconditionResult> {
    // Cette précondition précède le ToolGateway. La méthode de création la
    // rejoue dans une transaction afin de conserver les mêmes garanties en cas
    // de course entre l'autorisation et l'écriture.
    const query: QueryRows = (statement, values = []) => this.pglite.query<ScalarRow>(statement, values);
    return this.resolveInternalPostSchedulePrecondition(
      query,
      workspaceId,
      variantId,
      approvalId,
      expectedPayloadHash,
      now,
    );
  }

  async createInternalPostSchedule(
    workspaceId: string,
    actorUserId: string,
    variantId: string,
    approvalId: string,
    expectedPayloadHash: string,
    now: string,
  ): Promise<InternalPostScheduleCreateResult> {
    return this.pglite.transaction(async (transaction) => {
      const query: QueryRows = (statement, values = []) => transaction.query<ScalarRow>(statement, values);
      const precondition = await this.resolveInternalPostSchedulePrecondition(
        query,
        workspaceId,
        variantId,
        approvalId,
        expectedPayloadHash,
        now,
      );

      if (precondition.kind !== "ready") {
        return precondition;
      }

      const snapshot = precondition.snapshot;
      const conflictingSlot = await query(
        `
          SELECT id
          FROM internal_post_schedules
          WHERE workspace_id = $1
            AND platform_id = $2
            AND scheduled_at = $3
            AND state = 'SCHEDULED'
          LIMIT 1
        `,
        [workspaceId, snapshot.platformId, snapshot.plannedAt],
      );

      if (conflictingSlot.rows[0]) {
        return { kind: "conflict" };
      }

      // Les index partiels sont la dernière ligne de défense concurrente pour
      // l'unicité de la variante et du créneau plateforme. ON CONFLICT évite
      // qu'une collision laisse la transaction dans un état avorté.
      const scheduleId = `ips_${randomUUID().replaceAll("-", "")}`;
      const created = await query(
        `
            INSERT INTO internal_post_schedules (
              id, workspace_id, post_variant_id, approval_id, approved_payload_hash,
              scheduled_at, timezone, platform_id, state, created_by, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED', $9, $10)
            ON CONFLICT DO NOTHING
            RETURNING
              id,
              approval_id AS "approvalId",
              approved_payload_hash AS "payloadHash",
              scheduled_at AS "scheduledAt",
              timezone,
              platform_id AS "platformId",
              state
          `,
        [
          scheduleId,
          workspaceId,
          snapshot.variantId,
          snapshot.approvalId,
          snapshot.variantPayloadHash,
          snapshot.plannedAt,
          snapshot.timezone,
          snapshot.platformId,
          actorUserId,
          now,
        ],
      );
      const createdRow = created.rows[0];

      if (!createdRow) {
        const concurrentSchedule = await query(
          `
              SELECT
                id,
                approval_id AS "approvalId",
                approved_payload_hash AS "payloadHash",
                scheduled_at AS "scheduledAt",
                timezone,
                platform_id AS "platformId",
                state
              FROM internal_post_schedules
              WHERE workspace_id = $1
                AND post_variant_id = $2
                AND state = 'SCHEDULED'
              LIMIT 1
            `,
          [workspaceId, snapshot.variantId],
        );
        const concurrentRow = concurrentSchedule.rows[0];

        if (concurrentRow && isExactActiveSchedule(concurrentRow, snapshot)) {
          return {
            kind: "already-scheduled",
            schedule: toInternalPostScheduleFromSnapshot(concurrentRow, snapshot),
          };
        }

        return { kind: "conflict" };
      }

      const schedule = toInternalPostScheduleFromSnapshot(createdRow, snapshot);
      await query(
        `
            INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload)
            VALUES ($1, $2, $3, 'post_variant.internal_scheduled', 'POST_VARIANT', $4, $5::json)
          `,
        [
          `act_${randomUUID().replaceAll("-", "")}`,
          workspaceId,
          actorUserId,
          snapshot.variantId,
          JSON.stringify({
            scheduleId: schedule.id,
            variantId: schedule.variantId,
            approvalId: schedule.approvalId,
            platformId: schedule.platformId,
            payloadHash: schedule.payloadHash,
            scheduledAt: schedule.scheduledAt,
            timezone: schedule.timezone,
            state: schedule.state,
          }),
        ],
      );

      return { kind: "created", schedule };
    });
  }

  async listCalendarItems(workspaceId: string, from: string, to: string): Promise<CalendarItem[]> {
    const scheduled = await this.pglite.query<ScalarRow>(
      `
        SELECT
          schedule.id,
          schedule.approval_id AS "approvalId",
          schedule.approved_payload_hash AS "payloadHash",
          schedule.scheduled_at AS "scheduledAt",
          schedule.timezone AS "scheduleTimezone",
          schedule.platform_id AS "schedulePlatformId",
          schedule.state AS "scheduleState",
          approval.id AS "currentApprovalId",
          approval.state AS "approvalState",
          approval.payload_hash AS "approvalPayloadHash",
          approval.decided_by AS "approvalDecidedBy",
          approval.decided_at AS "approvalDecidedAt",
          variant.id AS "variantId",
          variant.approval_state AS "variantApprovalState",
          variant.payload_hash AS "variantPayloadHash",
          post.id AS "postId",
          post.title AS "postTitle",
          post.objective,
          post.rationale,
          platform.id AS "platformId",
          platform.key AS platform,
          variant.caption,
          variant.hashtags AS hashtags,
          variant.cta,
          variant.planned_at AS "plannedAt",
          variant.timezone,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', media.id,
                  'filename', media.filename,
                  'type', media.media_type,
                  'status', media.status
                )
                ORDER BY link.sort_order ASC, media.id ASC
              )
              FROM post_variant_media link
              INNER JOIN media_assets media ON media.id = link.media_asset_id
              WHERE link.post_variant_id = variant.id
                AND link.workspace_id = variant.workspace_id
                AND media.workspace_id = variant.workspace_id
            ),
            '[]'::json
          ) AS media
        FROM internal_post_schedules schedule
        INNER JOIN post_variants variant ON variant.id = schedule.post_variant_id
          AND variant.workspace_id = schedule.workspace_id
        INNER JOIN posts post ON post.id = variant.post_id
          AND post.workspace_id = variant.workspace_id
        INNER JOIN approvals approval ON approval.id = schedule.approval_id
          AND approval.post_variant_id = variant.id
          AND approval.workspace_id = schedule.workspace_id
        INNER JOIN social_platforms platform ON platform.id = variant.platform_id
        WHERE schedule.workspace_id = $1
          AND schedule.state = 'SCHEDULED'
          AND schedule.scheduled_at >= $2
          AND schedule.scheduled_at < $3
      `,
      [workspaceId, from, to],
    );

    const items: CalendarItem[] = [];
    const scheduledVariantIds = new Set<string>();

    for (const row of scheduled.rows) {
      // Les aliases du schedule sont volontairement re-projetés ici pour que
      // le même validateur couvre le hash snapshot, l'approbation courante et
      // l'immutabilité effective de la date/fuseau/plateforme.
      const snapshot = toInternalScheduleSnapshot({
        ...row,
        approvalId: row.currentApprovalId,
      });
      const scheduleRow: ScalarRow = {
        id: row.id,
        approvalId: row.approvalId,
        payloadHash: row.payloadHash,
        scheduledAt: row.scheduledAt,
        timezone: row.scheduleTimezone,
        platformId: row.schedulePlatformId,
        state: row.scheduleState,
      };

      if (
        !isCurrentApprovedScheduleSnapshot(snapshot, snapshot.variantPayloadHash) ||
        !isExactActiveSchedule(scheduleRow, snapshot)
      ) {
        continue;
      }

      items.push(toCalendarInternalScheduleItem(scheduleRow, snapshot));
      scheduledVariantIds.add(snapshot.variantId);
    }

    const candidates = await this.pglite.query<ScalarRow>(
      `
        SELECT
          approval.id AS "approvalId",
          approval.state AS "approvalState",
          approval.payload_hash AS "approvalPayloadHash",
          approval.decided_by AS "approvalDecidedBy",
          approval.decided_at AS "approvalDecidedAt",
          variant.id AS "variantId",
          variant.approval_state AS "variantApprovalState",
          variant.payload_hash AS "variantPayloadHash",
          post.id AS "postId",
          post.title AS "postTitle",
          post.objective,
          post.rationale,
          platform.id AS "platformId",
          platform.key AS platform,
          variant.caption,
          variant.hashtags AS hashtags,
          variant.cta,
          variant.planned_at AS "plannedAt",
          variant.timezone,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', media.id,
                  'filename', media.filename,
                  'type', media.media_type,
                  'status', media.status
                )
                ORDER BY link.sort_order ASC, media.id ASC
              )
              FROM post_variant_media link
              INNER JOIN media_assets media ON media.id = link.media_asset_id
              WHERE link.post_variant_id = variant.id
                AND link.workspace_id = variant.workspace_id
                AND media.workspace_id = variant.workspace_id
            ),
            '[]'::json
          ) AS media
        FROM post_variants variant
        INNER JOIN posts post ON post.id = variant.post_id
          AND post.workspace_id = variant.workspace_id
        INNER JOIN social_platforms platform ON platform.id = variant.platform_id
        INNER JOIN approvals approval ON approval.post_variant_id = variant.id
          AND approval.workspace_id = variant.workspace_id
        WHERE variant.workspace_id = $1
          AND post.workspace_id = $1
          AND variant.approval_state = 'APPROVED'
          AND approval.state = 'APPROVED'
          AND approval.payload_hash = variant.payload_hash
          AND variant.planned_at >= $2
          AND variant.planned_at < $3
        ORDER BY variant.id ASC, approval.decided_at DESC NULLS LAST, approval.id ASC
      `,
      [workspaceId, from, to],
    );

    const seenCandidateVariantIds = new Set<string>();

    for (const row of candidates.rows) {
      const snapshot = toInternalScheduleSnapshot(row);

      if (
        seenCandidateVariantIds.has(snapshot.variantId) ||
        scheduledVariantIds.has(snapshot.variantId) ||
        !isCurrentApprovedScheduleSnapshot(snapshot, snapshot.variantPayloadHash)
      ) {
        continue;
      }

      const item = toCalendarApprovedVariantItem(snapshot);

      if (!item) {
        continue;
      }

      seenCandidateVariantIds.add(snapshot.variantId);
      items.push(item);
    }

    return items
      .sort(
        (left, right) =>
          left.scheduledAt.localeCompare(right.scheduledAt) ||
          left.kind.localeCompare(right.kind) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, 200);
  }

  async listTasks(workspaceId: string): Promise<Task[]> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT
          id,
          title,
          description,
          status,
          due_at AS "dueAt",
          completed_by AS "completedBy",
          completed_at AS "completedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tasks
        WHERE workspace_id = $1
        ORDER BY
          CASE WHEN status IN ('DONE', 'CANCELLED') THEN 1 ELSE 0 END,
          due_at ASC NULLS LAST,
          created_at DESC,
          id ASC
      `,
      [workspaceId],
    );

    return result.rows.map(toTask);
  }

  async createTask(workspaceId: string, actorUserId: string, input: TaskCreate): Promise<Task> {
    return this.pglite.transaction(async (transaction) => {
      // L'identifiant, le workspace et l'état TODO sont imposés par cette
      // méthode. Le client ne peut créer ni une tâche terminée, ni une tâche
      // dans le périmètre d'un autre workspace.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const taskId = `task_${randomUUID().replaceAll("-", "")}`;
        const result = await transaction.query<ScalarRow>(
          `
            INSERT INTO tasks (id, workspace_id, title, description, due_at, status)
            VALUES ($1, $2, $3, $4, $5, 'TODO')
            ON CONFLICT (id) DO NOTHING
            RETURNING
              id,
              title,
              description,
              status,
              due_at AS "dueAt",
              completed_by AS "completedBy",
              completed_at AS "completedAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
          `,
          [taskId, workspaceId, input.title, input.description ?? null, input.dueAt ?? null],
        );
        const row = result.rows[0];

        if (!row) {
          continue;
        }

        const task = toTask(row);
        await transaction.query(
          `
            INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload)
            VALUES ($1, $2, $3, 'task.created', 'TASK', $4, $5::json)
          `,
          [
            `act_${randomUUID().replaceAll("-", "")}`,
            workspaceId,
            actorUserId,
            task.id,
            JSON.stringify({ status: task.status, hasDueAt: task.dueAt !== null }),
          ],
        );

        return task;
      }

      throw new Error("Impossible de générer un identifiant unique pour la tâche.");
    });
  }

  async completeTask(workspaceId: string, actorUserId: string, taskId: string): Promise<TaskCompletionResult> {
    return this.pglite.transaction(async (transaction) => {
      // Seules les tâches actives peuvent devenir DONE. La transition est
      // atomique ; un retry sur DONE ne réécrit ni la tâche ni son audit.
      const update = await transaction.query<ScalarRow>(
        `
          UPDATE tasks
          SET
            status = 'DONE',
            completed_by = $3,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
            AND workspace_id = $2
            AND status IN ('TODO', 'IN_PROGRESS')
          RETURNING
            id,
            title,
            description,
            status,
            due_at AS "dueAt",
            completed_by AS "completedBy",
            completed_at AS "completedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [taskId, workspaceId, actorUserId],
      );
      const row = update.rows[0];

      if (row) {
        const task = toTask(row);
        await transaction.query(
          `
            INSERT INTO activity_logs (id, workspace_id, actor_user_id, action, entity_type, entity_id, payload)
            VALUES ($1, $2, $3, 'task.completed', 'TASK', $4, $5::json)
          `,
          [
            `act_${randomUUID().replaceAll("-", "")}`,
            workspaceId,
            actorUserId,
            task.id,
            JSON.stringify({ status: task.status }),
          ],
        );

        return { kind: "completed", task };
      }

      // Ne sélectionner qu'à l'intérieur du scope serveur permet de renvoyer
      // 404 pour une tâche étrangère, 200 idempotent pour DONE et 409 pour un
      // autre état final visible (comme CANCELLED).
      const existing = await transaction.query<ScalarRow>(
        `
          SELECT
            id,
            title,
            description,
            status,
            due_at AS "dueAt",
            completed_by AS "completedBy",
            completed_at AS "completedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM tasks
          WHERE id = $1
            AND workspace_id = $2
        `,
        [taskId, workspaceId],
      );
      const existingTask = existing.rows[0];

      if (!existingTask) {
        return { kind: "not-found" };
      }

      if (asString(existingTask.status) === "DONE") {
        return { kind: "already-completed", task: toTask(existingTask) };
      }

      return { kind: "not-actionable", status: asString(existingTask.status) };
    });
  }

  async listToday(workspaceId: string): Promise<TodayItem[]> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT id, 'TASK' AS kind, title, due_at AS "dueAt", status
        FROM tasks
        WHERE workspace_id = $1
          AND status IN ('TODO', 'IN_PROGRESS')
          AND due_at IS NOT NULL
        UNION ALL
        SELECT id, 'SCHEDULED_POST' AS kind, title, scheduled_at AS "dueAt", status
        FROM scheduled_posts
        WHERE workspace_id = $1
          AND status = 'SCHEDULED'
        ORDER BY "dueAt" ASC
        LIMIT 10
      `,
      [workspaceId],
    );

    return result.rows.flatMap((row) => {
      const dueAt = asTimestamp(row.dueAt);

      // La projection Today ne tolère pas d'échéance absente. Les tâches sans
      // due_at sont déjà filtrées par SQL ; ce garde-fou évite aussi un faux
      // timestamp si une donnée historique reste incomplète.
      if (!dueAt) {
        return [];
      }

      return [
        {
          id: asString(row.id),
          kind: asString(row.kind) as TodayItem["kind"],
          title: asString(row.title),
          dueAt,
          status: asString(row.status),
        },
      ];
    });
  }

  async listSocialPlatforms(): Promise<SocialPlatform[]> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT
          id,
          key,
          name,
          oauth_supported AS "oauthSupported",
          draft_supported AS "draftSupported",
          schedule_supported AS "scheduleSupported",
          publish_supported AS "publishSupported",
          analytics_supported AS "analyticsSupported",
          verified_at AS "verifiedAt"
        FROM social_platforms
        WHERE is_active = TRUE
        ORDER BY name
      `,
    );

    return result.rows.map((row) => ({
      id: asString(row.id),
      key: asString(row.key),
      name: asString(row.name),
      oauthSupported: asBoolean(row.oauthSupported),
      draftSupported: asBoolean(row.draftSupported),
      scheduleSupported: asBoolean(row.scheduleSupported),
      publishSupported: asBoolean(row.publishSupported),
      analyticsSupported: asBoolean(row.analyticsSupported),
      verifiedAt: asDateString(row.verifiedAt) ?? "",
    }));
  }

  private async initialize(): Promise<void> {
    await this.pglite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        timezone TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        timezone TEXT NOT NULL,
        locale TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS memberships (
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        role TEXT NOT NULL,
        PRIMARY KEY (workspace_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS artist_projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS artist_profiles (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        project_id TEXT NOT NULL REFERENCES artist_projects(id),
        display_name TEXT NOT NULL,
        identity TEXT NOT NULL,
        genres JSON NOT NULL,
        influences JSON NOT NULL DEFAULT '[]'::json,
        tone TEXT NOT NULL,
        preferred_vocabulary JSON NOT NULL DEFAULT '[]'::json,
        forbidden_vocabulary JSON NOT NULL DEFAULT '[]'::json,
        audience TEXT NOT NULL,
        goals JSON NOT NULL,
        platform_preferences JSON NOT NULL DEFAULT '{}'::json,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (workspace_id, project_id)
      );

      CREATE TABLE IF NOT EXISTS releases (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        artist_project_id TEXT NOT NULL REFERENCES artist_projects(id),
        title TEXT NOT NULL,
        release_type TEXT NOT NULL,
        release_date DATE,
        label TEXT,
        status TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        artist_project_id TEXT NOT NULL REFERENCES artist_projects(id),
        release_id TEXT REFERENCES releases(id),
        title TEXT NOT NULL,
        artist_credit TEXT NOT NULL,
        genre TEXT,
        bpm NUMERIC,
        musical_key TEXT,
        release_date DATE,
        label TEXT,
        tags JSON NOT NULL DEFAULT '[]'::json,
        description TEXT,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        artist_project_id TEXT REFERENCES artist_projects(id),
        release_id TEXT REFERENCES releases(id),
        track_id TEXT REFERENCES tracks(id),
        filename TEXT NOT NULL,
        media_type TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        byte_size BIGINT NOT NULL,
        sha256 TEXT NOT NULL,
        storage_key TEXT,
        status TEXT NOT NULL,
        description TEXT,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (workspace_id, sha256)
      );

      CREATE TABLE IF NOT EXISTS media_tags (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        UNIQUE (workspace_id, normalized_name)
      );

      CREATE TABLE IF NOT EXISTS media_asset_tags (
        media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
        media_tag_id TEXT NOT NULL REFERENCES media_tags(id),
        PRIMARY KEY (media_asset_id, media_tag_id)
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        state TEXT NOT NULL,
        confirmed_by TEXT REFERENCES users(id),
        confirmed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS social_platforms (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        oauth_supported BOOLEAN NOT NULL,
        draft_supported BOOLEAN NOT NULL,
        schedule_supported BOOLEAN NOT NULL,
        publish_supported BOOLEAN NOT NULL,
        analytics_supported BOOLEAN NOT NULL,
        verified_at DATE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );

      -- Approval Center local : ces tables sont distinctes de
      -- scheduled_posts, qui reste la seule projection de démonstration pour
      -- Today. Une date proposée n'est pas une programmation.
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        artist_project_id TEXT REFERENCES artist_projects(id),
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        rationale TEXT,
        status TEXT NOT NULL DEFAULT 'PROPOSED',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT posts_status_check CHECK (status IN ('DRAFT', 'PROPOSED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'))
      );

      CREATE TABLE IF NOT EXISTS post_variants (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        post_id TEXT NOT NULL REFERENCES posts(id),
        platform_id TEXT NOT NULL REFERENCES social_platforms(id),
        caption TEXT NOT NULL,
        hashtags JSON NOT NULL DEFAULT '[]'::json,
        cta TEXT,
        planned_at TIMESTAMPTZ,
        timezone TEXT NOT NULL,
        approval_state TEXT NOT NULL DEFAULT 'REQUESTED',
        delivery_state TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
        payload_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (post_id, platform_id),
        CONSTRAINT post_variants_approval_state_check
          CHECK (approval_state IN ('REQUESTED', 'APPROVED', 'REJECTED', 'INVALIDATED')),
        -- Aucune livraison n'existe dans cette tranche. La contrainte évite
        -- qu'un code futur réutilise par erreur cette route comme scheduler.
        CONSTRAINT post_variants_delivery_state_check CHECK (delivery_state = 'NOT_CONFIGURED')
      );

      CREATE TABLE IF NOT EXISTS post_variant_media (
        post_variant_id TEXT NOT NULL REFERENCES post_variants(id),
        media_asset_id TEXT NOT NULL REFERENCES media_assets(id),
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (post_variant_id, media_asset_id),
        UNIQUE (post_variant_id, sort_order),
        CONSTRAINT post_variant_media_sort_order_check CHECK (sort_order >= 0)
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        post_variant_id TEXT NOT NULL REFERENCES post_variants(id),
        state TEXT NOT NULL DEFAULT 'REQUESTED',
        requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        decided_at TIMESTAMPTZ,
        decided_by TEXT REFERENCES users(id),
        payload_hash TEXT NOT NULL,
        comment TEXT,
        CONSTRAINT approvals_state_check CHECK (state IN ('REQUESTED', 'APPROVED', 'REJECTED', 'INVALIDATED')),
        CONSTRAINT approvals_decision_fields_check CHECK (
          (state = 'REQUESTED' AND decided_at IS NULL AND decided_by IS NULL)
          OR (state IN ('APPROVED', 'REJECTED') AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
          OR state = 'INVALIDATED'
        )
      );

      -- Snapshot additif de planification interne. Il reste explicitement
      -- distinct de scheduled_posts : aucune livraison ni publication ne
      -- peut être déduite de cette ligne.
      CREATE TABLE IF NOT EXISTS internal_post_schedules (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        post_variant_id TEXT NOT NULL REFERENCES post_variants(id),
        approval_id TEXT NOT NULL REFERENCES approvals(id),
        approved_payload_hash TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        timezone TEXT NOT NULL,
        platform_id TEXT NOT NULL REFERENCES social_platforms(id),
        state TEXT NOT NULL DEFAULT 'SCHEDULED',
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        cancelled_by TEXT REFERENCES users(id),
        cancelled_at TIMESTAMPTZ,
        CONSTRAINT internal_post_schedules_state_check CHECK (state IN ('SCHEDULED', 'CANCELLED')),
        CONSTRAINT internal_post_schedules_cancellation_check CHECK (
          (state = 'SCHEDULED' AND cancelled_by IS NULL AND cancelled_at IS NULL)
          OR (state = 'CANCELLED' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        title TEXT NOT NULL,
        description TEXT,
        due_at TIMESTAMPTZ,
        status TEXT NOT NULL,
        completed_by TEXT REFERENCES users(id),
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT tasks_status_check CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'))
      );

      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        title TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        actor_user_id TEXT NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload JSON NOT NULL DEFAULT '{}'::json,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_releases_workspace_date
        ON releases (workspace_id, release_date);
      CREATE INDEX IF NOT EXISTS idx_tracks_workspace_status
        ON tracks (workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_created
        ON activity_logs (workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_media_workspace_status
        ON media_assets (workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_media_asset_tags_tag_asset
        ON media_asset_tags (media_tag_id, media_asset_id);
      CREATE INDEX IF NOT EXISTS idx_memories_workspace_created
        ON memories (workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_workspace_state_created
        ON memories (workspace_id, state, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status_due
        ON tasks (workspace_id, status, due_at);
      CREATE INDEX IF NOT EXISTS idx_posts_workspace_created
        ON posts (workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_post_variants_workspace_approval_planned
        ON post_variants (workspace_id, approval_state, planned_at);
      CREATE INDEX IF NOT EXISTS idx_approvals_workspace_state_requested
        ON approvals (workspace_id, state, requested_at);
      CREATE INDEX IF NOT EXISTS idx_internal_post_schedules_workspace_state_time
        ON internal_post_schedules (workspace_id, state, scheduled_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_post_schedules_one_active_variant
        ON internal_post_schedules (post_variant_id)
        WHERE state = 'SCHEDULED';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_post_schedules_active_platform_time
        ON internal_post_schedules (workspace_id, platform_id, scheduled_at)
        WHERE state = 'SCHEDULED';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_requested_variant_hash
        ON approvals (post_variant_id, payload_hash)
        WHERE state = 'REQUESTED';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_one_requested_per_variant
        ON approvals (post_variant_id)
        WHERE state = 'REQUESTED';

      -- La seule transition future autorisée est SCHEDULED -> CANCELLED. Le
      -- snapshot qui relie une approbation à sa date ne peut jamais être
      -- réécrit, même depuis un futur appel SQL interne mal câblé.
      CREATE OR REPLACE FUNCTION enforce_internal_post_schedule_snapshot_immutable()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
          OR NEW.post_variant_id IS DISTINCT FROM OLD.post_variant_id
          OR NEW.approval_id IS DISTINCT FROM OLD.approval_id
          OR NEW.approved_payload_hash IS DISTINCT FROM OLD.approved_payload_hash
          OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
          OR NEW.timezone IS DISTINCT FROM OLD.timezone
          OR NEW.platform_id IS DISTINCT FROM OLD.platform_id
          OR NEW.created_by IS DISTINCT FROM OLD.created_by
          OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
          RAISE EXCEPTION 'Le snapshot de planification interne est immuable.';
        END IF;

        IF OLD.state = 'CANCELLED' AND NEW.state IS DISTINCT FROM 'CANCELLED' THEN
          RAISE EXCEPTION 'Une planification annulée ne peut pas être réactivée.';
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS internal_post_schedule_snapshot_immutable ON internal_post_schedules;
      CREATE TRIGGER internal_post_schedule_snapshot_immutable
      BEFORE UPDATE ON internal_post_schedules
      FOR EACH ROW EXECUTE FUNCTION enforce_internal_post_schedule_snapshot_immutable();
    `);

    // Cette migration additive garde un Artist Brain local déjà modifié intact.
    // Les seeds utilisent ensuite uniquement `ON CONFLICT DO NOTHING`.
    await this.pglite.exec(`
      ALTER TABLE artist_profiles
        ADD COLUMN IF NOT EXISTS influences JSON NOT NULL DEFAULT '[]'::json;
      ALTER TABLE artist_profiles
        ADD COLUMN IF NOT EXISTS preferred_vocabulary JSON NOT NULL DEFAULT '[]'::json;
      ALTER TABLE artist_profiles
        ADD COLUMN IF NOT EXISTS forbidden_vocabulary JSON NOT NULL DEFAULT '[]'::json;
      ALTER TABLE artist_profiles
        ADD COLUMN IF NOT EXISTS platform_preferences JSON NOT NULL DEFAULT '{}'::json;
      ALTER TABLE artist_profiles
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE artist_profiles
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE tracks
        ADD COLUMN IF NOT EXISTS label TEXT;
      ALTER TABLE tracks
        ADD COLUMN IF NOT EXISTS tags JSON NOT NULL DEFAULT '[]'::json;
      ALTER TABLE tracks
        ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE tracks
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE media_assets
        ADD COLUMN IF NOT EXISTS storage_key TEXT;
      ALTER TABLE media_assets
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE memories
        ADD COLUMN IF NOT EXISTS confirmed_by TEXT REFERENCES users(id);
      ALTER TABLE memories
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
      UPDATE memories
        SET updated_at = COALESCE(updated_at, confirmed_at, created_at);
      ALTER TABLE memories
        ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE memories
        ALTER COLUMN updated_at SET NOT NULL;
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS description TEXT;
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS completed_by TEXT REFERENCES users(id);
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
      ALTER TABLE tasks
        ALTER COLUMN due_at DROP NOT NULL;
      UPDATE tasks
        SET created_at = COALESCE(created_at, due_at, CURRENT_TIMESTAMP);
      UPDATE tasks
        SET updated_at = COALESCE(updated_at, completed_at, created_at);
      ALTER TABLE tasks
        ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE tasks
        ALTER COLUMN created_at SET NOT NULL;
      ALTER TABLE tasks
        ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE tasks
        ALTER COLUMN updated_at SET NOT NULL;
    `);

    await this.migrateRequestedApprovalPayloadHashes();
  }

  private async migrateRequestedApprovalPayloadHashes(): Promise<void> {
    // Compatibilité additive du hash canonique : un runtime déjà démarré peut
    // contenir les seeds REQUESTED d'une version antérieure du payload. On ne
    // touche jamais aux décisions terminales ; pour les seules demandes encore
    // actives, variante et approbation reçoivent le même hash recalculé dans
    // une transaction, sans changer leur timestamp métier ni écrire d'audit.
    await this.pglite.transaction(async (transaction) => {
      const requested = await transaction.query<ScalarRow>(
        `
          SELECT
            approval.id AS "approvalId",
            approval.workspace_id AS "workspaceId",
            variant.id AS "variantId",
            post.title AS "postTitle",
            post.objective,
            post.rationale,
            platform.key AS platform,
            variant.caption,
            variant.hashtags AS hashtags,
            variant.cta,
            variant.planned_at AS "plannedAt",
            variant.timezone,
            variant.payload_hash AS "variantPayloadHash",
            approval.payload_hash AS "approvalPayloadHash",
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', media.id,
                    'filename', media.filename,
                    'type', media.media_type,
                    'status', media.status
                  )
                  ORDER BY link.sort_order ASC, media.id ASC
                )
                FROM post_variant_media link
                INNER JOIN media_assets media ON media.id = link.media_asset_id
                WHERE link.post_variant_id = variant.id
                  AND link.workspace_id = variant.workspace_id
                  AND media.workspace_id = variant.workspace_id
              ),
              '[]'::json
            ) AS media
          FROM approvals approval
          INNER JOIN post_variants variant ON variant.id = approval.post_variant_id
            AND variant.workspace_id = approval.workspace_id
          INNER JOIN posts post ON post.id = variant.post_id
            AND post.workspace_id = variant.workspace_id
          INNER JOIN social_platforms platform ON platform.id = variant.platform_id
          WHERE approval.state = 'REQUESTED'
            AND variant.approval_state = 'REQUESTED'
            AND variant.delivery_state = 'NOT_CONFIGURED'
        `,
      );

      for (const row of requested.rows) {
        const payloadHash = calculatePostVariantPayloadHash({
          postTitle: asString(row.postTitle),
          objective: asString(row.objective),
          rationale: asNullableString(row.rationale),
          platform: asString(row.platform),
          caption: asString(row.caption),
          hashtags: asStringArray(row.hashtags),
          cta: asNullableString(row.cta),
          plannedAt: asTimestamp(row.plannedAt),
          timezone: asString(row.timezone),
          media: asRecordArray(row.media).map(toApprovalMedia),
        });

        if (payloadHash === asString(row.variantPayloadHash) && payloadHash === asString(row.approvalPayloadHash)) {
          continue;
        }

        await transaction.query(
          `
            UPDATE post_variants
            SET payload_hash = $3
            WHERE id = $1
              AND workspace_id = $2
              AND approval_state = 'REQUESTED'
          `,
          [asString(row.variantId), asString(row.workspaceId), payloadHash],
        );
        await transaction.query(
          `
            UPDATE approvals
            SET payload_hash = $3
            WHERE id = $1
              AND workspace_id = $2
              AND state = 'REQUESTED'
          `,
          [asString(row.approvalId), asString(row.workspaceId), payloadHash],
        );
      }
    });
  }

  private async seed(): Promise<void> {
    await this.pglite.transaction(async (transaction) => {
      await transaction.query(
        `
          INSERT INTO users (id, email, display_name, timezone)
          VALUES
            ($1, $2, $3, $4),
            ('usr_other', 'other@ida.local', 'Other', 'Europe/Paris')
          ON CONFLICT (id) DO NOTHING
        `,
        [demoContext.userId, "aless@ida.local", "Aless", demoWorkspace.timezone],
      );
      await transaction.query(
        `
          INSERT INTO workspaces (id, name, timezone, locale, owner_user_id)
          VALUES
            ($1, $2, $3, $4, $5),
            ('wsp_other', 'Other workspace', 'Europe/Paris', 'fr-FR', 'usr_other')
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id, demoWorkspace.name, demoWorkspace.timezone, demoWorkspace.locale, demoContext.userId],
      );
      await transaction.query(
        `
          INSERT INTO memberships (workspace_id, user_id, role)
          VALUES
            ($1, $2, $3),
            ('wsp_other', 'usr_other', 'OWNER')
          ON CONFLICT (workspace_id, user_id) DO NOTHING
        `,
        [demoWorkspace.id, demoContext.userId, demoContext.membershipRole],
      );
      await transaction.query(
        `
          INSERT INTO artist_projects (id, workspace_id, name, status)
          VALUES
            ('prj_demo_aless', $1, 'Aless', 'ACTIVE'),
            ('prj_other_workspace', 'wsp_other', 'Other Artist', 'ACTIVE')
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
      );
      await transaction.query(
        `
          INSERT INTO artist_profiles (
            id, workspace_id, project_id, display_name, identity, genres, influences, tone,
            preferred_vocabulary, forbidden_vocabulary, audience, goals, platform_preferences
          )
          VALUES (
            'profile_demo_aless', $1, 'prj_demo_aless', 'Aless',
            'Producteur et DJ électronique entre textures nocturnes et énergie club.',
            '["Melodic techno", "Progressive house", "Electronic"]'::json,
            '["Eric Prydz", "Tale Of Us", "RÜFÜS DU SOL"]'::json,
            'Direct, lumineux, précis et jamais générique.',
            '["direct", "précis", "nocturne"]'::json,
            '["vibes", "banger"]'::json,
            'Auditeurs de musique électronique et public de clubs européens.',
            '["Préparer une release cohérente", "Faire émerger les contenus studio", "Maintenir une voix éditoriale concise"]'::json,
            '{"instagram":{"preferredFormats":["Reel","Carousel"],"cadencePerWeek":3},"tiktok":{"preferredFormats":["Vertical studio clip"],"cadencePerWeek":3}}'::json
          )
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
      );
      await transaction.query(
        `
          INSERT INTO releases (
            id, workspace_id, artist_project_id, title, release_type, release_date, label, status, description
          )
          VALUES
            ('rel_lumiere_noire', $1, 'prj_demo_aless', 'Lumière Noire', 'SINGLE', '2026-09-18', 'Aural Motion', 'SCHEDULED', 'Single à venir, construit autour d''un lead nocturne et d''une montée club.'),
            ('rel_afterimage', $1, 'prj_demo_aless', 'Afterimage', 'EP', '2026-06-06', 'Aural Motion', 'RELEASED', 'EP publié au début de l''été.'),
            ('rel_other_workspace', 'wsp_other', 'prj_other_workspace', 'Private Release', 'SINGLE', '2026-10-01', 'Other', 'UNRELEASED', 'Donnée hors workspace démo.')
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
      );
      await transaction.query(
        `
          INSERT INTO tracks (
            id, workspace_id, artist_project_id, release_id, title, artist_credit, genre, bpm, musical_key, release_date, status
          )
          VALUES
            ('trk_lumiere_noire', $1, 'prj_demo_aless', 'rel_lumiere_noire', 'Lumière Noire', 'Aless', 'Melodic techno', 124, 'F minor', '2026-09-18', 'SCHEDULED'),
            ('trk_afterimage', $1, 'prj_demo_aless', 'rel_afterimage', 'Afterimage', 'Aless', 'Progressive house', 122, 'A minor', '2026-06-06', 'RELEASED'),
            ('trk_orbit_demo', $1, 'prj_demo_aless', NULL, 'Orbit (Studio Demo)', 'Aless', 'Electronic', 126, 'D minor', NULL, 'DEMO'),
            ('trk_other_workspace', 'wsp_other', 'prj_other_workspace', 'rel_other_workspace', 'Private Track', 'Other Artist', 'Electronic', 120, 'C minor', NULL, 'UNRELEASED')
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
      );
      await transaction.query(
        `
          INSERT INTO media_assets (
            id, workspace_id, artist_project_id, release_id, track_id, filename, media_type, mime_type,
            byte_size, sha256, status, description, usage_count, last_used_at
          )
          VALUES
            ('med_studio_light', $1, 'prj_demo_aless', 'rel_lumiere_noire', 'trk_lumiere_noire', 'studio-lumiere-noire-take-04.mp4', 'VIDEO', 'video/mp4', 48100231, 'demo-hash-studio-light-04', 'UNUSED', 'Plan studio vertical : ajustement du synthé principal.', 0, NULL),
            ('med_night-drive', $1, 'prj_demo_aless', 'rel_lumiere_noire', 'trk_lumiere_noire', 'night-drive-preview.mp4', 'VIDEO', 'video/mp4', 37119822, 'demo-hash-night-drive', 'UNUSED', 'Prévisualisation nocturne pour teaser court.', 0, NULL),
            ('med_artwork', $1, 'prj_demo_aless', 'rel_lumiere_noire', NULL, 'lumiere-noire-artwork-final.png', 'IMAGE', 'image/png', 2401022, 'demo-hash-artwork-final', 'USED', 'Artwork final de la release.', 2, '2026-08-28T16:00:00Z'),
            ('med_live', $1, 'prj_demo_aless', 'rel_afterimage', 'trk_afterimage', 'afterimage-live-clip.mp4', 'VIDEO', 'video/mp4', 68001442, 'demo-hash-live-clip', 'SCHEDULED', 'Extrait live prévu dans le calendrier éditorial.', 1, '2026-08-29T19:00:00Z'),
            ('med_other_workspace', 'wsp_other', 'prj_other_workspace', 'rel_other_workspace', 'trk_other_workspace', 'private-other-video.mp4', 'VIDEO', 'video/mp4', 77000000, 'demo-hash-other-private', 'UNUSED', 'Média hors workspace démo.', 0, NULL)
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
      );
      await transaction.query(
        `
          INSERT INTO media_tags (id, workspace_id, name, normalized_name)
          VALUES
            ('tag_studio', $1, 'studio', 'studio'),
            ('tag_vertical', $1, 'vertical', 'vertical'),
            ('tag_teaser', $1, 'teaser', 'teaser'),
            ('tag_live', $1, 'live', 'live')
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
      );
      await transaction.query(
        `
          INSERT INTO media_asset_tags (media_asset_id, media_tag_id)
          VALUES
            ('med_studio_light', 'tag_studio'),
            ('med_studio_light', 'tag_vertical'),
            ('med_night-drive', 'tag_teaser'),
            ('med_night-drive', 'tag_vertical'),
            ('med_live', 'tag_live')
          ON CONFLICT (media_asset_id, media_tag_id) DO NOTHING
        `,
      );
      await transaction.query(
        `
          INSERT INTO memories (
            id, workspace_id, category, content, state, confirmed_by, confirmed_at, created_at, updated_at
          )
          VALUES
            (
              'mem_short_captions', $1, 'PREFERENCE_MEMORY',
              'Préférence confirmée : captions courtes, directes et sans hashtags excessifs.',
              'CONFIRMED', $2, '2026-08-20T09:00:00Z', '2026-08-20T09:00:00Z', '2026-08-20T09:00:00Z'
            ),
            (
              'mem_weekly_planning', $1, 'ARTIST_MEMORY',
              'Objectif courant : valoriser les contenus de studio avant la sortie de Lumière Noire.',
              'CONFIRMED', $2, '2026-08-24T12:00:00Z', '2026-08-24T12:00:00Z', '2026-08-24T12:00:00Z'
            ),
            (
              'mem_tiktok_question', $1, 'PREFERENCE_MEMORY',
              'Proposition : tester une série de hooks TikTok plus frontaux.',
              'PENDING', NULL, NULL, '2026-08-26T10:00:00Z', '2026-08-26T10:00:00Z'
            ),
            (
              'mem_other_workspace', 'wsp_other', 'PREFERENCE_MEMORY',
              'Préférence privée d’un autre workspace.',
              'PENDING', NULL, NULL, '2026-08-26T11:00:00Z', '2026-08-26T11:00:00Z'
            )
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id, demoContext.userId],
      );
      await transaction.query(
        `
          INSERT INTO social_platforms (
            id, key, name, oauth_supported, draft_supported, schedule_supported, publish_supported, analytics_supported, verified_at
          )
          VALUES
            ('platform_instagram', 'INSTAGRAM', 'Instagram', TRUE, FALSE, FALSE, TRUE, TRUE, '2026-08-30'),
            ('platform_tiktok', 'TIKTOK', 'TikTok', TRUE, FALSE, FALSE, TRUE, TRUE, '2026-08-30'),
            ('platform_youtube', 'YOUTUBE', 'YouTube', TRUE, TRUE, TRUE, TRUE, TRUE, '2026-08-30')
          ON CONFLICT (id) DO NOTHING
        `,
      );
      // Les propositions sont uniquement des seeds locaux : aucune génération
      // IA, programmation, job ou intégration sociale n'est déclenchée ici.
      // Les hashes sont calculés sur le payload canonique que la file expose.
      const studioInstagramPayload = {
        postTitle: "Teaser studio — Lumière Noire",
        objective: "Créer de l'attente autour de la prochaine release.",
        rationale:
          "Le plan vertical montre une étape concrète de production et reste cohérent avec le ton direct de l'Artist Brain.",
        platform: "INSTAGRAM",
        caption: "Lumière Noire prend forme dans le studio. Pré-save disponible bientôt.",
        hashtags: ["#LumiereNoire", "#MelodicTechno", "#Studio"],
        cta: "Pré-save bientôt.",
        plannedAt: "2026-09-01T18:00:00.000Z",
        timezone: "Europe/Paris",
        media: [
          {
            id: "med_studio_light",
            filename: "studio-lumiere-noire-take-04.mp4",
            type: "VIDEO",
            status: "UNUSED" as MediaStatus,
          },
        ],
      };
      const nightDriveTiktokPayload = {
        postTitle: "Hook nocturne — Lumière Noire",
        objective: "Tester un angle conversationnel avant la sortie.",
        rationale: "Le preview court permet de demander un retour sans répéter la vidéo studio.",
        platform: "TIKTOK",
        caption: "Le hook arrive juste avant le break. Tu le gardes pour le set ?",
        hashtags: ["#LumiereNoire", "#TechnoTok", "#ProducerLife"],
        cta: "Réponds en commentaire.",
        plannedAt: "2026-09-03T17:30:00.000Z",
        timezone: "Europe/Paris",
        media: [
          {
            id: "med_night-drive",
            filename: "night-drive-preview.mp4",
            type: "VIDEO",
            status: "UNUSED" as MediaStatus,
          },
        ],
      };
      const afterimageYoutubePayload = {
        postTitle: "Afterimage live recap",
        objective: "Prolonger la visibilité de l'EP publié.",
        rationale: "Extrait live déjà validé dans un contexte historique de démonstration.",
        platform: "YOUTUBE",
        caption: "Afterimage en live : un extrait du dernier set.",
        hashtags: ["#Afterimage", "#LiveSet"],
        cta: null,
        plannedAt: "2026-08-29T19:00:00.000Z",
        timezone: "Europe/Paris",
        media: [
          {
            id: "med_live",
            filename: "afterimage-live-clip.mp4",
            type: "VIDEO",
            status: "SCHEDULED" as MediaStatus,
          },
        ],
      };
      const otherWorkspacePayload = {
        postTitle: "Proposition privée autre workspace",
        objective: "Donnée de test isolée.",
        rationale: "Ne doit jamais sortir du workspace propriétaire.",
        platform: "INSTAGRAM",
        caption: "Contenu privé d'un autre workspace.",
        hashtags: ["#Private"],
        cta: null,
        plannedAt: "2026-09-02T18:00:00.000Z",
        timezone: "Europe/Paris",
        media: [
          {
            id: "med_other_workspace",
            filename: "private-other-video.mp4",
            type: "VIDEO",
            status: "UNUSED" as MediaStatus,
          },
        ],
      };
      const studioInstagramHash = calculatePostVariantPayloadHash(studioInstagramPayload);
      const nightDriveTiktokHash = calculatePostVariantPayloadHash(nightDriveTiktokPayload);
      const afterimageYoutubeHash = calculatePostVariantPayloadHash(afterimageYoutubePayload);
      const otherWorkspaceHash = calculatePostVariantPayloadHash(otherWorkspacePayload);

      await transaction.query(
        `
          INSERT INTO posts (
            id, workspace_id, artist_project_id, title, objective, rationale, status, created_at, updated_at
          )
          VALUES
            (
              'post_lumiere_studio', $1, 'prj_demo_aless', 'Teaser studio — Lumière Noire',
              'Créer de l''attente autour de la prochaine release.',
              'Le plan vertical montre une étape concrète de production et reste cohérent avec le ton direct de l''Artist Brain.',
              'PROPOSED', '2026-08-30T08:30:00Z', '2026-08-30T08:30:00Z'
            ),
            (
              'post_lumiere_hook', $1, 'prj_demo_aless', 'Hook nocturne — Lumière Noire',
              'Tester un angle conversationnel avant la sortie.',
              'Le preview court permet de demander un retour sans répéter la vidéo studio.',
              'PROPOSED', '2026-08-30T08:35:00Z', '2026-08-30T08:35:00Z'
            ),
            (
              'post_afterimage_live', $1, 'prj_demo_aless', 'Afterimage live recap',
              'Prolonger la visibilité de l''EP publié.',
              'Extrait live déjà validé dans un contexte historique de démonstration.',
              'PROPOSED', '2026-08-24T08:35:00Z', '2026-08-24T08:35:00Z'
            ),
            (
              'post_other_workspace', 'wsp_other', 'prj_other_workspace', 'Proposition privée autre workspace',
              'Donnée de test isolée.', 'Ne doit jamais sortir du workspace propriétaire.',
              'PROPOSED', '2026-08-30T08:40:00Z', '2026-08-30T08:40:00Z'
            )
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
      );
      await transaction.query(
        `
          INSERT INTO post_variants (
            id, workspace_id, post_id, platform_id, caption, hashtags, cta, planned_at, timezone,
            approval_state, delivery_state, payload_hash, created_at, updated_at
          )
          VALUES
            (
              'variant_lumiere_instagram', $1, 'post_lumiere_studio', 'platform_instagram',
              $2, $3::json, $4, $5, $6, 'REQUESTED', 'NOT_CONFIGURED', $7,
              '2026-08-30T08:30:00Z', '2026-08-30T08:30:00Z'
            ),
            (
              'variant_lumiere_tiktok', $1, 'post_lumiere_hook', 'platform_tiktok',
              $8, $9::json, $10, $11, $12, 'REQUESTED', 'NOT_CONFIGURED', $13,
              '2026-08-30T08:35:00Z', '2026-08-30T08:35:00Z'
            ),
            (
              'variant_afterimage_youtube', $1, 'post_afterimage_live', 'platform_youtube',
              $14, $15::json, $16, $17, $18, 'APPROVED', 'NOT_CONFIGURED', $19,
              '2026-08-24T08:35:00Z', '2026-08-24T09:00:00Z'
            ),
            (
              'variant_other_instagram', 'wsp_other', 'post_other_workspace', 'platform_instagram',
              $20, $21::json, $22, $23, $24, 'REQUESTED', 'NOT_CONFIGURED', $25,
              '2026-08-30T08:40:00Z', '2026-08-30T08:40:00Z'
            )
          ON CONFLICT (id) DO NOTHING
        `,
        [
          demoWorkspace.id,
          studioInstagramPayload.caption,
          JSON.stringify(studioInstagramPayload.hashtags),
          studioInstagramPayload.cta,
          studioInstagramPayload.plannedAt,
          studioInstagramPayload.timezone,
          studioInstagramHash,
          nightDriveTiktokPayload.caption,
          JSON.stringify(nightDriveTiktokPayload.hashtags),
          nightDriveTiktokPayload.cta,
          nightDriveTiktokPayload.plannedAt,
          nightDriveTiktokPayload.timezone,
          nightDriveTiktokHash,
          afterimageYoutubePayload.caption,
          JSON.stringify(afterimageYoutubePayload.hashtags),
          afterimageYoutubePayload.cta,
          afterimageYoutubePayload.plannedAt,
          afterimageYoutubePayload.timezone,
          afterimageYoutubeHash,
          otherWorkspacePayload.caption,
          JSON.stringify(otherWorkspacePayload.hashtags),
          otherWorkspacePayload.cta,
          otherWorkspacePayload.plannedAt,
          otherWorkspacePayload.timezone,
          otherWorkspaceHash,
        ],
      );
      // Cette forme INSERT…SELECT refuse le lien si l'asset et la variante ne
      // partagent pas le workspace. Aucune route de cette tranche ne permet de
      // créer un lien média directement depuis le client.
      await transaction.query(
        `
          INSERT INTO post_variant_media (post_variant_id, media_asset_id, workspace_id, sort_order)
          SELECT $1, $2, $3, $4
          WHERE EXISTS (
            SELECT 1
            FROM post_variants variant
            INNER JOIN posts post ON post.id = variant.post_id
              AND post.workspace_id = variant.workspace_id
            WHERE variant.id = $1
              AND variant.workspace_id = $3
              AND post.workspace_id = $3
          )
            AND EXISTS (
              SELECT 1 FROM media_assets media WHERE media.id = $2 AND media.workspace_id = $3
            )
          ON CONFLICT (post_variant_id, media_asset_id) DO NOTHING
        `,
        ["variant_lumiere_instagram", "med_studio_light", demoWorkspace.id, 0],
      );
      await transaction.query(
        `
          INSERT INTO post_variant_media (post_variant_id, media_asset_id, workspace_id, sort_order)
          SELECT $1, $2, $3, $4
          WHERE EXISTS (
            SELECT 1
            FROM post_variants variant
            INNER JOIN posts post ON post.id = variant.post_id
              AND post.workspace_id = variant.workspace_id
            WHERE variant.id = $1
              AND variant.workspace_id = $3
              AND post.workspace_id = $3
          )
            AND EXISTS (
              SELECT 1 FROM media_assets media WHERE media.id = $2 AND media.workspace_id = $3
            )
          ON CONFLICT (post_variant_id, media_asset_id) DO NOTHING
        `,
        ["variant_lumiere_tiktok", "med_night-drive", demoWorkspace.id, 0],
      );
      await transaction.query(
        `
          INSERT INTO post_variant_media (post_variant_id, media_asset_id, workspace_id, sort_order)
          SELECT $1, $2, $3, $4
          WHERE EXISTS (
            SELECT 1
            FROM post_variants variant
            INNER JOIN posts post ON post.id = variant.post_id
              AND post.workspace_id = variant.workspace_id
            WHERE variant.id = $1
              AND variant.workspace_id = $3
              AND post.workspace_id = $3
          )
            AND EXISTS (
              SELECT 1 FROM media_assets media WHERE media.id = $2 AND media.workspace_id = $3
            )
          ON CONFLICT (post_variant_id, media_asset_id) DO NOTHING
        `,
        ["variant_afterimage_youtube", "med_live", demoWorkspace.id, 0],
      );
      await transaction.query(
        `
          INSERT INTO post_variant_media (post_variant_id, media_asset_id, workspace_id, sort_order)
          SELECT $1, $2, $3, $4
          WHERE EXISTS (
            SELECT 1
            FROM post_variants variant
            INNER JOIN posts post ON post.id = variant.post_id
              AND post.workspace_id = variant.workspace_id
            WHERE variant.id = $1
              AND variant.workspace_id = $3
              AND post.workspace_id = $3
          )
            AND EXISTS (
              SELECT 1 FROM media_assets media WHERE media.id = $2 AND media.workspace_id = $3
            )
          ON CONFLICT (post_variant_id, media_asset_id) DO NOTHING
        `,
        ["variant_other_instagram", "med_other_workspace", "wsp_other", 0],
      );
      await transaction.query(
        `
          INSERT INTO approvals (
            id, workspace_id, post_variant_id, state, requested_at, decided_at, decided_by, payload_hash
          )
          VALUES
            ('approval_lumiere_instagram', $1, 'variant_lumiere_instagram', 'REQUESTED', '2026-08-30T08:30:00Z', NULL, NULL, $2),
            ('approval_lumiere_tiktok', $1, 'variant_lumiere_tiktok', 'REQUESTED', '2026-08-30T08:35:00Z', NULL, NULL, $3),
            ('approval_afterimage_youtube', $1, 'variant_afterimage_youtube', 'APPROVED', '2026-08-24T08:35:00Z', '2026-08-24T09:00:00Z', $4, $5),
            ('approval_other_instagram', 'wsp_other', 'variant_other_instagram', 'REQUESTED', '2026-08-30T08:40:00Z', NULL, NULL, $6)
          ON CONFLICT (id) DO NOTHING
        `,
        [
          demoWorkspace.id,
          studioInstagramHash,
          nightDriveTiktokHash,
          demoContext.userId,
          afterimageYoutubeHash,
          otherWorkspaceHash,
        ],
      );
      await transaction.query(
        `
          INSERT INTO tasks (
            id, workspace_id, title, description, due_at, status, completed_by, completed_at, created_at, updated_at
          )
          VALUES
            (
              'task_caption_review', $1, 'Valider la caption de Lumière Noire',
              'Relire la caption de la prochaine release.', '2026-08-30T10:00:00Z',
              'TODO', NULL, NULL, '2026-08-29T10:00:00Z', '2026-08-29T10:00:00Z'
            ),
            (
              'task_campaign_review', $1, 'Finaliser le brief de campagne',
              'Valider les axes et les contenus de campagne.', '2026-08-30T14:00:00Z',
              'IN_PROGRESS', NULL, NULL, '2026-08-29T11:00:00Z', '2026-08-29T11:00:00Z'
            ),
            (
              'task_cancelled', $1, 'Ancienne idée de teaser',
              'Tâche annulée : ne doit plus être réactivée par le MVP.', NULL,
              'CANCELLED', NULL, NULL, '2026-08-28T11:00:00Z', '2026-08-28T12:00:00Z'
            ),
            (
              'task_other_workspace', 'wsp_other', 'Tâche privée autre workspace',
              'Cette tâche ne doit jamais être révélée au workspace démo.', '2026-08-30T12:00:00Z',
              'TODO', NULL, NULL, '2026-08-29T12:00:00Z', '2026-08-29T12:00:00Z'
            )
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
      );
      await transaction.query(
        `
          INSERT INTO scheduled_posts (id, workspace_id, title, scheduled_at, status)
          VALUES
            ('scheduled_studio', $1, 'Teaser studio — Lumière Noire', '2026-08-30T16:00:00Z', 'SCHEDULED'),
            ('scheduled_other_workspace', 'wsp_other', 'Publication privée autre workspace', '2026-08-30T17:00:00Z', 'SCHEDULED')
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
      );
    });
  }
}
