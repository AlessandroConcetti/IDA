import {
  type ClientAccessLevel,
  type MembershipRole,
  type PermissionLevel,
  permissionLevelSchema,
  type RequestIdentityContext,
  requestIdentityContextSchema,
  stepUpActionHashSchema,
} from "@ida/contracts";

const defaultStepUpMaxAgeMs = 5 * 60 * 1_000;

const membershipPermissions = {
  OWNER: ["READ", "WRITE", "APPROVAL_REQUIRED", "PUBLISH", "SYSTEM"],
  EDITOR: ["READ", "WRITE"],
  VIEWER: ["READ"],
} as const satisfies Record<MembershipRole, readonly PermissionLevel[]>;

const clientPermissions = {
  TRUSTED: ["READ", "WRITE", "APPROVAL_REQUIRED", "PUBLISH", "SYSTEM"],
  LIMITED: ["READ", "WRITE"],
  VIEW_ONLY: ["READ"],
} as const satisfies Record<ClientAccessLevel, readonly PermissionLevel[]>;

export interface IdentityAuthorizationRequest {
  readonly context: RequestIdentityContext;
  readonly permission: PermissionLevel;
  readonly now: Date;
  readonly requiresStepUp?: boolean;
  readonly requiredStepUpActionHash?: string;
  readonly stepUpMaxAgeMs?: number;
}

export type IdentityPolicyDenialCode =
  | "SESSION_NOT_ACTIVE"
  | "SESSION_NOT_YET_VALID"
  | "SESSION_EXPIRED"
  | "CLIENT_INSTANCE_NOT_ACTIVE"
  | "CLIENT_GRANT_NOT_ACTIVE"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "MEMBERSHIP_PERMISSION_DENIED"
  | "CLIENT_PERMISSION_DENIED"
  | "STEP_UP_REQUIRED";

export type IdentityPolicyDecision =
  | {
      readonly allowed: true;
      readonly reason: string;
      readonly context: RequestIdentityContext;
    }
  | {
      readonly allowed: false;
      readonly code: IdentityPolicyDenialCode;
      readonly reason: string;
    };

export class IdentityPolicyError extends Error {
  readonly code: IdentityPolicyDenialCode;

  constructor(code: IdentityPolicyDenialCode, message: string) {
    super(message);
    this.name = "IdentityPolicyError";
    this.code = code;
  }
}

function includesPermission(permissions: readonly PermissionLevel[], permission: PermissionLevel): boolean {
  return permissions.includes(permission);
}

export class IdentityAccessPolicy {
  evaluate(request: IdentityAuthorizationRequest): IdentityPolicyDecision {
    const context = requestIdentityContextSchema.parse(request.context);
    const permission = permissionLevelSchema.parse(request.permission);
    const nowMs = request.now.getTime();

    if (!Number.isFinite(nowMs)) {
      throw new TypeError("L'instant serveur de contrôle Identity est invalide.");
    }

    if (context.session.status !== "ACTIVE") {
      return { allowed: false, code: "SESSION_NOT_ACTIVE", reason: "La session a été révoquée." };
    }

    const issuedAtMs = Date.parse(context.session.issuedAt);
    const expiresAtMs = Date.parse(context.session.expiresAt);

    if (issuedAtMs > nowMs) {
      return {
        allowed: false,
        code: "SESSION_NOT_YET_VALID",
        reason: "La session n'est pas encore valide.",
      };
    }

    if (expiresAtMs <= nowMs) {
      return { allowed: false, code: "SESSION_EXPIRED", reason: "La session a expiré." };
    }

    if (context.clientInstance.status !== "ACTIVE") {
      return {
        allowed: false,
        code: "CLIENT_INSTANCE_NOT_ACTIVE",
        reason: "Cette instance cliente n'est pas autorisée.",
      };
    }

    if (context.membership.status !== "ACTIVE") {
      return {
        allowed: false,
        code: "MEMBERSHIP_NOT_ACTIVE",
        reason: "L'accès de l'utilisateur à ce workspace n'est pas actif.",
      };
    }

    if (context.clientGrant.status !== "ACTIVE") {
      return {
        allowed: false,
        code: "CLIENT_GRANT_NOT_ACTIVE",
        reason: "L'accès de cette instance au workspace n'est pas actif.",
      };
    }

    if (!includesPermission(membershipPermissions[context.membership.role], permission)) {
      return {
        allowed: false,
        code: "MEMBERSHIP_PERMISSION_DENIED",
        reason: `Le rôle ${context.membership.role} ne permet pas ${permission}.`,
      };
    }

    if (!includesPermission(clientPermissions[context.clientGrant.accessLevel], permission)) {
      return {
        allowed: false,
        code: "CLIENT_PERMISSION_DENIED",
        reason: `L'instance ${context.clientGrant.accessLevel} ne permet pas ${permission}.`,
      };
    }

    const requiresStepUp = request.requiresStepUp === true || permission === "PUBLISH" || permission === "SYSTEM";

    if (requiresStepUp) {
      const maxAgeMs = request.stepUpMaxAgeMs ?? defaultStepUpMaxAgeMs;

      if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
        throw new RangeError("La durée de validité de la réauthentification doit être positive.");
      }

      const requiredActionHash = stepUpActionHashSchema.safeParse(request.requiredStepUpActionHash);
      const stepUpAtMs =
        context.session.stepUp === undefined ? Number.NaN : Date.parse(context.session.stepUp.verifiedAt);

      if (
        !requiredActionHash.success ||
        context.session.stepUp?.actionHash !== requiredActionHash.data ||
        !Number.isFinite(stepUpAtMs) ||
        stepUpAtMs > nowMs ||
        nowMs - stepUpAtMs > maxAgeMs
      ) {
        return {
          allowed: false,
          code: "STEP_UP_REQUIRED",
          reason: "Une réauthentification récente est requise pour cette action.",
        };
      }
    }

    return {
      allowed: true,
      reason: "Contexte Identity accepté ; le Tool Gateway doit encore autoriser l'outil.",
      context,
    };
  }

  assertAuthorized(request: IdentityAuthorizationRequest): RequestIdentityContext {
    const decision = this.evaluate(request);

    if (!decision.allowed) {
      throw new IdentityPolicyError(decision.code, decision.reason);
    }

    return decision.context;
  }
}
