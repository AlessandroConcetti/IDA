import { intelligenceScopeSchema } from "@ida/contracts/intelligence";
import { IntelligenceError } from "@ida/domain";
import type { DemoDatabase } from "./database.js";
import {
  type MusicContextStore,
  type MusicMediaFact,
  type MusicTrackFact,
  musicContextQuerySchema,
} from "./music-context.js";

function literalLike(value: string): string {
  return `%${value.replace(/[\\%_]/gu, "\\$&")}%`;
}

/** Projection interne uniquement. Le broker autorise l'identité, l'agent et les sources avant/après la lecture. */
export function createMusicContextStore(database: DemoDatabase): MusicContextStore {
  return {
    async read(rawScope, rawQuery) {
      const parsedScope = intelligenceScopeSchema.safeParse(rawScope);
      const parsedQuery = musicContextQuerySchema.safeParse(rawQuery);
      if (!parsedScope.success || !parsedQuery.success) throw new IntelligenceError("INVALID_REQUEST");
      const scope = parsedScope.data;
      const query = parsedQuery.data;

      try {
        if (query.intent === "SEARCH_TRACK") {
          const values: unknown[] = [scope.workspaceId];
          const filters = ["workspace_id = $1", "status IN ('DEMO', 'UNRELEASED', 'SCHEDULED', 'RELEASED')"];
          if (query.title !== undefined) {
            values.push(literalLike(query.title));
            filters.push(`title ILIKE $${values.length} ESCAPE '\\'`);
          }
          values.push(query.limit);
          const result = await database.pglite.query<MusicTrackFact>(
            `
              SELECT
                id,
                title,
                artist_credit AS "artistCredit",
                genre,
                bpm::double precision AS bpm,
                musical_key AS "musicalKey",
                status,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
              FROM tracks
              WHERE ${filters.join(" AND ")}
              ORDER BY title ASC, id ASC
              LIMIT $${values.length}
            `,
            values,
          );
          return {
            tracks: result.rows.map((row) => ({
              id: row.id,
              title: row.title,
              artistCredit: row.artistCredit,
              genre: row.genre,
              bpm: row.bpm,
              musicalKey: row.musicalKey,
              status: row.status,
              updatedAt: row.updatedAt,
            })),
            media: [],
          };
        }

        const values: unknown[] = [scope.workspaceId];
        const filters = ["workspace_id = $1", "status IN ('UNUSED', 'USED', 'SCHEDULED', 'PUBLISHED')"];
        if (query.mediaType !== undefined) {
          values.push(query.mediaType);
          filters.push(`media_type = $${values.length}`);
        }
        if (query.status !== undefined) {
          values.push(query.status);
          filters.push(`status = $${values.length}`);
        }
        values.push(query.limit);
        const result = await database.pglite.query<MusicMediaFact>(
          `
            SELECT
              id,
              media_type AS "mediaType",
              status,
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
            FROM media_assets
            WHERE ${filters.join(" AND ")}
            ORDER BY created_at DESC, id DESC
            LIMIT $${values.length}
          `,
          values,
        );
        return {
          tracks: [],
          media: result.rows.map((row) => ({
            id: row.id,
            mediaType: row.mediaType,
            status: row.status,
            updatedAt: row.updatedAt,
          })),
        };
      } catch {
        // Les erreurs SQL brutes peuvent contenir des valeurs privées ou le schéma serveur.
        throw new IntelligenceError("UNAVAILABLE");
      }
    },
  };
}
