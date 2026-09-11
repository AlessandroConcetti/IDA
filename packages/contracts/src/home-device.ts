import { z } from "zod";

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
export type HomeDeviceResult = z.infer<typeof homeDeviceResultSchema>;
