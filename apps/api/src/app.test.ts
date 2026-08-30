import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app.js";

describe("IDA API — première tranche Phase 1", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    app = await createApp({
      dataDir: "memory://",
      now: () => new Date("2026-08-30T09:00:00.000Z"),
    });
  });

  afterEach(async () => {
    await app.close();
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
