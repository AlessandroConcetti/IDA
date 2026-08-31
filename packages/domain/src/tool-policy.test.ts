import { describe, expect, it } from "vitest";

import { ToolGateway, ToolPolicyError } from "./index.js";

describe("ToolGateway", () => {
  it("autorise les outils READ et WRITE", () => {
    const gateway = new ToolGateway();

    expect(gateway.authorize({ toolKey: "search_media", moduleKey: "CONTENT", permission: "READ" }).allowed).toBe(true);
    expect(gateway.authorize({ toolKey: "create_post", moduleKey: "CONTENT", permission: "WRITE" }).allowed).toBe(true);
  });

  it("interdit un outil PUBLISH sans validation humaine explicite", () => {
    const gateway = new ToolGateway();

    expect(() =>
      gateway.assertAuthorized({ toolKey: "publish_post", moduleKey: "SOCIAL", permission: "PUBLISH" }),
    ).toThrow(ToolPolicyError);

    expect(gateway.authorize({ toolKey: "publish_post", moduleKey: "SOCIAL", permission: "PUBLISH" })).toMatchObject({
      allowed: false,
      code: "APPROVAL_REQUIRED",
    });
  });

  it("autorise APPROVAL_REQUIRED seulement avec une preuve explicite conforme", () => {
    const gateway = new ToolGateway(undefined, [
      { toolKey: "decide_post_variant", moduleKey: "CONTENT", permission: "APPROVAL_REQUIRED" },
    ]);

    expect(
      gateway.authorize({ toolKey: "decide_post_variant", moduleKey: "CONTENT", permission: "APPROVAL_REQUIRED" }),
    ).toMatchObject({ allowed: false, code: "APPROVAL_REQUIRED" });
    expect(
      gateway.authorize({
        toolKey: "decide_post_variant",
        moduleKey: "CONTENT",
        permission: "APPROVAL_REQUIRED",
        explicitApproval: {
          approvalId: "human_server_action",
          approvedBy: "usr_demo_aless",
          approvedAt: "2026-08-30T09:00:00.000Z",
        },
      }),
    ).toMatchObject({ allowed: true });
  });

  it("peut limiter explicitement les outils WRITE autorisés", () => {
    const gateway = new ToolGateway(undefined, [
      { toolKey: "create_track", moduleKey: "MUSIC", permission: "WRITE" },
      { toolKey: "import_media", moduleKey: "CONTENT", permission: "WRITE" },
      { toolKey: "propose_preference_memory", moduleKey: "MEMORY", permission: "WRITE" },
      { toolKey: "confirm_memory", moduleKey: "MEMORY", permission: "WRITE" },
      { toolKey: "reject_memory", moduleKey: "MEMORY", permission: "WRITE" },
      { toolKey: "create_task", moduleKey: "TASKS", permission: "WRITE" },
      { toolKey: "complete_task", moduleKey: "TASKS", permission: "WRITE" },
      { toolKey: "decide_post_variant", moduleKey: "CONTENT", permission: "APPROVAL_REQUIRED" },
    ]);

    expect(gateway.authorize({ toolKey: "create_track", moduleKey: "MUSIC", permission: "WRITE" })).toMatchObject({
      allowed: true,
    });
    expect(gateway.authorize({ toolKey: "import_media", moduleKey: "CONTENT", permission: "WRITE" })).toMatchObject({
      allowed: true,
    });
    expect(
      gateway.authorize({ toolKey: "propose_preference_memory", moduleKey: "MEMORY", permission: "WRITE" }),
    ).toMatchObject({ allowed: true });
    expect(gateway.authorize({ toolKey: "confirm_memory", moduleKey: "MEMORY", permission: "WRITE" })).toMatchObject({
      allowed: true,
    });
    expect(gateway.authorize({ toolKey: "reject_memory", moduleKey: "MEMORY", permission: "WRITE" })).toMatchObject({
      allowed: true,
    });
    expect(gateway.authorize({ toolKey: "create_task", moduleKey: "TASKS", permission: "WRITE" })).toMatchObject({
      allowed: true,
    });
    expect(gateway.authorize({ toolKey: "complete_task", moduleKey: "TASKS", permission: "WRITE" })).toMatchObject({
      allowed: true,
    });
    expect(
      gateway.authorize({
        toolKey: "decide_post_variant",
        moduleKey: "CONTENT",
        permission: "APPROVAL_REQUIRED",
        explicitApproval: {
          approvalId: "human_server_action",
          approvedBy: "usr_demo_aless",
          approvedAt: "2026-08-30T09:00:00.000Z",
        },
      }),
    ).toMatchObject({ allowed: true });
    expect(gateway.authorize({ toolKey: "delete_track", moduleKey: "MUSIC", permission: "WRITE" })).toMatchObject({
      allowed: false,
      code: "TOOL_NOT_ALLOWED",
    });
  });
});
