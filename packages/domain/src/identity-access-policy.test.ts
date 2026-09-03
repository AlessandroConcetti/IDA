import type {
  ClientAccessLevel,
  ClientGrantStatus,
  ClientInstanceStatus,
  IdentitySessionStatus,
  MembershipRole,
  MembershipStatus,
  PermissionLevel,
  RequestIdentityContext,
} from "@ida/contracts";
import { describe, expect, it } from "vitest";

import { IdentityAccessPolicy, ToolGateway } from "./index.js";

const now = new Date("2026-09-03T13:00:00.000Z");

interface ContextOptions {
  role?: MembershipRole;
  userStatus?: RequestIdentityContext["userStatus"];
  membershipStatus?: MembershipStatus;
  clientStatus?: ClientInstanceStatus;
  clientGrantStatus?: ClientGrantStatus;
  accessLevel?: ClientAccessLevel;
  sessionStatus?: IdentitySessionStatus;
  issuedAt?: string;
  expiresAt?: string;
  stepUpAt?: string;
  stepUpActionHash?: string;
  clientInstanceId?: string;
  clientKind?: RequestIdentityContext["clientInstance"]["kind"];
  platform?: RequestIdentityContext["clientInstance"]["platform"];
}

function createContext(options: ContextOptions = {}): RequestIdentityContext {
  const clientInstanceId = options.clientInstanceId ?? "client_android_native";

  return {
    userId: "usr_aless",
    userStatus: options.userStatus ?? "ACTIVE",
    workspaceId: "wsp_aless",
    membership: {
      userId: "usr_aless",
      workspaceId: "wsp_aless",
      role: options.role ?? "OWNER",
      status: options.membershipStatus ?? "ACTIVE",
    },
    clientInstance: {
      id: clientInstanceId,
      userId: "usr_aless",
      kind: options.clientKind ?? "NATIVE_MOBILE",
      platform: options.platform ?? "ANDROID",
      status: options.clientStatus ?? "ACTIVE",
    },
    clientGrant: {
      clientInstanceId,
      workspaceId: "wsp_aless",
      status: options.clientGrantStatus ?? "ACTIVE",
      accessLevel: options.accessLevel ?? "TRUSTED",
    },
    session: {
      id: `session_${clientInstanceId}`,
      userId: "usr_aless",
      clientInstanceId,
      status: options.sessionStatus ?? "ACTIVE",
      issuedAt: options.issuedAt ?? "2026-09-03T12:00:00.000Z",
      expiresAt: options.expiresAt ?? "2026-09-03T14:00:00.000Z",
      ...(options.stepUpAt === undefined
        ? {}
        : {
            stepUp: {
              verifiedAt: options.stepUpAt,
              workspaceId: "wsp_aless",
              clientInstanceId,
              sessionId: `session_${clientInstanceId}`,
              actionHash: options.stepUpActionHash ?? "a".repeat(64),
            },
          }),
    },
  };
}

function evaluate(
  permission: PermissionLevel,
  options: ContextOptions = {},
  requiresStepUp = false,
  requiredStepUpActionHash = "a".repeat(64),
) {
  return new IdentityAccessPolicy().evaluate({
    context: createContext(options),
    permission,
    now,
    requiresStepUp,
    requiredStepUpActionHash,
  });
}

describe("IdentityAccessPolicy", () => {
  it("accepte un contexte actif sans jamais accorder l'outil lui-même", () => {
    const identity = evaluate("READ");
    const tools = new ToolGateway();

    expect(identity).toMatchObject({ allowed: true, context: { userId: "usr_aless", workspaceId: "wsp_aless" } });
    expect(tools.authorize({ toolKey: "unknown_read", moduleKey: "IDA", permission: "READ" })).toMatchObject({
      allowed: false,
      code: "TOOL_NOT_ALLOWED",
    });
  });

  it("refuse une session révoquée, future ou expirée", () => {
    expect(evaluate("READ", { sessionStatus: "REVOKED" })).toMatchObject({
      allowed: false,
      code: "SESSION_NOT_ACTIVE",
    });
    expect(
      evaluate("READ", { issuedAt: "2026-09-03T13:10:00.000Z", expiresAt: "2026-09-03T14:00:00.000Z" }),
    ).toMatchObject({
      allowed: false,
      code: "SESSION_NOT_YET_VALID",
    });
    expect(evaluate("READ", { expiresAt: "2026-09-03T13:00:00.000Z" })).toMatchObject({
      allowed: false,
      code: "SESSION_EXPIRED",
    });
  });

  it("refuse une instance cliente ou une membership non active", () => {
    for (const clientStatus of ["PENDING", "REVOKED"] as const) {
      expect(evaluate("READ", { clientStatus })).toMatchObject({
        allowed: false,
        code: "CLIENT_INSTANCE_NOT_ACTIVE",
      });
    }

    for (const membershipStatus of ["SUSPENDED", "REVOKED"] as const) {
      expect(evaluate("READ", { membershipStatus })).toMatchObject({
        allowed: false,
        code: "MEMBERSHIP_NOT_ACTIVE",
      });
    }

    expect(evaluate("READ", { clientGrantStatus: "REVOKED" })).toMatchObject({
      allowed: false,
      code: "CLIENT_GRANT_NOT_ACTIVE",
    });
  });

  it("refuse un compte utilisateur suspendu ou révoqué", () => {
    for (const userStatus of ["SUSPENDED", "REVOKED"] as const) {
      expect(evaluate("READ", { userStatus })).toMatchObject({ allowed: false, code: "USER_NOT_ACTIVE" });
    }
  });

  it("révoque le navigateur mobile sans révoquer l'application native du même téléphone", () => {
    expect(
      evaluate("READ", {
        clientInstanceId: "client_ios_safari",
        clientKind: "WEB_BROWSER",
        platform: "IOS",
        clientStatus: "REVOKED",
      }),
    ).toMatchObject({ allowed: false, code: "CLIENT_INSTANCE_NOT_ACTIVE" });
    expect(
      evaluate("READ", {
        clientInstanceId: "client_ios_native",
        clientKind: "NATIVE_MOBILE",
        platform: "IOS",
      }),
    ).toMatchObject({ allowed: true });
  });

  it("applique l'intersection des droits membership et appareil", () => {
    expect(evaluate("READ", { role: "VIEWER" })).toMatchObject({ allowed: true });
    expect(evaluate("WRITE", { role: "VIEWER" })).toMatchObject({
      allowed: false,
      code: "MEMBERSHIP_PERMISSION_DENIED",
    });
    expect(evaluate("WRITE", { role: "EDITOR" })).toMatchObject({ allowed: true });
    expect(evaluate("APPROVAL_REQUIRED", { role: "EDITOR" })).toMatchObject({
      allowed: false,
      code: "MEMBERSHIP_PERMISSION_DENIED",
    });
    expect(evaluate("READ", { accessLevel: "VIEW_ONLY" })).toMatchObject({ allowed: true });
    expect(evaluate("WRITE", { accessLevel: "VIEW_ONLY" })).toMatchObject({
      allowed: false,
      code: "CLIENT_PERMISSION_DENIED",
    });
    expect(evaluate("WRITE", { accessLevel: "LIMITED" })).toMatchObject({ allowed: true });
    expect(evaluate("APPROVAL_REQUIRED", { accessLevel: "LIMITED" })).toMatchObject({
      allowed: false,
      code: "CLIENT_PERMISSION_DENIED",
    });
  });

  it("exige une réauthentification liée à l'action pour PUBLISH, SYSTEM ou une demande explicite", () => {
    expect(evaluate("PUBLISH")).toMatchObject({ allowed: false, code: "STEP_UP_REQUIRED" });
    expect(evaluate("SYSTEM", {}, true)).toMatchObject({ allowed: false, code: "STEP_UP_REQUIRED" });
    expect(evaluate("SYSTEM", { stepUpAt: "2026-09-03T12:50:00.000Z" }, true)).toMatchObject({
      allowed: false,
      code: "STEP_UP_REQUIRED",
    });
    expect(evaluate("SYSTEM", { stepUpAt: "2026-09-03T12:58:00.000Z" }, true)).toMatchObject({ allowed: true });
    expect(evaluate("SYSTEM", { stepUpAt: "2026-09-03T12:58:00.000Z" }, true, "b".repeat(64))).toMatchObject({
      allowed: false,
      code: "STEP_UP_REQUIRED",
    });
    expect(evaluate("SYSTEM", { stepUpAt: "2026-09-03T13:01:00.000Z" }, true)).toMatchObject({
      allowed: false,
      code: "STEP_UP_REQUIRED",
    });
  });

  it("empêche un appareil limité de profiter d'une approbation ToolGateway valide", () => {
    const identity = evaluate("PUBLISH", { accessLevel: "LIMITED", stepUpAt: "2026-09-03T12:58:00.000Z" }, true);
    const tools = new ToolGateway(undefined, [{ toolKey: "publish_post", moduleKey: "SOCIAL", permission: "PUBLISH" }]);
    const toolDecision = tools.authorize({
      toolKey: "publish_post",
      moduleKey: "SOCIAL",
      permission: "PUBLISH",
      explicitApproval: {
        approvalId: "approval_server_bound",
        approvedBy: "usr_aless",
        approvedAt: "2026-09-03T12:59:00.000Z",
      },
    });

    expect(toolDecision).toMatchObject({ allowed: true });
    expect(identity).toMatchObject({ allowed: false, code: "CLIENT_PERMISSION_DENIED" });
  });
});
