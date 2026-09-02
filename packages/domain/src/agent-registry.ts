import {
  type AgentAllowedTool,
  type AgentKey,
  type AgentManifest,
  agentManifestSchema,
  type ModuleKey,
  type PermissionLevel,
} from "@ida/contracts";

export const agentManifests = [
  {
    key: "agent_memory_manager",
    version: "0.1.0",
    status: "PLANNED",
    displayName: "Memory Manager",
    domain: "MEMORY",
    executionMode: "PROPOSAL_ONLY",
    supportedIntents: ["SAVE_MEMORY"],
    inputContract: "agent-request.v1",
    outputContract: "memory-proposal.v1",
    allowedTools: [{ key: "list_confirmed_preferences", moduleKey: "MEMORY", permission: "READ" }],
    contextSources: ["ARTIST_PROFILE", "PREFERENCE_MEMORY"],
    approvalPolicy: "NO_EXTERNAL_ACTIONS",
    promptVersion: "memory-manager.v1",
    evaluationSuite: "memory-manager-consent.v1",
  },
  {
    key: "agent_music_librarian",
    version: "0.1.0",
    status: "PLANNED",
    displayName: "Music Librarian",
    domain: "MUSIC",
    executionMode: "PROPOSAL_ONLY",
    supportedIntents: ["SEARCH_TRACK", "SEARCH_MEDIA"],
    inputContract: "agent-request.v1",
    outputContract: "music-search-proposal.v1",
    allowedTools: [
      { key: "list_tracks", moduleKey: "MUSIC", permission: "READ" },
      { key: "search_media", moduleKey: "CONTENT", permission: "READ" },
    ],
    contextSources: ["MUSIC_CATALOG", "CONTENT_LIBRARY", "ARTIST_PROFILE"],
    approvalPolicy: "NO_EXTERNAL_ACTIONS",
    promptVersion: "music-librarian.v1",
    evaluationSuite: "music-librarian-retrieval.v1",
  },
] as const satisfies readonly AgentManifest[];

export class AgentRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRegistryError";
  }
}

export interface AgentToolAuthorization {
  readonly key: string;
  readonly moduleKey: ModuleKey;
  readonly permission: PermissionLevel;
}

export interface AgentRegistry {
  list(): readonly AgentManifest[];
  get(key: AgentKey): AgentManifest | undefined;
  require(key: AgentKey): AgentManifest;
  assertActiveTool(agentKey: AgentKey, tool: AgentToolAuthorization): AgentManifest;
}

function copyManifest(manifest: AgentManifest): AgentManifest {
  return {
    ...manifest,
    allowedTools: manifest.allowedTools.map((tool) => ({ ...tool })),
    contextSources: [...manifest.contextSources],
    supportedIntents: [...manifest.supportedIntents],
  };
}

function assertManifestPolicy(manifest: AgentManifest): void {
  const uniqueTools = new Set<string>();

  for (const tool of manifest.allowedTools) {
    const signature = `${tool.key}:${tool.moduleKey}:${tool.permission}`;

    if (uniqueTools.has(signature)) {
      throw new AgentRegistryError(`L’agent ${manifest.key} déclare deux fois l’outil ${tool.key}.`);
    }

    uniqueTools.add(signature);

    if (
      (manifest.executionMode === "READ_ONLY" || manifest.executionMode === "PROPOSAL_ONLY") &&
      tool.permission !== "READ"
    ) {
      throw new AgentRegistryError(
        `L’agent ${manifest.key} est ${manifest.executionMode} mais déclare ${tool.permission}.`,
      );
    }

    if (
      manifest.approvalPolicy === "NO_EXTERNAL_ACTIONS" &&
      (tool.permission === "PUBLISH" || tool.permission === "SYSTEM")
    ) {
      throw new AgentRegistryError(
        `L’agent ${manifest.key} interdit les actions externes mais déclare ${tool.permission}.`,
      );
    }
  }
}

export function createAgentRegistry(manifests: readonly AgentManifest[] = agentManifests): AgentRegistry {
  const manifestsByKey = new Map<AgentKey, AgentManifest>();

  for (const rawManifest of manifests) {
    const manifest = agentManifestSchema.parse(rawManifest);

    if (manifestsByKey.has(manifest.key)) {
      throw new AgentRegistryError(`L’agent ${manifest.key} est déclaré plusieurs fois.`);
    }

    assertManifestPolicy(manifest);
    manifestsByKey.set(manifest.key, copyManifest(manifest));
  }

  const registeredManifests = Object.freeze([...manifestsByKey.values()]);

  return Object.freeze({
    list: () => registeredManifests.map(copyManifest),
    get: (key: AgentKey) => {
      const manifest = manifestsByKey.get(key);

      return manifest ? copyManifest(manifest) : undefined;
    },
    require: (key: AgentKey) => {
      const manifest = manifestsByKey.get(key);

      if (!manifest) {
        throw new AgentRegistryError(`L’agent ${key} n’est pas enregistré.`);
      }

      return copyManifest(manifest);
    },
    assertActiveTool: (agentKey: AgentKey, tool: AgentToolAuthorization) => {
      const manifest = manifestsByKey.get(agentKey);

      if (!manifest) {
        throw new AgentRegistryError(`L’agent ${agentKey} n’est pas enregistré.`);
      }

      if (manifest.status !== "ACTIVE") {
        throw new AgentRegistryError(`L’agent ${agentKey} n’est pas actif.`);
      }

      const isAllowed = manifest.allowedTools.some(
        (allowedTool: AgentAllowedTool) =>
          allowedTool.key === tool.key &&
          allowedTool.moduleKey === tool.moduleKey &&
          allowedTool.permission === tool.permission,
      );

      if (!isAllowed) {
        throw new AgentRegistryError(`L’outil ${tool.key} n’est pas déclaré pour l’agent ${agentKey}.`);
      }

      return copyManifest(manifest);
    },
  });
}
