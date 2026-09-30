import { z } from "zod";

const contactId = z.string().regex(/^mct_[a-f0-9]{32}$/u);
const taskId = z.string().regex(/^task_[a-z0-9_]{1,76}$/iu);
const title = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !value.includes("\u0000"));
const dueAt = z
  .string()
  .datetime()
  .refine((value) => Number.isFinite(Date.parse(value)));
const timeZone = z
  .string()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("fr", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
export const musicFollowupCreateSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    expectedContactRevision: z.number().int().min(0).max(2147483646),
    title,
    description: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .refine((value) => !value.includes("\u0000"))
      .optional(),
    dueAt,
    timeZone,
  })
  .strict();
export const musicFollowupQuerySchema = z
  .object({
    musicContactId: contactId.optional(),
    taskId: taskId.optional(),
    state: z.enum(["OPEN", "CLOSED", "ALL"]).default("ALL"),
    offset: z.coerce.number().int().min(0).max(20000).default(0),
  })
  .strict();
export const musicFollowupSchema = z
  .object({
    id: z.string().regex(/^mfu_[a-f0-9]{32}$/u),
    musicContactId: contactId,
    artistProjectId: z.string().min(1).max(100),
    projectName: z.string(),
    organisation: z.string(),
    timeZone,
    task: z
      .object({
        id: taskId,
        title,
        description: z.string().nullable(),
        status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]),
        dueAt: z.string().datetime().nullable(),
        createdAt: z.string().datetime(),
        completedAt: z.string().datetime().nullable(),
      })
      .strict(),
    createdAt: z.string().datetime(),
  })
  .strict();
export const musicFollowupResponseSchema = z.object({ data: musicFollowupSchema, replayed: z.boolean() }).strict();
export const musicFollowupListSchema = z
  .object({
    data: z.array(musicFollowupSchema).max(25),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type MusicFollowup = z.infer<typeof musicFollowupSchema>;
