import { describe, expect, it } from "vitest";

import { requestIdentityContextSchema } from "./index.js";

const baseContext = {
  userId: "usr_aless",
  userStatus: "ACTIVE",
  workspaceId: "wsp_aless",
  membership: { userId: "usr_aless", workspaceId: "wsp_aless", role: "OWNER", status: "ACTIVE" },
  clientInstance: {
    id: "client_ios_browser",
    userId: "usr_aless",
    kind: "WEB_BROWSER",
    platform: "IOS",
    status: "ACTIVE",
  },
  clientGrant: {
    clientInstanceId: "client_ios_browser",
    workspaceId: "wsp_aless",
    status: "ACTIVE",
    accessLevel: "TRUSTED",
  },
  session: {
    id: "session_ios_browser",
    userId: "usr_aless",
    clientInstanceId: "client_ios_browser",
    status: "ACTIVE",
    issuedAt: "2026-09-03T10:00:00.000Z",
    expiresAt: "2026-09-03T18:00:00.000Z",
  },
} as const;

describe("RequestIdentityContext", () => {
  it.each(["IOS", "ANDROID"] as const)("distingue navigateur, PWA et app native sur un téléphone %s", (platform) => {
    const suffix = platform.toLowerCase();
    const variants = [
      { kind: "WEB_BROWSER", id: `client_${suffix}_browser` },
      { kind: "PWA", id: `client_${suffix}_pwa` },
      { kind: "NATIVE_MOBILE", id: `client_${suffix}_native` },
    ] as const;
    const contexts = variants.map(({ id, kind }) =>
      requestIdentityContextSchema.parse({
        ...baseContext,
        clientInstance: { ...baseContext.clientInstance, id, kind, platform },
        clientGrant: { ...baseContext.clientGrant, clientInstanceId: id },
        session: { ...baseContext.session, id: `session_${id}`, clientInstanceId: id },
      }),
    );

    expect(new Set(contexts.map((context) => context.clientInstance.id)).size).toBe(3);
    expect(new Set(contexts.map((context) => context.session.id)).size).toBe(3);
    expect(contexts.every((context) => context.clientInstance.platform === platform)).toBe(true);
  });

  it("refuse les champs de scope supplémentaires et les durées de session incohérentes", () => {
    expect(() => requestIdentityContextSchema.parse({ ...baseContext, requestedWorkspaceId: "wsp_other" })).toThrow();
    expect(() =>
      requestIdentityContextSchema.parse({
        ...baseContext,
        session: { ...baseContext.session, token: "un-secret-qui-ne-doit-jamais-sortir" },
      }),
    ).toThrow();
    expect(() =>
      requestIdentityContextSchema.parse({
        ...baseContext,
        clientInstance: { ...baseContext.clientInstance, privateKey: "interdite" },
      }),
    ).toThrow();
    expect(() =>
      requestIdentityContextSchema.parse({
        ...baseContext,
        session: {
          ...baseContext.session,
          issuedAt: "2026-09-03T18:00:00.000Z",
          expiresAt: "2026-09-03T10:00:00.000Z",
        },
      }),
    ).toThrow("La session doit expirer après son émission");
  });

  it("refuse toute incohérence utilisateur, workspace, session, instance ou grant", () => {
    expect(() =>
      requestIdentityContextSchema.parse({
        ...baseContext,
        clientGrant: { ...baseContext.clientGrant, workspaceId: "wsp_other" },
      }),
    ).toThrow("Le grant appartient à un autre workspace");
    expect(() =>
      requestIdentityContextSchema.parse({
        ...baseContext,
        session: { ...baseContext.session, clientInstanceId: "client_other" },
      }),
    ).toThrow("La session appartient à une autre instance");
  });

  it("lie une réauthentification au workspace, à la session, à l'instance et à l'action", () => {
    const withStepUp = {
      ...baseContext,
      session: {
        ...baseContext.session,
        stepUp: {
          verifiedAt: "2026-09-03T12:58:00.000Z",
          workspaceId: "wsp_aless",
          clientInstanceId: "client_ios_browser",
          sessionId: "session_ios_browser",
          actionHash: "a".repeat(64),
        },
      },
    };

    expect(requestIdentityContextSchema.parse(withStepUp).session.stepUp?.actionHash).toBe("a".repeat(64));
    expect(() =>
      requestIdentityContextSchema.parse({
        ...withStepUp,
        session: {
          ...withStepUp.session,
          stepUp: { ...withStepUp.session.stepUp, workspaceId: "wsp_other" },
        },
      }),
    ).toThrow("La réauthentification appartient à un autre workspace");
    expect(() =>
      requestIdentityContextSchema.parse({
        ...withStepUp,
        session: {
          ...withStepUp.session,
          stepUp: { ...withStepUp.session.stepUp, sessionId: "session_other" },
        },
      }),
    ).toThrow("La réauthentification appartient à une autre session");
    expect(() =>
      requestIdentityContextSchema.parse({
        ...withStepUp,
        session: {
          ...withStepUp.session,
          stepUp: { ...withStepUp.session.stepUp, clientInstanceId: "client_other" },
        },
      }),
    ).toThrow("La réauthentification appartient à une autre instance");
  });
});
