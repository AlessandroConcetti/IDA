import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

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
  tone: string;
  audience: string;
  goals: string[];
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
  releaseId: string | null;
  title: string;
  artistCredit: string;
  genre: string | null;
  bpm: number | null;
  musicalKey: string | null;
  status: string;
  releaseDate: string | null;
};

export type MediaAsset = {
  id: string;
  filename: string;
  mediaType: string;
  mimeType: string;
  byteSize: number;
  status: MediaStatus;
  description: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  projectName: string | null;
  releaseTitle: string | null;
  trackTitle: string | null;
  tags: string[];
};

export type Memory = {
  id: string;
  category: string;
  content: string;
  state: string;
  confirmedAt: string | null;
};

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

function isPersistentDirectory(dataDir: string): boolean {
  return !dataDir.startsWith("memory://");
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
          profile.tone,
          profile.audience,
          profile.goals
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
      tone: asString(row.tone),
      audience: asString(row.audience),
      goals: asStringArray(row.goals),
    };
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
          release_id AS "releaseId",
          title,
          artist_credit AS "artistCredit",
          genre,
          bpm,
          musical_key AS "musicalKey",
          status,
          release_date AS "releaseDate"
        FROM tracks
        WHERE workspace_id = $1
        ORDER BY release_date NULLS LAST, title
      `,
      [workspaceId],
    );

    return result.rows.map((row) => ({
      id: asString(row.id),
      releaseId: asNullableString(row.releaseId),
      title: asString(row.title),
      artistCredit: asString(row.artistCredit),
      genre: asNullableString(row.genre),
      bpm: row.bpm === null || row.bpm === undefined ? null : asNumber(row.bpm),
      musicalKey: asNullableString(row.musicalKey),
      status: asString(row.status),
      releaseDate: asDateString(row.releaseDate),
    }));
  }

  async listMedia(workspaceId: string, status?: MediaStatus): Promise<MediaAsset[]> {
    const values: unknown[] = [workspaceId];
    const statusClause = status ? " AND asset.status = $2" : "";

    if (status) {
      values.push(status);
    }

    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT
          asset.id,
          asset.filename,
          asset.media_type AS "mediaType",
          asset.mime_type AS "mimeType",
          asset.byte_size AS "byteSize",
          asset.status,
          asset.description,
          asset.usage_count AS "usageCount",
          asset.last_used_at AS "lastUsedAt",
          project.name AS "projectName",
          release.title AS "releaseTitle",
          track.title AS "trackTitle",
          COALESCE(
            json_agg(tag.name ORDER BY tag.name) FILTER (WHERE tag.name IS NOT NULL),
            '[]'::json
          ) AS tags
        FROM media_assets asset
        LEFT JOIN artist_projects project ON project.id = asset.artist_project_id
        LEFT JOIN releases release ON release.id = asset.release_id
        LEFT JOIN tracks track ON track.id = asset.track_id
        LEFT JOIN media_asset_tags asset_tag ON asset_tag.media_asset_id = asset.id
        LEFT JOIN media_tags tag ON tag.id = asset_tag.media_tag_id
        WHERE asset.workspace_id = $1${statusClause}
        GROUP BY asset.id, project.name, release.title, track.title
        ORDER BY asset.created_at DESC
      `,
      values,
    );

    return result.rows.map((row) => ({
      id: asString(row.id),
      filename: asString(row.filename),
      mediaType: asString(row.mediaType),
      mimeType: asString(row.mimeType),
      byteSize: asNumber(row.byteSize),
      status: asString(row.status) as MediaStatus,
      description: asNullableString(row.description),
      usageCount: asNumber(row.usageCount),
      lastUsedAt: asTimestamp(row.lastUsedAt),
      projectName: asNullableString(row.projectName),
      releaseTitle: asNullableString(row.releaseTitle),
      trackTitle: asNullableString(row.trackTitle),
      tags: asStringArray(row.tags),
    }));
  }

  async listMemories(workspaceId: string): Promise<Memory[]> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT id, category, content, state, confirmed_at AS "confirmedAt"
        FROM memories
        WHERE workspace_id = $1
        ORDER BY created_at DESC
      `,
      [workspaceId],
    );

    return result.rows.map((row) => ({
      id: asString(row.id),
      category: asString(row.category),
      content: asString(row.content),
      state: asString(row.state),
      confirmedAt: asTimestamp(row.confirmedAt),
    }));
  }

  async listToday(workspaceId: string): Promise<TodayItem[]> {
    const result = await this.pglite.query<ScalarRow>(
      `
        SELECT id, 'TASK' AS kind, title, due_at AS "dueAt", status
        FROM tasks
        WHERE workspace_id = $1
          AND status IN ('TODO', 'IN_PROGRESS')
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

    return result.rows.map((row) => ({
      id: asString(row.id),
      kind: asString(row.kind) as TodayItem["kind"],
      title: asString(row.title),
      dueAt: asTimestamp(row.dueAt) ?? "",
      status: asString(row.status),
    }));
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
        tone TEXT NOT NULL,
        audience TEXT NOT NULL,
        goals JSON NOT NULL,
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
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
        status TEXT NOT NULL,
        description TEXT,
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
        confirmed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        title TEXT NOT NULL,
        due_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        title TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_releases_workspace_date
        ON releases (workspace_id, release_date);
      CREATE INDEX IF NOT EXISTS idx_tracks_workspace_status
        ON tracks (workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_media_workspace_status
        ON media_assets (workspace_id, status);
      CREATE INDEX IF NOT EXISTS idx_memories_workspace_created
        ON memories (workspace_id, created_at DESC);
    `);
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
            id, workspace_id, project_id, display_name, identity, genres, tone, audience, goals
          )
          VALUES (
            'profile_demo_aless', $1, 'prj_demo_aless', 'Aless',
            'Producteur et DJ électronique entre textures nocturnes et énergie club.',
            '["Melodic techno", "Progressive house", "Electronic"]'::json,
            'Direct, lumineux, précis et jamais générique.',
            'Auditeurs de musique électronique et public de clubs européens.',
            '["Préparer une release cohérente", "Faire émerger les contenus studio", "Maintenir une voix éditoriale concise"]'::json
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
          INSERT INTO memories (id, workspace_id, category, content, state, confirmed_at)
          VALUES
            ('mem_short_captions', $1, 'PREFERENCE_MEMORY', 'Préférence confirmée : captions courtes, directes et sans hashtags excessifs.', 'CONFIRMED', '2026-08-20T09:00:00Z'),
            ('mem_weekly_planning', $1, 'ARTIST_MEMORY', 'Objectif courant : valoriser les contenus de studio avant la sortie de Lumière Noire.', 'CONFIRMED', '2026-08-24T12:00:00Z'),
            ('mem_tiktok_question', $1, 'PREFERENCE_MEMORY', 'Proposition : tester une série de hooks TikTok plus frontaux.', 'PENDING', NULL)
          ON CONFLICT (id) DO NOTHING
        `,
        [demoWorkspace.id],
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
      await transaction.query(
        `
          INSERT INTO tasks (id, workspace_id, title, due_at, status)
          VALUES
            ('task_caption_review', $1, 'Valider la caption de Lumière Noire', '2026-08-30T10:00:00Z', 'TODO'),
            ('task_campaign_review', $1, 'Finaliser le brief de campagne', '2026-08-30T14:00:00Z', 'IN_PROGRESS'),
            ('task_other_workspace', 'wsp_other', 'Tâche privée autre workspace', '2026-08-30T12:00:00Z', 'TODO')
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
