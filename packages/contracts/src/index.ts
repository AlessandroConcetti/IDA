import { z } from "zod";

export const entityIdSchema = z.string().trim().min(1);
export const timestampSchema = z.string().datetime({ offset: true });

export const moduleKeySchema = z.enum([
  "HOME",
  "IDA",
  "MUSIC",
  "CONTENT",
  "SOCIAL",
  "CALENDAR",
  "CAMPAIGNS",
  "ANALYTICS",
  "TASKS",
  "MEMORY",
  "SYSTEM",
]);

export type ModuleKey = z.infer<typeof moduleKeySchema>;

export const moduleLabels: Record<ModuleKey, string> = {
  HOME: "Accueil",
  IDA: "IDA",
  MUSIC: "Musique",
  CONTENT: "Contenus",
  SOCIAL: "Réseaux sociaux",
  CALENDAR: "Calendrier",
  CAMPAIGNS: "Campagnes",
  ANALYTICS: "Analyses",
  TASKS: "Tâches",
  MEMORY: "Mémoire",
  SYSTEM: "Système",
};

export const permissionLevelSchema = z.enum(["READ", "WRITE", "APPROVAL_REQUIRED", "PUBLISH", "SYSTEM"]);

export type PermissionLevel = z.infer<typeof permissionLevelSchema>;

export const permissionLevelLabels: Record<PermissionLevel, string> = {
  READ: "Lecture",
  WRITE: "Modification",
  APPROVAL_REQUIRED: "Validation requise",
  PUBLISH: "Publication",
  SYSTEM: "Système",
};

export const systemComponentSchema = z.enum([
  "AI",
  "DATABASE",
  "STORAGE",
  "SOCIAL_ACCOUNTS",
  "SCHEDULER",
  "NOTIFICATIONS",
]);

export type SystemComponent = z.infer<typeof systemComponentSchema>;

export const systemStateSchema = z.enum(["ONLINE", "WARNING", "ERROR", "DISCONNECTED"]);
export type SystemState = z.infer<typeof systemStateSchema>;

export const systemStateLabels: Record<SystemState, string> = {
  ONLINE: "En ligne",
  WARNING: "Avertissement",
  ERROR: "Erreur",
  DISCONNECTED: "Déconnecté",
};

export const systemStatusSchema = z.object({
  component: systemComponentSchema,
  state: systemStateSchema,
  message: z.string().trim().min(1).optional(),
  checkedAt: timestampSchema,
});

export type SystemStatus = z.infer<typeof systemStatusSchema>;

export const artistProfileSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema,
  identity: z.string().trim().min(1),
  genres: z.array(z.string().trim().min(1)).default([]),
  influences: z.array(z.string().trim().min(1)).default([]),
  tone: z.string().trim().min(1).optional(),
  preferredVocabulary: z.array(z.string().trim().min(1)).default([]),
  forbiddenVocabulary: z.array(z.string().trim().min(1)).default([]),
  goals: z.array(z.string().trim().min(1)).default([]),
  audience: z.string().trim().min(1).optional(),
  platformPreferences: z.record(z.string(), z.unknown()).default({}),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type ArtistProfile = z.infer<typeof artistProfileSchema>;

export const releaseStatusSchema = z.enum(["DRAFT", "SCHEDULED", "RELEASED", "ARCHIVED"]);
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;

export const releaseSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema,
  title: z.string().trim().min(1),
  releaseType: z.string().trim().min(1),
  releaseDate: z.string().date().optional(),
  label: z.string().trim().min(1).optional(),
  status: releaseStatusSchema,
  description: z.string().trim().optional(),
  links: z.array(z.string().url()).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Release = z.infer<typeof releaseSchema>;

export const trackStatusSchema = z.enum(["DEMO", "UNRELEASED", "SCHEDULED", "RELEASED", "ARCHIVED"]);
export type TrackStatus = z.infer<typeof trackStatusSchema>;

export const trackSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema,
  releaseId: entityIdSchema.optional(),
  title: z.string().trim().min(1),
  artistCredit: z.string().trim().min(1),
  genre: z.string().trim().min(1).optional(),
  bpm: z.number().positive().max(400).optional(),
  musicalKey: z.string().trim().min(1).optional(),
  releaseDate: z.string().date().optional(),
  label: z.string().trim().min(1).optional(),
  status: trackStatusSchema,
  links: z.array(z.string().url()).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  description: z.string().trim().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Track = z.infer<typeof trackSchema>;

export const mediaTypeSchema = z.enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "OTHER"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const mediaStatusSchema = z.enum(["UNUSED", "USED", "SCHEDULED", "PUBLISHED", "ARCHIVED"]);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

export const mediaAssetSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema.optional(),
  filename: z.string().trim().min(1),
  type: mediaTypeSchema,
  mimeType: z.string().trim().min(1),
  size: z.number().int().nonnegative(),
  hash: z.string().trim().min(1),
  createdAtSource: timestampSchema.optional(),
  releaseId: entityIdSchema.optional(),
  trackId: entityIdSchema.optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  description: z.string().trim().optional(),
  status: mediaStatusSchema,
  usageCount: z.number().int().nonnegative().default(0),
  lastUsedAt: timestampSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const memoryCategorySchema = z.enum([
  "ARTIST_MEMORY",
  "CONTENT_MEMORY",
  "CAMPAIGN_MEMORY",
  "SOCIAL_MEMORY",
  "PREFERENCE_MEMORY",
  "SYSTEM_MEMORY",
]);

export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

export const memoryStateSchema = z.enum(["PENDING", "CONFIRMED", "REJECTED"]);
export type MemoryState = z.infer<typeof memoryStateSchema>;

export const memorySchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema.optional(),
  category: memoryCategorySchema,
  content: z.string().trim().min(1),
  state: memoryStateSchema,
  sourceMessageId: entityIdSchema.optional(),
  confirmedBy: entityIdSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Memory = z.infer<typeof memorySchema>;

export const socialPlatformSchema = z.enum(["INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK"]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

export const socialPlatformCapabilitySchema = z.object({
  platform: socialPlatformSchema,
  apiVersion: z.string().trim().min(1),
  oauthSupported: z.boolean(),
  draftSupported: z.boolean(),
  scheduleSupported: z.boolean(),
  publishSupported: z.boolean(),
  analyticsSupported: z.boolean(),
  requiresHumanApproval: z.boolean().default(true),
  requiresPlatformReview: z.boolean().default(false),
  notes: z.array(z.string().trim().min(1)).default([]),
  verifiedAt: timestampSchema,
});

export type SocialPlatformCapability = z.infer<typeof socialPlatformCapabilitySchema>;

export const idaCommandIntentSchema = z.enum([
  "UNKNOWN",
  "PREPARE_DAY",
  "SEARCH_MEDIA",
  "SEARCH_TRACK",
  "LIST_UNUSED_CONTENT",
  "CREATE_POST",
  "UPDATE_POST",
  "SCHEDULE_POST",
  "ANALYZE_PERFORMANCE",
  "CREATE_CAMPAIGN",
  "GET_CALENDAR",
  "CONNECT_SOCIAL_ACCOUNT",
  "EXPLAIN_PROPOSAL",
  "SAVE_MEMORY",
]);

export type IdaCommandIntent = z.infer<typeof idaCommandIntentSchema>;

export const idaCommandStateSchema = z.enum([
  "RECEIVED",
  "UNDERSTOOD",
  "PLANNED",
  "AWAITING_APPROVAL",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export type IdaCommandState = z.infer<typeof idaCommandStateSchema>;

export const idaCommandInputSchema = z.object({
  workspaceId: entityIdSchema,
  message: z.string().trim().min(1),
  intent: idaCommandIntentSchema.default("UNKNOWN"),
  parameters: z.record(z.string(), z.unknown()).default({}),
});

export type IdaCommandInput = z.infer<typeof idaCommandInputSchema>;

export const idaCommandSchema = idaCommandInputSchema.extend({
  id: entityIdSchema,
  state: idaCommandStateSchema,
  requestedPermission: permissionLevelSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type IdaCommand = z.infer<typeof idaCommandSchema>;

export const explicitApprovalSchema = z.object({
  approvalId: entityIdSchema,
  approvedBy: entityIdSchema,
  approvedAt: timestampSchema,
});

export type ExplicitApproval = z.infer<typeof explicitApprovalSchema>;
