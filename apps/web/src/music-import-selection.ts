export interface MusicCandidate {
  name: string;
  lastModified: number;
  size: number;
}

/** Normalisation prudente : suffixes d'exports uniquement, pas de rapprochement flou. */
export function canonicalMusicTitle(filename: string): string {
  return filename
    .replace(/\.(mp3|wav|flac|aiff?|m4a|ogg|aac)$/iu, "")
    .replace(/\s*(?:[-_]\s*)?(?:copie|copy)(?:\s*\(\d+\)|\s+\d+)?$/iu, "")
    .replace(/\s*\((?:original|orginal)\s+(?:\d+\s+)?mix\)/giu, "")
    .replace(/\s+(?:AST|OK|FINAL|MASTER(?:ED)?|V\d+|MIX\s*\d+)$/iu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function newestMusicFiles<T extends MusicCandidate>(files: readonly T[]): T[] {
  const selected = new Map<string, T>();
  for (const file of files) {
    if (!/\.(mp3|wav|flac|aiff?|m4a|ogg|aac)$/iu.test(file.name)) continue;
    const key = canonicalMusicTitle(file.name).normalize("NFKC").toLocaleLowerCase("fr");
    const prior = selected.get(key);
    // Date exacte d'abord ; à égalité seulement, conserver le lossless.
    const lossless = (name: string) => (/\.(wav|flac|aiff?)$/iu.test(name) ? 1 : 0);
    if (
      !prior ||
      file.lastModified > prior.lastModified ||
      (file.lastModified === prior.lastModified && lossless(file.name) > lossless(prior.name))
    )
      selected.set(key, file);
  }
  return [...selected.values()].sort((a, b) =>
    canonicalMusicTitle(a.name).localeCompare(canonicalMusicTitle(b.name), "fr"),
  );
}
