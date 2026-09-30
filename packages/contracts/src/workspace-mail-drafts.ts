import { z } from "zod";
import { musicContactPublicUrlSchema } from "./music-contacts.js";

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value));
const body = z
  .string()
  .trim()
  .min(1)
  .max(12000)
  .refine((value) => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(value.replace(/[\r\n\t]/gu, "")));
const email = z.string().trim().email().max(254);
const musicContactId = z.string().regex(/^mct_[a-f0-9]{32}$/u);
const draftId = z.string().regex(/^wmd_[a-f0-9]{32}$/u);
const trackId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/u);
const revision = z.number().int().min(0).max(2147483646);
export const mailDraftPurposeSchema = z.enum(["LABEL_DEMO", "GIG", "PRIVATE_EVENT"]);
export const mailDraftStatusSchema = z.enum(["DRAFT", "ARCHIVED"]);
export const musicMailDraftCreateSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    expectedContactRevision: revision,
    purpose: mailDraftPurposeSchema,
    trackId: trackId.nullable().optional(),
    listeningUrl: musicContactPublicUrlSchema.nullable().optional(),
    recipientEmail: email.nullable(),
    subject: line(240),
    body,
  })
  .strict();
export const workspaceMailDraftPatchSchema = z
  .object({
    expectedRevision: revision,
    subject: line(240).optional(),
    body: body.optional(),
    recipientEmail: email.nullable().optional(),
    listeningUrl: musicContactPublicUrlSchema.nullable().optional(),
    status: mailDraftStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1);
export const workspaceMailDraftParamsSchema = z.object({ draftId }).strict();
export const workspaceMailDraftQuerySchema = z
  .object({
    musicContactId: musicContactId.optional(),
    status: mailDraftStatusSchema.optional(),
    offset: z.coerce.number().int().min(0).max(20000).default(0),
  })
  .strict();
export const workspaceMailDraftSchema = z
  .object({
    id: draftId,
    musicContactId,
    artistProjectId: line(100),
    projectName: line(240),
    organisation: line(240),
    contactSourceUrl: musicContactPublicUrlSchema,
    currentContactEmail: email.nullable(),
    purpose: mailDraftPurposeSchema,
    trackId: trackId.nullable(),
    // Match the source track contract; a display projection is not a mail header.
    trackTitle: z.string().trim().min(1).max(240).nullable(),
    listeningUrl: musicContactPublicUrlSchema.nullable(),
    recipientEmail: email.nullable(),
    subject: line(240),
    body,
    status: mailDraftStatusSchema,
    revision,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const workspaceMailDraftResponseSchema = z
  .object({ data: workspaceMailDraftSchema, replayed: z.boolean().optional() })
  .strict();
export const workspaceMailDraftListSchema = z
  .object({
    data: z.array(workspaceMailDraftSchema).max(25),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type WorkspaceMailDraft = z.infer<typeof workspaceMailDraftSchema>;
export type MailDraftPurpose = z.infer<typeof mailDraftPurposeSchema>;
