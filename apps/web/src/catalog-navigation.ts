// Les cibles viennent des objets structurés du serveur, jamais du texte du
// dialogue. Elles ne constituent pas une permission : le clic relit l'API.
export interface CatalogTarget {
  kind: "track" | "media";
  id: string;
  label: string;
}

export function isCatalogId(value: unknown, kind: CatalogTarget["kind"]): value is string {
  return (
    typeof value === "string" &&
    value.length <= 80 &&
    (kind === "track" ? /^trk_[a-z0-9_-]+$/iu : /^med_[a-z0-9_-]+$/iu).test(value)
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readCatalogTargets(data: unknown): CatalogTarget[] {
  if (!record(data) || data.state !== "COMPLETED" || !record(data.result)) return [];
  const kind = data.kind === "SEARCH_TRACK" ? "track" : data.kind === "SEARCH_MEDIA" ? "media" : undefined;
  if (!kind) return [];
  const rows = kind === "track" ? data.result.tracks : data.result.media;
  if (!Array.isArray(rows) || rows.length > 10) return [];
  const seen = new Set<string>();
  const targets: CatalogTarget[] = [];
  for (const row of rows) {
    if (!record(row) || !isCatalogId(row.id, kind)) continue;
    const rawLabel = kind === "track" ? row.title : row.filename;
    if (typeof rawLabel !== "string" || rawLabel.length > 500) continue;
    const label = rawLabel.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ").trim();
    const id = row.id;
    if (!label || seen.has(id)) continue;
    seen.add(id);
    targets.push({ kind, id, label });
  }
  return targets;
}
