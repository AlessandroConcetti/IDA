export type CatalogCommand =
  | { kind: "SEARCH_TRACK"; title?: string; limit: number }
  | {
      kind: "SEARCH_MEDIA";
      q?: string;
      mediaType?: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
      status?: "UNUSED" | "USED" | "SCHEDULED" | "PUBLISHED";
      limit: number;
    }
  | { kind: "CLARIFY_CATALOG"; message: string };

type MediaType = Extract<CatalogCommand, { kind: "SEARCH_MEDIA" }>["mediaType"];
type MediaStatus = Extract<CatalogCommand, { kind: "SEARCH_MEDIA" }>["status"];
type Token = { value: string; key: string; start: number; end: number; quoted?: boolean; invalid?: boolean };

const trackNouns = new Set(["morceau", "morceaux", "titre", "titres", "piste", "pistes", "track", "tracks"]);
const pluralTrackNouns = new Set(["morceaux", "titres", "pistes", "tracks"]);
const unsupportedTrackFilters = new Set([
  "archive",
  "archives",
  "archivee",
  "archivees",
  "sorti",
  "sortis",
  "sortie",
  "sorties",
  "demo",
  "demos",
  "brouillon",
  "brouillons",
  "bpm",
  "tempo",
  "tempos",
  "tonalite",
  "tonalites",
  "frequence",
  "frequences",
  "hz",
  "khz",
  "majeur",
  "majeure",
  "mineur",
  "mineure",
]);
const genericMediaNouns = new Set(["media", "medias", "contenu", "contenus"]);
const mediaTypes: Readonly<Record<string, MediaType>> = {
  image: "IMAGE",
  images: "IMAGE",
  photo: "IMAGE",
  photos: "IMAGE",
  video: "VIDEO",
  videos: "VIDEO",
  audio: "AUDIO",
  audios: "AUDIO",
  document: "DOCUMENT",
  documents: "DOCUMENT",
  autre: "OTHER",
  autres: "OTHER",
};
const mediaStatuses: Readonly<Record<string, MediaStatus>> = {
  inutilise: "UNUSED",
  inutilises: "UNUSED",
  inutilisee: "UNUSED",
  inutilisees: "UNUSED",
  utilise: "USED",
  utilises: "USED",
  utilisee: "USED",
  utilisees: "USED",
  planifie: "SCHEDULED",
  planifies: "SCHEDULED",
  planifiee: "SCHEDULED",
  planifiees: "SCHEDULED",
  programme: "SCHEDULED",
  programmes: "SCHEDULED",
  programmee: "SCHEDULED",
  programmees: "SCHEDULED",
  publie: "PUBLISHED",
  publies: "PUBLISHED",
  publiee: "PUBLISHED",
  publiees: "PUBLISHED",
};
const numbers: Readonly<Record<string, number>> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
};
const determiners = new Set(["mes", "mon", "ma", "les", "le", "la", "des"]);
const queryMarkers = new Set(["nomme", "nommes", "nommee", "nommees", "appele", "appeles", "appelee", "appelees"]);
const unsupportedQueryWords = new Set([
  "sauf",
  "pas",
  "non",
  "sans",
  "avec",
  "de",
  "du",
  "des",
  "pour",
  "avant",
  "apres",
  "entre",
  "meilleur",
  "meilleurs",
  "meilleure",
  "meilleures",
  "recent",
  "recents",
  "recente",
  "recentes",
  "premier",
  "premiers",
  "premiere",
  "premieres",
  "dernier",
  "derniers",
  "derniere",
  "dernieres",
  "et",
  "ou",
  "puis",
  "ensuite",
  "publie",
  "publier",
  "supprime",
  "supprimer",
  "envoie",
  "envoyer",
  "ignore",
  "execute",
  "executer",
  "telecharge",
  "telecharger",
  "programme",
  "programmer",
]);

function key(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("’", "'");
}

function clarify(
  message = "Précise une recherche de morceaux ou de médias, avec une limite de 1 à 10. Pour les médias, indique au plus un type et un statut. Place le titre ou le texte recherché entre guillemets ; les tris, dates, exclusions et actions combinées ne sont pas pris en charge.",
): CatalogCommand {
  return {
    kind: "CLARIFY_CATALOG",
    message,
  };
}

// Quoted spans remain opaque data. Positions preserve the spelling and spacing of unquoted values.
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const closingQuotes: Readonly<Record<string, string | undefined>> = {
    '"': '"',
    "«": "»",
    "“": "”",
    "'": "'",
    "‘": "’",
  };
  let cursor = 0;
  while (cursor < source.length) {
    if (/\s/u.test(source.charAt(cursor))) {
      cursor += 1;
      continue;
    }
    const start = cursor;
    const closer = closingQuotes[source.charAt(cursor)];
    if (closer) {
      cursor += 1;
      const valueStart = cursor;
      while (cursor < source.length && (source[cursor] !== closer || source[cursor - 1] === "\\")) cursor += 1;
      const invalid = cursor === source.length;
      const value = source.slice(valueStart, cursor).trim();
      if (!invalid) cursor += 1;
      tokens.push({ value, key: key(value), start, end: cursor, quoted: true, invalid });
      continue;
    }
    if (/[.,!?;:]/u.test(source.charAt(cursor))) cursor += 1;
    else while (cursor < source.length && !/[\s.,!?;:"«»“”]/u.test(source.charAt(cursor))) cursor += 1;
    // A stray closing quote is invalid syntax, not a word or an invitation to skip text.
    if (cursor === start) cursor += 1;
    const value = source.slice(start, cursor);
    tokens.push({ value, key: key(value), start, end: cursor });
  }
  return tokens;
}

function isNoun(token: Token): boolean {
  return (
    !token.quoted &&
    (trackNouns.has(token.key) ||
      genericMediaNouns.has(token.key) ||
      (Object.hasOwn(mediaTypes, token.key) && mediaTypes[token.key] !== "OTHER"))
  );
}

function trimCourtesy(tokens: Token[]): Token[] {
  let end = tokens.length;
  const trimPunctuation = () => {
    while (end > 0) {
      const token = tokens[end - 1];
      if (!token || token.quoted || !/^[.!?]$/u.test(token.key)) break;
      end -= 1;
    }
  };
  trimPunctuation();
  const suffixes = [["svp"], ["s'il", "te", "plait"], ["s'il", "vous", "plait"]];
  for (const suffix of suffixes) {
    const start = end - suffix.length;
    if (
      start >= 0 &&
      suffix.every((word, index) => {
        const token = tokens[start + index];
        return token !== undefined && !token.quoted && token.key === word;
      })
    ) {
      end = start;
      const preceding = tokens[end - 1];
      if (preceding?.key === "," && !preceding.quoted) end -= 1;
      trimPunctuation();
      break;
    }
  }
  return tokens.slice(0, end);
}

function parseLimit(prefix: Token[]): number | undefined {
  let index = 0;
  const first = prefix[0];
  if (first && determiners.has(first.key)) index += 1;
  if (index === prefix.length) return 5;
  const token = prefix[index];
  if (!token) return undefined;
  const limit = Object.hasOwn(numbers, token.key)
    ? numbers[token.key]
    : /^\d+$/u.test(token.key)
      ? Number(token.key)
      : undefined;
  return index + 1 === prefix.length && limit !== undefined && limit >= 1 && limit <= 10 ? limit : undefined;
}

function parseQuery(tokens: Token[], source: string): string | undefined {
  const first = tokens[0];
  const last = tokens.at(-1);
  if (!first || !last) return undefined;
  if (tokens.length === 1 && first.quoted && !first.invalid) return first.value || undefined;
  if (
    tokens.some(
      (token) =>
        token.quoted ||
        token.invalid ||
        unsupportedQueryWords.has(token.key) ||
        isNoun(token) ||
        Object.hasOwn(mediaStatuses, token.key) ||
        Object.hasOwn(mediaTypes, token.key) ||
        /[.,!?;:«»“”]/u.test(token.value) ||
        /^d'/u.test(token.key),
    )
  )
    return undefined;
  return source.slice(first.start, last.end);
}

/** Recognizes only a complete, explicit catalogue command; never extracts instructions from prose. */
export function parseCatalogCommand(message: string): CatalogCommand | undefined {
  const command =
    /^(?:ida(?:\s*[,!:]\s*|\s+))?(?:(?:cherche|trouve|recherche|liste|affiche|montre)(?:-moi|\s+moi)?|(?:peux|pourrais)(?:-tu|\s+tu)\s+(?:me\s+)?(?:chercher|trouver|rechercher|lister|afficher|montrer))\s+(.+)$/iu.exec(
      message.trim(),
    );
  const source = command?.[1];
  if (source === undefined) return undefined;
  const tokens = trimCourtesy(tokenize(source));
  // Quoted text cannot supply the command's catalogue noun. Punctuation in a numeric
  // prefix is an ambiguous limit; punctuation in prose is not a catalogue instruction.
  const nounIndex = tokens.findIndex((token) => isNoun(token));
  const noun = tokens[nounIndex];
  if (!noun) return undefined;
  const prefix = tokens.slice(0, nounIndex);
  if (prefix.some((token) => token.quoted)) return undefined;
  const punctuationIndex = prefix.findIndex((token) => /[.,!?;:]/u.test(token.value));
  if (punctuationIndex >= 0) {
    const beforePunctuation = prefix.slice(0, punctuationIndex);
    return beforePunctuation.length > 0 &&
      beforePunctuation.every(
        (token) => determiners.has(token.key) || Object.hasOwn(numbers, token.key) || /^\d+$/u.test(token.key),
      )
      ? clarify()
      : undefined;
  }
  const limit = parseLimit(prefix);
  if (limit === undefined) return clarify();
  const tail = tokens.slice(nounIndex + 1);
  if (trackNouns.has(noun.key)) {
    const first = tail[0];
    if (!first) return { kind: "SEARCH_TRACK", limit };
    const hasQueryMarker = !first.quoted && queryMarkers.has(first.key);
    // A bare plural suffix may be an unsupported filter, whereas a singular title
    // such as "Demain" is a supported direct lookup. Quoted values stay opaque data.
    if (pluralTrackNouns.has(noun.key) && !hasQueryMarker && !first.quoted) return clarify();
    const queryTokens = hasQueryMarker ? tail.slice(1) : tail;
    if (queryTokens.some((token) => !token.quoted && unsupportedTrackFilters.has(token.key))) return clarify();
    const title = parseQuery(queryTokens, source);
    if (title !== undefined && title.length > 120)
      return clarify(
        "Le titre recherché doit contenir au plus 120 caractères. Raccourcis le titre pour préciser la recherche.",
      );
    return title === undefined ? clarify() : { kind: "SEARCH_TRACK", title, limit };
  }
  let mediaType = Object.hasOwn(mediaTypes, noun.key) ? mediaTypes[noun.key] : undefined;
  let status: MediaStatus;
  let q: string | undefined;
  for (const [index, token] of tail.entries()) {
    if (token.quoted || token.key === "contenant" || queryMarkers.has(token.key)) {
      q = parseQuery(tail.slice(token.quoted ? index : index + 1), source);
      if (q === undefined) return clarify();
      if (q.length > 160)
        return clarify(
          "Le texte recherché dans les médias doit contenir au plus 160 caractères. Raccourcis ce texte pour préciser la recherche.",
        );
      break;
    }
    if (Object.hasOwn(mediaTypes, token.key)) {
      if (mediaType !== undefined) return clarify();
      mediaType = mediaTypes[token.key];
    } else if (Object.hasOwn(mediaStatuses, token.key)) {
      if (status !== undefined) return clarify();
      status = mediaStatuses[token.key];
    } else return clarify();
  }
  return {
    kind: "SEARCH_MEDIA",
    ...(mediaType ? { mediaType } : {}),
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    limit,
  };
}
