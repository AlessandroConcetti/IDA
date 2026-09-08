import type { IntelligenceScope } from "@ida/contracts/intelligence";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DemoDatabase } from "./database.js";
import type { MusicContextQuery, MusicContextStore } from "./music-context.js";
import { createMusicContextStore } from "./music-context-store.js";

const scope: IntelligenceScope = {
  userId: "usr_context_test",
  workspaceId: "wsp_context_a",
  sessionId: "ses_context_test",
  clientInstanceId: "cli_context_test",
};
const updatedAt = "2026-09-08T10:00:00.123Z";
let database: DemoDatabase;
let store: MusicContextStore;

async function insertTrack(id: string, title: string, workspace = "a", status = "UNRELEASED") {
  await database.pglite.query(
    `
      INSERT INTO tracks (
        id, workspace_id, artist_project_id, title, artist_credit, genre, bpm,
        musical_key, status, description, label, tags, updated_at
      ) VALUES ($1, $2, $3, $4, 'Artiste de test', NULL, 123.5, 'Am', $5,
        'PRIVATE_TRACK_DESCRIPTION', 'PRIVATE_LABEL', '["PRIVATE_TAG"]'::json, $6)
    `,
    [id, `wsp_context_${workspace}`, `prj_context_${workspace}`, title, status, "2026-09-08T12:00:00.123+02:00"],
  );
}

async function insertMedia(id: string, mediaType: string, status: string, workspace = "a") {
  await database.pglite.query(
    `
      INSERT INTO media_assets (
        id, workspace_id, artist_project_id, track_id, filename, media_type, mime_type,
        byte_size, sha256, storage_key, status, description, usage_count, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'PRIVATE_FILENAME.docx', $5, 'application/x-private',
        4096, $6, 'PRIVATE_STORAGE', $7, 'PRIVATE_MEDIA_DESCRIPTION', 42, $8, $8)
    `,
    [
      id,
      `wsp_context_${workspace}`,
      `prj_context_${workspace}`,
      workspace === "a" ? "tr_a_00" : "tr_b_private",
      mediaType,
      `PRIVATE_HASH_${id}`,
      status,
      updatedAt,
    ],
  );
}

beforeAll(async () => {
  database = await DemoDatabase.open({ dataDir: "memory://", seed: false });
  await database.pglite.exec(`
    INSERT INTO users (id, email, display_name, timezone)
      VALUES ('usr_context_test', 'synthetic-context@example.invalid', 'Contexte synthétique', 'UTC');
    INSERT INTO workspaces (id, name, timezone, locale, owner_user_id) VALUES
      ('wsp_context_a', 'PRIVATE_WORKSPACE_A', 'UTC', 'fr', 'usr_context_test'),
      ('wsp_context_b', 'PRIVATE_WORKSPACE_B', 'UTC', 'fr', 'usr_context_test');
    INSERT INTO artist_projects (id, workspace_id, name, status) VALUES
      ('prj_context_a', 'wsp_context_a', 'PRIVATE_PROJECT_A', 'ACTIVE'),
      ('prj_context_b', 'wsp_context_b', 'PRIVATE_PROJECT_B', 'ACTIVE');
  `);
  const statuses = ["DEMO", "UNRELEASED", "SCHEDULED", "RELEASED"];
  for (let index = 0; index < 12; index++) {
    const suffix = String(index).padStart(2, "0");
    await insertTrack(`tr_a_${suffix}`, `Piste ${suffix}`, "a", statuses[index % statuses.length]);
  }
  await insertTrack("tr_a_archived", "Piste 00 archive", "a", "ARCHIVED");
  await insertTrack("tr_b_private", "Piste privée autre workspace", "b");
  await insertTrack("tr_percent", "Motif 100% pur");
  await insertTrack("tr_percent_decoy", "Motif 100X pur");
  await insertTrack("tr_underscore", "Motif A_B");
  await insertTrack("tr_underscore_decoy", "Motif AXB");
  await insertTrack("tr_backslash", "Motif C\\D");
  await insertTrack("tr_backslash_decoy", "Motif CD");
  await insertTrack("tr_quote", "Motif l'art");
  await insertTrack("tr_order_b", "Même titre");
  await insertTrack("tr_order_a", "Même titre");
  await database.pglite.query("UPDATE tracks SET bpm = NULL, musical_key = NULL WHERE id = $1", ["tr_order_b"]);
  const mediaTypes = ["VIDEO", "IMAGE", "AUDIO", "DOCUMENT", "OTHER"];
  const mediaStatuses = ["UNUSED", "USED", "SCHEDULED", "PUBLISHED"];
  for (let index = 0; index < 12; index++) {
    await insertMedia(
      `ma_a_${String(index).padStart(2, "0")}`,
      mediaTypes[index % mediaTypes.length] ?? "VIDEO",
      mediaStatuses[index % mediaStatuses.length] ?? "UNUSED",
    );
  }
  await insertMedia("ma_a_zz_archived", "VIDEO", "ARCHIVED");
  await insertMedia("ma_b_private", "VIDEO", "UNUSED", "b");
  await database.pglite.query("UPDATE media_assets SET created_at = $1 WHERE id = $2", [
    "2026-09-09T10:00:00.123Z",
    "ma_a_00",
  ]);
  await database.pglite.query("UPDATE media_assets SET created_at = $1 WHERE id = $2", [
    "2026-09-10T10:00:00.123Z",
    "ma_a_zz_archived",
  ]);
  store = createMusicContextStore(database);
});

afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  if (database) await database.close();
});

describe("Bounded music context projection over an isolated PGlite database", () => {
  it("selects tracks only in the bound workspace and excludes archives before limiting", async () => {
    const result = await store.read(scope, { intent: "SEARCH_TRACK", title: "Piste", limit: 10 });
    expect(result.tracks.map((row) => row.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `tr_a_${String(index).padStart(2, "0")}`),
    );
    expect(result.media).toEqual([]);
    const other = await store.read({ ...scope, workspaceId: "wsp_context_b" }, { intent: "SEARCH_TRACK", limit: 10 });
    expect(other.tracks.map((row) => row.id)).toEqual(["tr_b_private"]);
    expect(other.media).toEqual([]);
  });

  it("returns only approved track fields, normalized UTC and numeric BPM", async () => {
    const result = await store.read(scope, { intent: "SEARCH_TRACK", title: "Piste 00", limit: 5 });
    expect(result).toEqual({
      tracks: [
        {
          id: "tr_a_00",
          title: "Piste 00",
          artistCredit: "Artiste de test",
          genre: null,
          bpm: 123.5,
          musicalKey: "Am",
          status: "DEMO",
          updatedAt,
        },
      ],
      media: [],
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_");
    expect(await store.read(scope, { intent: "SEARCH_TRACK", title: "PRIVATE_TRACK_DESCRIPTION", limit: 5 })).toEqual({
      tracks: [],
      media: [],
    });
  });

  it("uses stable track id ordering when titles match and preserves unknown nullable facts", async () => {
    const result = await store.read(scope, { intent: "SEARCH_TRACK", title: "Même titre", limit: 10 });
    expect(result.tracks.map((row) => row.id)).toEqual(["tr_order_a", "tr_order_b"]);
    expect(result.tracks[1]).toMatchObject({ genre: null, bpm: null, musicalKey: null });
  });

  it.each([
    ["%", "tr_percent"],
    ["_", "tr_underscore"],
    ["\\", "tr_backslash"],
    ["100%", "tr_percent"],
    ["A_B", "tr_underscore"],
    ["l'art", "tr_quote"],
    ["pIsTe 03", "tr_a_03"],
  ])("matches title %s literally without wildcard expansion", async (title, expectedId) => {
    const result = await store.read(scope, { intent: "SEARCH_TRACK", title, limit: 10 });
    expect(result.tracks.map((row) => row.id)).toEqual([expectedId]);
    expect(result.media).toEqual([]);
  });

  it("binds title and workspace parameters without treating them as SQL", async () => {
    expect(await store.read(scope, { intent: "SEARCH_TRACK", title: "' OR TRUE --", limit: 10 })).toEqual({
      tracks: [],
      media: [],
    });
    expect(
      await store.read({ ...scope, workspaceId: "wsp_context_a' OR TRUE --" }, { intent: "SEARCH_MEDIA", limit: 10 }),
    ).toEqual({ tracks: [], media: [] });
  });

  it("bounds each SQL query and reads no unrelated source", async () => {
    const query = vi.spyOn(database.pglite, "query");
    await store.read(scope, { intent: "SEARCH_TRACK", title: "Piste", limit: 10 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toMatch(/FROM tracks\s+WHERE/);
    expect(query.mock.calls[0]?.[0]).toMatch(/LIMIT \$3/);
    expect(query.mock.calls[0]?.[1]).toEqual([scope.workspaceId, "%Piste%", 10]);
    query.mockClear();
    await store.read(scope, { intent: "SEARCH_MEDIA", mediaType: "VIDEO", status: "UNUSED", limit: 2 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toMatch(/FROM media_assets\s+WHERE/);
    expect(query.mock.calls[0]?.[0]).toMatch(/LIMIT \$4/);
    expect(query.mock.calls[0]?.[1]).toEqual([scope.workspaceId, "VIDEO", "UNUSED", 2]);
  });

  it("returns default five or requested ten media records with no private metadata or archive", async () => {
    const defaultQuery = { intent: "SEARCH_MEDIA" } as MusicContextQuery;
    const five = await store.read(scope, defaultQuery);
    expect(five.media.map((row) => row.id)).toEqual(["ma_a_00", "ma_a_11", "ma_a_10", "ma_a_09", "ma_a_08"]);
    expect(five.tracks).toEqual([]);
    for (const row of five.media) {
      expect(Object.keys(row).sort()).toEqual(["id", "mediaType", "status", "updatedAt"]);
      expect(row.updatedAt).toBe(updatedAt);
    }
    expect(JSON.stringify(five)).not.toContain("PRIVATE_");
    const ten = await store.read(scope, { intent: "SEARCH_MEDIA", limit: 10 });
    expect(ten.media).toHaveLength(10);
    expect(ten.media.every((row) => row.id.startsWith("ma_a_") && row.status !== ("ARCHIVED" as string))).toBe(true);
  });

  it("filters media type and status only within the bound workspace", async () => {
    expect(
      await store.read(scope, { intent: "SEARCH_MEDIA", mediaType: "VIDEO", status: "UNUSED", limit: 10 }),
    ).toEqual({
      tracks: [],
      media: [{ id: "ma_a_00", mediaType: "VIDEO", status: "UNUSED", updatedAt }],
    });
    const other = await store.read(
      { ...scope, workspaceId: "wsp_context_b" },
      { intent: "SEARCH_MEDIA", mediaType: "VIDEO", status: "UNUSED", limit: 10 },
    );
    expect(other.media.map((row) => row.id)).toEqual(["ma_b_private"]);
    expect(other.tracks).toEqual([]);
  });

  it.each([
    { intent: "SEARCH_TRACK", limit: 11 },
    { intent: "SEARCH_TRACK", limit: 0 },
    { intent: "SEARCH_TRACK", limit: 1.5 },
    { intent: "SEARCH_TRACK", limit: Infinity },
    { intent: "SEARCH_TRACK", title: "x".repeat(121), limit: 5 },
    { intent: "SEARCH_TRACK", title: "", limit: 5 },
    { intent: "SEARCH_TRACK", workspaceId: "wsp_context_b", limit: 5 },
    { intent: "SEARCH_TRACK", mediaType: "VIDEO", limit: 5 },
    { intent: "SEARCH_MEDIA", status: "ARCHIVED", limit: 5 },
    { intent: "SEARCH_MEDIA", title: "private", limit: 5 },
    { intent: "SEARCH_MEDIA", filename: "private", limit: 5 },
    { intent: "SEARCH_MEDIA", trackId: "tr_b_private", limit: 5 },
    { intent: "SEARCH_MEDIA", q: "private", limit: 5 },
    { intent: "SEARCH_MEDIA", mediaType: "CAMERA", limit: 5 },
    { intent: "SAVE_MEMORY", limit: 5 },
  ])("rejects malformed or out-of-scope queries without SQL: %j", async (query) => {
    const sql = vi.spyOn(database.pglite, "query");
    await expect(store.read(scope, query as MusicContextQuery)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(sql).not.toHaveBeenCalled();
  });

  it("rejects malformed scope before SQL and redacts unexpected database errors", async () => {
    const sql = vi.spyOn(database.pglite, "query");
    await expect(store.read({ ...scope, workspaceId: "" }, { intent: "SEARCH_TRACK", limit: 5 })).rejects.toMatchObject(
      {
        code: "INVALID_REQUEST",
      },
    );
    expect(sql).not.toHaveBeenCalled();
    sql.mockRejectedValueOnce(new Error("PRIVATE_DATABASE_DETAIL"));
    await expect(store.read(scope, { intent: "SEARCH_MEDIA", limit: 5 })).rejects.toThrow(
      "IDA intelligence: UNAVAILABLE",
    );
  });
});
