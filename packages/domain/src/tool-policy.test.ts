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

  it("peut limiter explicitement les outils WRITE autorisés", () => {
    const gateway = new ToolGateway(undefined, [{ toolKey: "create_track", moduleKey: "MUSIC", permission: "WRITE" }]);

    expect(gateway.authorize({ toolKey: "create_track", moduleKey: "MUSIC", permission: "WRITE" })).toMatchObject({
      allowed: true,
    });
    expect(gateway.authorize({ toolKey: "delete_track", moduleKey: "MUSIC", permission: "WRITE" })).toMatchObject({
      allowed: false,
      code: "TOOL_NOT_ALLOWED",
    });
  });
});
