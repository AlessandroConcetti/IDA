import { z } from "zod";

/** Métadonnées locales uniquement : aucune connexion ni validation du token. */
export const homeDevicePrerequisitesSchema = z
  .object({
    configuration: z.enum(["CONFIGURED", "REQUIRED", "INVALID"]),
    tls: z.enum(["CONFIGURED", "REQUIRED"]),
    target: z.enum(["CONFIGURED", "REQUIRED"]),
    credential: z.enum(["STORED", "MISSING", "UNAVAILABLE", "NOT_CHECKED"]),
    verification: z.literal("NOT_PERFORMED"),
  })
  .strict();

export const homeDeviceStatusSchema = z
  .object({
    provider: z.literal("HOME_ASSISTANT"),
    mode: z.literal("READ_ONLY_PILOT"),
    state: z.enum([
      "DISABLED",
      "CONNECTION_REQUIRED",
      "TLS_REQUIRED",
      "TARGET_REQUIRED",
      "SECRET_REQUIRED",
      "CONFIGURED",
    ]),
    // Facultatif pour accepter les statuts d'un serveur antérieur pendant mise à jour.
    prerequisites: homeDevicePrerequisitesSchema.optional(),
  })
  .strict();
export const homeDeviceReadSchema = z.object({ consent: z.literal(true) }).strict();
export const homeDeviceResultSchema = z
  .object({
    state: z.enum(["ON", "OFF", "UNKNOWN", "UNAVAILABLE"]),
    observedAt: z.iso.datetime({ offset: true }),
    providerUpdatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type HomeDeviceStatus = z.infer<typeof homeDeviceStatusSchema>;
export type HomeDevicePrerequisites = z.infer<typeof homeDevicePrerequisitesSchema>;
export type HomeDeviceResult = z.infer<typeof homeDeviceResultSchema>;
