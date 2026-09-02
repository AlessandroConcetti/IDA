import { describe, expect, it } from "vitest";

import { AgentRegistryError, agentManifests, createAgentRegistry } from "./index.js";

const memoryManagerManifest = agentManifests[0];

if (!memoryManagerManifest) {
  throw new Error("Le manifeste Memory Manager est requis pour ces tests.");
}

describe("AgentRegistry", () => {
  it("déclare les prochains spécialistes sans les activer ni leur donner d'accès implicite", () => {
    const registry = createAgentRegistry();

    expect(registry.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "agent_memory_manager", status: "PLANNED", executionMode: "PROPOSAL_ONLY" }),
        expect.objectContaining({ key: "agent_music_librarian", status: "PLANNED", executionMode: "PROPOSAL_ONLY" }),
      ]),
    );
    expect(registry.list().every((manifest) => manifest.approvalPolicy === "NO_EXTERNAL_ACTIONS")).toBe(true);
    expect(registry.list().every((manifest) => manifest.allowedTools.every((tool) => tool.permission === "READ"))).toBe(
      true,
    );
    expect(() =>
      registry.assertActiveTool("agent_memory_manager", {
        key: "list_confirmed_preferences",
        moduleKey: "MEMORY",
        permission: "READ",
      }),
    ).toThrow("n’est pas actif");

    const exposedManifest = registry.require("agent_memory_manager");
    const exposedTool = exposedManifest.allowedTools[0];

    if (!exposedTool) {
      throw new Error("Le manifeste Memory Manager doit déclarer un outil.");
    }

    exposedTool.key = "mutated_by_client";
    expect(registry.require("agent_memory_manager").allowedTools[0]?.key).toBe("list_confirmed_preferences");
  });

  it("rejette les manifestes dupliqués ou incompatibles avec leur policy", () => {
    expect(() => createAgentRegistry([memoryManagerManifest, memoryManagerManifest])).toThrow(AgentRegistryError);

    expect(() =>
      createAgentRegistry([
        {
          ...memoryManagerManifest,
          key: "agent_invalid_reader",
          executionMode: "READ_ONLY",
          allowedTools: [{ key: "create_task", moduleKey: "TASKS", permission: "WRITE" }],
        },
      ]),
    ).toThrow("READ_ONLY");

    expect(() =>
      createAgentRegistry([
        {
          ...memoryManagerManifest,
          key: "agent_invalid_proposal",
          allowedTools: [{ key: "create_task", moduleKey: "TASKS", permission: "WRITE" }],
        },
      ]),
    ).toThrow("PROPOSAL_ONLY");

    expect(() =>
      createAgentRegistry([
        {
          ...memoryManagerManifest,
          key: "agent_invalid_external",
          executionMode: "CONTROLLED_EXECUTION",
          allowedTools: [{ key: "publish_post", moduleKey: "SOCIAL", permission: "PUBLISH" }],
        },
      ]),
    ).toThrow("interdit les actions externes");
  });

  it("n’autorise que l’outil exactement déclaré après une activation explicite", () => {
    const registry = createAgentRegistry([
      {
        ...memoryManagerManifest,
        key: "agent_active_reader",
        status: "ACTIVE",
        executionMode: "CONTROLLED_EXECUTION",
        approvalPolicy: "READ_ONLY",
      },
    ]);

    expect(
      registry.assertActiveTool("agent_active_reader", {
        key: "list_confirmed_preferences",
        moduleKey: "MEMORY",
        permission: "READ",
      }),
    ).toMatchObject({ key: "agent_active_reader", status: "ACTIVE" });
    expect(() =>
      registry.assertActiveTool("agent_active_reader", {
        key: "list_confirmed_preferences",
        moduleKey: "MEMORY",
        permission: "WRITE",
      }),
    ).toThrow("n’est pas déclaré");
  });
});
