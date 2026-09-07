import { z } from "zod";

const key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/u);
const id = z.string().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const nonNegative = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const aiDataClassSchema = z.enum(["PUBLIC", "INTERNAL", "PRIVATE_CREATIVE", "SENSITIVE_PERSONAL", "SECRET"]);
export const intelligenceScopeSchema = z
  .object({
    userId: id,
    workspaceId: id,
    sessionId: id,
    clientInstanceId: id,
  })
  .strict();
export const intelligencePurposeSchema = z.enum(["ASSISTANT_REPLY", "CONTENT_DRAFT"]);
export const modelCapabilitySchema = z.enum(["TEXT", "REASONING"]);

// Métadonnées revues côté serveur. Aucun endpoint, secret ou code exécutable.
export const aiProviderManifestSchema = z
  .object({
    key,
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    category: z.literal("LLM"),
    locality: z.enum(["LOCAL", "CLOUD"]),
    retention: z.enum(["LOCAL_ONLY", "REVIEWED_CLOUD", "UNKNOWN"]),
    acceptedDataClasses: z.array(aiDataClassSchema.exclude(["SECRET"])).min(1),
    models: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u),
            capabilities: z.array(modelCapabilitySchema).min(1),
            maxComplexity: z.number().int().min(1).max(3),
            maxInputChars: z.number().int().min(1).max(32_000),
            maxOutputTokens: z.number().int().min(1).max(8192),
            // Estimations pour l'enveloppe ci-dessus, jamais des tarifs live certifiés.
            estimatedCostMicros: nonNegative.nullable(),
            estimatedLatencyMs: z.number().int().positive().max(120_000).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict();

export const aiProviderStateSchema = z
  .object({
    enabled: z.boolean(),
    configured: z.boolean(),
    availability: z.enum(["UNKNOWN", "READY", "UNAVAILABLE"]),
    validUntil: timestamp,
    // Allocation serveur consommée avant chaque tentative, même en cas d'échec.
    // Ce n'est pas le solde de crédits du fournisseur.
    remainingCalls: nonNegative,
  })
  .strict();

export const intelligenceRequestSchema = z
  .object({
    scope: intelligenceScopeSchema,
    purpose: intelligencePurposeSchema,
    prompt: z.string().trim().min(1).max(32_000),
    dataClasses: z.array(aiDataClassSchema).min(1).max(5),
    capabilities: z.array(modelCapabilitySchema).min(1).max(2),
    complexity: z.number().int().min(1).max(3),
    maxOutputTokens: z.number().int().min(1).max(8192),
  })
  .strict();

// Contrat interne : résolu par l'autorité serveur, jamais depuis le body HTTP.
export const intelligencePolicySchema = z
  .object({
    mode: z.enum(["NORMAL", "AI"]),
    allowedProviderKeys: z.array(key).max(32),
    localFirst: z.boolean(),
    preferredProviderKey: key.optional(),
    maxAttempts: z.number().int().min(1).max(3),
    maxCostMicros: nonNegative,
    maxLatencyMs: z.number().int().positive().max(120_000),
    cloudConsents: z
      .array(
        z
          .object({
            scope: intelligenceScopeSchema,
            providerKey: key,
            purpose: intelligencePurposeSchema,
            dataClasses: z.array(aiDataClassSchema.exclude(["SECRET"])).min(1),
            expiresAt: timestamp,
          })
          .strict(),
      )
      .max(32),
  })
  .strict();

export const intelligenceTextSchema = z.object({ text: z.string().trim().min(1).max(65_536) }).strict();

export type IntelligenceScope = z.infer<typeof intelligenceScopeSchema>;
export type IntelligenceRequest = z.infer<typeof intelligenceRequestSchema>;
export type IntelligencePolicy = z.infer<typeof intelligencePolicySchema>;
export type AIProviderManifest = z.infer<typeof aiProviderManifestSchema>;
export type AIProviderState = z.infer<typeof aiProviderStateSchema>;
export type IntelligenceText = z.infer<typeof intelligenceTextSchema>;
