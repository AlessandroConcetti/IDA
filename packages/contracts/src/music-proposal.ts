import { z } from "zod";

// Le modèle propose un ordre seulement. Le serveur impose la permutation exacte du contexte.
export const musicRankingSchema = z
  .object({
    orderedRefs: z
      .array(z.string().regex(/^R(?:[1-9]|10)$/u))
      .min(1)
      .max(10),
  })
  .strict();
export type MusicRanking = z.infer<typeof musicRankingSchema>;
