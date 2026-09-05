import { z } from "zod";

const identityIdSchema = z.string().trim().min(1).max(200);
const identityTimestampSchema = z.string().datetime({ offset: true });

export const membershipRoleValues = ["OWNER", "EDITOR", "VIEWER"] as const;
export const membershipRoleSchema = z.enum(membershipRoleValues);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const identityUserStatusValues = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;
export const identityUserStatusSchema = z.enum(identityUserStatusValues);
export type IdentityUserStatus = z.infer<typeof identityUserStatusSchema>;

export const membershipStatusValues = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;
export const membershipStatusSchema = z.enum(membershipStatusValues);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const clientKindValues = ["WEB_BROWSER", "PWA", "NATIVE_DESKTOP", "NATIVE_MOBILE", "TV"] as const;
export const clientKindSchema = z.enum(clientKindValues);
export type ClientKind = z.infer<typeof clientKindSchema>;

export const devicePlatformValues = ["WINDOWS", "MACOS", "LINUX", "IOS", "ANDROID", "TV", "OTHER"] as const;
export const devicePlatformSchema = z.enum(devicePlatformValues);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

export const clientInstanceStatusValues = ["PENDING", "ACTIVE", "REVOKED"] as const;
export const clientInstanceStatusSchema = z.enum(clientInstanceStatusValues);
export type ClientInstanceStatus = z.infer<typeof clientInstanceStatusSchema>;

export const clientGrantStatusValues = ["ACTIVE", "REVOKED"] as const;
export const clientGrantStatusSchema = z.enum(clientGrantStatusValues);
export type ClientGrantStatus = z.infer<typeof clientGrantStatusSchema>;

export const clientAccessLevelValues = ["TRUSTED", "LIMITED", "VIEW_ONLY"] as const;
export const clientAccessLevelSchema = z.enum(clientAccessLevelValues);
export type ClientAccessLevel = z.infer<typeof clientAccessLevelSchema>;

export const identitySessionStatusValues = ["ACTIVE", "REVOKED"] as const;
export const identitySessionStatusSchema = z.enum(identitySessionStatusValues);
export type IdentitySessionStatus = z.infer<typeof identitySessionStatusSchema>;

export const stepUpActionHashSchema = z.string().regex(/^[a-f0-9]{64}$/u, {
  message: "Le hash d'action doit être un SHA-256 hexadécimal canonique.",
});

export const clientInstanceSchema = z
  .object({
    id: identityIdSchema,
    userId: identityIdSchema,
    kind: clientKindSchema,
    platform: devicePlatformSchema,
    status: clientInstanceStatusSchema,
  })
  .strict();

export type ClientInstance = z.infer<typeof clientInstanceSchema>;

export const clientWorkspaceGrantSchema = z
  .object({
    clientInstanceId: identityIdSchema,
    workspaceId: identityIdSchema,
    status: clientGrantStatusSchema,
    accessLevel: clientAccessLevelSchema,
  })
  .strict();

export type ClientWorkspaceGrant = z.infer<typeof clientWorkspaceGrantSchema>;

export const stepUpProofSchema = z
  .object({
    verifiedAt: identityTimestampSchema,
    workspaceId: identityIdSchema,
    clientInstanceId: identityIdSchema,
    sessionId: identityIdSchema,
    // Hash canonique calculé côté serveur sur l'action et son payload exact.
    actionHash: stepUpActionHashSchema,
  })
  .strict();

export type StepUpProof = z.infer<typeof stepUpProofSchema>;

export const identitySessionSchema = z
  .object({
    id: identityIdSchema,
    userId: identityIdSchema,
    clientInstanceId: identityIdSchema,
    status: identitySessionStatusSchema,
    issuedAt: identityTimestampSchema,
    expiresAt: identityTimestampSchema,
    stepUp: stepUpProofSchema.optional(),
  })
  .strict()
  .superRefine((session, context) => {
    const issuedAt = Date.parse(session.issuedAt);
    const expiresAt = Date.parse(session.expiresAt);

    if (expiresAt <= issuedAt) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "La session doit expirer après son émission.",
      });
    }

    if (session.stepUp !== undefined) {
      const stepUpAt = Date.parse(session.stepUp.verifiedAt);

      if (stepUpAt < issuedAt || stepUpAt > expiresAt) {
        context.addIssue({
          code: "custom",
          path: ["stepUp", "verifiedAt"],
          message: "La réauthentification doit appartenir à la durée de vie de la session.",
        });
      }

      if (session.stepUp.sessionId !== session.id) {
        context.addIssue({
          code: "custom",
          path: ["stepUp", "sessionId"],
          message: "La réauthentification appartient à une autre session.",
        });
      }

      if (session.stepUp.clientInstanceId !== session.clientInstanceId) {
        context.addIssue({
          code: "custom",
          path: ["stepUp", "clientInstanceId"],
          message: "La réauthentification appartient à une autre instance.",
        });
      }
    }
  });

export type IdentitySession = z.infer<typeof identitySessionSchema>;

// Ce contexte est construit exclusivement côté serveur après vérification de
// la session. Un navigateur, une PWA et une app native sur le même téléphone
// utilisent des clientInstance/session distincts et révocables séparément.
export const requestIdentityContextSchema = z
  .object({
    userId: identityIdSchema,
    userStatus: identityUserStatusSchema,
    workspaceId: identityIdSchema,
    membership: z
      .object({
        userId: identityIdSchema,
        workspaceId: identityIdSchema,
        role: membershipRoleSchema,
        status: membershipStatusSchema,
      })
      .strict(),
    clientInstance: clientInstanceSchema,
    clientGrant: clientWorkspaceGrantSchema,
    session: identitySessionSchema,
  })
  .strict()
  .superRefine((identity, context) => {
    const mismatches: Array<{ path: (string | number)[]; message: string }> = [];

    if (identity.membership.userId !== identity.userId) {
      mismatches.push({ path: ["membership", "userId"], message: "La membership appartient à un autre utilisateur." });
    }
    if (identity.membership.workspaceId !== identity.workspaceId) {
      mismatches.push({
        path: ["membership", "workspaceId"],
        message: "La membership appartient à un autre workspace.",
      });
    }
    if (identity.clientInstance.userId !== identity.userId) {
      mismatches.push({ path: ["clientInstance", "userId"], message: "L'instance appartient à un autre utilisateur." });
    }
    if (identity.clientGrant.clientInstanceId !== identity.clientInstance.id) {
      mismatches.push({
        path: ["clientGrant", "clientInstanceId"],
        message: "Le grant appartient à une autre instance.",
      });
    }
    if (identity.clientGrant.workspaceId !== identity.workspaceId) {
      mismatches.push({ path: ["clientGrant", "workspaceId"], message: "Le grant appartient à un autre workspace." });
    }
    if (identity.session.userId !== identity.userId) {
      mismatches.push({ path: ["session", "userId"], message: "La session appartient à un autre utilisateur." });
    }
    if (identity.session.clientInstanceId !== identity.clientInstance.id) {
      mismatches.push({
        path: ["session", "clientInstanceId"],
        message: "La session appartient à une autre instance.",
      });
    }
    if (
      identity.session.stepUp?.workspaceId !== undefined &&
      identity.session.stepUp.workspaceId !== identity.workspaceId
    ) {
      mismatches.push({
        path: ["session", "stepUp", "workspaceId"],
        message: "La réauthentification appartient à un autre workspace.",
      });
    }

    for (const mismatch of mismatches) {
      context.addIssue({ code: "custom", path: mismatch.path, message: mismatch.message });
    }
  });

export type RequestIdentityContext = z.infer<typeof requestIdentityContextSchema>;

// Verrou local propriétaire ------------------------------------------------
//
// Ces contrats ne créent ni compte cloud ni Device Linking. La passphrase ne
// quitte le corps de setup/unlock que pour être dérivée côté serveur et ne doit
// jamais apparaître dans une réponse, un log ou une mémoire.
export const localPassphraseSchema = z.string().min(15).max(1_024);

export const localAuthCredentialRequestSchema = z
  .object({
    passphrase: localPassphraseSchema,
  })
  .strict();

export type LocalAuthCredentialRequest = z.infer<typeof localAuthCredentialRequestSchema>;

export const localAuthStateValues = ["UNINITIALIZED", "LOCKED", "UNLOCKED"] as const;
export const localAuthStateSchema = z.enum(localAuthStateValues);
export type LocalAuthState = z.infer<typeof localAuthStateSchema>;

export const localAuthStatusSchema = z
  .object({
    mode: z.literal("LOCAL_LOCK"),
    state: localAuthStateSchema,
    sessionExpiresAt: identityTimestampSchema.optional(),
  })
  .strict();

export type LocalAuthStatus = z.infer<typeof localAuthStatusSchema>;

export const localAuthStatusResponseSchema = z
  .object({
    data: localAuthStatusSchema,
  })
  .strict();

export type LocalAuthStatusResponse = z.infer<typeof localAuthStatusResponseSchema>;
