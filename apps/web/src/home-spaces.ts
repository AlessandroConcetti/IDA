/** Espaces de navigation illustrés, pas un inventaire de pièces ou d'appareils réels. */
export const homeSpaces = [
  {
    id: "living",
    title: "Salon",
    icon: "home",
    x: 39,
    y: 59,
    crop: "38% 56%",
    detail: "Musique, détente et dialogue",
    actions: ["music", "dialogue"],
  },
  {
    id: "kitchen",
    title: "Cuisine",
    icon: "fridge",
    x: 61,
    y: 61,
    crop: "59% 62%",
    detail: "Frigo, produits et liste de courses",
    actions: ["fridge", "tasks"],
  },
  {
    id: "bedroom",
    title: "Chambre",
    icon: "heart",
    x: 37,
    y: 34,
    crop: "36% 33%",
    detail: "Votre quotidien et votre espace Care",
    actions: ["today", "care"],
  },
  {
    id: "terrace",
    title: "Terrasse",
    icon: "leaf",
    x: 80,
    y: 58,
    crop: "79% 57%",
    detail: "Météo et idées d'évasion",
    actions: ["weather", "travel"],
  },
] as const;
export type HomeSpace = (typeof homeSpaces)[number];
export type HomeSpaceAction = HomeSpace["actions"][number];
export const homeActionLabels: Record<HomeSpaceAction, string> = {
  music: "Ouvrir Music Studio",
  dialogue: "Dialoguer avec IDA",
  fridge: "Ouvrir mon frigo",
  tasks: "Mes tâches et courses",
  today: "Ma journée",
  care: "Mon espace Care",
  weather: "Consulter la météo",
  travel: "Explorer les voyages",
};
export function searchHomeSpaces(query: string): HomeSpace[] {
  const clean = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const search = clean(query.trim());
  return homeSpaces.filter((room) =>
    clean(`${room.title} ${room.detail} ${room.actions.map((action) => homeActionLabels[action]).join(" ")}`).includes(
      search,
    ),
  );
}
export const homeAmbiences = [
  {
    id: "home",
    label: "Maison",
    title: "Soirée chill",
    detail: "Lueur bleue et lumière chaude",
    position: "center 45%",
  },
  { id: "reading", label: "Lecture", title: "Lecture", detail: "Une interface plus chaleureuse", position: "35% 50%" },
  {
    id: "cinema",
    label: "Cinéma",
    title: "Cinéma",
    detail: "Couleurs profondes et lumière tamisée",
    position: "60% 50%",
  },
  { id: "night", label: "Nuit", title: "Nuit", detail: "Reflets atténués, animation en pause", position: "center 5%" },
] as const;
