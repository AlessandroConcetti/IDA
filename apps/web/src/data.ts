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

export interface TodayPriority {
  label: string;
  value: string;
  detail: string;
  accent: "violet" | "blue" | "amber" | "mint";
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
  filename: string;
  kind: "VIDEO" | "IMAGE" | "AUDIO" | "FILE";
  status: "UNUSED" | "USED" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
  detail: string;
  tone: "violet" | "coral" | "blue";
}

export interface CalendarItem {
  time: string;
  title: string;
  platform: string;
  status: "APPROVAL" | "SCHEDULED" | "DRAFT";
}

export interface SocialCapability {
  name: string;
  state: "READY" | "PLANNED" | "NOT_CONNECTED";
  detail: string;
  capabilities: string[];
}

export const navigation: NavigationItem[] = [
  { id: "home", label: "HOME", glyph: "⌂" },
  { id: "ida", label: "IDA", glyph: "✦" },
  { id: "music", label: "MUSIC", glyph: "♫" },
  { id: "content", label: "CONTENT", glyph: "◇" },
  { id: "social", label: "SOCIAL", glyph: "◌" },
  { id: "calendar", label: "CALENDAR", glyph: "□" },
  { id: "campaigns", label: "CAMPAIGNS", glyph: "◎" },
  { id: "analytics", label: "ANALYTICS", glyph: "↗" },
  { id: "tasks", label: "TASKS", glyph: "✓" },
  { id: "memory", label: "MEMORY", glyph: "◒" },
  { id: "system", label: "SYSTEM", glyph: "◉" },
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
    title: "Good afternoon.",
    description: "Ton univers artistique, en un seul endroit.",
  },
  ida: {
    eyebrow: "CONVERSATION",
    title: "Talk to IDA.",
    description: "Demande, cherche, organise ou prépare une prochaine action.",
  },
  music: {
    eyebrow: "MUSIC BRAIN",
    title: "Your sound, in context.",
    description: "Tracks, releases et métadonnées reliés à ton workflow.",
  },
  content: {
    eyebrow: "CONTENT LIBRARY",
    title: "Ready when you are.",
    description: "Des médias retrouvables, frais et prêts à être proposés.",
  },
  social: {
    eyebrow: "SOCIAL CAPABILITIES",
    title: "Connected by design.",
    description: "Les capacités réelles sont visibles avant toute intégration.",
  },
  calendar: {
    eyebrow: "EDITORIAL CALENDAR",
    title: "A clear next move.",
    description: "Ton rythme éditorial, sans surcharge ni répétition.",
  },
  campaigns: {
    eyebrow: "CAMPAIGNS",
    title: "Shape the story.",
    description: "Transforme une release en campagne cohérente.",
  },
  analytics: {
    eyebrow: "ANALYTICS",
    title: "See what resonates.",
    description: "Les recommandations resteront fondées sur des données traçables.",
  },
  tasks: {
    eyebrow: "TASKS",
    title: "Keep momentum.",
    description: "Les priorités créatives et opérationnelles restent visibles.",
  },
  memory: {
    eyebrow: "ARTIST BRAIN",
    title: "A memory you control.",
    description: "Ton identité artistique et tes préférences, modifiables à tout moment.",
  },
  system: {
    eyebrow: "IDA SYSTEM",
    title: "Calm, observable, reliable.",
    description: "Chaque intégration garde un état compréhensible.",
  },
};

export const todayPriorities: TodayPriority[] = [
  {
    label: "Approvals",
    value: "3",
    detail: "propositions à valider",
    accent: "violet",
  },
  {
    label: "Scheduled",
    value: "5",
    detail: "moments déjà planifiés",
    accent: "blue",
  },
  {
    label: "Campaigns",
    value: "1",
    detail: "campagne active",
    accent: "amber",
  },
  {
    label: "Releases",
    value: "2",
    detail: "échéances à venir",
    accent: "mint",
  },
];

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

export const calendarItems: CalendarItem[] = [
  { time: "11:00", title: "Valider les trois propositions", platform: "IDA", status: "APPROVAL" },
  { time: "18:00", title: "Hook — Afterimage", platform: "Instagram", status: "SCHEDULED" },
  { time: "20:30", title: "Studio moment", platform: "TikTok", status: "DRAFT" },
];

export const systemServices: SystemService[] = [
  { name: "AI", state: "ONLINE", detail: "Commandes et contexte prêts" },
  { name: "Database", state: "ONLINE", detail: "Données du workspace disponibles" },
  { name: "Storage", state: "ONLINE", detail: "Bibliothèque média accessible" },
  { name: "Scheduler", state: "WARNING", detail: "Planning interne — worker à venir" },
  { name: "Notifications", state: "WARNING", detail: "Centre de notifications en préparation" },
  { name: "Social accounts", state: "DISCONNECTED", detail: "Connexions prévues en phase 3" },
];

export const socialCapabilities: SocialCapability[] = [
  {
    name: "Instagram",
    state: "NOT_CONNECTED",
    detail: "Connexion non activée dans cette tranche.",
    capabilities: ["Capacités API à vérifier", "Brouillons internes", "Approval Center"],
  },
  {
    name: "TikTok",
    state: "PLANNED",
    detail: "Flux pilote à définir selon les règles officielles.",
    capabilities: ["Export assisté", "Brouillons internes", "Aucune publication automatique"],
  },
  {
    name: "YouTube",
    state: "PLANNED",
    detail: "Adaptateur prévu après validation de l'éligibilité.",
    capabilities: ["Upload planifié à étudier", "Analytics à étudier", "Approval Center"],
  },
];

export function getLocalIdaResponse(command: string): string {
  const normalized = command.toLocaleLowerCase("fr-FR");

  if (normalized.includes("aujourd") || normalized.includes("today")) {
    return "Aujourd’hui, tu as trois propositions à valider, cinq moments déjà planifiés et une campagne active à finaliser.";
  }

  if (normalized.includes("inutil") || normalized.includes("unused") || normalized.includes("média")) {
    return "J’ai trouvé deux médias inutilisés dans cet aperçu local : studio_take_07.mp4 et blue_hour_press.jpg. L’API permettra bientôt de rechercher ta bibliothèque réelle.";
  }

  if (normalized.includes("release") || normalized.includes("campagne")) {
    return "Je préparerais une campagne autour d’Afterimage avec un hook studio, un visuel éditorial et un rappel de release. Cette proposition est locale tant que l’API n’est pas connectée.";
  }

  return "Je suis en mode aperçu local. Configure VITE_IDA_API_URL pour que cette commande consulte le vrai IDA Core et ton workspace.";
}
