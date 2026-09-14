import { z } from "zod";
import { freeQuotaObservationSchema, intelligenceErrorCodes } from "./intelligence.js";

export const networkCapabilitySchema = z.enum([
  "TEXT",
  "REASONING",
  "CODE",
  "STRUCTURED_OUTPUT",
  "TOOL_CALLING",
  "LONG_CONTEXT",
  "VISION",
  "EMBEDDINGS",
  "IMAGE_GENERATION",
  "AUDIO",
  "STT",
  "TTS",
]);
export const networkStatusSchema = z.enum([
  "AVAILABLE_FREE",
  "AVAILABLE_PAID",
  "QUOTA_EXCEEDED",
  "NOT_CONFIGURED",
  "UNAVAILABLE",
  "BLOCKED",
  "UNKNOWN",
]);
export const networkProviderSchema = z
  .object({
    key: z.string().min(1).max(64),
    name: z.string().min(1).max(100),
    model: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    lifecycle: z.enum(["REGISTERED", "PREPARED", "NEEDS_REVIEW"]),
    status: networkStatusSchema,
    locality: z.enum(["LOCAL", "CLOUD", "CODING_TOOL"]),
    cost: z.enum(["LOCAL", "FREE_LIMITED", "PAID", "UNKNOWN", "BLOCKED"]),
    freeTier: z.enum(["CONDITIONAL", "NONE", "UNKNOWN", "NOT_APPLICABLE"]),
    capabilities: z.array(networkCapabilitySchema).max(12),
    privacy: z.string().min(1).max(500),
    conditions: z.string().min(1).max(1200),
    allocationRemaining: z.number().int().nonnegative().nullable(),
    quota: freeQuotaObservationSchema.nullable(),
    estimatedCostMicros: z.number().int().nonnegative().nullable(),
    latencyMs: z.number().int().nonnegative().nullable(),
    lastSuccess: z.string().datetime({ offset: true }).nullable(),
    lastError: z.enum(intelligenceErrorCodes).nullable(),
    verifiedAt: z.string().date().nullable(),
    sources: z.array(z.url().startsWith("https://")).max(10),
  })
  .strict();
export const intelligenceNetworkResponseSchema = z
  .object({
    data: z
      .object({
        generatedAt: z.string().datetime({ offset: true }),
        policy: z.literal("LOCAL_FIRST_FREE_ONLY_NO_AUTO_PAYMENT"),
        providers: z.array(networkProviderSchema).max(128),
        tasks: z
          .array(
            z
              .object({
                task: z.string().min(1).max(100),
                requires: z.array(networkCapabilitySchema).min(1).max(12),
                availableModels: z.array(z.string().max(250)).max(128),
                transport: z.enum(["TEXT_READY", "PREPARED"]),
              })
              .strict(),
          )
          .max(32),
      })
      .strict(),
  })
  .strict();
export type NetworkProvider = z.infer<typeof networkProviderSchema>;
export type IntelligenceNetwork = z.infer<typeof intelligenceNetworkResponseSchema>["data"];
