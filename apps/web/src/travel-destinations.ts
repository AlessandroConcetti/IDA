export const travelDestinations = [
  { name: "Japon", detail: "Tradition · Modernité · Émotions", city: "Tokyo", theme: "Culture", crop: "34.5%" },
  { name: "Thaïlande", detail: "Nature · Aventure · Inspiration", city: "Bangkok", theme: "Nature", crop: "45.4%" },
  { name: "Italie", detail: "Culture · Gastronomie · Art de vivre", city: "Positano", theme: "Culture", crop: "56.2%" },
  {
    name: "Islande",
    detail: "Nature brute · Grands espaces · Liberté",
    city: "Reykjavik",
    theme: "Nature",
    crop: "67.2%",
  },
  {
    name: "États-Unis",
    detail: "Villes iconiques · Road trips · Expériences",
    city: "New York",
    theme: "Villes",
    crop: "78.3%",
  },
  { name: "Bali", detail: "Spiritualité · Détente · Équilibre", city: "Ubud", theme: "Nature", crop: "89.1%" },
] as const;
export type TravelDestination = (typeof travelDestinations)[number];

export function filterDestinations(query: string, theme: string): TravelDestination[] {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const search = normalize(query.trim());
  return travelDestinations.filter(
    (place) =>
      (theme === "Toutes" || place.theme === theme) &&
      normalize(`${place.name} ${place.city} ${place.detail}`).includes(search),
  );
}
