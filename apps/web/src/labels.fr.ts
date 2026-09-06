// Libellés de présentation de la démo, sans modifier les codes métier/API.
const statusLabels: Readonly<Record<string, string>> = Object.freeze({
  DEMO: "Démo",
  UNRELEASED: "Inédit",
  SCHEDULED: "Planifié",
  RELEASED: "Sorti",
  ARCHIVED: "Archivé",
  DRAFT: "Brouillon",
  UNUSED: "Inutilisé",
  USED: "Utilisé",
  PUBLISHED: "Publié",
  ONLINE: "Disponible",
  WARNING: "À vérifier",
  ERROR: "Erreur",
  DISCONNECTED: "Déconnecté",
  PLANNED: "Prévu — inactif",
  REQUESTED: "À valider",
  APPROVED: "Approuvé",
  REJECTED: "Refusé",
  NOT_CONFIGURED: "Publication non configurée",
});

export function statusLabelFr(code: string): string {
  return Object.hasOwn(statusLabels, code) ? (statusLabels[code] ?? code) : code;
}
