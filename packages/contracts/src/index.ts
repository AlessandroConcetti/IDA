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

// Journal d'activité -------------------------------------------------------
//
// La timeline utilisateur est une projection très réduite de l'audit interne.
// Elle ne transporte jamais le payload, l'acteur, le workspace, un hash ni un
// contenu libre. Seules les actions connues de la tranche locale sont visibles
// par défaut ; les futurs domaines sensibles devront déclarer leur projection.
export const activityLogActionValues = [
  "campaign.created",
  "campaign.release_linked",
  "campaign.release_unlinked",
  "release.created",
  "track.created",
  "media.imported",
  "memory.proposed",
  "memory.confirmed",
  "memory.rejected",
  "post_variant.approved",
  "post_variant.rejected",
  "post_variant.internal_scheduled",
  "post_variant.internal_schedule_cancelled",
  "task.created",
  "task.completed",
] as const;

export const activityLogActionSchema = z.enum(activityLogActionValues);
export type ActivityLogAction = z.infer<typeof activityLogActionSchema>;

export const activityLogEntityTypeValues = [
  "CAMPAIGN",
  "RELEASE",
  "TRACK",
  "MEDIA_ASSET",
  "MEMORY",
  "POST_VARIANT",
  "TASK",
] as const;
export const activityLogEntityTypeSchema = z.enum(activityLogEntityTypeValues);
export type ActivityLogEntityType = z.infer<typeof activityLogEntityTypeSchema>;

export const activityLogSchema = z
  .object({
    id: entityIdSchema,
    action: activityLogActionSchema,
    entityType: activityLogEntityTypeSchema,
    entityId: entityIdSchema,
    createdAt: timestampSchema,
  })
  .strict();

export type ActivityLog = z.infer<typeof activityLogSchema>;

export const activityLogCursorSchema = z
  .object({
    createdAt: timestampSchema,
    id: entityIdSchema,
  })
  .strict();

export type ActivityLogCursor = z.infer<typeof activityLogCursorSchema>;

export const activityLogListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(30).optional(),
    cursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
  })
  .strict();

export type ActivityLogListQuery = z.infer<typeof activityLogListQuerySchema>;

export const activityLogPageSchema = z
  .object({
    items: z.array(activityLogSchema).max(30),
    nextCursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
  })
  .strict();

export const activityLogListResponseSchema = z
  .object({
    data: activityLogPageSchema,
  })
  .strict();

export type ActivityLogListResponse = z.infer<typeof activityLogListResponseSchema>;

const artistProfileTextSchema = z.string().trim().min(1).max(2_000);
const artistProfileListItemSchema = z.string().trim().min(1).max(240);
const artistProfileListSchema = z.array(artistProfileListItemSchema).max(60);

export const artistPlatformPreferenceSchema = z
  .object({
    preferredFormats: z.array(artistProfileListItemSchema).max(20).optional(),
    cadencePerWeek: z.number().int().min(0).max(31).optional(),
    notes: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const artistPlatformPreferencesSchema = z
  .record(z.string().trim().min(1).max(48), artistPlatformPreferenceSchema)
  .refine((preferences) => Object.keys(preferences).length <= 12, {
    message: "Le profil ne peut pas contenir plus de douze préférences de plateforme.",
  });

export const artistProfileSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema,
  identity: artistProfileTextSchema,
  genres: artistProfileListSchema.default([]),
  influences: artistProfileListSchema.default([]),
  tone: artistProfileTextSchema.optional(),
  preferredVocabulary: artistProfileListSchema.default([]),
  forbiddenVocabulary: artistProfileListSchema.default([]),
  goals: artistProfileListSchema.default([]),
  audience: artistProfileTextSchema.optional(),
  platformPreferences: artistPlatformPreferencesSchema.default({}),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type ArtistProfile = z.infer<typeof artistProfileSchema>;

export const artistProfileUpdateSchema = z
  .object({
    identity: artistProfileTextSchema.optional(),
    genres: artistProfileListSchema.optional(),
    influences: artistProfileListSchema.optional(),
    tone: artistProfileTextSchema.optional(),
    preferredVocabulary: artistProfileListSchema.optional(),
    forbiddenVocabulary: artistProfileListSchema.optional(),
    goals: artistProfileListSchema.optional(),
    audience: artistProfileTextSchema.optional(),
    platformPreferences: artistPlatformPreferencesSchema.optional(),
  })
  .strict()
  .refine((update) => Object.values(update).some((value) => value !== undefined), {
    message: "Au moins un champ éditable est requis pour mettre à jour l’Artist Brain.",
  });

export type ArtistProfileUpdate = z.infer<typeof artistProfileUpdateSchema>;

export const releaseStatusSchema = z.enum(["DRAFT", "SCHEDULED", "RELEASED", "ARCHIVED"]);
export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;

const releaseTitleSchema = z.string().trim().min(1).max(240);
const releaseTypeSchema = z.string().trim().min(1).max(80);
const releaseLabelSchema = z.string().trim().min(1).max(240);
const releaseTagSchema = z.string().trim().min(1).max(80);
const releaseTagsSchema = z.array(releaseTagSchema).max(30);
const releaseDescriptionSchema = z.string().trim().min(1).max(4_000);

export const releaseSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema,
  title: releaseTitleSchema,
  releaseType: releaseTypeSchema,
  releaseDate: z.string().date().optional(),
  label: releaseLabelSchema.optional(),
  status: releaseStatusSchema,
  description: releaseDescriptionSchema.optional(),
  links: z.array(z.string().url()).default([]),
  tags: releaseTagsSchema.default([]),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Release = z.infer<typeof releaseSchema>;

// Le projet et le workspace sont résolus par le backend. Cette première
// création de release n'accepte ni liens externes, ni associations de tracks
// ou médias : ces relations auront leurs propres transitions contrôlées.
export const releaseCreateSchema = z
  .object({
    title: releaseTitleSchema,
    releaseType: releaseTypeSchema,
    releaseDate: z.string().date().optional(),
    label: releaseLabelSchema.optional(),
    status: releaseStatusSchema,
    tags: releaseTagsSchema.default([]),
    description: releaseDescriptionSchema.optional(),
  })
  .strict();

export type ReleaseCreate = z.infer<typeof releaseCreateSchema>;

export const trackStatusSchema = z.enum(["DEMO", "UNRELEASED", "SCHEDULED", "RELEASED", "ARCHIVED"]);
export type TrackStatus = z.infer<typeof trackStatusSchema>;

const trackTitleSchema = z.string().trim().min(1).max(240);
const trackArtistCreditSchema = z.string().trim().min(1).max(240);
const trackGenreSchema = z.string().trim().min(1).max(120);
const trackMusicalKeySchema = z.string().trim().min(1).max(32);
const trackLabelSchema = z.string().trim().min(1).max(240);
const trackTagSchema = z.string().trim().min(1).max(80);
const trackTagsSchema = z.array(trackTagSchema).max(30);
const trackDescriptionSchema = z.string().trim().min(1).max(4_000);

export const trackSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema,
  releaseId: entityIdSchema.optional(),
  title: trackTitleSchema,
  artistCredit: trackArtistCreditSchema,
  genre: trackGenreSchema.optional(),
  bpm: z.number().positive().max(400).optional(),
  musicalKey: trackMusicalKeySchema.optional(),
  releaseDate: z.string().date().optional(),
  label: trackLabelSchema.optional(),
  status: trackStatusSchema,
  links: z.array(z.string().url()).default([]),
  tags: trackTagsSchema.default([]),
  description: trackDescriptionSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Track = z.infer<typeof trackSchema>;

// Le projet et le workspace sont résolus par le backend : le client ne peut
// pas les injecter dans une création de morceau.
export const trackCreateSchema = z
  .object({
    title: trackTitleSchema,
    artistCredit: trackArtistCreditSchema,
    genre: trackGenreSchema.optional(),
    bpm: z.number().finite().positive().max(400).optional(),
    musicalKey: trackMusicalKeySchema.optional(),
    releaseDate: z.string().date().optional(),
    label: trackLabelSchema.optional(),
    status: trackStatusSchema,
    tags: trackTagsSchema.default([]),
    description: trackDescriptionSchema.optional(),
  })
  .strict();

export type TrackCreate = z.infer<typeof trackCreateSchema>;

export const mediaTypeSchema = z.enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "OTHER"]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const mediaStatusSchema = z.enum(["UNUSED", "USED", "SCHEDULED", "PUBLISHED", "ARCHIVED"]);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

const mediaDescriptionSchema = z.string().trim().min(1).max(4_000);
const mediaTagSchema = z.string().trim().min(1).max(80);

// Les métadonnées multipart sont converties par l'API avant validation. Le
// fichier, son scope et ses associations ne font jamais partie de ce contrat
// client : ils sont traités ou résolus exclusivement côté serveur.
export const mediaImportSchema = z
  .object({
    description: mediaDescriptionSchema.optional(),
    tags: z.array(mediaTagSchema).max(30).default([]),
  })
  .strict();

export type MediaImport = z.infer<typeof mediaImportSchema>;

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
  tags: z.array(mediaTagSchema).default([]),
  description: mediaDescriptionSchema.optional(),
  status: mediaStatusSchema,
  usageCount: z.number().int().nonnegative().default(0),
  lastUsedAt: timestampSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type MediaAsset = z.infer<typeof mediaAssetSchema>;

// Ce contrat décrit uniquement les filtres de lecture de la bibliothèque. Le
// workspace, les associations et tout accès au stockage restent hors de la
// requête client et sont résolus par l'API.
export const mediaListQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(160).optional(),
    status: mediaStatusSchema.optional(),
    type: mediaTypeSchema.optional(),
    tag: z.string().trim().min(1).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;

// La rotation locale ne classe ni ne note les médias : elle ne propose que
// ceux qui sont UNUSED et sans aucun lien éditorial. Un lien, même incomplet,
// bloque le média de façon conservative jusqu'à une future vue explicative.
export const contentRotationCandidateSchema = z
  .object({
    id: entityIdSchema,
    filename: z.string().trim().min(1).max(255),
    type: mediaTypeSchema,
    description: mediaDescriptionSchema.optional(),
    tags: z.array(mediaTagSchema).max(30),
    createdAt: timestampSchema,
    state: z.literal("AVAILABLE"),
  })
  .strict();

export type ContentRotationCandidate = z.infer<typeof contentRotationCandidateSchema>;

export const contentRotationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(12).optional(),
  })
  .strict();

export type ContentRotationQuery = z.infer<typeof contentRotationQuerySchema>;

export const contentRotationResponseSchema = z
  .object({
    data: z
      .object({
        candidates: z.array(contentRotationCandidateSchema).max(12),
      })
      .strict(),
  })
  .strict();

export type ContentRotationResponse = z.infer<typeof contentRotationResponseSchema>;

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

const memoryContentSchema = z.string().trim().min(1).max(4_000);

export const memorySchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema.optional(),
  category: memoryCategorySchema,
  content: memoryContentSchema,
  state: memoryStateSchema,
  sourceMessageId: entityIdSchema.optional(),
  confirmedBy: entityIdSchema.optional(),
  confirmedAt: timestampSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Memory = z.infer<typeof memorySchema>;

// Une proposition de préférence ne peut pas choisir son état, sa catégorie,
// son workspace ou son acteur. Ces valeurs restent entièrement côté serveur.
export const memoryProposalCreateSchema = z
  .object({
    content: memoryContentSchema,
  })
  .strict();

export type MemoryProposalCreate = z.infer<typeof memoryProposalCreateSchema>;

// Les transitions confirm/reject sont matérialisées par leur route. Le corps
// doit donc rester vide, afin d'empêcher toute tentative de forcer un état ou
// un acteur depuis le client.
export const memoryDecisionRequestSchema = z.object({}).strict();

export const memoryDecisionParamsSchema = z
  .object({
    memoryId: entityIdSchema,
  })
  .strict();

export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

const taskTitleSchema = z.string().trim().min(1).max(240);
const taskDescriptionSchema = z.string().trim().min(1).max(4_000);

export const taskSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  title: taskTitleSchema,
  description: taskDescriptionSchema.optional(),
  status: taskStatusSchema,
  dueAt: timestampSchema.optional(),
  completedBy: entityIdSchema.optional(),
  completedAt: timestampSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Task = z.infer<typeof taskSchema>;

// Le client ne crée qu'une intention de tâche. Son périmètre, son état initial
// et son acteur restent décidés par le serveur.
export const taskCreateSchema = z
  .object({
    title: taskTitleSchema,
    description: taskDescriptionSchema.optional(),
    dueAt: timestampSchema.optional(),
  })
  .strict();

export type TaskCreate = z.infer<typeof taskCreateSchema>;

// La route /complete porte elle-même la transition. Un corps reste interdit
// pour empêcher l'injection d'un état, d'un workspace ou d'un acteur.
export const taskCompleteRequestSchema = z.object({}).strict();

export const taskCompleteParamsSchema = z
  .object({
    taskId: entityIdSchema,
  })
  .strict();

// Campaign Brief Registry --------------------------------------------------
//
// Le brief créatif et son lien facultatif vers une release restent deux
// contrats distincts. Les dates, piliers, contenus et transitions de campagne
// arriveront eux aussi par des sous-ressources dédiées, plutôt que comme champs
// libres dans la création.
export const campaignStatusSchema = z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

const campaignNameSchema = z.string().trim().min(1).max(240);
const campaignObjectiveSchema = z.string().trim().min(1).max(2_000);
const campaignVersionSchema = z.number().int().positive();

export const campaignSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  artistProjectId: entityIdSchema,
  name: campaignNameSchema,
  objective: campaignObjectiveSchema,
  status: campaignStatusSchema,
  releaseId: entityIdSchema.optional(),
  releaseTitle: z.string().trim().min(1).max(240).optional(),
  version: campaignVersionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type Campaign = z.infer<typeof campaignSchema>;

// Le client soumet seulement le brief. L'état initial DRAFT, le scope, le
// projet, l'acteur, les dates et l'identifiant sont toujours imposés côté
// serveur.
export const campaignCreateSchema = z
  .object({
    name: campaignNameSchema,
    objective: campaignObjectiveSchema,
  })
  .strict();

export type CampaignCreate = z.infer<typeof campaignCreateSchema>;

// Le rattachement est une mutation explicite et optimiste : le client indique
// la version du brief qu'il a lu. `null` ne signifie jamais une valeur absente
// implicite ; il demande explicitement de retirer le lien courant.
export const campaignReleaseLinkParamsSchema = z
  .object({
    campaignId: entityIdSchema,
  })
  .strict();

export const campaignReleaseLinkSchema = z
  .object({
    releaseId: entityIdSchema.nullable(),
    expectedVersion: campaignVersionSchema,
  })
  .strict();

export type CampaignReleaseLink = z.infer<typeof campaignReleaseLinkSchema>;

export const socialPlatformSchema = z.enum(["INSTAGRAM", "TIKTOK", "YOUTUBE", "FACEBOOK"]);
export type SocialPlatform = z.infer<typeof socialPlatformSchema>;

// Approval Center ----------------------------------------------------------
//
// Une approbation lie une décision humaine à une version exacte et stable
// d'une variante. Le client ne peut soumettre que les deux préconditions
// (approvalId + payloadHash) ; il ne transporte jamais l'acteur, l'état, le
// workspace ou le contenu qui sera décidé.
export const approvalStateSchema = z.enum(["REQUESTED", "APPROVED", "REJECTED", "INVALIDATED"]);
export type ApprovalState = z.infer<typeof approvalStateSchema>;

export const approvalQueueStateSchema = z.literal("REQUESTED");
export const approvalDecisionStateSchema = z.enum(["APPROVED", "REJECTED"]);

export const postDeliveryStateSchema = z.enum(["NOT_CONFIGURED"]);
export type PostDeliveryState = z.infer<typeof postDeliveryStateSchema>;

const postTitleSchema = z.string().trim().min(1).max(240);
const postCaptionSchema = z.string().trim().min(1).max(4_000);
const postHashtagSchema = z.string().trim().min(1).max(100);
const postCtaSchema = z.string().trim().min(1).max(500);
const postObjectiveSchema = z.string().trim().min(1).max(2_000);
const postRationaleSchema = z.string().trim().min(1).max(4_000);
const timezoneSchema = z.string().trim().min(1).max(120);

// Le préfixe rend le type de hash explicite et interdit des valeurs libres
// susceptibles d'être confondues avec un contenu ou une URL.
export const payloadHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const postVariantMediaSummarySchema = z.object({
  id: entityIdSchema,
  filename: z.string().trim().min(1).max(255),
  type: mediaTypeSchema,
  status: mediaStatusSchema,
});

export type PostVariantMediaSummary = z.infer<typeof postVariantMediaSummarySchema>;

export const approvalQueueItemSchema = z.object({
  approvalId: entityIdSchema,
  variantId: entityIdSchema,
  postId: entityIdSchema,
  postTitle: postTitleSchema,
  platform: socialPlatformSchema,
  media: z.array(postVariantMediaSummarySchema).max(20),
  caption: postCaptionSchema,
  hashtags: z.array(postHashtagSchema).max(30),
  cta: postCtaSchema.optional(),
  objective: postObjectiveSchema,
  rationale: postRationaleSchema.optional(),
  plannedAt: timestampSchema.optional(),
  timezone: timezoneSchema,
  payloadHash: payloadHashSchema,
  approvalState: approvalQueueStateSchema,
  deliveryState: postDeliveryStateSchema,
  requestedAt: timestampSchema,
});

export type ApprovalQueueItem = z.infer<typeof approvalQueueItemSchema>;

// Les deux routes humaines partagent ce corps strict. Ce sont uniquement des
// préconditions de concurrence : elles ne donnent aucun droit ni aucun état
// au client.
export const postVariantDecisionRequestSchema = z
  .object({
    approvalId: entityIdSchema,
    expectedPayloadHash: payloadHashSchema,
  })
  .strict();

export type PostVariantDecisionRequest = z.infer<typeof postVariantDecisionRequestSchema>;

export const postVariantDecisionParamsSchema = z
  .object({
    variantId: entityIdSchema,
  })
  .strict();

export const postVariantDecisionSchema = z.object({
  approvalId: entityIdSchema,
  variantId: entityIdSchema,
  approvalState: approvalDecisionStateSchema,
  deliveryState: postDeliveryStateSchema,
  payloadHash: payloadHashSchema,
  decidedAt: timestampSchema,
});

export type PostVariantDecision = z.infer<typeof postVariantDecisionSchema>;

// Calendrier éditorial et planification interne --------------------------------
//
// Une planification interne est un snapshot append-only de la variante
// approuvée. Elle ne constitue ni une publication, ni une livraison vers une
// plateforme : le contrat ne transporte donc aucun compte, média, caption ou
// secret de connecteur.
export const calendarViewSchema = z.enum(["DAY", "WEEK", "MONTH"]);
export type CalendarView = z.infer<typeof calendarViewSchema>;

export const calendarQuerySchema = z
  .object({
    view: calendarViewSchema.optional(),
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
  })
  .strict()
  .refine((query) => (query.from === undefined) === (query.to === undefined), {
    message: "Les bornes from et to doivent être fournies ensemble.",
  });

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export const calendarRangeSchema = z.object({
  view: calendarViewSchema,
  from: timestampSchema,
  to: timestampSchema,
  timezone: timezoneSchema,
});

export type CalendarRange = z.infer<typeof calendarRangeSchema>;

export const calendarItemKindSchema = z.enum(["INTERNAL_SCHEDULE", "APPROVED_VARIANT"]);
export type CalendarItemKind = z.infer<typeof calendarItemKindSchema>;

export const calendarItemStateSchema = z.enum(["SCHEDULED_INTERNAL", "READY_TO_SCHEDULE"]);
export type CalendarItemState = z.infer<typeof calendarItemStateSchema>;

// Projection volontairement réduite : elle permet de rendre le calendrier
// sans rendre à nouveau accessible le payload qui a été approuvé.
export const calendarItemSchema = z.object({
  id: entityIdSchema,
  kind: calendarItemKindSchema,
  variantId: entityIdSchema,
  postId: entityIdSchema,
  postTitle: postTitleSchema,
  platform: socialPlatformSchema,
  scheduledAt: timestampSchema,
  timezone: timezoneSchema,
  state: calendarItemStateSchema,
  approvalId: entityIdSchema,
  payloadHash: payloadHashSchema,
});

export type CalendarItem = z.infer<typeof calendarItemSchema>;

export const calendarDataSchema = z.object({
  range: calendarRangeSchema,
  items: z.array(calendarItemSchema).max(200),
});

export const calendarResponseSchema = z.object({
  data: calendarDataSchema,
});

export type CalendarResponse = z.infer<typeof calendarResponseSchema>;

// La route de planification n'accepte que les deux préconditions déjà liées
// à l'approbation. Date, fuseau, plateforme, acteur et état sont dérivés du
// snapshot résolu côté serveur.
export const postVariantInternalScheduleRequestSchema = z
  .object({
    approvalId: entityIdSchema,
    expectedPayloadHash: payloadHashSchema,
  })
  .strict();

export type PostVariantInternalScheduleRequest = z.infer<typeof postVariantInternalScheduleRequestSchema>;

export const internalPostScheduleStateSchema = z.enum(["SCHEDULED", "CANCELLED"]);
export type InternalPostScheduleState = z.infer<typeof internalPostScheduleStateSchema>;

export const internalPostScheduleSchema = z.object({
  id: entityIdSchema,
  variantId: entityIdSchema,
  postId: entityIdSchema,
  platform: socialPlatformSchema,
  scheduledAt: timestampSchema,
  timezone: timezoneSchema,
  state: internalPostScheduleStateSchema,
  approvalId: entityIdSchema,
  payloadHash: payloadHashSchema,
  deliveryState: postDeliveryStateSchema,
});

export type InternalPostSchedule = z.infer<typeof internalPostScheduleSchema>;

// La transition vers CANCELLED est portée par sa route. Le client ne peut ni
// sélectionner l'acteur, ni réécrire le snapshot, ni injecter un état.
export const internalPostScheduleCancelRequestSchema = z.object({}).strict();

export const internalPostScheduleCancelParamsSchema = z
  .object({
    scheduleId: entityIdSchema,
  })
  .strict();

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

export const idaCommandMessageSchema = z.string().trim().min(1).max(4_000);

export const idaCommandInputSchema = z.object({
  workspaceId: entityIdSchema,
  message: idaCommandMessageSchema,
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

// Historique local des commandes ------------------------------------------
//
// Une commande terminée peut être rejouée dans l'interface depuis le même
// workspace. Ce registre ne représente pas encore une conversation générale
// et ne contient ni résultat d'outil, ni trace de modèle, ni paramètres, ni
// payload externe. Il ne crée jamais de mémoire durable par lui-même.
export const idaCommandRunSchema = z
  .object({
    id: entityIdSchema,
    intent: idaCommandIntentSchema,
    state: idaCommandStateSchema,
    requestedPermission: permissionLevelSchema,
    message: idaCommandMessageSchema,
    responseMessage: z.string().trim().min(1).max(4_000),
    createdAt: timestampSchema,
  })
  .strict();

export type IdaCommandRun = z.infer<typeof idaCommandRunSchema>;

export const idaCommandRunCursorSchema = z
  .object({
    createdAt: timestampSchema,
    id: entityIdSchema,
  })
  .strict();

export type IdaCommandRunCursor = z.infer<typeof idaCommandRunCursorSchema>;

export const idaCommandRunListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(30).optional(),
    cursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
  })
  .strict();

export type IdaCommandRunListQuery = z.infer<typeof idaCommandRunListQuerySchema>;

export const idaCommandRunPageSchema = z
  .object({
    items: z.array(idaCommandRunSchema).max(30),
    nextCursor: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
  })
  .strict();

export const idaCommandRunListResponseSchema = z
  .object({
    data: idaCommandRunPageSchema,
  })
  .strict();

export type IdaCommandRunListResponse = z.infer<typeof idaCommandRunListResponseSchema>;

export const explicitApprovalSchema = z.object({
  approvalId: entityIdSchema,
  approvedBy: entityIdSchema,
  approvedAt: timestampSchema,
});

export type ExplicitApproval = z.infer<typeof explicitApprovalSchema>;
