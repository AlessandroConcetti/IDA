import { z } from "zod";
import { environmentKeySchema } from "./environment-brains.js";
import { agentKeySchema } from "./index.js";
import {
  aiDataClassSchema,
  aiProviderManifestSchema,
  intelligenceErrorCodes,
  intelligencePurposeSchema,
  intelligenceScopeSchema,
} from "./intelligence.js";

export const intelligenceAuditOutcomes = ["ATTEMPT", "SUCCEEDED", ...intelligenceErrorCodes] as const;
const common = { runId: z.string().uuid(), scope: intelligenceScopeSchema };
export const musicContextAuditSchema = z
  .object({
    ...common,
    environmentKey: z.literal("music"),
    agentKey: z.literal("agent_music_librarian"),
    intent: z.enum(["SEARCH_TRACK", "SEARCH_MEDIA"]),
    outcome: z.enum(["ATTEMPT", "SUCCEEDED", "DENIED"]),
  })
  .strict();
export const intelligenceAuditSchema = z
  .object({
    ...common,
    purpose: intelligencePurposeSchema,
    providerKey: aiProviderManifestSchema.shape.key,
    modelId: aiProviderManifestSchema.shape.models.element.shape.id.refine((value) => !value.includes("://")),
    locality: aiProviderManifestSchema.shape.locality,
    manifestVersion: aiProviderManifestSchema.shape.version.max(32),
    dataClasses: z
      .array(aiDataClassSchema)
      .min(1)
      .max(4)
      .refine((values) => !values.includes("SECRET") && new Set(values).size === values.length),
    attempt: z.number().int().min(1).max(3),
    estimatedCostMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    outcome: z.enum(intelligenceAuditOutcomes),
  })
  .strict();
export const environmentIntelligenceAuditSchema = intelligenceAuditSchema
  .extend({
    environmentKey: environmentKeySchema,
    agentKey: agentKeySchema.max(80),
    profileVersion: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/u)
      .max(32),
  })
  .strict();

export type IntelligenceAudit = z.infer<typeof intelligenceAuditSchema>;
export type MusicContextAudit = z.infer<typeof musicContextAuditSchema>;
export type EnvironmentIntelligenceAudit = z.infer<typeof environmentIntelligenceAuditSchema>;
