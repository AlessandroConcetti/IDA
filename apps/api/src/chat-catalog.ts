import { mediaListQuerySchema } from "@ida/contracts";
import type { MusicTrackFact } from "@ida/contracts/music-context";
import type { CatalogCommand } from "./catalog-command.js";
import type { DemoDatabase, MediaAsset, TodayItem } from "./database.js";

export type ChatMediaFact = Pick<MediaAsset, "id" | "filename" | "mediaType" | "status">;

const statusLabels: Record<MusicTrackFact["status"] | MediaAsset["status"], string> = {
  DEMO: "démo",
  UNRELEASED: "non sorti",
  SCHEDULED: "programmé",
  RELEASED: "sorti",
  ARCHIVED: "archivé",
  UNUSED: "inutilisé",
  USED: "utilisé",
  PUBLISHED: "publié",
};
const typeLabels: Record<MediaAsset["mediaType"], string> = {
  IMAGE: "image",
  VIDEO: "vidéo",
  AUDIO: "audio",
  DOCUMENT: "document",
  OTHER: "autre fichier",
};

// Une valeur importée reste du texte, jamais une instruction ou du balisage.
// Borner les libellés protège aussi le contrat d'historique (4 000 caractères).
export function chatLabel(value: string, max = 120): string {
  const label = value
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function trackSearchMessage(tracks: MusicTrackFact[], title: string | undefined, limit: number): string {
  const selection = title === undefined ? "du catalogue" : `dont le titre contient « ${chatLabel(title)} »`;
  if (tracks.length === 0) return `Je n’ai trouvé aucun morceau non archivé ${selection}. Essaie un autre titre.`;
  return [
    `${tracks.length} morceau${tracks.length > 1 ? "x" : ""} non archivé${tracks.length > 1 ? "s" : ""} ${selection} (limite : ${limit}, tri par titre).`,
    ...tracks.map((track, index) => {
      const bpm = track.bpm === null ? "BPM non renseigné" : `${track.bpm} BPM`;
      const key = track.musicalKey === null ? "tonalité non renseignée" : chatLabel(track.musicalKey, 32);
      return `${index + 1}. « ${chatLabel(track.title)} » — ${chatLabel(track.artistCredit, 80)} · ${bpm} · ${key} · ${statusLabels[track.status]}`;
    }),
    "Source : Music Brain. Aucun classement de qualité ni analyse audio n’a été effectué.",
  ].join("\n");
}

/** Lecture de bibliothèque, distincte de la rotation éditoriale : UNUSED ne garantit pas la disponibilité. */
export async function readChatMedia(
  database: DemoDatabase,
  workspaceId: string,
  command: Extract<CatalogCommand, { kind: "SEARCH_MEDIA" }>,
): Promise<ChatMediaFact[]> {
  const query = mediaListQuerySchema.parse({
    limit: command.limit,
    ...(command.q === undefined ? {} : { q: command.q }),
    ...(command.mediaType === undefined ? {} : { type: command.mediaType }),
    ...(command.status === undefined ? {} : { status: command.status }),
  });
  return (await database.listMedia(workspaceId, query)).map(({ id, filename, mediaType, status }) => ({
    id,
    filename,
    mediaType,
    status,
  }));
}

export function mediaSearchMessage(
  media: ChatMediaFact[],
  command: Extract<CatalogCommand, { kind: "SEARCH_MEDIA" }>,
): string {
  const filters = [
    command.mediaType ? typeLabels[command.mediaType] : "tous types",
    command.status ? `statut ${statusLabels[command.status]}` : "tous statuts, archives incluses",
    ...(command.q === undefined ? [] : [`texte « ${chatLabel(command.q)} » dans nom, description ou tags`]),
  ].join(" ; ");
  if (media.length === 0) return `Aucun média trouvé avec ces filtres : ${filters}. Essaie un autre filtre.`;
  return [
    `${media.length} média${media.length > 1 ? "s" : ""} trouvé${media.length > 1 ? "s" : ""} (${filters} ; limite : ${command.limit}, plus récents en premier).`,
    ...media.map(
      (item, index) =>
        `${index + 1}. « ${chatLabel(item.filename, 160)} » — ${typeLabels[item.mediaType]} · ${statusLabels[item.status]}`,
    ),
    "Source : Content Library. Un statut inutilisé ne garantit pas qu’un média soit libre de toute proposition. Aucune analyse visuelle ni publication effectuée.",
  ].join("\n");
}

export function dayMessage(items: TodayItem[], dayLabel: string, timezone: string): string {
  if (items.length === 0) {
    return `${dayLabel}, aucun élément avec une échéance dans cet agenda IDA. Les tâches sans date et les calendriers externes ne sont pas inclus.`;
  }
  const clock = new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  const kinds: Record<TodayItem["kind"], string> = {
    TASK: "tâche",
    INTERNAL_SCHEDULE: "programmation interne — non publiée",
    APPROVED_VARIANT: "proposition approuvée — non publiée",
  };
  return [
    `${dayLabel}, voici ${items.length} élément${items.length > 1 ? "s" : ""} à suivre dans IDA (${timezone}).`,
    ...items.map(
      (item) => `• ${clock.format(new Date(item.dueAt))} — ${chatLabel(item.title, 160)} · ${kinds[item.kind]}`,
    ),
    "Aperçu limité à 10 éléments datés. Les tâches sans date et les calendriers externes ne sont pas inclus.",
  ].join("\n");
}
