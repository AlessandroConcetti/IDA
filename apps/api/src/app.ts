import cors from "@fastify/cors";
import {
  artistProfileSchema,
  artistProfileUpdateSchema,
  mediaAssetSchema,
  mediaStatusSchema,
  memorySchema,
  releaseSchema,
  socialPlatformCapabilitySchema,
  trackSchema,
} from "@ida/contracts";
import { createModuleRegistry, ToolGateway, ToolPolicyError } from "@ida/domain";
import Fastify, { type FastifyInstance } from "fastify";

import { type ArtistProfile, DemoDatabase, type DemoDatabaseOptions, mediaStatuses } from "./database.js";
import { demoContext, demoWorkspace } from "./demo-context.js";
import { CommandInputError, DeterministicIdaCore } from "./ida-core.js";

export type CreateAppOptions = DemoDatabaseOptions & {
  now?: () => Date;
};

type AppError = Error & {
  statusCode?: number;
  code?: string;
};

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

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const database = await DemoDatabase.open(options);
  const core = new DeterministicIdaCore(database, undefined, options.now);
  const modules = createModuleRegistry();
  const toolGateway = new ToolGateway();

  await app.register(cors, {
    origin: "http://127.0.0.1:5173",
    methods: ["GET", "PATCH", "POST", "OPTIONS"],
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
    const timestamp = "2026-08-30T00:00:00.000Z";

    return {
      data: tracks.map((track) =>
        trackSchema.parse({
          id: track.id,
          workspaceId: demoContext.workspaceId,
          artistProjectId: "prj_demo_aless",
          releaseId: optionalString(track.releaseId),
          title: track.title,
          artistCredit: track.artistCredit,
          genre: optionalString(track.genre),
          bpm: track.bpm ?? undefined,
          musicalKey: optionalString(track.musicalKey),
          releaseDate: optionalString(track.releaseDate),
          label: "Aural Motion",
          status: track.status,
          links: [],
          tags: [],
          description: undefined,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    };
  });

  app.get("/v1/media", async (request) => {
    const query = isRecord(request.query) ? request.query : {};
    const candidateStatus = typeof query.status === "string" ? query.status.toUpperCase() : undefined;

    if (candidateStatus && !mediaStatuses.includes(candidateStatus as (typeof mediaStatuses)[number])) {
      throw new CommandInputError(`Statut de média invalide : ${candidateStatus}.`);
    }

    const status = candidateStatus ? mediaStatusSchema.parse(candidateStatus) : undefined;
    const media = await database.listMedia(demoContext.workspaceId, status);
    const timestamp = "2026-08-30T00:00:00.000Z";

    return {
      data: media.map((asset) =>
        mediaAssetSchema.parse({
          id: asset.id,
          workspaceId: demoContext.workspaceId,
          artistProjectId: "prj_demo_aless",
          filename: asset.filename,
          type: asset.mediaType,
          mimeType: asset.mimeType,
          size: asset.byteSize,
          hash: `seed-${asset.id}`,
          releaseId: undefined,
          trackId: undefined,
          tags: asset.tags,
          description: optionalString(asset.description),
          status: asset.status,
          usageCount: asset.usageCount,
          lastUsedAt: asset.lastUsedAt ?? undefined,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      ),
    };
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
