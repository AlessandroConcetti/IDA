import { z } from "zod";
import { agentContextSourceSchema, agentKeySchema, idaCommandIntentSchema } from "./index.js";
import { aiDataClassSchema } from "./intelligence.js";

// Clés de la Roue existante. "workspace" est un environnement, pas workspaceId.
export const environmentKeySchema = z.enum([
  "travel",
  "workspace",
  "music",
  "creative",
  "social",
  "finance",
  "research",
  "admin",
  "legal",
  "health",
  "home",
  "idacar",
]);
export type EnvironmentKey = z.infer<typeof environmentKeySchema>;
const version = z.string().regex(/^\d+\.\d+\.\d+$/u);
const modelReference = z
  .object({
    providerKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/u),
    modelId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/u),
  })
  .strict();

export const environmentBrainProfileSchema = z
  .object({
    environmentKey: environmentKeySchema,
    version,
    status: z.enum(["PLANNED", "ACTIVE", "DISABLED"]),
    // Un rôle prévu n'est jamais un agent enregistré ni un droit d'exécution.
    plannedRoles: z.array(z.string().trim().min(1).max(100)).min(1).max(16),
    agentKeys: z.array(agentKeySchema).max(32),
    contextSources: z.array(agentContextSourceSchema).max(12),
    acceptedDataClasses: z
      .array(aiDataClassSchema.exclude(["SECRET"]))
      .min(1)
      .max(4),
    modelPolicy: z
      .object({
        mode: z.enum(["LOCAL_ONLY", "LOCAL_FIRST"]),
        allowedModels: z.array(modelReference).max(32),
        maxCostMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      })
      .strict(),
    memoryPolicy: z.literal("CONFIRMED_ONLY"),
    improvementPolicy: z.literal("HUMAN_REVIEWED"),
  })
  .strict()
  .superRefine((profile, context) => {
    if (
      new Set(profile.agentKeys).size !== profile.agentKeys.length ||
      new Set(profile.modelPolicy.allowedModels.map((model) => `${model.providerKey}\0${model.modelId}`)).size !==
        profile.modelPolicy.allowedModels.length
    ) {
      context.addIssue({ code: "custom", message: "Les références doivent être uniques." });
    }
    if (profile.status === "ACTIVE" && (!profile.agentKeys.length || !profile.modelPolicy.allowedModels.length)) {
      context.addIssue({
        code: "custom",
        message: "Un profil actif exige un agent et un modèle explicitement référencés.",
      });
    }
    if (profile.modelPolicy.mode === "LOCAL_ONLY" && profile.modelPolicy.maxCostMicros !== 0) {
      context.addIssue({ code: "custom", message: "Le profil local strict interdit un budget API payant." });
    }
  });
export type EnvironmentBrainProfile = z.infer<typeof environmentBrainProfileSchema>;

// Décrit le contexte composé par le serveur ; ne remplace pas le Context Broker.
export const environmentInvocationSchema = z
  .object({
    environmentKey: environmentKeySchema,
    profileVersion: version,
    agentKey: agentKeySchema,
    intent: idaCommandIntentSchema,
    contextSources: z.array(agentContextSourceSchema).max(12),
  })
  .strict();
export type EnvironmentInvocation = z.infer<typeof environmentInvocationSchema>;
