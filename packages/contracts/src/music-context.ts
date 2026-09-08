import { z } from "zod";

const limit = z.number().int().min(1).max(10).default(5);
const mediaType = z.enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "OTHER"]);
const mediaStatus = z.enum(["UNUSED", "USED", "SCHEDULED", "PUBLISHED"]);
// Commandes structurées seulement. Ni prompt, ni mémoire, ni publication dans ce contrat.
export const musicContextQuerySchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("SEARCH_TRACK"), title: z.string().trim().min(1).max(120).optional(), limit }).strict(),
  z
    .object({
      intent: z.literal("SEARCH_MEDIA"),
      mediaType: mediaType.optional(),
      status: mediaStatus.optional(),
      limit,
    })
    .strict(),
]);
export type MusicContextQuery = z.infer<typeof musicContextQuerySchema>;

const id = z.string().min(1).max(200);
const updatedAt = z.string().datetime({ offset: true });
const trackFactSchema = z
  .object({
    id,
    title: z.string().min(1).max(240),
    artistCredit: z.string().min(1).max(240),
    genre: z.string().max(120).nullable(),
    bpm: z.number().positive().max(400).nullable(),
    musicalKey: z.string().max(32).nullable(),
    status: z.enum(["DEMO", "UNRELEASED", "SCHEDULED", "RELEASED"]),
    updatedAt,
  })
  .strict();
const mediaFactSchema = z.object({ id, mediaType, status: mediaStatus, updatedAt }).strict();
export const musicContextRowsSchema = z
  .object({ tracks: z.array(trackFactSchema).max(10), media: z.array(mediaFactSchema).max(10) })
  .strict();
export type MusicTrackFact = z.infer<typeof trackFactSchema>;
export type MusicMediaFact = z.infer<typeof mediaFactSchema>;
export type MusicContextRows = z.infer<typeof musicContextRowsSchema>;
