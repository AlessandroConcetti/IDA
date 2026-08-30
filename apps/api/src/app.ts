import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import {
  artistProfileSchema,
  artistProfileUpdateSchema,
  mediaAssetSchema,
  mediaImportSchema,
  mediaStatusSchema,
  memorySchema,
  releaseSchema,
  socialPlatformCapabilitySchema,
  trackCreateSchema,
  trackSchema,
} from "@ida/contracts";
import { createModuleRegistry, ToolGateway, ToolPolicyError } from "@ida/domain";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

import {
  type ArtistProfile,
  DemoDatabase,
  type DemoDatabaseOptions,
  type MediaAsset,
  mediaStatuses,
  type Track,
} from "./database.js";
import { demoContext, demoWorkspace } from "./demo-context.js";
import { CommandInputError, DeterministicIdaCore } from "./ida-core.js";

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

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const database = await DemoDatabase.open(options);
  const storageDir = options.storageDir ?? defaultStorageDir;
  const core = new DeterministicIdaCore(database, undefined, options.now);
  const modules = createModuleRegistry();
  const toolGateway = new ToolGateway(undefined, [
    { toolKey: "update_artist_profile", moduleKey: "MEMORY", permission: "WRITE" },
    { toolKey: "create_track", moduleKey: "MUSIC", permission: "WRITE" },
    { toolKey: "import_media", moduleKey: "CONTENT", permission: "WRITE" },
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

  app.get("/v1/system/status", async () => ({ data: core.getSystemStatus() }));

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
    const timestamp = "2026-08-30T00:00:00.000Z";

    return {
      data: releases.map((release) =>
        releaseSchema.parse({
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
          tags: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    };
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
    const query = isRecord(request.query) ? request.query : {};
    const candidateStatus = typeof query.status === "string" ? query.status.toUpperCase() : undefined;

    if (candidateStatus && !mediaStatuses.includes(candidateStatus as (typeof mediaStatuses)[number])) {
      throw new CommandInputError(`Statut de média invalide : ${candidateStatus}.`);
    }

    const status = candidateStatus ? mediaStatusSchema.parse(candidateStatus) : undefined;
    const media = await database.listMedia(demoContext.workspaceId, status);

    return {
      data: media.map(toMediaAssetResponse),
    };
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
    const timestamp = "2026-08-30T00:00:00.000Z";

    return {
      data: memories.map((memory) =>
        memorySchema.parse({
          id: memory.id,
          workspaceId: demoContext.workspaceId,
          category: memory.category,
          content: memory.content,
          state: memory.state,
          confirmedBy: memory.state === "CONFIRMED" ? demoContext.userId : undefined,
          createdAt: timestamp,
          updatedAt: memory.confirmedAt ?? timestamp,
        }),
      ),
    };
  });

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

  app.post("/v1/ida/commands", async (request) => ({ data: await core.execute(request.body) }));

  return app;
}
