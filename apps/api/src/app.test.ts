import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";

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
      "/v1/tracks",
      "/v1/media",
      "/v1/memories",
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

  it("refuse un statut média inconnu", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/media?status=NOT_A_STATUS" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_COMMAND" } });
  });
});
