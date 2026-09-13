import type { CommandCenterSummary, TaskRecord } from "./api";
import type { NavigationId } from "./data";

export const homeMetrics: readonly {
  key: "pendingApprovals" | "activeInternalSchedules" | "activeCampaigns" | "upcomingReleases";
  label: string;
  target: NavigationId;
}[] = [
  { key: "pendingApprovals", label: "À valider", target: "content" },
  { key: "activeInternalSchedules", label: "Planifications internes", target: "calendar" },
  { key: "activeCampaigns", label: "Campagnes actives", target: "campaigns" },
  { key: "upcomingReleases", label: "Releases à venir", target: "music" },
];

export function openHomeTasks(tasks: readonly TaskRecord[]): TaskRecord[] {
  const deadline = (task: TaskRecord) => {
    const instant = task.dueAt ? Date.parse(task.dueAt) : Number.NaN;
    return Number.isFinite(instant) ? instant : Number.POSITIVE_INFINITY;
  };
  return tasks
    .filter((task) => task.status === "TODO" || task.status === "IN_PROGRESS")
    .sort((left, right) => deadline(left) - deadline(right));
}

export function homeTimestamp(value: string | undefined, timezone: string | undefined, clock = false): string {
  if (!value || !timezone || !Number.isFinite(Date.parse(value))) return "Date indisponible";
  try {
    return new Intl.DateTimeFormat(
      "fr-FR",
      clock
        ? { timeZone: timezone, hour: "2-digit", minute: "2-digit" }
        : { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
    ).format(new Date(value));
  } catch {
    return "Date indisponible";
  }
}

export function homeWorkspaceDate(summary: CommandCenterSummary | undefined): string {
  const date = summary?.workspaceDate;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Votre espace personnel";
  const instant = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(instant.valueOf()) || instant.toISOString().slice(0, 10) !== date)
    return "Votre espace personnel";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    instant,
  );
}

const homeActivityLabels: Readonly<Record<string, string>> = {
  "task.created": "Nouvelle tâche ajoutée",
  "task.completed": "Tâche terminée",
  "creative.dossier.recorded": "Dossier de conception enrichi",
  "release.created": "Release ajoutée au catalogue",
  "track.created": "Morceau ajouté au catalogue",
  "media.imported": "Média ajouté à la bibliothèque",
  "campaign.created": "Brief de campagne créé",
  "memory.proposed": "Préférence en attente de votre accord",
  "memory.confirmed": "Préférence enregistrée",
  "memory.rejected": "Préférence refusée",
  "post_variant.approved": "Proposition approuvée",
  "post_variant.proposed": "Proposition à valider créée",
  "post_variant.rejected": "Proposition refusée",
  "post_variant.internal_scheduled": "Contenu planifié dans IDA",
  "post_variant.internal_schedule_cancelled": "Planification interne annulée",
};

export function homeActivityLabel(action: string): string {
  return Object.hasOwn(homeActivityLabels, action)
    ? (homeActivityLabels[action] ?? "Activité enregistrée")
    : "Activité enregistrée";
}
