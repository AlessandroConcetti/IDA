export type NavigationId =
  | "home"
  | "ida"
  | "music"
  | "content"
  | "social"
  | "calendar"
  | "campaigns"
  | "analytics"
  | "tasks"
  | "memory"
  | "system";

export type OperationalState = "ONLINE" | "WARNING" | "ERROR" | "DISCONNECTED";

export interface NavigationItem {
  id: NavigationId;
  label: string;
  glyph: string;
}

export interface SystemService {
  name: string;
  state: OperationalState;
  detail: string;
}

export interface ArtistBrain {
  identity: string;
  genres: string[];
  influences: string[];
  tone: string;
  preferredVocabulary: string[];
  forbiddenVocabulary: string[];
  goals: string[];
  audience: string;
  platformPreferences: Record<string, unknown>;
}

export interface Track {
  title: string;
  project: string;
  status: "DEMO" | "UNRELEASED" | "SCHEDULED" | "RELEASED" | "ARCHIVED";
  bpm?: number;
  key: string;
  freshness: string;
}

export interface MediaAsset {
  id?: string;
  filename: string;
  kind: "VIDEO" | "IMAGE" | "AUDIO" | "FILE";
  status: "UNUSED" | "USED" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
  detail: string;
  tone: "violet" | "coral" | "blue";
  tags?: string[];
  sizeLabel?: string;
  usageCount?: number;
  previewAvailable?: boolean;
  previewUrl?: string;
}

export const navigation: NavigationItem[] = [
  { id: "home", label: "Accueil", glyph: "⌂" },
  { id: "ida", label: "IDA", glyph: "✦" },
  { id: "music", label: "Musique", glyph: "♫" },
  { id: "content", label: "Contenus", glyph: "◇" },
  { id: "social", label: "Réseaux", glyph: "◌" },
  { id: "calendar", label: "Calendrier", glyph: "□" },
  { id: "campaigns", label: "Campagnes", glyph: "◎" },
  { id: "analytics", label: "Statistiques", glyph: "↗" },
  { id: "tasks", label: "Tâches", glyph: "✓" },
  { id: "memory", label: "Mémoire", glyph: "◒" },
  { id: "system", label: "Système", glyph: "◉" },
];

export const mobilePrimaryNavigation: NavigationId[] = ["home", "ida", "content", "calendar"];

export const artistBrain: ArtistBrain = {
  identity: "Producteur et DJ électronique entre textures nocturnes et énergie club.",
  genres: ["Melodic techno", "Progressive house", "Electronic"],
  influences: ["Nuits de club", "Cinéma analogique", "Architecture lumineuse"],
  tone: "Direct, lumineux, précis et jamais générique.",
  preferredVocabulary: ["nocturne", "texture", "élan"],
  forbiddenVocabulary: ["banger", "vibes"],
  goals: ["Préparer une release cohérente", "Faire émerger les contenus studio"],
  audience: "Auditeurs de musique électronique et public de clubs européens.",
  platformPreferences: {},
};

export const sectionCopy: Record<NavigationId, { eyebrow: string; title: string; description: string }> = {
  home: {
    eyebrow: "IDA COMMAND CENTER",
    title: "Votre journée, en perspective.",
    description: "Ton univers artistique, en un seul endroit.",
  },
  ida: {
    eyebrow: "CONVERSATION",
    title: "Parlons de votre univers.",
    description: "Demande, cherche, organise ou prépare une prochaine action.",
  },
  music: {
    eyebrow: "MUSIC BRAIN",
    title: "Votre musique prend sa place.",
    description: "Morceaux, releases et métadonnées dans un même catalogue.",
  },
  content: {
    eyebrow: "CONTENT LIBRARY",
    title: "Vos contenus, à portée de main.",
    description: "Des médias retrouvables, frais et prêts à être proposés.",
  },
  social: {
    eyebrow: "SOCIAL BRAIN",
    title: "Vos réseaux, en toute clarté.",
    description: "Les capacités réelles sont visibles avant toute intégration.",
  },
  calendar: {
    eyebrow: "CALENDRIER ÉDITORIAL",
    title: "Un rythme qui vous ressemble.",
    description: "Ton rythme éditorial, sans surcharge ni répétition.",
  },
  campaigns: {
    eyebrow: "CAMPAGNES",
    title: "Donnez forme à votre histoire.",
    description: "Pose un brief créatif clair avant de relier les contenus et la release.",
  },
  analytics: {
    eyebrow: "STATISTIQUES",
    title: "Comprendre ce qui résonne.",
    description: "Les recommandations resteront fondées sur des données traçables.",
  },
  tasks: {
    eyebrow: "TÂCHES",
    title: "Gardez votre élan.",
    description: "Les priorités créatives et opérationnelles restent visibles.",
  },
  memory: {
    eyebrow: "ARTIST BRAIN",
    title: "Une mémoire sous votre contrôle.",
    description: "Ton identité artistique et tes préférences, modifiables à tout moment.",
  },
  system: {
    eyebrow: "IDA SYSTÈME",
    title: "Un état clair, à chaque instant.",
    description: "Chaque intégration garde un état compréhensible.",
  },
};

export const tracks: Track[] = [
  {
    title: "Afterimage",
    project: "Next release",
    status: "UNRELEASED",
    bpm: 124,
    key: "F♯ minor",
    freshness: "Jamais utilisé en contenu",
  },
  {
    title: "Late Signal",
    project: "Studio archive",
    status: "DEMO",
    bpm: 128,
    key: "A minor",
    freshness: "Preview disponible",
  },
  {
    title: "Luminous",
    project: "Current catalogue",
    status: "RELEASED",
    bpm: 122,
    key: "C major",
    freshness: "Utilisé il y a 18 jours",
  },
];

export const mediaAssets: MediaAsset[] = [
  {
    filename: "studio_take_07.mp4",
    kind: "VIDEO",
    status: "UNUSED",
    detail: "42 sec · studio · Afterimage",
    tone: "violet",
  },
  {
    filename: "blue_hour_press.jpg",
    kind: "IMAGE",
    status: "UNUSED",
    detail: "Portrait · press kit · 4.8 MB",
    tone: "blue",
  },
  {
    filename: "afterimage_hook.wav",
    kind: "AUDIO",
    status: "SCHEDULED",
    detail: "0:19 · hook · demain 18:00",
    tone: "coral",
  },
];

export const systemServices: SystemService[] = [
  { name: "AI", state: "ONLINE", detail: "Commandes et contexte prêts" },
  { name: "Database", state: "ONLINE", detail: "Données du workspace disponibles" },
  { name: "Storage", state: "ONLINE", detail: "Bibliothèque média accessible" },
  { name: "Scheduler", state: "WARNING", detail: "Planning interne — worker à venir" },
  { name: "Notifications", state: "WARNING", detail: "Centre de notifications en préparation" },
  { name: "Social accounts", state: "DISCONNECTED", detail: "Connexions prévues en phase 3" },
];

export function getLocalIdaResponse(command: string): string {
  const normalized = command.toLocaleLowerCase("fr-FR");

  if (normalized.includes("aujourd") || normalized.includes("today")) {
    return "Aujourd’hui, tu as trois propositions à valider, cinq moments déjà planifiés et une campagne active à finaliser.";
  }

  if (normalized.includes("inutil") || normalized.includes("unused") || normalized.includes("média")) {
    return "Je ne peux pas vérifier les médias réellement disponibles sans IDA API. Ouvre Content Rotation une fois le hub connecté.";
  }

  if (normalized.includes("release") || normalized.includes("campagne")) {
    return "Je préparerais une campagne autour d’Afterimage avec un hook studio, un visuel éditorial et un rappel de release. Cette proposition est locale tant que l’API n’est pas connectée.";
  }

  return "Je suis en mode aperçu local. Configure VITE_IDA_API_URL pour que cette commande consulte le vrai IDA Core et ton workspace.";
}
