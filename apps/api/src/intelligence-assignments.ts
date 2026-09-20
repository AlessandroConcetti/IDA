import type { EnvironmentKey } from "@ida/contracts/environment-brains";
import { aiDataClassSchema, type IntelligenceRequest } from "@ida/contracts/intelligence";
import type { IntelligenceNetwork, NetworkProvider } from "@ida/contracts/intelligence-network";

type AssignmentEnvironment = EnvironmentKey | "fabrique";
type AssignmentCapability = "TEXT" | "CODE";
type AssignmentState = "USABLE" | "PREPARED";
export type AssignmentReason =
  | "AVAILABLE_IN_SNAPSHOT"
  | "INVALID_DATA_CLASSES"
  | "SECRET_FORBIDDEN"
  | "LOCAL_ONLY"
  | "CLOUD_CONSENT_REQUIRED"
  | "NOT_REGISTERED"
  | "NOT_READY"
  | "CAPABILITY_MISSING"
  | "COST_NOT_FREE"
  | "ALLOCATION_EMPTY"
  | "RESERVED";

interface AssignmentDefinition {
  readonly key: string;
  readonly environmentKey: AssignmentEnvironment;
  readonly role: string;
  readonly requires: readonly AssignmentCapability[];
  readonly providerKeys: readonly string[];
  readonly localOnly?: boolean;
}

// Préférences produit, pas un benchmark ni une activation. Aucun nom de modèle
// n'est inventé : les références proviennent exclusivement du registre courant.
const assignmentDefinitions: readonly AssignmentDefinition[] = [
  {
    key: "home_dialogue",
    environmentKey: "home",
    role: "Dialogue domestique privé",
    requires: ["TEXT"],
    providerKeys: ["ollama"],
    localOnly: true,
  },
  {
    key: "health_notes",
    environmentKey: "health",
    role: "Reformulation de notes personnelles, sans diagnostic",
    requires: ["TEXT"],
    providerKeys: ["ollama"],
    localOnly: true,
  },
  {
    key: "finance_summary",
    environmentKey: "finance",
    role: "Synthèse privée en lecture seule, sans opération bancaire",
    requires: ["TEXT"],
    providerKeys: ["ollama"],
    localOnly: true,
  },
  {
    key: "music_text",
    environmentKey: "music",
    role: "Direction artistique et textes français",
    requires: ["TEXT"],
    providerKeys: ["mistral", "ollama"],
  },
  {
    key: "social_draft",
    environmentKey: "social",
    role: "Brouillons français à valider, sans publication",
    requires: ["TEXT"],
    providerKeys: ["mistral", "ollama"],
  },
  {
    key: "research_summary",
    environmentKey: "research",
    role: "Synthèse de sources publiques fournies, sans navigation",
    requires: ["TEXT"],
    providerKeys: ["gemini", "ovhcloud", "groq", "ollama"],
  },
  {
    key: "creative_plan",
    environmentKey: "creative",
    role: "Conception et plans textuels",
    requires: ["TEXT"],
    providerKeys: ["mistral", "ollama"],
  },
  {
    key: "fabrique_plan",
    environmentKey: "fabrique",
    role: "Plans de fabrication à examiner, sans exécution",
    requires: ["TEXT"],
    providerKeys: ["mistral", "ollama"],
  },
  {
    key: "fabrique_code",
    environmentKey: "fabrique",
    role: "Propositions de code à examiner, sans exécution",
    requires: ["TEXT", "CODE"],
    providerKeys: ["mistral", "nvidia", "openrouter", "ollama"],
  },
  {
    key: "workspace_triage",
    environmentKey: "workspace",
    role: "Tri et reformulation de tâches",
    requires: ["TEXT"],
    providerKeys: ["groq", "cloudflare", "ollama"],
  },
  {
    key: "travel_itinerary",
    environmentKey: "travel",
    role: "Ébauches textuelles d'itinéraires, sans réservation",
    requires: ["TEXT"],
    providerKeys: ["gemini", "mistral", "ollama"],
  },
  {
    key: "admin_summary",
    environmentKey: "admin",
    role: "Synthèse et préparation de démarches privées",
    requires: ["TEXT"],
    providerKeys: ["ollama"],
    localOnly: true,
  },
  {
    key: "legal_notes",
    environmentKey: "legal",
    role: "Reformulation privée à revoir avec un professionnel",
    requires: ["TEXT"],
    providerKeys: ["ollama"],
    localOnly: true,
  },
  {
    key: "idacar_notes",
    environmentKey: "idacar",
    role: "Organisation privée des trajets et de l'entretien",
    requires: ["TEXT"],
    providerKeys: ["ollama"],
    localOnly: true,
  },
];

export interface AssignmentModel {
  providerKey: string;
  modelId: string;
}

export interface IntelligenceAssignmentCandidate {
  providerKey: string;
  preference: number;
  state: AssignmentState;
  reason: AssignmentReason;
  models: AssignmentModel[];
}

export interface IntelligenceAssignment {
  key: string;
  environmentKey: AssignmentEnvironment;
  role: string;
  requires: AssignmentCapability[];
  state: AssignmentState;
  selectedModel: AssignmentModel | null;
  candidates: IntelligenceAssignmentCandidate[];
}

export interface IntelligenceAssignmentContext {
  dataClasses: readonly IntelligenceRequest["dataClasses"][number][];
  // Résultat consultatif de consentements déjà résolus par l'autorité serveur
  // pour identité, purpose et classes courants ; jamais une entrée HTTP cliente.
  cloudConsentProviderKeys: readonly string[];
}

export interface IntelligenceAssignments {
  mode: "ADVISORY_ONLY";
  generatedAt: string;
  assignments: IntelligenceAssignment[];
  reserves: { providerKey: string; role: string; state: "PREPARED"; reason: "RESERVED" }[];
}

/** Texte affichable dans le tableau existant ; ne change aucun statut technique. */
export function providerAssignmentRole(providerKey: string): string {
  if (providerKey === "cerebras") return "Réserve expérimentale · essai à revoir, aucune affectation active";
  const environments = [
    ...new Set(
      assignmentDefinitions
        .filter((entry) => entry.providerKeys.includes(providerKey))
        .map((entry) => entry.environmentKey),
    ),
  ];
  return environments.length
    ? `Affectation indicative · ${environments.join(", ")} · capacités du modèle requises`
    : "Réserve documentaire · aucune affectation active";
}

function modelReason(
  provider: NetworkProvider,
  definition: AssignmentDefinition,
  context: IntelligenceAssignmentContext,
): AssignmentReason {
  if (provider.lifecycle !== "REGISTERED") return "NOT_REGISTERED";
  if (provider.locality !== "LOCAL") {
    if (definition.localOnly || context.dataClasses.some((dataClass) => dataClass !== "PUBLIC")) return "LOCAL_ONLY";
    if (provider.locality !== "CLOUD") return "NOT_READY";
    if (!context.cloudConsentProviderKeys.includes(provider.key)) return "CLOUD_CONSENT_REQUIRED";
  }
  if (!definition.requires.every((capability) => provider.capabilities.includes(capability)))
    return "CAPABILITY_MISSING";
  if (
    provider.estimatedCostMicros !== 0 ||
    provider.cost !== (provider.locality === "LOCAL" ? "LOCAL" : "FREE_LIMITED")
  )
    return "COST_NOT_FREE";
  if (provider.status !== "AVAILABLE_FREE") return "NOT_READY";
  if (provider.allocationRemaining === null || provider.allocationRemaining < 1) return "ALLOCATION_EMPTY";
  return "AVAILABLE_IN_SNAPSHOT";
}

/**
 * Projection pure du snapshot technique. USABLE signifie seulement candidat
 * admissible à cet instant : CoreIntelligence / EnvironmentIntelligence restent
 * obligatoires pour identité, policy, consentement, quotas et audit à chaque appel.
 * Cette fonction ne réserve rien, n'écrit rien et n'invoque aucun fournisseur.
 */
export function buildIntelligenceAssignments(
  network: IntelligenceNetwork,
  context: IntelligenceAssignmentContext,
): IntelligenceAssignments {
  const dataReason: AssignmentReason | null =
    !context.dataClasses.length ||
    context.dataClasses.some((dataClass) => !aiDataClassSchema.safeParse(dataClass).success)
      ? "INVALID_DATA_CLASSES"
      : context.dataClasses.includes("SECRET")
        ? "SECRET_FORBIDDEN"
        : null;
  const assignments = assignmentDefinitions.map((definition): IntelligenceAssignment => {
    const candidates = definition.providerKeys.map((providerKey, index): IntelligenceAssignmentCandidate => {
      const entries = network.providers.filter((provider) => provider.key === providerKey);
      const results = entries.map((provider) => ({
        provider,
        reason: dataReason ?? modelReason(provider, definition, context),
      }));
      const models = results
        .filter((result) => result.reason === "AVAILABLE_IN_SNAPSHOT")
        .map(({ provider }) => ({ providerKey, modelId: provider.model }));
      return {
        providerKey,
        preference: index + 1,
        state: models.length ? "USABLE" : "PREPARED",
        reason: models.length ? "AVAILABLE_IN_SNAPSHOT" : (dataReason ?? results[0]?.reason ?? "NOT_REGISTERED"),
        models,
      };
    });
    const selected = candidates.flatMap((candidate) => candidate.models)[0];
    return {
      key: definition.key,
      environmentKey: definition.environmentKey,
      role: definition.role,
      requires: [...definition.requires],
      state: selected ? "USABLE" : "PREPARED",
      selectedModel: selected ? { ...selected } : null,
      candidates,
    };
  });
  const assignedProviders = new Set(assignmentDefinitions.flatMap((definition) => definition.providerKeys));
  const reserveKeys = new Set([
    "cerebras",
    ...network.providers.map((provider) => provider.key).filter((key) => !assignedProviders.has(key)),
  ]);
  return {
    mode: "ADVISORY_ONLY",
    generatedAt: network.generatedAt,
    assignments,
    reserves: [...reserveKeys].map((providerKey) => ({
      providerKey,
      role: providerAssignmentRole(providerKey),
      state: "PREPARED",
      reason: "RESERVED",
    })),
  };
}
