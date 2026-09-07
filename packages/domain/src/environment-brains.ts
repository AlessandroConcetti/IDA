import {
  type EnvironmentBrainProfile,
  type EnvironmentInvocation,
  type EnvironmentKey,
  environmentBrainProfileSchema,
  environmentInvocationSchema,
} from "@ida/contracts/environment-brains";
import type { IntelligencePolicy, IntelligenceRequest } from "@ida/contracts/intelligence";
import type { AgentRegistry } from "./agent-registry.js";
import { IntelligenceError } from "./provider-registry.js";

const profilePlans = [
  { key: "travel", roles: ["Planification de voyage", "Vérification des réservations"] },
  { key: "workspace", roles: ["Coordination des missions", "Gestion de mémoire"] },
  { key: "music", roles: ["Music Librarian", "Direction artistique", "Planification des releases"] },
  { key: "creative", roles: ["Content Curator", "Copywriter", "Gestion de contenus"] },
  { key: "social", roles: ["Social Manager", "Calendar Manager", "Campaign Manager", "Analytics Agent"] },
  { key: "finance", roles: ["Analyse de budget en lecture seule", "Gouvernance des données financières"] },
  { key: "research", roles: ["Recherche documentaire", "Vérification des sources"] },
  { key: "admin", roles: ["Organisation documentaire", "Suivi des démarches"] },
  { key: "legal", roles: ["Recherche juridique", "Gouvernance et escalade vers un juriste"] },
  { key: "health", roles: ["Organisation du suivi personnel", "Gouvernance et escalade vers un soignant"] },
  { key: "home", roles: ["Gestion des tâches domestiques", "Courses", "Home Safety Steward"] },
  { key: "idacar", roles: ["Suivi de l'entretien", "Organisation des trajets"] },
] as const satisfies readonly { key: EnvironmentKey; roles: readonly string[] }[];

/** Profils statiques copiés, aucun modèle ni agent démarré au chargement. */
export function listEnvironmentBrainProfiles(): EnvironmentBrainProfile[] {
  return profilePlans.map(({ key, roles }) =>
    environmentBrainProfileSchema.parse({
      environmentKey: key,
      version: "0.1.0",
      status: "PLANNED",
      plannedRoles: [...roles],
      agentKeys:
        key === "music"
          ? ["agent_music_librarian", "agent_memory_manager"]
          : ["workspace", "home"].includes(key)
            ? ["agent_memory_manager"]
            : [],
      contextSources:
        key === "music"
          ? ["MUSIC_CATALOG", "CONTENT_LIBRARY", "ARTIST_PROFILE", "PREFERENCE_MEMORY"]
          : ["workspace", "home"].includes(key)
            ? ["PREFERENCE_MEMORY"]
            : [],
      acceptedDataClasses:
        key === "music"
          ? ["PUBLIC", "INTERNAL", "PRIVATE_CREATIVE"]
          : ["home", "finance", "health", "legal", "admin", "idacar"].includes(key)
            ? ["PUBLIC", "INTERNAL", "SENSITIVE_PERSONAL"]
            : ["PUBLIC", "INTERNAL"],
      modelPolicy: { mode: "LOCAL_ONLY", allowedModels: [], maxCostMicros: 0 },
      memoryPolicy: "CONFIRMED_ONLY",
      improvementPolicy: "HUMAN_REVIEWED",
    }),
  );
}

/** Intersection : le profil ne peut élargir ni l'agent ni la policy du compte. */
export function constrainEnvironmentPolicy(
  rawProfile: EnvironmentBrainProfile,
  rawInvocation: EnvironmentInvocation,
  request: IntelligenceRequest,
  policy: IntelligencePolicy,
  agents: AgentRegistry,
): IntelligencePolicy {
  const parsedProfile = environmentBrainProfileSchema.safeParse(rawProfile);
  const parsedInvocation = environmentInvocationSchema.safeParse(rawInvocation);
  if (!parsedProfile.success || !parsedInvocation.success) throw new IntelligenceError("FORBIDDEN");
  const profile = parsedProfile.data;
  const invocation = parsedInvocation.data;
  const agent = agents.get(invocation.agentKey);
  if (
    profile.status !== "ACTIVE" ||
    profile.environmentKey !== invocation.environmentKey ||
    profile.version !== invocation.profileVersion ||
    !profile.agentKeys.includes(invocation.agentKey) ||
    !agent ||
    agent.status !== "ACTIVE" ||
    !agent.supportedIntents.includes(invocation.intent) ||
    !invocation.contextSources.every(
      (source) => profile.contextSources.includes(source) && agent.contextSources.includes(source),
    ) ||
    !request.dataClasses.every(
      (classification) => classification !== "SECRET" && profile.acceptedDataClasses.includes(classification),
    )
  ) {
    throw new IntelligenceError("FORBIDDEN");
  }
  const allowedModels = profile.modelPolicy.allowedModels.filter(
    (model) =>
      policy.allowedProviderKeys.includes(model.providerKey) &&
      (policy.allowedModels === undefined ||
        policy.allowedModels.some(
          (allowed) => allowed.providerKey === model.providerKey && allowed.modelId === model.modelId,
        )),
  );
  const localOnly = profile.modelPolicy.mode === "LOCAL_ONLY";
  return {
    ...policy,
    localFirst: true,
    allowedProviderKeys: policy.allowedProviderKeys.filter((key) =>
      allowedModels.some((model) => model.providerKey === key),
    ),
    allowedModels,
    allowedLocalities: (policy.allowedLocalities ?? ["LOCAL", "CLOUD"]).filter(
      (locality) => !localOnly || locality === "LOCAL",
    ),
    maxCostMicros: Math.min(policy.maxCostMicros, profile.modelPolicy.maxCostMicros),
    cloudConsents: localOnly ? [] : policy.cloudConsents,
  };
}
