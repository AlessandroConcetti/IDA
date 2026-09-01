import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";

type MultipartTestPart =
  | { name: string; value: string }
  | { name: string; filename: string; contentType: string; value: Buffer };

function multipartPayload(parts: MultipartTestPart[]): { headers: Record<string, string>; payload: Buffer } {
  const boundary = `----ida-test-${randomUUID()}`;
  const chunks: Buffer[] = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));

    if ("filename" in part) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
        ),
      );
      chunks.push(part.value);
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}`));
    }

    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  };
}

describe("IDA API — première tranche Phase 1", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "ida-media-storage-"));
    app = await createApp({
      dataDir: "memory://",
      storageDir,
      now: () => new Date("2026-08-30T09:00:00.000Z"),
    });
  });

  afterEach(async () => {
    await app.close();
    await rm(storageDir, { recursive: true, force: true });
  });

  it("expose un health check local explicite", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "ida-api",
      mode: "LOCAL_DEMO",
      database: "ready",
    });
  });

  it("autorise le client web local configuré par CORS", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://127.0.0.1:5173" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
  });

  it("expose les ressources lecture seule de la première tranche", async () => {
    const endpoints = [
      "/v1/me",
      "/v1/modules",
      "/v1/system/status",
      "/v1/artist-profile",
      "/v1/releases",
      "/v1/campaigns",
      "/v1/tracks",
      "/v1/media",
      "/v1/memories",
      "/v1/approvals/queue",
      "/v1/calendar",
      "/v1/tasks",
      "/v1/social/platforms",
    ];

    for (const url of endpoints) {
      const response = await app.inject({ method: "GET", url });

      expect(response.statusCode, url).toBe(200);
      expect(response.json()).toHaveProperty("data");
    }
  });

  it("isole les médias au workspace démo, même si le client tente d'en fournir un autre", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/media?status=UNUSED&workspaceId=wsp_other",
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      data: Array<{ id: string; filename: string; workspaceId: string; status: string }>;
    };

    expect(body.data).toHaveLength(2);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "med_studio_light", workspaceId: "wsp_demo_aless", status: "UNUSED" }),
        expect.objectContaining({ id: "med_night-drive", workspaceId: "wsp_demo_aless", status: "UNUSED" }),
      ]),
    );
    expect(body.data.some((asset) => asset.id === "med_other_workspace")).toBe(false);
    expect(body.data.some((asset) => asset.filename === "private-other-video.mp4")).toBe(false);
  });

  it("recherche les médias avec des filtres cumulés sans exposer le stockage privé", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/media?q=studio&status=UNUSED&type=VIDEO&tag=StUdIo&limit=1",
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      data: Array<Record<string, unknown>>;
    };

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "med_studio_light",
      filename: "studio-lumiere-noire-take-04.mp4",
      status: "UNUSED",
      type: "VIDEO",
      tags: expect.arrayContaining(["studio", "vertical"]),
    });
    expect(body.data[0]).not.toHaveProperty("storageKey");
    expect(body.data[0]).not.toHaveProperty("filePath");
  });

  it("cherche aussi dans les tags, normalise le filtre tag et garde une liste sans doublon", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/media?q=VERTICAL&type=VIDEO&tag=VeRtIcAl&limit=2",
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      data: Array<{ id: string; tags: string[] }>;
    };

    expect(body.data.map((asset) => asset.id)).toEqual(expect.arrayContaining(["med_studio_light", "med_night-drive"]));
    expect(body.data).toHaveLength(2);
    expect(new Set(body.data.map((asset) => asset.id)).size).toBe(2);
    expect(body.data.every((asset) => asset.tags.includes("vertical"))).toBe(true);

    const escapedWildcard = await app.inject({ method: "GET", url: "/v1/media?q=%25" });
    expect(escapedWildcard.statusCode).toBe(200);
    expect((escapedWildcard.json() as { data: unknown[] }).data).toHaveLength(0);
  });

  it("applique une limite stable aux recherches de médias", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/media?type=VIDEO&limit=2" });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      data: Array<{ id: string; createdAt: string }>;
    };
    const ordered = [...body.data].sort(
      (left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
    );

    expect(body.data).toHaveLength(2);
    expect(body.data).toEqual(ordered);
  });

  it("importe un média privé, normalise ses tags et le rend visible dans la bibliothèque", async () => {
    const file = Buffer.from("ida-private-image-content");
    const response = await app.inject({
      method: "POST",
      url: "/v1/media",
      ...multipartPayload([
        {
          name: "file",
          filename: "..\\studio-frame.jpg",
          contentType: "image/jpeg",
          value: file,
        },
        { name: "description", value: "Photo studio importée localement." },
        { name: "tags", value: "Studio, Vertical, studio" },
      ]),
    });

    const expectedHash = createHash("sha256").update(file).digest("hex");
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      data: {
        id: expect.stringMatching(/^med_[a-f0-9]{32}$/),
        workspaceId: "wsp_demo_aless",
        artistProjectId: "prj_demo_aless",
        filename: "studio-frame.jpg",
        type: "IMAGE",
        mimeType: "image/jpeg",
        size: file.byteLength,
        hash: expectedHash,
        status: "UNUSED",
        description: "Photo studio importée localement.",
        tags: ["studio", "vertical"],
      },
    });
    expect((response.json() as { data: Record<string, unknown> }).data).not.toHaveProperty("storageKey");
    expect((response.json() as { data: Record<string, unknown> }).data).not.toHaveProperty("filePath");

    const listing = await app.inject({ method: "GET", url: "/v1/media?status=UNUSED" });
    expect(listing.statusCode).toBe(200);
    expect((listing.json() as { data: Array<{ hash: string; filename: string; tags: string[] }> }).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hash: expectedHash, filename: "studio-frame.jpg", tags: ["studio", "vertical"] }),
      ]),
    );
  });

  it("conserve un média importé après un redémarrage local", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-media-data-"));
    const persistentStorageDir = await mkdtemp(join(tmpdir(), "ida-media-private-storage-"));
    let firstApp: Awaited<ReturnType<typeof createApp>> | undefined;
    let restartedApp: Awaited<ReturnType<typeof createApp>> | undefined;

    try {
      firstApp = await createApp({ dataDir, storageDir: persistentStorageDir });
      const file = Buffer.from("ida-persistent-audio");
      const imported = await firstApp.inject({
        method: "POST",
        url: "/v1/media",
        ...multipartPayload([
          { name: "file", filename: "persistent-demo.mp3", contentType: "audio/mpeg", value: file },
          { name: "tags", value: "demo, local" },
        ]),
      });

      expect(imported.statusCode).toBe(201);
      const hash = createHash("sha256").update(file).digest("hex");
      await firstApp.close();
      firstApp = undefined;

      restartedApp = await createApp({ dataDir, storageDir: persistentStorageDir });
      const listing = await restartedApp.inject({ method: "GET", url: "/v1/media" });

      expect(listing.statusCode).toBe(200);
      expect((listing.json() as { data: Array<{ hash: string; filename: string; tags: string[] }> }).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ hash, filename: "persistent-demo.mp3", tags: ["demo", "local"] }),
        ]),
      );
    } finally {
      await firstApp?.close();
      await restartedApp?.close();
      await rm(dataDir, { recursive: true, force: true });
      await rm(persistentStorageDir, { recursive: true, force: true });
    }
  });

  it("refuse un doublon exact sans créer un second média", async () => {
    const file = Buffer.from("ida-duplicate-file");
    const first = await app.inject({
      method: "POST",
      url: "/v1/media",
      ...multipartPayload([{ name: "file", filename: "first.png", contentType: "image/png", value: file }]),
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/media",
      ...multipartPayload([{ name: "file", filename: "renamed.png", contentType: "image/png", value: file }]),
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: "DUPLICATE_MEDIA" } });

    const hash = createHash("sha256").update(file).digest("hex");
    const listing = await app.inject({ method: "GET", url: "/v1/media" });
    expect(
      (listing.json() as { data: Array<{ hash: string }> }).data.filter((asset) => asset.hash === hash),
    ).toHaveLength(1);
  });

  it("refuse un type de fichier ou une tentative de scope non autorisés", async () => {
    const initial = await app.inject({ method: "GET", url: "/v1/media" });
    const initialCount = (initial.json() as { data: unknown[] }).data.length;
    const invalidFile = await app.inject({
      method: "POST",
      url: "/v1/media",
      ...multipartPayload([
        { name: "file", filename: "unsafe.exe", contentType: "image/jpeg", value: Buffer.from("not an image") },
      ]),
    });
    const invalidScope = await app.inject({
      method: "POST",
      url: "/v1/media",
      ...multipartPayload([
        { name: "file", filename: "allowed.png", contentType: "image/png", value: Buffer.from("image") },
        { name: "workspaceId", value: "wsp_other" },
      ]),
    });

    expect(invalidFile.statusCode).toBe(415);
    expect(invalidFile.json()).toMatchObject({ error: { code: "UNSUPPORTED_MEDIA_FILE" } });
    expect(invalidScope.statusCode).toBe(400);
    expect(invalidScope.json()).toMatchObject({ error: { code: "INVALID_MEDIA_IMPORT" } });

    const after = await app.inject({ method: "GET", url: "/v1/media" });
    expect((after.json() as { data: unknown[] }).data).toHaveLength(initialCount);
  });

  it("applique la limite explicite de 25 MiB aux imports", async () => {
    const oversizedFile = Buffer.alloc(25 * 1024 * 1024 + 1, 1);
    const response = await app.inject({
      method: "POST",
      url: "/v1/media",
      ...multipartPayload([
        { name: "file", filename: "too-large.mp4", contentType: "video/mp4", value: oversizedFile },
      ]),
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ error: { code: "MEDIA_FILE_TOO_LARGE" } });
  });

  it("crée un morceau Music Brain avec un outil WRITE et le conserve dans le workspace serveur", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tracks",
      payload: {
        title: "Signal Horizon",
        artistCredit: "Aless",
        genre: "Melodic techno",
        bpm: 128,
        musicalKey: "E minor",
        releaseDate: "2026-10-03",
        label: "Aural Motion",
        status: "UNRELEASED",
        tags: ["club", "draft"],
        description: "Démo construite autour d’un break progressif.",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      data: {
        id: expect.stringMatching(/^trk_[a-f0-9]{32}$/),
        workspaceId: "wsp_demo_aless",
        artistProjectId: "prj_demo_aless",
        title: "Signal Horizon",
        artistCredit: "Aless",
        genre: "Melodic techno",
        bpm: 128,
        musicalKey: "E minor",
        releaseDate: "2026-10-03",
        label: "Aural Motion",
        status: "UNRELEASED",
        tags: ["club", "draft"],
        description: "Démo construite autour d’un break progressif.",
      },
    });

    const tracks = await app.inject({ method: "GET", url: "/v1/tracks" });
    expect(tracks.statusCode).toBe(200);
    expect((tracks.json() as { data: Array<{ title: string; workspaceId: string }> }).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Signal Horizon", workspaceId: "wsp_demo_aless" })]),
    );
  });

  it("refuse un morceau Music Brain invalide avant toute écriture", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tracks",
      payload: {
        title: "Sans tempo valide",
        artistCredit: "Aless",
        bpm: 0,
        status: "DEMO",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_TRACK" } });

    const tracks = await app.inject({ method: "GET", url: "/v1/tracks" });
    expect((tracks.json() as { data: Array<{ title: string }> }).data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Sans tempo valide" })]),
    );
  });

  it("refuse toute tentative de choisir le workspace pendant la création d’un morceau", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tracks",
      payload: {
        workspaceId: "wsp_other",
        title: "Tentative hors périmètre",
        artistCredit: "Aless",
        status: "DEMO",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_TRACK" } });

    const tracks = await app.inject({ method: "GET", url: "/v1/tracks?workspaceId=wsp_other" });
    expect((tracks.json() as { data: Array<{ title: string; workspaceId: string }> }).data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Tentative hors périmètre" })]),
    );
    expect(
      (tracks.json() as { data: Array<{ workspaceId: string }> }).data.every(
        (track) => track.workspaceId === "wsp_demo_aless",
      ),
    ).toBe(true);
  });

  it("liste les Campaign Briefs uniquement dans le workspace serveur", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/campaigns?workspaceId=wsp_other" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: Array<{ id: string; workspaceId: string; artistProjectId: string; name: string; status: string }>;
    };

    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "cmp_lumiere_noire",
          workspaceId: "wsp_demo_aless",
          artistProjectId: "prj_demo_aless",
          status: "DRAFT",
        }),
      ]),
    );
    expect(body.data.some((campaign) => campaign.id === "cmp_other_workspace")).toBe(false);
    expect(body.data.some((campaign) => campaign.name === "Private campaign")).toBe(false);
    expect(body.data.every((campaign) => campaign.workspaceId === "wsp_demo_aless")).toBe(true);
  });

  it("crée un Campaign Brief DRAFT strictement scoped et bloque les doublons normalisés", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      payload: {
        id: "cmp_client",
        workspaceId: "wsp_other",
        artistProjectId: "prj_other_workspace",
        actorUserId: "usr_other",
        status: "ACTIVE",
        name: "Tentative de campagne forcée",
        objective: "Forcer un état et un scope externes.",
      },
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: "INVALID_CAMPAIGN" } });

    const created = await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      payload: {
        name: "Lumière Noire — automne",
        objective: "Centraliser le brief créatif avant tout plan de contenu.",
      },
    });

    expect(created.statusCode).toBe(201);
    const campaign = (
      created.json() as {
        data: {
          id: string;
          workspaceId: string;
          artistProjectId: string;
          name: string;
          objective: string;
          status: string;
          createdAt: string;
          updatedAt: string;
        };
      }
    ).data;
    expect(campaign).toMatchObject({
      id: expect.stringMatching(/^cmp_[a-f0-9]{32}$/),
      workspaceId: "wsp_demo_aless",
      artistProjectId: "prj_demo_aless",
      name: "Lumière Noire — automne",
      objective: "Centraliser le brief créatif avant tout plan de contenu.",
      status: "DRAFT",
    });
    expect(Number.isNaN(Date.parse(campaign.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(campaign.updatedAt))).toBe(false);
    expect((campaign as Record<string, unknown>).normalizedName).toBeUndefined();

    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      payload: {
        name: "  lumiÈre noire — AUTOMNE  ",
        objective: "Ce brief ne doit jamais créer un second enregistrement.",
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ error: { code: "CAMPAIGN_ALREADY_EXISTS" } });

    const listing = await app.inject({ method: "GET", url: "/v1/campaigns" });
    expect(listing.statusCode).toBe(200);
    expect(
      (listing.json() as { data: Array<{ id: string }> }).data.filter((item) => item.id === campaign.id),
    ).toHaveLength(1);
  });

  it("journalise un Campaign Brief sans toucher aux ressources éditoriales ou sociales", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-campaign-brief-"));
    const isolatedStorageDir = await mkdtemp(join(tmpdir(), "ida-campaign-brief-storage-"));
    let setupDatabase: DemoDatabase | undefined;
    let isolatedApp: Awaited<ReturnType<typeof createApp>> | undefined;
    let inspectedDatabase: DemoDatabase | undefined;

    type CampaignBoundaryCounts = {
      campaigns: number;
      posts: number;
      postVariants: number;
      approvals: number;
      media: number;
      tasks: number;
      scheduledPosts: number;
      internalSchedules: number;
      socialPlatforms: number;
    };

    const countBoundaryResources = async (database: DemoDatabase): Promise<CampaignBoundaryCounts> => {
      const result = await database.pglite.query<CampaignBoundaryCounts>(`
        SELECT
          (SELECT COUNT(*)::int FROM campaigns WHERE workspace_id = 'wsp_demo_aless') AS campaigns,
          (SELECT COUNT(*)::int FROM posts WHERE workspace_id = 'wsp_demo_aless') AS posts,
          (SELECT COUNT(*)::int FROM post_variants WHERE workspace_id = 'wsp_demo_aless') AS "postVariants",
          (SELECT COUNT(*)::int FROM approvals WHERE workspace_id = 'wsp_demo_aless') AS approvals,
          (SELECT COUNT(*)::int FROM media_assets WHERE workspace_id = 'wsp_demo_aless') AS media,
          (SELECT COUNT(*)::int FROM tasks WHERE workspace_id = 'wsp_demo_aless') AS tasks,
          (SELECT COUNT(*)::int FROM scheduled_posts WHERE workspace_id = 'wsp_demo_aless') AS "scheduledPosts",
          (SELECT COUNT(*)::int FROM internal_post_schedules WHERE workspace_id = 'wsp_demo_aless') AS "internalSchedules",
          (SELECT COUNT(*)::int FROM social_platforms) AS "socialPlatforms"
      `);

      return result.rows[0] as CampaignBoundaryCounts;
    };

    try {
      setupDatabase = await DemoDatabase.open({ dataDir });
      const before = await countBoundaryResources(setupDatabase);
      await setupDatabase.close();
      setupDatabase = undefined;

      isolatedApp = await createApp({ dataDir, storageDir: isolatedStorageDir });
      const created = await isolatedApp.inject({
        method: "POST",
        url: "/v1/campaigns",
        payload: {
          name: "Brief audit campagne",
          objective: "Vérifier les frontières avant toute extension de campagne.",
        },
      });
      expect(created.statusCode).toBe(201);
      const campaignId = (created.json() as { data: { id: string } }).data.id;
      await isolatedApp.close();
      isolatedApp = undefined;

      inspectedDatabase = await DemoDatabase.open({ dataDir, seed: false });
      const after = await countBoundaryResources(inspectedDatabase);
      expect(after).toEqual({ ...before, campaigns: before.campaigns + 1 });

      const audit = await inspectedDatabase.pglite.query<{
        action: string;
        entityType: string;
        entityId: string;
        payload: string;
      }>(
        `
          SELECT
            action,
            entity_type AS "entityType",
            entity_id AS "entityId",
            payload::text AS payload
          FROM activity_logs
          WHERE workspace_id = 'wsp_demo_aless'
            AND action = 'campaign.created'
            AND entity_id = $1
        `,
        [campaignId],
      );

      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        action: "campaign.created",
        entityType: "CAMPAIGN",
        entityId: campaignId,
      });
      expect(audit.rows[0]?.payload).toContain('"status":"DRAFT"');
      expect(audit.rows[0]?.payload).not.toContain("Brief audit campagne");
      expect(audit.rows[0]?.payload).not.toContain("Vérifier les frontières");
    } finally {
      await setupDatabase?.close();
      await isolatedApp?.close();
      await inspectedDatabase?.close();
      await rm(dataDir, { recursive: true, force: true });
      await rm(isolatedStorageDir, { recursive: true, force: true });
    }
  });

  it("met à jour et persiste l’Artist Brain avec un outil WRITE sans écraser les autres champs", async () => {
    const firstUpdate = await app.inject({
      method: "PATCH",
      url: "/v1/artist-profile",
      payload: {
        identity: "Producteur électronique focalisé sur des récits nocturnes et l’énergie du club.",
        influences: ["Bicep", "Jon Hopkins"],
        preferredVocabulary: ["précis", "immersif"],
        forbiddenVocabulary: ["banger"],
        goals: ["Finaliser la campagne de Lumière Noire"],
        audience: "Auditeurs de musique électronique et clubbers européens.",
        platformPreferences: {
          instagram: { preferredFormats: ["Reel", "Carousel"], cadencePerWeek: 3 },
          tiktok: { preferredFormats: ["Studio clip"], notes: "Privilégier les hooks directs." },
        },
      },
    });

    expect(firstUpdate.statusCode).toBe(200);
    expect(firstUpdate.json()).toMatchObject({
      data: {
        workspaceId: "wsp_demo_aless",
        identity: "Producteur électronique focalisé sur des récits nocturnes et l’énergie du club.",
        influences: ["Bicep", "Jon Hopkins"],
        preferredVocabulary: ["précis", "immersif"],
        forbiddenVocabulary: ["banger"],
        goals: ["Finaliser la campagne de Lumière Noire"],
        audience: "Auditeurs de musique électronique et clubbers européens.",
        platformPreferences: {
          instagram: { preferredFormats: ["Reel", "Carousel"], cadencePerWeek: 3 },
          tiktok: { preferredFormats: ["Studio clip"], notes: "Privilégier les hooks directs." },
        },
      },
    });

    const secondUpdate = await app.inject({
      method: "PATCH",
      url: "/v1/artist-profile",
      payload: { tone: "Chaleureux, direct et précis." },
    });

    expect(secondUpdate.statusCode).toBe(200);
    expect(secondUpdate.json()).toMatchObject({
      data: {
        tone: "Chaleureux, direct et précis.",
        influences: ["Bicep", "Jon Hopkins"],
        preferredVocabulary: ["précis", "immersif"],
        goals: ["Finaliser la campagne de Lumière Noire"],
      },
    });

    const persisted = await app.inject({ method: "GET", url: "/v1/artist-profile" });
    expect(persisted.statusCode).toBe(200);
    expect(persisted.json()).toMatchObject({
      data: {
        tone: "Chaleureux, direct et précis.",
        platformPreferences: {
          instagram: { cadencePerWeek: 3 },
        },
      },
    });
  });

  it("refuse un corps Artist Brain invalide ou qui tente de choisir un autre workspace", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/artist-profile",
      payload: {
        workspaceId: "wsp_other",
        identity: "Tentative hors périmètre",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_ARTIST_PROFILE" } });

    const profile = await app.inject({ method: "GET", url: "/v1/artist-profile" });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({
      data: {
        workspaceId: "wsp_demo_aless",
        identity: "Producteur et DJ électronique entre textures nocturnes et énergie club.",
      },
    });
  });

  it("garde un Artist Brain modifié après un redémarrage local et un nouveau seed", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-artist-brain-"));
    let firstApp: Awaited<ReturnType<typeof createApp>> | undefined;
    let restartedApp: Awaited<ReturnType<typeof createApp>> | undefined;

    try {
      firstApp = await createApp({ dataDir });
      const update = await firstApp.inject({
        method: "PATCH",
        url: "/v1/artist-profile",
        payload: { identity: "Profil local déjà édité." },
      });

      expect(update.statusCode).toBe(200);
      await firstApp.close();
      firstApp = undefined;

      restartedApp = await createApp({ dataDir });
      const profile = await restartedApp.inject({ method: "GET", url: "/v1/artist-profile" });

      expect(profile.statusCode).toBe(200);
      expect(profile.json()).toMatchObject({ data: { identity: "Profil local déjà édité." } });
    } finally {
      await firstApp?.close();
      await restartedApp?.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("crée une proposition de préférence PENDING avec de vrais timestamps persistés", async () => {
    const proposal = await app.inject({
      method: "POST",
      url: "/v1/memories/proposals",
      payload: { content: "Préférence proposée : garder les captions très courtes." },
    });

    expect(proposal.statusCode).toBe(201);
    const body = proposal.json() as {
      data: {
        id: string;
        workspaceId: string;
        category: string;
        content: string;
        state: string;
        createdAt: string;
        updatedAt: string;
        confirmedBy?: string;
        confirmedAt?: string;
      };
    };

    expect(body.data).toMatchObject({
      id: expect.stringMatching(/^mem_[a-f0-9]{32}$/),
      workspaceId: "wsp_demo_aless",
      category: "PREFERENCE_MEMORY",
      content: "Préférence proposée : garder les captions très courtes.",
      state: "PENDING",
    });
    expect(Number.isNaN(Date.parse(body.data.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(body.data.updatedAt))).toBe(false);
    expect(body.data).not.toHaveProperty("confirmedBy");
    expect(body.data).not.toHaveProperty("confirmedAt");

    const memories = await app.inject({ method: "GET", url: "/v1/memories" });
    expect(memories.statusCode).toBe(200);
    expect(
      (memories.json() as { data: Array<{ id: string; state: string; createdAt: string; updatedAt: string }> }).data,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: body.data.id,
          state: "PENDING",
          createdAt: body.data.createdAt,
          updatedAt: body.data.updatedAt,
        }),
      ]),
    );
  });

  it("confirme ou refuse explicitement une proposition, puis bloque toute seconde décision", async () => {
    const confirmedProposal = await app.inject({
      method: "POST",
      url: "/v1/memories/proposals",
      payload: { content: "Préférence proposée : privilégier les hooks directs." },
    });
    const confirmedId = (confirmedProposal.json() as { data: { id: string } }).data.id;

    const confirmation = await app.inject({ method: "POST", url: `/v1/memories/${confirmedId}/confirm` });
    expect(confirmation.statusCode).toBe(200);
    expect(confirmation.json()).toMatchObject({
      data: {
        id: confirmedId,
        state: "CONFIRMED",
        confirmedBy: "usr_demo_aless",
        confirmedAt: expect.any(String),
      },
    });

    const secondDecision = await app.inject({ method: "POST", url: `/v1/memories/${confirmedId}/reject` });
    expect(secondDecision.statusCode).toBe(409);
    expect(secondDecision.json()).toMatchObject({ error: { code: "MEMORY_DECISION_FINAL" } });

    const rejectedProposal = await app.inject({
      method: "POST",
      url: "/v1/memories/proposals",
      payload: { content: "Préférence proposée : ajouter des hashtags systématiquement." },
    });
    const rejectedId = (rejectedProposal.json() as { data: { id: string } }).data.id;

    const rejection = await app.inject({ method: "POST", url: `/v1/memories/${rejectedId}/reject` });
    expect(rejection.statusCode).toBe(200);
    expect(rejection.json()).toMatchObject({ data: { id: rejectedId, state: "REJECTED" } });
    expect((rejection.json() as { data: Record<string, unknown> }).data).not.toHaveProperty("confirmedBy");
    expect((rejection.json() as { data: Record<string, unknown> }).data).not.toHaveProperty("confirmedAt");

    const secondRejection = await app.inject({ method: "POST", url: `/v1/memories/${rejectedId}/reject` });
    expect(secondRejection.statusCode).toBe(409);
    expect(secondRejection.json()).toMatchObject({ error: { code: "MEMORY_DECISION_FINAL" } });
  });

  it("refuse tout scope, état ou acteur client et masque les mémoires d’un autre workspace", async () => {
    const invalidProposal = await app.inject({
      method: "POST",
      url: "/v1/memories/proposals",
      payload: {
        content: "Tentative de mémoire déjà confirmée.",
        category: "ARTIST_MEMORY",
        state: "CONFIRMED",
        workspaceId: "wsp_other",
        id: "mem_client",
        actorUserId: "usr_other",
      },
    });

    expect(invalidProposal.statusCode).toBe(400);
    expect(invalidProposal.json()).toMatchObject({ error: { code: "INVALID_MEMORY_PROPOSAL" } });

    const decisionWithBody = await app.inject({
      method: "POST",
      url: "/v1/memories/mem_tiktok_question/confirm",
      payload: { state: "REJECTED", workspaceId: "wsp_other", actorUserId: "usr_other" },
    });
    expect(decisionWithBody.statusCode).toBe(400);
    expect(decisionWithBody.json()).toMatchObject({ error: { code: "INVALID_MEMORY_DECISION" } });

    const decisionWithNullBody = await app.inject({
      method: "POST",
      url: "/v1/memories/mem_tiktok_question/confirm",
      headers: { "content-type": "application/json" },
      payload: "null",
    });
    expect(decisionWithNullBody.statusCode).toBe(400);
    expect(decisionWithNullBody.json()).toMatchObject({ error: { code: "INVALID_MEMORY_DECISION" } });

    const stillPending = await app.inject({ method: "GET", url: "/v1/memories" });
    expect(stillPending.json()).toMatchObject({
      data: expect.arrayContaining([expect.objectContaining({ id: "mem_tiktok_question", state: "PENDING" })]),
    });

    const otherWorkspace = await app.inject({
      method: "POST",
      url: "/v1/memories/mem_other_workspace/confirm",
    });
    expect(otherWorkspace.statusCode).toBe(404);
    expect(otherWorkspace.json()).toMatchObject({ error: { code: "MEMORY_NOT_FOUND" } });
  });

  it("liste une Approval Queue stable, limitée aux demandes du workspace et aux métadonnées média sûres", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/approvals/queue?workspaceId=wsp_other" });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: Array<{
        approvalId: string;
        variantId: string;
        postId: string;
        postTitle: string;
        platform: string;
        media: Array<Record<string, unknown>>;
        caption: string;
        hashtags: string[];
        objective: string;
        rationale?: string;
        plannedAt?: string;
        timezone: string;
        payloadHash: string;
        approvalState: string;
        deliveryState: string;
        requestedAt: string;
      }>;
    };

    expect(body.data.map((item) => item.variantId)).toEqual(["variant_lumiere_instagram", "variant_lumiere_tiktok"]);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          approvalId: "approval_lumiere_instagram",
          variantId: "variant_lumiere_instagram",
          postId: "post_lumiere_studio",
          postTitle: "Teaser studio — Lumière Noire",
          platform: "INSTAGRAM",
          approvalState: "REQUESTED",
          deliveryState: "NOT_CONFIGURED",
          payloadHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          plannedAt: "2026-09-01T18:00:00.000Z",
          timezone: "Europe/Paris",
          requestedAt: expect.any(String),
        }),
      ]),
    );
    expect(body.data.some((item) => item.variantId === "variant_other_instagram")).toBe(false);
    expect(body.data.some((item) => item.approvalState !== "REQUESTED")).toBe(false);
    expect(body.data[0]?.media).toEqual([
      expect.objectContaining({
        id: "med_studio_light",
        filename: "studio-lumiere-noire-take-04.mp4",
        type: "VIDEO",
        status: "UNUSED",
      }),
    ]);
    expect(body.data[0]?.media[0]).not.toHaveProperty("storageKey");
    expect(body.data[0]?.media[0]).not.toHaveProperty("path");
    expect(body.data[0]?.media[0]).not.toHaveProperty("url");
  });

  it("refuse un corps de décision imprécis ou qui tente d'injecter un acteur, un état ou un scope", async () => {
    const queue = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    const proposal = (queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> })
      .data[0];

    expect(proposal).toBeDefined();
    const injected = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/approve`,
      payload: {
        approvalId: proposal?.approvalId,
        expectedPayloadHash: proposal?.payloadHash,
        workspaceId: "wsp_other",
        approvedBy: "usr_other",
        approvalState: "APPROVED",
        deliveryState: "SCHEDULED",
        caption: "Tentative d'injection.",
      },
    });
    expect(injected.statusCode).toBe(400);
    expect(injected.json()).toMatchObject({ error: { code: "INVALID_APPROVAL_DECISION" } });

    const nullBody = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/approve`,
      headers: { "content-type": "application/json" },
      payload: "null",
    });
    expect(nullBody.statusCode).toBe(400);
    expect(nullBody.json()).toMatchObject({ error: { code: "INVALID_APPROVAL_DECISION" } });

    const unchanged = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    expect((unchanged.json() as { data: Array<{ variantId: string }> }).data.map((item) => item.variantId)).toContain(
      proposal?.variantId,
    );
  });

  it("applique une décision après les préconditions exactes, sans programmer de publication", async () => {
    const queue = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    const proposal = (queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> })
      .data[0];
    const beforeToday = await app.inject({
      method: "POST",
      url: "/v1/ida/commands",
      payload: { message: "IDA, prépare ma journée." },
    });
    const beforeTodayIds = (
      beforeToday.json() as { data: { result: { items: Array<{ id: string }> } } }
    ).data.result.items.map((item) => item.id);

    const approved = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/approve`,
      payload: { approvalId: proposal?.approvalId, expectedPayloadHash: proposal?.payloadHash },
    });
    expect(approved.statusCode).toBe(200);
    const approvedData = (
      approved.json() as {
        data: {
          approvalId: string;
          variantId: string;
          approvalState: string;
          deliveryState: string;
          payloadHash: string;
          decidedAt: string;
        };
      }
    ).data;
    expect(approvedData).toMatchObject({
      approvalId: proposal?.approvalId,
      variantId: proposal?.variantId,
      approvalState: "APPROVED",
      deliveryState: "NOT_CONFIGURED",
      payloadHash: proposal?.payloadHash,
      decidedAt: expect.any(String),
    });

    const afterQueue = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    expect(
      (afterQueue.json() as { data: Array<{ variantId: string }> }).data.map((item) => item.variantId),
    ).not.toContain(proposal?.variantId);
    const afterToday = await app.inject({
      method: "POST",
      url: "/v1/ida/commands",
      payload: { message: "IDA, prépare ma journée." },
    });
    const afterTodayIds = (
      afterToday.json() as { data: { result: { items: Array<{ id: string }> } } }
    ).data.result.items.map((item) => item.id);
    expect(afterTodayIds).toEqual(beforeTodayIds);
    expect(afterTodayIds).not.toContain(proposal?.variantId);
  });

  it("rend un retry de même décision idempotent et bloque une décision opposée", async () => {
    const queue = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    const proposal = (queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> })
      .data[0];
    const payload = { approvalId: proposal?.approvalId, expectedPayloadHash: proposal?.payloadHash };

    const first = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/approve`,
      payload,
    });
    expect(first.statusCode).toBe(200);
    const firstData = (first.json() as { data: { decidedAt: string; payloadHash: string } }).data;

    const retry = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/approve`,
      payload,
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({
      data: { decidedAt: firstData.decidedAt, payloadHash: firstData.payloadHash },
    });

    const opposite = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/reject`,
      payload,
    });
    expect(opposite.statusCode).toBe(409);
    expect(opposite.json()).toMatchObject({ error: { code: "APPROVAL_DECISION_FINAL" } });
  });

  it("rejette les préconditions obsolètes et masque toute variante d'un autre workspace", async () => {
    const queue = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    const proposal = (queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> })
      .data[0];

    const staleHash = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/approve`,
      payload: { approvalId: proposal?.approvalId, expectedPayloadHash: `sha256:${"0".repeat(64)}` },
    });
    expect(staleHash.statusCode).toBe(409);
    expect(staleHash.json()).toMatchObject({ error: { code: "APPROVAL_STALE_PAYLOAD" } });

    const staleApproval = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/approve`,
      payload: { approvalId: "approval_not_the_current_one", expectedPayloadHash: proposal?.payloadHash },
    });
    expect(staleApproval.statusCode).toBe(409);
    expect(staleApproval.json()).toMatchObject({ error: { code: "APPROVAL_STALE_PAYLOAD" } });

    const otherWorkspace = await app.inject({
      method: "POST",
      url: "/v1/post-variants/variant_other_instagram/approve",
      payload: { approvalId: "approval_other_instagram", expectedPayloadHash: `sha256:${"a".repeat(64)}` },
    });
    expect(otherWorkspace.statusCode).toBe(404);
    expect(otherWorkspace.json()).toMatchObject({ error: { code: "POST_VARIANT_NOT_FOUND" } });

    const unchanged = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    expect((unchanged.json() as { data: Array<{ variantId: string }> }).data.map((item) => item.variantId)).toContain(
      proposal?.variantId,
    );
  });

  it("répare au redémarrage le hash REQUESTED d'un seed local plus ancien", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-approval-hash-upgrade-"));
    const legacyHash = `sha256:${"f".repeat(64)}`;
    let seededDatabase: DemoDatabase | undefined;
    let upgradedApp: Awaited<ReturnType<typeof createApp>> | undefined;

    try {
      seededDatabase = await DemoDatabase.open({ dataDir });
      await seededDatabase.pglite.query(
        `
          UPDATE post_variants
          SET payload_hash = $1
          WHERE id = 'variant_lumiere_instagram'
            AND approval_state = 'REQUESTED';
        `,
        [legacyHash],
      );
      await seededDatabase.pglite.query(
        `
          UPDATE approvals
          SET payload_hash = $1
          WHERE id = 'approval_lumiere_instagram'
            AND state = 'REQUESTED';
        `,
        [legacyHash],
      );
      await seededDatabase.close();
      seededDatabase = undefined;

      upgradedApp = await createApp({ dataDir });
      const queue = await upgradedApp.inject({ method: "GET", url: "/v1/approvals/queue" });
      expect(queue.statusCode).toBe(200);
      const proposal = (
        queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> }
      ).data.find((item) => item.variantId === "variant_lumiere_instagram");

      expect(proposal?.payloadHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(proposal?.payloadHash).not.toBe(legacyHash);
      const approved = await upgradedApp.inject({
        method: "POST",
        url: "/v1/post-variants/variant_lumiere_instagram/approve",
        payload: { approvalId: proposal?.approvalId, expectedPayloadHash: proposal?.payloadHash },
      });
      expect(approved.statusCode).toBe(200);
      expect(approved.json()).toMatchObject({
        data: { approvalState: "APPROVED", deliveryState: "NOT_CONFIGURED" },
      });
    } finally {
      await seededDatabase?.close();
      await upgradedApp?.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("projette un calendrier borné, strict et sans payload éditorial", async () => {
    const calendar = await app.inject({ method: "GET", url: "/v1/calendar?view=WEEK" });

    expect(calendar.statusCode).toBe(200);
    const body = calendar.json() as {
      data: {
        range: { view: string; from: string; to: string; timezone: string };
        items: Array<Record<string, unknown>>;
      };
    };

    expect(body.data.range).toEqual({
      view: "WEEK",
      from: "2026-08-23T22:00:00.000Z",
      to: "2026-08-30T22:00:00.000Z",
      timezone: "Europe/Paris",
    });
    expect(body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "variant_afterimage_youtube",
          kind: "APPROVED_VARIANT",
          variantId: "variant_afterimage_youtube",
          postId: "post_afterimage_live",
          platform: "YOUTUBE",
          scheduledAt: "2026-08-29T19:00:00.000Z",
          state: "READY_TO_SCHEDULE",
          approvalId: "approval_afterimage_youtube",
          payloadHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      ]),
    );
    expect(body.data.items.some((item) => item.variantId === "variant_other_instagram")).toBe(false);
    expect(Object.keys(body.data.items[0] ?? {}).sort()).toEqual([
      "approvalId",
      "id",
      "kind",
      "payloadHash",
      "platform",
      "postId",
      "postTitle",
      "scheduledAt",
      "state",
      "timezone",
      "variantId",
    ]);
    expect(body.data.items[0]).not.toHaveProperty("caption");
    expect(body.data.items[0]).not.toHaveProperty("media");

    const partialRange = await app.inject({ method: "GET", url: "/v1/calendar?from=2026-08-30T00:00:00.000Z" });
    expect(partialRange.statusCode).toBe(400);
    expect(partialRange.json()).toMatchObject({ error: { code: "INVALID_CALENDAR_QUERY" } });

    const injectedScope = await app.inject({ method: "GET", url: "/v1/calendar?workspaceId=wsp_other" });
    expect(injectedScope.statusCode).toBe(400);
    expect(injectedScope.json()).toMatchObject({ error: { code: "INVALID_CALENDAR_QUERY" } });

    const tooWide = await app.inject({
      method: "GET",
      url: "/v1/calendar?from=2026-01-01T00:00:00.000Z&to=2026-04-01T00:00:00.000Z",
    });
    expect(tooWide.statusCode).toBe(400);
    expect(tooWide.json()).toMatchObject({ error: { code: "INVALID_CALENDAR_QUERY" } });
  });

  it("crée une planification interne depuis une approbation exacte, sans effet de livraison", async () => {
    const queue = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    const proposal = (
      queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> }
    ).data.find((item) => item.variantId === "variant_lumiere_instagram");
    const payload = { approvalId: proposal?.approvalId, expectedPayloadHash: proposal?.payloadHash };
    const beforeToday = await app.inject({
      method: "POST",
      url: "/v1/ida/commands",
      payload: { message: "IDA, prépare ma journée." },
    });

    const approved = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/approve`,
      payload,
    });
    expect(approved.statusCode).toBe(200);

    const scheduled = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/internal-schedules`,
      payload,
    });
    expect(scheduled.statusCode).toBe(201);
    expect(scheduled.json()).toMatchObject({
      data: {
        id: expect.stringMatching(/^ips_[a-f0-9]{32}$/),
        variantId: "variant_lumiere_instagram",
        postId: "post_lumiere_studio",
        platform: "INSTAGRAM",
        scheduledAt: "2026-09-01T18:00:00.000Z",
        timezone: "Europe/Paris",
        state: "SCHEDULED",
        approvalId: proposal?.approvalId,
        payloadHash: proposal?.payloadHash,
        deliveryState: "NOT_CONFIGURED",
      },
    });
    expect((scheduled.json() as { data: Record<string, unknown> }).data).not.toHaveProperty("caption");
    expect((scheduled.json() as { data: Record<string, unknown> }).data).not.toHaveProperty("media");

    const calendar = await app.inject({
      method: "GET",
      url: "/v1/calendar?view=DAY&from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z",
    });
    expect(calendar.statusCode).toBe(200);
    expect(calendar.json()).toMatchObject({
      data: {
        items: [
          expect.objectContaining({
            kind: "INTERNAL_SCHEDULE",
            variantId: "variant_lumiere_instagram",
            state: "SCHEDULED_INTERNAL",
            payloadHash: proposal?.payloadHash,
          }),
        ],
      },
    });

    const afterToday = await app.inject({
      method: "POST",
      url: "/v1/ida/commands",
      payload: { message: "IDA, prépare ma journée." },
    });
    expect((afterToday.json() as { data: { result: { items: unknown[] } } }).data.result.items).toEqual(
      (beforeToday.json() as { data: { result: { items: unknown[] } } }).data.result.items,
    );
  });

  it("ne touche ni scheduled_posts, ni médias, ni delivery_state lors d'une planification interne", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-internal-schedule-side-effects-"));
    const isolatedStorageDir = await mkdtemp(join(tmpdir(), "ida-internal-schedule-storage-"));
    let isolatedApp: Awaited<ReturnType<typeof createApp>> | undefined;
    let inspectedDatabase: DemoDatabase | undefined;

    try {
      isolatedApp = await createApp({
        dataDir,
        storageDir: isolatedStorageDir,
        now: () => new Date("2026-08-30T09:00:00.000Z"),
      });
      const queue = await isolatedApp.inject({ method: "GET", url: "/v1/approvals/queue" });
      const proposal = (
        queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> }
      ).data.find((item) => item.variantId === "variant_lumiere_instagram");
      const payload = { approvalId: proposal?.approvalId, expectedPayloadHash: proposal?.payloadHash };
      expect(
        (
          await isolatedApp.inject({
            method: "POST",
            url: `/v1/post-variants/${proposal?.variantId}/approve`,
            payload,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await isolatedApp.inject({
            method: "POST",
            url: `/v1/post-variants/${proposal?.variantId}/internal-schedules`,
            payload,
          })
        ).statusCode,
      ).toBe(201);
      await isolatedApp.close();
      isolatedApp = undefined;

      inspectedDatabase = await DemoDatabase.open({ dataDir, seed: false });
      const scheduledPosts = await inspectedDatabase.pglite.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM scheduled_posts WHERE workspace_id = 'wsp_demo_aless'`,
      );
      const variant = await inspectedDatabase.pglite.query<{ deliveryState: string }>(
        `
          SELECT delivery_state AS "deliveryState"
          FROM post_variants
          WHERE id = 'variant_lumiere_instagram'
        `,
      );
      const media = await inspectedDatabase.pglite.query<{ status: string; usageCount: number }>(
        `
          SELECT status, usage_count AS "usageCount"
          FROM media_assets
          WHERE id = 'med_studio_light'
        `,
      );
      const schedules = await inspectedDatabase.pglite.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM internal_post_schedules WHERE state = 'SCHEDULED'`,
      );

      expect(scheduledPosts.rows[0]?.count).toBe(1);
      expect(variant.rows[0]).toMatchObject({ deliveryState: "NOT_CONFIGURED" });
      expect(media.rows[0]).toMatchObject({ status: "UNUSED", usageCount: 0 });
      expect(schedules.rows[0]?.count).toBe(1);
    } finally {
      await inspectedDatabase?.close();
      await isolatedApp?.close();
      await rm(dataDir, { recursive: true, force: true });
      await rm(isolatedStorageDir, { recursive: true, force: true });
    }
  });

  it("refuse l'injection, les préconditions obsolètes et une date approuvée indisponible", async () => {
    const queue = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    const proposal = (
      queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> }
    ).data.find((item) => item.variantId === "variant_lumiere_instagram");
    const payload = { approvalId: proposal?.approvalId, expectedPayloadHash: proposal?.payloadHash };

    const unapproved = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/internal-schedules`,
      payload,
    });
    expect(unapproved.statusCode).toBe(409);
    expect(unapproved.json()).toMatchObject({ error: { code: "SCHEDULE_STALE_APPROVAL" } });

    const approved = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/approve`,
      payload,
    });
    expect(approved.statusCode).toBe(200);

    const injected = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/internal-schedules`,
      payload: { ...payload, scheduledAt: "2026-12-01T18:00:00.000Z", timezone: "UTC", actorUserId: "usr_other" },
    });
    expect(injected.statusCode).toBe(400);
    expect(injected.json()).toMatchObject({ error: { code: "INVALID_INTERNAL_SCHEDULE" } });

    const staleHash = await app.inject({
      method: "POST",
      url: `/v1/post-variants/${proposal?.variantId}/internal-schedules`,
      payload: { approvalId: proposal?.approvalId, expectedPayloadHash: `sha256:${"0".repeat(64)}` },
    });
    expect(staleHash.statusCode).toBe(409);
    expect(staleHash.json()).toMatchObject({ error: { code: "SCHEDULE_STALE_APPROVAL" } });

    const calendar = await app.inject({ method: "GET", url: "/v1/calendar?view=WEEK" });
    const past = (
      calendar.json() as {
        data: { items: Array<{ variantId: string; approvalId: string; payloadHash: string }> };
      }
    ).data.items.find((item) => item.variantId === "variant_afterimage_youtube");
    const unavailable = await app.inject({
      method: "POST",
      url: "/v1/post-variants/variant_afterimage_youtube/internal-schedules",
      payload: { approvalId: past?.approvalId, expectedPayloadHash: past?.payloadHash },
    });
    expect(unavailable.statusCode).toBe(409);
    expect(unavailable.json()).toMatchObject({ error: { code: "SCHEDULE_TIME_UNAVAILABLE" } });

    const otherWorkspace = await app.inject({
      method: "POST",
      url: "/v1/post-variants/variant_other_instagram/internal-schedules",
      payload: { approvalId: "approval_other_instagram", expectedPayloadHash: `sha256:${"a".repeat(64)}` },
    });
    expect(otherWorkspace.statusCode).toBe(404);
    expect(otherWorkspace.json()).toMatchObject({ error: { code: "POST_VARIANT_NOT_FOUND" } });
  });

  it("rend un retry de planification exact idempotent, même après l'horaire", async () => {
    let currentNow = new Date("2026-08-30T09:00:00.000Z");
    const retryApp = await createApp({
      dataDir: "memory://",
      storageDir,
      now: () => currentNow,
    });

    try {
      const queue = await retryApp.inject({ method: "GET", url: "/v1/approvals/queue" });
      const proposal = (
        queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> }
      ).data.find((item) => item.variantId === "variant_lumiere_instagram");
      const payload = { approvalId: proposal?.approvalId, expectedPayloadHash: proposal?.payloadHash };
      await retryApp.inject({ method: "POST", url: `/v1/post-variants/${proposal?.variantId}/approve`, payload });

      const first = await retryApp.inject({
        method: "POST",
        url: `/v1/post-variants/${proposal?.variantId}/internal-schedules`,
        payload,
      });
      expect(first.statusCode).toBe(201);
      const firstId = (first.json() as { data: { id: string } }).data.id;

      currentNow = new Date("2026-09-02T09:00:00.000Z");
      const retry = await retryApp.inject({
        method: "POST",
        url: `/v1/post-variants/${proposal?.variantId}/internal-schedules`,
        payload,
      });
      expect(retry.statusCode).toBe(200);
      expect(retry.json()).toMatchObject({ data: { id: firstId, state: "SCHEDULED" } });
    } finally {
      await retryApp.close();
    }
  });

  it("conserve un unique snapshot actif lors de deux demandes concurrentes exactes", async () => {
    const queue = await app.inject({ method: "GET", url: "/v1/approvals/queue" });
    const proposal = (
      queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> }
    ).data.find((item) => item.variantId === "variant_lumiere_instagram");
    const payload = { approvalId: proposal?.approvalId, expectedPayloadHash: proposal?.payloadHash };
    expect(
      (await app.inject({ method: "POST", url: `/v1/post-variants/${proposal?.variantId}/approve`, payload }))
        .statusCode,
    ).toBe(200);

    const results = await Promise.all([
      app.inject({
        method: "POST",
        url: `/v1/post-variants/${proposal?.variantId}/internal-schedules`,
        payload,
      }),
      app.inject({
        method: "POST",
        url: `/v1/post-variants/${proposal?.variantId}/internal-schedules`,
        payload,
      }),
    ]);

    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 201]);
    expect(new Set(results.map((result) => (result.json() as { data: { id: string } }).data.id)).size).toBe(1);
  });

  it("bloque un même créneau plateforme tout en conservant le scope de la variante", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "ida-internal-schedule-conflict-"));
    const isolatedStorageDir = await mkdtemp(join(tmpdir(), "ida-internal-schedule-storage-"));
    let setupDatabase: DemoDatabase | undefined;
    let conflictApp: Awaited<ReturnType<typeof createApp>> | undefined;

    try {
      setupDatabase = await DemoDatabase.open({ dataDir });
      // La seconde variante reste REQUESTED afin que la migration de hash au
      // redémarrage recalcule le snapshot canonique avec le même créneau et la
      // même plateforme. Aucun endpoint de production ne rend ces champs
      // éditables dans cette tranche.
      await setupDatabase.pglite.query(
        `
          UPDATE post_variants
          SET
            platform_id = 'platform_instagram',
            planned_at = '2026-09-01T18:00:00.000Z',
            payload_hash = $1
          WHERE id = 'variant_lumiere_tiktok'
            AND workspace_id = 'wsp_demo_aless'
            AND approval_state = 'REQUESTED'
        `,
        [`sha256:${"f".repeat(64)}`],
      );
      await setupDatabase.pglite.query(
        `
          UPDATE approvals
          SET payload_hash = $1
          WHERE id = 'approval_lumiere_tiktok'
            AND workspace_id = 'wsp_demo_aless'
            AND state = 'REQUESTED'
        `,
        [`sha256:${"f".repeat(64)}`],
      );
      await setupDatabase.close();
      setupDatabase = undefined;

      conflictApp = await createApp({
        dataDir,
        storageDir: isolatedStorageDir,
        now: () => new Date("2026-08-30T09:00:00.000Z"),
      });
      const queue = await conflictApp.inject({ method: "GET", url: "/v1/approvals/queue" });
      const proposals = (
        queue.json() as { data: Array<{ approvalId: string; variantId: string; payloadHash: string }> }
      ).data;
      const instagram = proposals.find((item) => item.variantId === "variant_lumiere_instagram");
      const tiktokAtInstagramSlot = proposals.find((item) => item.variantId === "variant_lumiere_tiktok");

      for (const proposal of [instagram, tiktokAtInstagramSlot]) {
        const approved = await conflictApp.inject({
          method: "POST",
          url: `/v1/post-variants/${proposal?.variantId}/approve`,
          payload: { approvalId: proposal?.approvalId, expectedPayloadHash: proposal?.payloadHash },
        });
        expect(approved.statusCode).toBe(200);
      }

      const first = await conflictApp.inject({
        method: "POST",
        url: `/v1/post-variants/${instagram?.variantId}/internal-schedules`,
        payload: { approvalId: instagram?.approvalId, expectedPayloadHash: instagram?.payloadHash },
      });
      expect(first.statusCode).toBe(201);

      const conflict = await conflictApp.inject({
        method: "POST",
        url: `/v1/post-variants/${tiktokAtInstagramSlot?.variantId}/internal-schedules`,
        payload: {
          approvalId: tiktokAtInstagramSlot?.approvalId,
          expectedPayloadHash: tiktokAtInstagramSlot?.payloadHash,
        },
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: { code: "SCHEDULE_CONFLICT" } });
    } finally {
      await setupDatabase?.close();
      await conflictApp?.close();
      await rm(dataDir, { recursive: true, force: true });
      await rm(isolatedStorageDir, { recursive: true, force: true });
    }
  });

  it("crée une tâche TODO strictement scoped, y compris sans échéance", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      payload: {
        title: "Préparer la sélection de la semaine",
        description: "Choisir trois extraits studio encore inédits.",
        dueAt: "2026-09-01T16:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      data: {
        id: string;
        workspaceId: string;
        title: string;
        description?: string;
        status: string;
        dueAt?: string;
        createdAt: string;
        updatedAt: string;
      };
    };

    expect(body.data).toMatchObject({
      id: expect.stringMatching(/^task_[a-f0-9]{32}$/),
      workspaceId: "wsp_demo_aless",
      title: "Préparer la sélection de la semaine",
      description: "Choisir trois extraits studio encore inédits.",
      status: "TODO",
      dueAt: "2026-09-01T16:00:00.000Z",
    });
    expect(Number.isNaN(Date.parse(body.data.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(body.data.updatedAt))).toBe(false);

    const withoutDueAt = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      payload: { title: "Noter une idée de teaser" },
    });
    expect(withoutDueAt.statusCode).toBe(201);
    const taskWithoutDueAt = (withoutDueAt.json() as { data: { id: string } }).data.id;
    expect((withoutDueAt.json() as { data: Record<string, unknown> }).data).not.toHaveProperty("dueAt");

    const tasks = await app.inject({ method: "GET", url: "/v1/tasks" });
    expect(tasks.statusCode).toBe(200);
    expect((tasks.json() as { data: Array<{ id: string; status: string }> }).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: body.data.id, status: "TODO" }),
        expect.objectContaining({ id: taskWithoutDueAt, status: "TODO" }),
      ]),
    );

    const today = await app.inject({
      method: "POST",
      url: "/v1/ida/commands",
      payload: { message: "IDA, prépare ma journée." },
    });
    expect(today.statusCode).toBe(200);
    expect(
      (today.json() as { data: { result: { items: Array<{ id: string }> } } }).data.result.items.map((item) => item.id),
    ).not.toContain(taskWithoutDueAt);
  });

  it("complète une tâche de façon idempotente sans réécrire ses timestamps", async () => {
    const completion = await app.inject({
      method: "POST",
      url: "/v1/tasks/task_caption_review/complete",
    });

    expect(completion.statusCode).toBe(200);
    const completed = (
      completion.json() as {
        data: { id: string; status: string; completedBy?: string; completedAt?: string; updatedAt: string };
      }
    ).data;
    expect(completed).toMatchObject({
      id: "task_caption_review",
      status: "DONE",
      completedBy: "usr_demo_aless",
      completedAt: expect.any(String),
    });

    const retry = await app.inject({ method: "POST", url: "/v1/tasks/task_caption_review/complete" });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({
      data: {
        id: "task_caption_review",
        status: "DONE",
        completedAt: completed.completedAt,
        updatedAt: completed.updatedAt,
      },
    });

    const inProgress = await app.inject({ method: "POST", url: "/v1/tasks/task_campaign_review/complete" });
    expect(inProgress.statusCode).toBe(200);
    expect(inProgress.json()).toMatchObject({ data: { id: "task_campaign_review", status: "DONE" } });
  });

  it("refuse les champs client, les états non actionnables et les tâches hors workspace", async () => {
    const invalidTask = await app.inject({
      method: "POST",
      url: "/v1/tasks",
      payload: {
        id: "task_client",
        workspaceId: "wsp_other",
        actorUserId: "usr_other",
        status: "DONE",
        title: "Tentative hors périmètre",
      },
    });
    expect(invalidTask.statusCode).toBe(400);
    expect(invalidTask.json()).toMatchObject({ error: { code: "INVALID_TASK" } });

    const invalidComplete = await app.inject({
      method: "POST",
      url: "/v1/tasks/task_caption_review/complete",
      payload: { status: "DONE", workspaceId: "wsp_other", actorUserId: "usr_other" },
    });
    expect(invalidComplete.statusCode).toBe(400);
    expect(invalidComplete.json()).toMatchObject({ error: { code: "INVALID_TASK_COMPLETION" } });

    const cancelled = await app.inject({ method: "POST", url: "/v1/tasks/task_cancelled/complete" });
    expect(cancelled.statusCode).toBe(409);
    expect(cancelled.json()).toMatchObject({ error: { code: "TASK_NOT_ACTIONABLE" } });

    const otherWorkspace = await app.inject({
      method: "POST",
      url: "/v1/tasks/task_other_workspace/complete",
    });
    expect(otherWorkspace.statusCode).toBe(404);
    expect(otherWorkspace.json()).toMatchObject({ error: { code: "TASK_NOT_FOUND" } });

    const listing = await app.inject({ method: "GET", url: "/v1/tasks?workspaceId=wsp_other" });
    expect(listing.statusCode).toBe(200);
    expect(
      (listing.json() as { data: Array<{ id: string; workspaceId: string }> }).data.every(
        (task) => task.workspaceId === "wsp_demo_aless" && task.id !== "task_other_workspace",
      ),
    ).toBe(true);
  });

  it("traite une commande de contenus inutilisés uniquement avec un outil READ", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/ida/commands",
      payload: { message: "IDA, montre-moi mes contenus inutilisés." },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json() as {
      data: {
        kind: string;
        command: { intent: string; requestedPermission: string; workspaceId: string; state: string };
        tools: Array<{ key: string; moduleKey: string; permission: string }>;
        result: { items: Array<{ id: string }> };
      };
    };

    expect(body.data.kind).toBe("UNUSED_CONTENT");
    expect(body.data.command).toMatchObject({
      intent: "LIST_UNUSED_CONTENT",
      requestedPermission: "READ",
      workspaceId: "wsp_demo_aless",
      state: "COMPLETED",
    });
    expect(body.data.tools).toEqual([{ key: "search_unused_media", moduleKey: "CONTENT", permission: "READ" }]);
    expect(body.data.result.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(["med_studio_light", "med_night-drive"]),
    );
  });

  it("refuse les filtres médias invalides ou dupliqués", async () => {
    const invalidUrls = [
      "/v1/media?status=NOT_A_STATUS",
      "/v1/media?limit=0",
      "/v1/media?limit=51",
      "/v1/media?status=UNUSED&status=USED",
    ];

    for (const url of invalidUrls) {
      const response = await app.inject({ method: "GET", url });

      expect(response.statusCode, url).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "INVALID_MEDIA_QUERY" } });
    }
  });
});
