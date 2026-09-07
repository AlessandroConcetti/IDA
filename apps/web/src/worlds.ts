import type { NavigationId } from "./data";

/** Navigation cliente uniquement. Ce catalogue n'accorde aucun outil ni permission. */
export interface IdaWorld {
  id: string;
  title: string;
  description: string;
  glyph: string;
  spaces: readonly { title: string; target: NavigationId; detail: string }[];
  video?: string;
}

export type HomeTheme = "classic" | "scifi";

export const worlds: readonly IdaWorld[] = [
  { id: "travel", title: "Travel", description: "Découvrir · Explorer · Planifier", glyph: "↗", spaces: [] },
  {
    id: "workspace",
    title: "Workspace",
    description: "Organiser · Gérer · Avancer",
    glyph: "◇",
    spaces: [
      { title: "Command Center", target: "home", detail: "Votre journée et vos priorités." },
      { title: "Conversation IDA", target: "ida", detail: "Interroger le même Core, dans tous vos mondes." },
      { title: "Tâches", target: "tasks", detail: "Créer et suivre vos tâches locales." },
      { title: "Mémoire", target: "memory", detail: "Vos préférences, enregistrées avec votre accord." },
      { title: "Système & agents", target: "system", detail: "Les capacités et l’état réel d’IDA." },
    ],
  },
  {
    id: "music",
    title: "Music Studio",
    description: "Créer · Produire · Explorer",
    glyph: "♫",
    video: "/design/world-reference-v1.mp4",
    spaces: [
      { title: "Artist Brain", target: "memory", detail: "Identité, inspirations et direction artistique." },
      { title: "Music Brain", target: "music", detail: "Morceaux, catalogue et releases." },
    ],
  },
  {
    id: "creative",
    title: "Content Studio",
    description: "Créer · Éditer · Partager",
    glyph: "▷",
    spaces: [
      { title: "Content Library", target: "content", detail: "Importer et retrouver vos images, sons et vidéos." },
    ],
  },
  {
    id: "social",
    title: "Social Hub",
    description: "Préparer · Valider · Mesurer",
    glyph: "◌",
    spaces: [
      { title: "Social Brain", target: "social", detail: "Capacités réelles des plateformes et intégrations." },
      {
        title: "Approval Center",
        target: "content",
        detail: "Bibliothèque et propositions à valider, sans publication automatique.",
      },
      { title: "Calendrier", target: "calendar", detail: "Votre planning éditorial interne." },
      { title: "Campagnes", target: "campaigns", detail: "Organiser vos briefs et objectifs." },
      { title: "Statistiques", target: "analytics", detail: "Les mesures disponibles, sans chiffres inventés." },
    ],
  },
  { id: "finance", title: "Finance", description: "Budget · Comptes · Suivi", glyph: "▥", spaces: [] },
  { id: "research", title: "Research", description: "Apprendre · Chercher · Comprendre", glyph: "⌕", spaces: [] },
  { id: "admin", title: "Admin", description: "Documents · Démarches · Organisation", glyph: "▤", spaces: [] },
  { id: "legal", title: "Legal", description: "Comprendre · Vérifier · Accompagner", glyph: "⚖", spaces: [] },
  { id: "health", title: "Health", description: "Prendre soin · Suivre · Équilibrer", glyph: "♡", spaces: [] },
  {
    id: "home",
    title: "IDA Home",
    description: "Retrouver · Organiser · Avancer",
    glyph: "⌂",
    spaces: [
      { title: "Mes tâches", target: "tasks", detail: "Vos tâches et leurs échéances, sans nouvelle liste parallèle." },
      { title: "Calendrier", target: "calendar", detail: "Vos planifications éditoriales internes." },
      { title: "Mémoire", target: "memory", detail: "Vos préférences enregistrées avec votre accord." },
    ],
  },
  { id: "idacar", title: "IDACAR", description: "Mobilité · Entretien · Trajets", glyph: "↔", spaces: [] },
];

export const initialWorldIndex = worlds.findIndex((world) => world.id === "music");

export function worldIndexForKey(key: string, current: number, length: number): number | undefined {
  if (length < 1) return undefined;
  const index = Math.max(0, Math.min(length - 1, current));
  if (key === "ArrowLeft") return Math.max(0, index - 1);
  if (key === "ArrowRight") return Math.min(length - 1, index + 1);
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return undefined;
}

export function nearestWorldIndex(centers: readonly number[], viewportCenter: number): number {
  return centers.reduce(
    (best, center, index) =>
      Math.abs(center - viewportCenter) < Math.abs((centers[best] ?? 0) - viewportCenter) ? index : best,
    0,
  );
}

export interface AmbienceState {
  requested: boolean;
  visible: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  failed: boolean;
}
export function canPlayAmbience(state: AmbienceState): boolean {
  return state.requested && state.visible && !state.reducedMotion && !state.saveData && !state.failed;
}
