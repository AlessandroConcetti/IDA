import {
  type ExplicitApproval,
  explicitApprovalSchema,
  type ModuleKey,
  moduleKeySchema,
  type PermissionLevel,
  permissionLevelSchema,
} from "@ida/contracts";

export interface ToolAuthorizationRequest {
  readonly toolKey: string;
  readonly moduleKey: ModuleKey;
  readonly permission: PermissionLevel;
  readonly explicitApproval?: ExplicitApproval;
}

export type ToolPolicyDenialCode = "APPROVAL_REQUIRED" | "SYSTEM_POLICY_REQUIRED";

export type ToolPolicyDecision =
  | { readonly allowed: true; readonly reason: string }
  | { readonly allowed: false; readonly code: ToolPolicyDenialCode; readonly reason: string };

export class ToolPolicyError extends Error {
  readonly code: ToolPolicyDenialCode;

  constructor(code: ToolPolicyDenialCode, message: string) {
    super(message);
    this.name = "ToolPolicyError";
    this.code = code;
  }
}

export class ToolPolicy {
  evaluate(request: ToolAuthorizationRequest): ToolPolicyDecision {
    moduleKeySchema.parse(request.moduleKey);
    permissionLevelSchema.parse(request.permission);

    switch (request.permission) {
      case "READ":
        return { allowed: true, reason: "Lecture autorisée." };
      case "WRITE":
        return { allowed: true, reason: "Modification interne autorisée." };
      case "APPROVAL_REQUIRED":
      case "PUBLISH":
        return this.evaluateApproval(request);
      case "SYSTEM":
        return {
          allowed: false,
          code: "SYSTEM_POLICY_REQUIRED",
          reason: "Une politique système dédiée est requise pour cette action.",
        };
    }
  }

  private evaluateApproval(request: ToolAuthorizationRequest): ToolPolicyDecision {
    const approval = explicitApprovalSchema.safeParse(request.explicitApproval);

    if (approval.success) {
      return { allowed: true, reason: "Validation humaine explicite confirmée." };
    }

    return {
      allowed: false,
      code: "APPROVAL_REQUIRED",
      reason: "Une validation humaine explicite est requise avant cette action.",
    };
  }
}

export class ToolGateway {
  constructor(private readonly policy: ToolPolicy = new ToolPolicy()) {}

  authorize(request: ToolAuthorizationRequest): ToolPolicyDecision {
    return this.policy.evaluate(request);
  }

  assertAuthorized(request: ToolAuthorizationRequest): void {
    const decision = this.authorize(request);

    if (!decision.allowed) {
      throw new ToolPolicyError(decision.code, decision.reason);
    }
  }
}
