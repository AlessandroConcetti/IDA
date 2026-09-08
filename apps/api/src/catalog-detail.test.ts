import { mediaAssetSchema, trackSchema } from "@ida/contracts";
import { ToolGateway, ToolPolicyError } from "@ida/domain";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { DemoDatabase } from "./database.js";
import { demoContext, demoIdentity } from "./demo-context.js";

const now = () => new Date("2026-09-09T10:00:00.000Z");
let database: DemoDatabase;
let app: Awaited<ReturnType<typeof createApp>>;
let importedMediaId: string;
const urls = ["/v1/tracks/trk_lumiere_noire", "/v1/media/med_night-drive"];

beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://", now });
  const opening = vi.spyOn(DemoDatabase, "open").mockResolvedValueOnce(database);
  try {
    app = await createApp({ dataDir: "memory://", now });
  } finally {
    opening.mockRestore();
  }
  const imported = await database.createMedia(
    demoContext.workspaceId,
    demoContext.userId,
    { tags: ["fiche"], description: "Un média synthétique pour la lecture de fiche." },
    {
      filename: "fiche-test.mp4",
      mediaType: "VIDEO",
      mimeType: "video/mp4",
      byteSize: 32,
      sha256: "a".repeat(64),
      storageKey: "NEVER_PUBLIC_STORAGE",
    },
  );
  if (imported.kind !== "created") throw new Error("Fixture d’import absente");
  importedMediaId = imported.asset.id;
  // Un média ancien est volontairement hors de la première page de 50.
  await database.pglite.query(
    `INSERT INTO media_assets (id, workspace_id, artist_project_id, filename, media_type, mime_type, byte_size, sha256, status, created_at)
     SELECT 'med_detail_page_' || n, $1, 'prj_demo_aless', 'fiche-page.mp4', 'VIDEO', 'video/mp4', 1,
       'detail-page-hash-' || n, 'UNUSED', '2090-01-01T00:00:00Z'::timestamptz
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

describe("Fiches catalogue — lectures HTTP isolées", () => {
  it("retourne la projection musicale existante avec la release du même workspace", async () => {
    const list = (await app.inject({ method: "GET", url: "/v1/tracks" })).json().data;
    const response = await app.inject({ method: "GET", url: urls[0] });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(trackSchema.parse(response.json().data)).toEqual(
      list.find((track: { id: string }) => track.id === "trk_lumiere_noire"),
    );
    expect(response.json().data.releaseTitle).toBe("Lumière Noire");
  });

  it("ouvre l’ID historique avec tiret, sans lire ni chercher dans une page de médias", async () => {
    expect((await database.listMedia(demoContext.workspaceId)).map((asset) => asset.id)).not.toContain(
      "med_night-drive",
    );
    const list = vi.spyOn(database, "listMedia");
    const response = await app.inject({ method: "GET", url: urls[1] });
    expect(response.statusCode).toBe(200);
    expect(list).not.toHaveBeenCalled();
    expect(mediaAssetSchema.parse(response.json().data)).toMatchObject({
      id: "med_night-drive",
      type: "VIDEO",
      previewAvailable: false,
      tags: ["teaser", "vertical"],
    });
  });

  it("ouvre un ID d’import généré sans exposer la clé de stockage ni créer de prévisualisation", async () => {
    const response = await app.inject({ method: "GET", url: `/v1/media/${importedMediaId}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: importedMediaId,
      filename: "fiche-test.mp4",
      previewAvailable: true,
      usageCount: 0,
      tags: ["fiche"],
    });
    expect(response.body).not.toMatch(/NEVER_PUBLIC_STORAGE|storageKey|storage_key|filePath|token/iu);
  });

  it.each([
    ["tracks", "trk_other_workspace", "trk_missing", "TRACK_NOT_FOUND"],
    ["media", "med_other_workspace", "med_missing", "MEDIA_NOT_FOUND"],
  ])(
    "rend le même 404 pour un %s étranger ou absent malgré un scope injecté",
    async (resource, foreign, absent, code) => {
      const responses = await Promise.all(
        [foreign, absent].map((id) =>
          app.inject({
            method: "GET",
            url: `/v1/${resource}/${id}?workspaceId=wsp_other`,
            headers: { "x-workspace-id": "wsp_other", "x-user-id": "usr_other" },
          }),
        ),
      );
      expect(responses.map((response) => response.statusCode)).toEqual([404, 404]);
      expect(responses[0]?.body).toBe(responses[1]?.body);
      expect(responses[0]?.json().error.code).toBe(code);
      expect(responses[0]?.headers["cache-control"]).toBe("no-store");
    },
  );

  it.each([
    ["tracks", "bad-id"],
    ["tracks", "med_night-drive"],
    ["tracks", "trk_%25"],
    ["tracks", `trk_${"a".repeat(77)}`],
    ["tracks", "%20trk_lumiere_noire"],
    ["media", "bad-id"],
    ["media", "trk_lumiere_noire"],
    ["media", "med_%27"],
    ["media", `med_${"a".repeat(77)}`],
    ["media", "%20med_night-drive"],
  ])("rejette le paramètre %s/%s avant toute lecture du catalogue", async (resource, id) => {
    const trackRead = vi.spyOn(database, "findTrack");
    const mediaRead = vi.spyOn(database, "findMedia");
    const response = await app.inject({ method: "GET", url: `/v1/${resource}/${id}` });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe(
      resource === "tracks" ? "INVALID_TRACK_DETAIL_PARAMS" : "INVALID_MEDIA_DETAIL_PARAMS",
    );
    expect(trackRead).not.toHaveBeenCalled();
    expect(mediaRead).not.toHaveBeenCalled();
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("limite SQL à l’ID exact ET au workspace serveur", async () => {
    const query = vi.spyOn(database.pglite, "query");
    for (const url of urls) expect((await app.inject({ method: "GET", url })).statusCode).toBe(200);
    expect(
      query.mock.calls.some(
        ([sql, values]) =>
          /WHERE track.workspace_id = \$1\s+AND track.id = \$2/u.test(sql) &&
          JSON.stringify(values) === JSON.stringify([demoContext.workspaceId, "trk_lumiere_noire"]),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(
        ([sql, values]) =>
          /WHERE asset.workspace_id = \$1\s+AND asset.id = \$2/u.test(sql) &&
          JSON.stringify(values) === JSON.stringify([demoContext.workspaceId, "med_night-drive", 1]),
      ),
    ).toBe(true);
  });

  it("autorise VIEW_ONLY sans le transformer en droit d’écriture", async () => {
    await database.pglite.query(
      "UPDATE client_workspace_grants SET access_level = 'VIEW_ONLY' WHERE client_instance_id = $1",
      [demoIdentity.clientInstanceId],
    );
    for (const url of urls) expect((await app.inject({ method: "GET", url })).statusCode).toBe(200);
    const denied = await app.inject({
      method: "POST",
      url: "/v1/tracks",
      payload: { title: "Interdit", artistCredit: "Test", status: "DEMO", tags: [] },
    });
    expect(denied.statusCode).toBe(403);
  });

  it.each(["expired", "revoked", "unauthorized-device"])(
    "refuse une identité %s avant toute donnée catalogue",
    async (state) => {
      if (state === "expired")
        await database.pglite.query("UPDATE identity_sessions SET expires_at = '2026-09-08T00:00:00Z' WHERE id = $1", [
          demoIdentity.sessionId,
        ]);
      if (state === "revoked")
        await database.pglite.query("UPDATE identity_sessions SET status = 'REVOKED', revoked_at = $2 WHERE id = $1", [
          demoIdentity.sessionId,
          now().toISOString(),
        ]);
      if (state === "unauthorized-device")
        await database.pglite.query(
          "UPDATE client_workspace_grants SET status = 'REVOKED', revoked_at = $2 WHERE client_instance_id = $1",
          [demoIdentity.clientInstanceId, now().toISOString()],
        );
      const trackRead = vi.spyOn(database, "findTrack");
      const mediaRead = vi.spyOn(database, "findMedia");
      for (const url of urls) {
        const response = await app.inject({ method: "GET", url });
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({
          error: { code: "AUTHENTICATION_REQUIRED", message: "Authentification requise." },
        });
      }
      expect(trackRead).not.toHaveBeenCalled();
      expect(mediaRead).not.toHaveBeenCalled();
    },
  );

  it("ne contourne pas le Tool Gateway même avec une session valide", async () => {
    vi.spyOn(ToolGateway.prototype, "assertAuthorized").mockImplementation(() => {
      throw new ToolPolicyError("TOOL_NOT_ALLOWED", "Lecture refusée pour ce test.");
    });
    const trackRead = vi.spyOn(database, "findTrack");
    const mediaRead = vi.spyOn(database, "findMedia");
    for (const url of urls) expect((await app.inject({ method: "GET", url })).statusCode).toBe(403);
    expect(trackRead).not.toHaveBeenCalled();
    expect(mediaRead).not.toHaveBeenCalled();
  });

  it.each(["track", "media"])(
    "ne livre pas de %s après révocation de l’appareil pendant la lecture",
    async (resource) => {
      const revoke = async () =>
        database.pglite.query("UPDATE client_instances SET status = 'REVOKED', revoked_at = $2 WHERE id = $1", [
          demoIdentity.clientInstanceId,
          now().toISOString(),
        ]);
      if (resource === "track") {
        const read = database.findTrack.bind(database);
        vi.spyOn(database, "findTrack").mockImplementation(async (...args) => {
          const result = await read(...args);
          await revoke();
          return result;
        });
      } else {
        const read = database.findMedia.bind(database);
        vi.spyOn(database, "findMedia").mockImplementation(async (...args) => {
          const result = await read(...args);
          await revoke();
          return result;
        });
      }
      const response = await app.inject({ method: "GET", url: resource === "track" ? urls[0] : urls[1] });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: { code: "AUTHORIZATION_DENIED", message: "Cette action n’est pas autorisée." },
      });
    },
  );

  it("ne change ni catalogue, usage, audit, conversation ou mémoire et n’appelle aucun réseau", async () => {
    const snapshot = async () =>
      Promise.all(
        ["tracks", "media_assets", "activity_logs", "command_runs", "memories"].map((table) =>
          database.pglite.query(`SELECT * FROM ${table} ORDER BY id`),
        ),
      );
    const before = await snapshot();
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Réseau interdit"));
    const preview = vi.spyOn(database, "findPrivateMediaFile");
    for (const url of urls) expect((await app.inject({ method: "GET", url })).statusCode).toBe(200);
    expect(await snapshot()).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
    expect(preview).not.toHaveBeenCalled();
  });
});

describe("Fiches catalogue — verrou local réel", () => {
  it("exige une session, accepte un cookie réel puis refuse ce cookie après verrouillage", async () => {
    const locked = await createApp({ dataDir: "memory://", identityMode: "LOCAL_LOCK", now });
    try {
      for (const url of urls) expect((await locked.inject({ method: "GET", url })).statusCode).toBe(401);
      const setup = await locked.inject({
        method: "POST",
        url: "/v1/auth/setup",
        payload: { passphrase: "Phrase éphémère synthétique de test des fiches IDA" },
      });
      expect(setup.statusCode).toBe(201);
      const cookie = String(setup.headers["set-cookie"]).split(";", 1)[0] ?? "";
      for (const url of urls)
        expect((await locked.inject({ method: "GET", url, headers: { cookie } })).statusCode).toBe(200);
      expect((await locked.inject({ method: "POST", url: "/v1/auth/lock", headers: { cookie } })).statusCode).toBe(204);
      for (const url of urls)
        expect((await locked.inject({ method: "GET", url, headers: { cookie } })).statusCode).toBe(401);
    } finally {
      await locked.close();
    }
  });
});
