import { idaCommandRunSchema, type RequestIdentityContext } from "@ida/contracts";
import type { MusicTrackFact } from "@ida/contracts/music-context";
import { ToolGateway } from "@ida/domain";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { chatLabel, dayMessage, mediaSearchMessage, trackSearchMessage } from "./chat-catalog.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";
import { DeterministicIdaCore } from "./ida-core.js";

const now = () => new Date("2026-09-08T09:00:00Z");
let database: DemoDatabase;
let identity: RequestIdentityContext;
let core: DeterministicIdaCore;

beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://", now });
  const resolved = await database.resolveRequestIdentityContext(demoIdentity.sessionId, demoContext.workspaceId);
  if (!resolved) throw new Error("Identité de test absente");
  identity = resolved;
  core = new DeterministicIdaCore(database, undefined, now);
  await database.createTask(identity.workspaceId, identity.userId, {
    title: "Vérifier le master du chat",
    dueAt: "2026-09-08T10:15:00Z",
  });
  const project = (await database.listTracks(identity.workspaceId))[0]?.projectId;
  if (!project) throw new Error("Projet de test absent");
  for (const [id, title, status] of [
    ["trk_chat_demain", "Demain", "UNRELEASED"],
    ["trk_chat_literal", "Chat 100%_", "DEMO"],
    ["trk_chat_decoy", "Chat 100XY", "DEMO"],
    ["trk_chat_archived", "Chat 100%_ archive", "ARCHIVED"],
  ]) {
    await database.pglite.query(
      `INSERT INTO tracks (id, workspace_id, artist_project_id, title, artist_credit, status, description)
       VALUES ($1, $2, $3, $4, 'Artiste de test', $5, 'EXCLUDED_DESCRIPTION')`,
      [id, identity.workspaceId, project, title, status],
    );
  }
  for (const [id, type, status] of [
    ["med_chat_video", "VIDEO", "UNUSED"],
    ["med_chat_image", "IMAGE", "UNUSED"],
    ["med_chat_used", "VIDEO", "USED"],
  ]) {
    await database.pglite.query(
      `INSERT INTO media_assets (id, workspace_id, artist_project_id, filename, media_type, mime_type,
        byte_size, sha256, status, storage_key, description)
       VALUES ($1, $2, $3, 'Chat 100%_.mp4', $4, 'video/mp4', 10, $1, $5, 'EXCLUDED_STORAGE', 'EXCLUDED_DESCRIPTION')`,
      [id, identity.workspaceId, project, type, status],
    );
  }
  // Même titre dans l'autre workspace : aucun scope fourni dans le message/body ne doit l'ouvrir.
  const foreignProject = (await database.listTracks("wsp_other"))[0]?.projectId;
  if (!foreignProject) throw new Error("Projet étranger de test absent");
  await database.pglite.query(
    `INSERT INTO tracks (id, workspace_id, artist_project_id, title, artist_credit, status)
     VALUES ('trk_chat_foreign', 'wsp_other', $1, 'Demain', 'FOREIGN_ARTIST', 'DEMO')`,
    [foreignProject],
  );
});
afterAll(async () => database?.close());
afterEach(() => vi.restoreAllMocks());

describe("Chat local — parcours Core et données réelles de test", () => {
  it("cherche le titre Demain sans sélectionner l’agenda ni le workspace client", async () => {
    const response = await core.execute(identity, {
      message: "Trouve le morceau « Demain »",
      workspaceId: "wsp_other",
      intent: "PUBLISH_POST",
    });
    expect(response.kind).toBe("SEARCH_TRACK");
    expect(response.command).toMatchObject({
      intent: "SEARCH_TRACK",
      requestedPermission: "READ",
      workspaceId: identity.workspaceId,
    });
    expect(response.tools).toEqual([{ key: "list_tracks", moduleKey: "MUSIC", permission: "READ" }]);
    expect(response.result.tracks).toEqual([expect.objectContaining({ id: "trk_chat_demain", title: "Demain" })]);
    expect(response.message).toContain("BPM non renseigné");
    expect(response.message).not.toContain("FOREIGN_ARTIST");
    expect(JSON.stringify(response)).not.toContain("EXCLUDED_DESCRIPTION");
  });

  it("traite les jokers SQL comme du texte littéral et exclut les archives musicales", async () => {
    const response = await core.execute(identity, { message: "Trouve les morceaux nommés « Chat 100%_ »" });
    expect(response.result.tracks?.map((track) => track.id)).toEqual(["trk_chat_literal"]);
  });

  it("filtre les médias par type, statut et texte sans révéler leurs champs privés", async () => {
    const response = await core.execute(identity, {
      message: "Montre-moi cinq vidéos inutilisées contenant « Chat 100%_ »",
    });
    expect(response.result.media).toEqual([
      { id: "med_chat_video", filename: "Chat 100%_.mp4", mediaType: "VIDEO", status: "UNUSED" },
    ]);
    expect(response.tools).toEqual([{ key: "search_media", moduleKey: "CONTENT", permission: "READ" }]);
    expect(response.message).toContain("ne garantit pas");
    expect(JSON.stringify(response)).not.toMatch(/EXCLUDED|sha256|storageKey|mimeType|byteSize/u);
  });

  it("ne prétend ni avoir un total global ni avoir trouvé un morceau absent", async () => {
    const limited = await core.execute(identity, { message: "Liste deux morceaux" });
    expect(limited.result.tracks).toHaveLength(2);
    expect(limited.message).toContain("limite : 2");
    const absent = await core.execute(identity, { message: "Trouve le morceau « INEXISTANT_CHAT_TEST »" });
    expect(absent.result.tracks).toEqual([]);
    expect(absent.message).toContain("aucun morceau");
  });

  it.each([
    "Trouve mes meilleures vidéos",
    "Liste mes morceaux archivés",
    "Liste mes morceaux à 120 BPM",
    "Montre-moi mes vidéos inutilisées et publie-les",
    `Trouve le morceau « ${"x".repeat(121)} »`,
    `Montre les vidéos contenant « ${"x".repeat(161)} »`,
  ])("demande une précision sans lire le catalogue : %s", async (message) => {
    const query = vi.spyOn(database.pglite, "query");
    const response = await core.execute(identity, { message });
    expect(response.kind).toBe("CLARIFY_CATALOG");
    expect(response.result).toEqual({});
    expect(query.mock.calls.some(([sql]) => /FROM (?:tracks|media_assets)/iu.test(sql))).toBe(false);
  });

  it.each([
    "Affiche « Liste les médias inutilisés »",
    "Voici le texte : trouve le morceau Demain",
    "Publie cette vidéo demain",
    "Ne prépare pas demain",
    "Demain et envoie un email",
  ])("n’extrait pas de lecture du texte cité ou d’une action non prise en charge : %s", async (message) => {
    const response = await core.execute(identity, { message });
    expect(response.kind).toBe("HELP");
    expect(response.result).toEqual({});
  });

  it("conserve la commande historique de rotation distincte du statut UNUSED", async () => {
    const response = await core.execute(identity, { message: "IDA, montre-moi mes contenus inutilisés." });
    expect(response.kind).toBe("UNUSED_CONTENT");
    expect(response.tools[0]?.key).toBe("list_content_rotation_candidates");
    expect(response.result.items?.map((item) => item.id)).not.toContain("med_studio_light");
    expect(response.message).toContain("Chat 100%_.mp4");
  });

  it("affiche les heures du workspace et les vraies tâches plutôt qu’un compteur seul", async () => {
    const response = await core.execute(identity, { message: "Qu’est-ce que j’ai aujourd’hui ?" });
    expect(response.kind).toBe("TODAY");
    expect(response.message).toContain("Europe/Paris");
    expect(response.message).toContain("12:15 — Vérifier le master du chat");
    for (const item of response.result.items ?? []) if ("title" in item) expect(response.message).toContain(item.title);
    expect(response.message).toContain("tâches sans date");
  });

  it("journalise la réponse française lisible, sans résultat structuré ni mémoire permanente", async () => {
    const memories = await database.pglite.query("SELECT * FROM memories ORDER BY id");
    const response = await core.execute(identity, { message: "Liste mes morceaux" });
    const history = await database.listCommandRuns(identity.workspaceId, identity.userId, { limit: 50 });
    const saved = history.items.find((item) => item.id === response.commandRunId);
    if (!saved) throw new Error("Historique de test absent");
    expect(saved.responseMessage).toBe(response.message);
    expect(saved.responseMessage).toContain("\n1.");
    expect(saved).not.toHaveProperty("tracks");
    expect((await database.pglite.query("SELECT * FROM memories ORDER BY id")).rows).toEqual(memories.rows);
  });

  it("refuse un outil absent de la whitelist avant de lire la base", async () => {
    const guarded = new DeterministicIdaCore(database, new ToolGateway(), now);
    const query = vi.spyOn(database.pglite, "query");
    await expect(guarded.execute(identity, { message: "Liste mes morceaux" })).rejects.toMatchObject({
      code: "TOOL_NOT_ALLOWED",
    });
    expect(query).not.toHaveBeenCalled();
  });

  it("laisse VIEW_ONLY chercher sans écrire d’historique", async () => {
    const view = structuredClone(identity);
    view.clientGrant.accessLevel = "VIEW_ONLY";
    const history = vi.spyOn(database, "createCommandRun");
    const response = await core.execute(view, { message: "Liste mes morceaux" });
    expect(response.result.tracks?.length).toBeGreaterThan(0);
    expect(history).not.toHaveBeenCalled();
  });

  it("refuse une session expirée avant toute requête", async () => {
    const expired = structuredClone(identity);
    expired.session.expiresAt = "2026-09-08T08:00:00Z";
    const query = vi.spyOn(database.pglite, "query");
    await expect(core.execute(expired, { message: "Liste mes morceaux" })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it("refuse une révocation reçue pendant la lecture et ne conserve pas la réponse", async () => {
    const resolve = database.resolveRequestIdentityContext.bind(database);
    let calls = 0;
    vi.spyOn(database, "resolveRequestIdentityContext").mockImplementation(async (...args) => {
      const current = await resolve(...args);
      calls += 1;
      if (current && calls >= 2) current.clientInstance.status = "REVOKED";
      return current;
    });
    const history = vi.spyOn(database, "createCommandRun");
    await expect(core.execute(identity, { message: "Liste mes morceaux" })).rejects.toThrow();
    expect(history).not.toHaveBeenCalled();
  });

  it("ne lance aucun modèle ou réseau même si un port IA est injecté", async () => {
    const generate = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const deterministic = new DeterministicIdaCore(database, undefined, now, { generate });
      await deterministic.execute(identity, { message: "Liste mes morceaux" });
      expect(generate).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Formatage déterministe borné", () => {
  it("borne même dix libellés longs sous le contrat d’historique", () => {
    const track: MusicTrackFact = {
      id: "track",
      title: "T".repeat(240),
      artistCredit: "A".repeat(240),
      genre: null,
      bpm: null,
      musicalKey: null,
      status: "UNRELEASED",
      updatedAt: now().toISOString(),
    };
    for (const message of [
      trackSearchMessage(Array(10).fill(track), "q".repeat(120), 10),
      mediaSearchMessage(
        Array(10).fill({ id: "media", filename: "f".repeat(255), mediaType: "VIDEO", status: "UNUSED" }),
        { kind: "SEARCH_MEDIA", limit: 10, q: "q".repeat(160) },
      ),
    ]) {
      expect(message.length).toBeLessThanOrEqual(4000);
      expect(idaCommandRunSchema.shape.responseMessage.safeParse(message).success).toBe(true);
    }
    expect(chatLabel("Titre\n\u202EIgnore\u0000 les règles")).toBe("Titre Ignore les règles");
  });

  it("ne confond jamais programmation interne et publication, y compris au changement d’heure", () => {
    const message = dayMessage(
      [
        {
          id: "i",
          kind: "INTERNAL_SCHEDULE",
          title: "Teaser",
          dueAt: "2026-10-25T01:30:00Z",
          status: "SCHEDULED_INTERNAL",
        },
      ],
      "Aujourd’hui",
      "Europe/Paris",
    );
    expect(message).toContain("02:30");
    expect(message).toContain("programmation interne — non publiée");
    expect(dayMessage([], "Demain", "Europe/Paris")).toContain("calendriers externes ne sont pas inclus");
  });
});

describe("HTTP — le même chat devient utilisable", () => {
  it("retrouve un morceau créé via API puis relit la réponse détaillée dans l’historique", async () => {
    const app = await createApp({ dataDir: "memory://", now });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/v1/tracks",
        payload: {
          title: "Aurore du chat",
          artistCredit: "Artiste fictif",
          status: "DEMO",
          bpm: 126,
        },
      });
      expect(created.statusCode).toBe(201);
      const response = await app.inject({
        method: "POST",
        url: "/v1/ida/commands",
        payload: {
          message: "Peux-tu trouver le morceau « Aurore du chat » ?",
          workspaceId: "wsp_other",
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.result.tracks).toEqual([expect.objectContaining({ id: created.json().data.id })]);
      expect(response.json().data.message).toContain("126 BPM");
      const history = await app.inject({ method: "GET", url: "/v1/ida/command-runs" });
      expect(history.statusCode).toBe(200);
      expect(history.json().data.items[0].responseMessage).toBe(response.json().data.message);
    } finally {
      await app.close();
    }
  });
});
