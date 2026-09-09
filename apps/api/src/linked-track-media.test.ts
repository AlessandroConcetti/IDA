import { mediaAssetSchema } from "@ida/contracts";
import { ToolGateway, ToolPolicyError } from "@ida/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";

const now = () => new Date("2026-09-09T10:00:00.000Z");
const trackId = "trk_lumiere_noire";
const linkedUrl = `/v1/media?trackId=${trackId}&limit=50`;
const previewUrl = "/v1/media/med_studio_light/preview";
const statuses = ["UNUSED", "USED", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
let database: DemoDatabase;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://", now });
  const opening = vi.spyOn(DemoDatabase, "open").mockResolvedValueOnce(database);
  try {
    app = await createApp({ dataDir: "memory://", now });
  } finally {
    opening.mockRestore();
  }
  for (const status of statuses) {
    await database.pglite.query(
      `INSERT INTO media_assets
        (id, workspace_id, artist_project_id, release_id, track_id, filename, media_type, mime_type,
         byte_size, sha256, status, created_at)
       VALUES ($1, $2, 'prj_demo_aless', 'rel_lumiere_noire', $3, $4, 'VIDEO', 'video/mp4',
         1, $5, $6, '2090-01-01T00:00:00Z')`,
      [
        `med_linked_status_${status.toLowerCase()}`,
        demoContext.workspaceId,
        trackId,
        `linked-${status.toLowerCase()}.mp4`,
        `synthetic-linked-status-${status.toLowerCase()}`,
        status,
      ],
    );
  }
  // Une collection distincte exerce la borne sans masquer les liens de la première fixture.
  await database.pglite.query(
    `INSERT INTO media_assets
      (id, workspace_id, artist_project_id, release_id, track_id, filename, media_type, mime_type,
       byte_size, sha256, status, created_at)
     SELECT 'med_linked_page_' || n, $1, 'prj_demo_aless', 'rel_afterimage', 'trk_afterimage',
       'synthetic-linked-page.mp4', 'VIDEO', 'video/mp4', 1, 'synthetic-linked-page-hash-' || n,
       'UNUSED', '2090-01-01T00:00:00Z'::timestamptz
     FROM generate_series(1, 51) n`,
    [demoContext.workspaceId],
  );
});

beforeEach(async () => {
  await database.pglite.query(
    "UPDATE identity_sessions SET status = 'ACTIVE', revoked_at = NULL, expires_at = $2 WHERE id = $1",
    [demoIdentity.sessionId, demoIdentity.expiresAt],
  );
  await database.pglite.query("UPDATE client_instances SET status = 'ACTIVE', revoked_at = NULL WHERE id = $1", [
    demoIdentity.clientInstanceId,
  ]);
  await database.pglite.query(
    "UPDATE client_workspace_grants SET status = 'ACTIVE', revoked_at = NULL, access_level = 'TRUSTED' WHERE client_instance_id = $1 AND workspace_id = $2",
    [demoIdentity.clientInstanceId, demoContext.workspaceId],
  );
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => app?.close());

async function revokeDevice() {
  await database.pglite.query("UPDATE client_instances SET status = 'REVOKED', revoked_at = $2 WHERE id = $1", [
    demoIdentity.clientInstanceId,
    now().toISOString(),
  ]);
}

describe("Médias directement liés — sélection bornée et lecture contrôlée", () => {
  it("ne retourne que les liens directs du morceau, pas la release, un autre morceau ou un autre workspace", async () => {
    const response = await app.inject({ method: "GET", url: linkedUrl });
    expect(response.statusCode).toBe(200);
    const assets = mediaAssetSchema.array().parse(response.json().data);
    expect(assets).toHaveLength(7);
    expect(assets.every((asset) => asset.trackId === trackId && asset.workspaceId === demoContext.workspaceId)).toBe(
      true,
    );
    expect(assets.map((asset) => asset.id)).toEqual(expect.arrayContaining(["med_studio_light", "med_night-drive"]));
    for (const excluded of ["med_artwork", "med_live", "med_other_workspace"]) {
      expect(assets.map((asset) => asset.id)).not.toContain(excluded);
    }
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("ignore les identités et workspaces injectés par le client", async () => {
    const legitimate = await app.inject({ method: "GET", url: linkedUrl });
    const injected = await app.inject({
      method: "GET",
      url: `${linkedUrl}&workspaceId=wsp_other&userId=usr_other`,
      headers: { "x-workspace-id": "wsp_other", "x-user-id": "usr_other" },
    });
    expect(injected.statusCode).toBe(200);
    expect(injected.json()).toEqual(legitimate.json());
  });

  it("ne révèle pas l’existence d’un morceau étranger et ne remplace pas un filtre vide par la bibliothèque", async () => {
    for (const id of ["trk_other_workspace", "trk_missing"]) {
      const response = await app.inject({ method: "GET", url: `/v1/media?trackId=${id}&limit=50` });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: [] });
    }
  });

  it("conserve tous les statuts, y compris les archives, sans simuler la disponibilité éditoriale", async () => {
    const response = await app.inject({ method: "GET", url: linkedUrl });
    const assets = mediaAssetSchema.array().parse(response.json().data);
    expect([...new Set(assets.map((asset) => asset.status))].sort()).toEqual([...statuses].sort());
    // Ce média UNUSED appartient déjà à une proposition : un lien n’est pas une recommandation de rotation.
    expect(assets.find((asset) => asset.id === "med_studio_light")?.status).toBe("UNUSED");
  });

  it("ne modifie ni associations, usage, audit, historique ou mémoire et ne charge aucun aperçu ni IA", async () => {
    const snapshot = () =>
      Promise.all(
        ["tracks", "media_assets", "activity_logs", "command_runs", "memories"].map((table) =>
          database.pglite.query(`SELECT * FROM ${table} ORDER BY id`),
        ),
      );
    const before = await snapshot();
    const preview = vi.spyOn(database, "findPrivateMediaFile");
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Aucun appel externe autorisé"));
    expect((await app.inject({ method: "GET", url: linkedUrl })).statusCode).toBe(200);
    expect(await snapshot()).toEqual(before);
    expect(preview).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuse search_media via le Gateway avant toute lecture de la liste", async () => {
    const gateway = vi.spyOn(ToolGateway.prototype, "assertAuthorized").mockImplementation(() => {
      throw new ToolPolicyError("TOOL_NOT_ALLOWED", "Lecture refusée pour ce test.");
    });
    const list = vi.spyOn(database, "listMedia");
    const response = await app.inject({ method: "GET", url: linkedUrl });
    expect(response.statusCode).toBe(403);
    expect(gateway).toHaveBeenCalledWith({ toolKey: "search_media", moduleKey: "CONTENT", permission: "READ" });
    expect(list).not.toHaveBeenCalled();
    expect(response.json()).not.toHaveProperty("data");
  });

  it("refuse get_media via le Gateway avant tout accès au fichier d’aperçu", async () => {
    const gateway = vi.spyOn(ToolGateway.prototype, "assertAuthorized").mockImplementation(() => {
      throw new ToolPolicyError("TOOL_NOT_ALLOWED", "Lecture refusée pour ce test.");
    });
    const preview = vi.spyOn(database, "findPrivateMediaFile");
    const response = await app.inject({ method: "GET", url: previewUrl });
    expect(response.statusCode).toBe(403);
    expect(gateway).toHaveBeenCalledWith({ toolKey: "get_media", moduleKey: "CONTENT", permission: "READ" });
    expect(preview).not.toHaveBeenCalled();
    expect(response.json()).not.toHaveProperty("data");
  });

  it("ne livre pas la liste si l’appareil a été révoqué pendant sa lecture", async () => {
    const read = database.listMedia.bind(database);
    vi.spyOn(database, "listMedia").mockImplementation(async (...args) => {
      const media = await read(...args);
      await revokeDevice();
      return media;
    });
    const response = await app.inject({ method: "GET", url: linkedUrl });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: { code: "AUTHORIZATION_DENIED", message: "Cette action n’est pas autorisée." },
    });
    expect(response.body).not.toContain("studio-lumiere");
  });

  it("réévalue les droits après la lecture d’aperçu, même lorsque le fichier est absent", async () => {
    vi.spyOn(database, "findPrivateMediaFile").mockImplementation(async () => {
      await revokeDevice();
      return undefined;
    });
    const response = await app.inject({ method: "GET", url: previewUrl });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: { code: "AUTHORIZATION_DENIED", message: "Cette action n’est pas autorisée." },
    });
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("permet la lecture VIEW_ONLY sans accorder un droit d’écriture", async () => {
    await database.pglite.query(
      "UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1",
      [demoIdentity.clientInstanceId],
    );
    expect((await app.inject({ method: "GET", url: linkedUrl })).statusCode).toBe(200);
    const preview = vi.spyOn(database, "findPrivateMediaFile").mockResolvedValue(undefined);
    expect((await app.inject({ method: "GET", url: previewUrl })).statusCode).toBe(404);
    expect(preview).toHaveBeenCalledWith(demoContext.workspaceId, "med_studio_light");
    const write = await app.inject({
      method: "POST",
      url: "/v1/tracks",
      payload: { title: "Interdit", artistCredit: "Test", status: "DEMO", tags: [] },
    });
    expect(write.statusCode).toBe(403);
  });

  it("limite la réponse à 50 liens directs avec un ordre stable sans prétendre donner le total", async () => {
    const url = "/v1/media?trackId=trk_afterimage&limit=50";
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(200);
    const assets = mediaAssetSchema.array().parse(response.json().data);
    expect(assets).toHaveLength(50);
    expect(assets.every((asset) => asset.trackId === "trk_afterimage")).toBe(true);
    expect(response.json()).not.toHaveProperty("total");
    expect((await app.inject({ method: "GET", url })).json()).toEqual(response.json());
  });

  it("refuse une borne invalide ou un filtre morceau multiple avant toute lecture", async () => {
    const list = vi.spyOn(database, "listMedia");
    for (const query of [
      `trackId=${trackId}&limit=0`,
      `trackId=${trackId}&limit=51`,
      `trackId=${trackId}&trackId=trk_afterimage&limit=50`,
    ]) {
      expect((await app.inject({ method: "GET", url: `/v1/media?${query}` })).statusCode).toBe(400);
    }
    expect(list).not.toHaveBeenCalled();
  });
});
