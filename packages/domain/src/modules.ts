import { type ModuleKey, moduleKeySchema } from "@ida/contracts";

export interface ModuleDefinition {
  readonly key: ModuleKey;
  readonly label: string;
  readonly description: string;
  readonly route: string;
}

export const moduleDefinitions = [
  { key: "HOME", label: "Accueil", description: "Vue d’ensemble de votre espace IDA.", route: "/" },
  { key: "IDA", label: "IDA", description: "Conversation et commandes avec IDA.", route: "/ida" },
  { key: "MUSIC", label: "Musique", description: "Catalogue musical, morceaux et releases.", route: "/music" },
  {
    key: "CONTENT",
    label: "Contenus",
    description: "Bibliothèque de médias et propositions de contenu.",
    route: "/content",
  },
  {
    key: "SOCIAL",
    label: "Réseaux sociaux",
    description: "Comptes connectés et capacités des plateformes.",
    route: "/social",
  },
  { key: "CALENDAR", label: "Calendrier", description: "Calendrier éditorial et échéances.", route: "/calendar" },
  { key: "CAMPAIGNS", label: "Campagnes", description: "Campagnes et objectifs de release.", route: "/campaigns" },
  { key: "ANALYTICS", label: "Analyses", description: "Performances et tendances de contenu.", route: "/analytics" },
  { key: "TASKS", label: "Tâches", description: "Tâches et validations à effectuer.", route: "/tasks" },
  { key: "MEMORY", label: "Mémoire", description: "Préférences et mémoire artistique confirmées.", route: "/memory" },
  { key: "SYSTEM", label: "Système", description: "État des services et intégrations IDA.", route: "/system" },
] as const satisfies readonly ModuleDefinition[];

export class ModuleRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleRegistryError";
  }
}

export interface ModuleRegistry {
  list(): readonly ModuleDefinition[];
  get(key: ModuleKey): ModuleDefinition | undefined;
  require(key: ModuleKey): ModuleDefinition;
}

export function createModuleRegistry(definitions: readonly ModuleDefinition[] = moduleDefinitions): ModuleRegistry {
  const definitionsByKey = new Map<ModuleKey, ModuleDefinition>();

  for (const definition of definitions) {
    moduleKeySchema.parse(definition.key);

    if (definitionsByKey.has(definition.key)) {
      throw new ModuleRegistryError(`Le module ${definition.key} est déclaré plusieurs fois.`);
    }

    definitionsByKey.set(definition.key, Object.freeze({ ...definition }));
  }

  const registeredDefinitions = Object.freeze([...definitionsByKey.values()]);

  return Object.freeze({
    list: () => registeredDefinitions,
    get: (key: ModuleKey) => definitionsByKey.get(key),
    require: (key: ModuleKey) => {
      const definition = definitionsByKey.get(key);

      if (!definition) {
        throw new ModuleRegistryError(`Le module ${key} n’est pas enregistré.`);
      }

      return definition;
    },
  });
}
