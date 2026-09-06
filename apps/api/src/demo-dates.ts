// Dates des nouvelles fixtures uniquement. Les instants sont explicitement UTC,
// jamais calculés dans le fuseau du PC ; l'interface les affiche dans celui du workspace.
export function getDemoDates(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Date de démonstration invalide.");
  const at = (days: number, hour = 0, minute = 0) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour, minute)).toISOString();
  return {
    studioPlannedAt: at(2, 18),
    hookPlannedAt: at(4, 17, 30),
    upcomingReleaseDate: at(19).slice(0, 10),
  };
}
