/** Atelier typographique client : aucune permission métier, requête externe ni publication. */
export const brandIds = ["ida-studio", "alessandro", "egeri", "astromer"] as const;
export type BrandId = (typeof brandIds)[number];
export const fontIds = ["space", "plex", "cormorant", "manrope", "bodoni", "helvetica", "syne", "georgia"] as const;
export type FontId = (typeof fontIds)[number];

export interface TypographyConfig {
  brand: BrandId;
  display: FontId;
  body: FontId;
  tracking: number;
  scale: number;
  weight: 400 | 500 | 600 | 700;
  uppercase: boolean;
  motion: "none" | "fade" | "rise";
}

export const fonts: Record<FontId, { name: string; stack: string; note: string; packageName?: string }> = {
  space: { name: "Space Grotesk", stack: '"Space Grotesk Variable", "Trebuchet MS", sans-serif', note: "Famille variable auto-hébergée (Fontsource, OFL-1.1)", packageName: "@fontsource-variable/space-grotesk" },
  plex: { name: "IBM Plex Sans", stack: '"IBM Plex Sans Variable", Arial, sans-serif', note: "Famille variable auto-hébergée (Fontsource, OFL-1.1)", packageName: "@fontsource-variable/ibm-plex-sans" },
  cormorant: { name: "Cormorant Garamond", stack: '"Cormorant Garamond Variable", Georgia, serif', note: "Famille variable auto-hébergée (Fontsource, OFL-1.1)", packageName: "@fontsource-variable/cormorant-garamond" },
  manrope: { name: "Manrope", stack: "Manrope Variable", Arial, sans-serif", note: "Famille variable auto-hébergée (Fontsource, OFL-1.1)", packageName: "@fontsource-variable/manrope" },
  bodoni: { name: "Bodoni Moda", stack: '"Bodoni Moda Variable", "Times New Roman", serif', note: "Famille variable auto-hébergée (Fontsource, OFL-1.1)", packageName: "@fontsource-variable/bodoni-moda" },
  helvetica: {
    name: "Helvetica Neue (système)",
    stack: '"Helvetica Neue", Arial, sans-serif',
    note: "Licence système à vérifier pour toute distribution",
  },
  syne: { name: "Syne", stack: '"Syne Variable", "Arial Black", sans-serif', note: "Famille variable auto-hébergée (Fontsource, OFL-1.1)", packageName: "@fontsource-variable/syne" },
  georgia: { name: "Georgia (système)", stack: "Georgia, serif", note: "Police système sans fichier embarqué" },
};

export const brandMeta: Record<BrandId, { name: string; description: string; mood: string }> = {
  "ida-studio": {
    name: "IDA Studio",
    description: "Précision technologique et architecture",
    mood: "DIGITAL OBJECTS / HUMAN IDEAS",
  },
  alessandro: {
    name: "Alessandro",
    description: "Éditorial mariage, ivoire et lumière",
    mood: "Une autre idée de la célébration",
  },
  egeri: { name: "Egeri", description: "Portfolio mannequin, luxe éditorial", mood: "The presence of a silhouette." },
  astromer: {
    name: "Astromer / Makerz",
    description: "Musique et expérimentation visuelle",
    mood: "SOUND IS ANOTHER DIMENSION",
  },
};

export const defaultTypography: Record<BrandId, TypographyConfig> = {
  "ida-studio": {
    brand: "ida-studio",
    display: "space",
    body: "plex",
    tracking: -0.035,
    scale: 1.1,
    weight: 500,
    uppercase: false,
    motion: "rise",
  },
  alessandro: {
    brand: "alessandro",
    display: "cormorant",
    body: "manrope",
    tracking: -0.015,
    scale: 1.25,
    weight: 400,
    uppercase: false,
    motion: "fade",
  },
  egeri: {
    brand: "egeri",
    display: "bodoni",
    body: "helvetica",
    tracking: 0.015,
    scale: 1.22,
    weight: 400,
    uppercase: true,
    motion: "fade",
  },
  astromer: {
    brand: "astromer",
    display: "syne",
    body: "plex",
    tracking: -0.05,
    scale: 1.18,
    weight: 700,
    uppercase: true,
    motion: "rise",
  },
};

export function parseTypography(input: unknown, brand: BrandId): TypographyConfig {
  const base = defaultTypography[brand];
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ...base };
  const record = input as Record<string, unknown>;
  const isFont = (value: unknown): value is FontId =>
    typeof value === "string" && (fontIds as readonly string[]).includes(value);
  const isMotion = (value: unknown): value is TypographyConfig["motion"] =>
    value === "none" || value === "fade" || value === "rise";
  const numeric = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  const weight = record.weight;
  return {
    brand,
    display: isFont(record.display) ? record.display : base.display,
    body: isFont(record.body) ? record.body : base.body,
    tracking: numeric(record.tracking, -0.08, 0.16, base.tracking),
    scale: numeric(record.scale, 0.8, 1.5, base.scale),
    weight: weight === 400 || weight === 500 || weight === 600 || weight === 700 ? weight : base.weight,
    uppercase: typeof record.uppercase === "boolean" ? record.uppercase : base.uppercase,
    motion: isMotion(record.motion) ? record.motion : base.motion,
  };
}

export function sameTypography(left: TypographyConfig, right: TypographyConfig): boolean {
  return (
    left.display === right.display &&
    left.body === right.body &&
    left.tracking === right.tracking &&
    left.scale === right.scale &&
    left.weight === right.weight &&
    left.uppercase === right.uppercase &&
    left.motion === right.motion
  );
}

/** Les variations de graisse ou de mouvement ne créent pas une identité nouvelle. */
export function sameTypefacePair(left: TypographyConfig, right: TypographyConfig): boolean {
  return left.display === right.display && left.body === right.body;
}

export function duplicateOf(config: TypographyConfig, saved: Record<BrandId, TypographyConfig>): BrandId | null {
  return brandIds.find((id) => id !== config.brand && sameTypefacePair(config, saved[id])) ?? null;
}

/** Dépendances de police à exporter vers le site client : aucune URL externe. */
export function typographyFontPackages(config: TypographyConfig): string[] {
  return [...new Set([fonts[config.display].packageName, fonts[config.body].packageName].filter((value): value is string => Boolean(value)))].sort();
}

export function typographyCss(config: TypographyConfig): string {
  const c = parseTypography(config, config.brand);
  const heading = fonts[c.display].stack;
  const body = fonts[c.body].stack;
  const spacing = `${c.tracking.toFixed(3)}em`;
  const displaySize = `${(c.scale * 4.2).toFixed(2)}rem`;
  const lines = [
    "/* IDA Studio | Typography tokens v2 | polices locales, sans CDN */",
    `/* Packages requis : ${typographyFontPackages(c).join(", ") || "polices système uniquement"} */`,
    ":root {",
    `  --site-font-display: ${heading};`,
    `  --site-font-body: ${body};`,
    `  --site-title-spacing: ${spacing};`,
    `  --site-title-scale: ${displaySize};`,
    `  --site-title-weight: ${c.weight};`,
    "}",
    "body { font-family: var(--site-font-body); }",
    `h1, h2, .site-display { font-family: var(--site-font-display); font-weight: var(--site-title-weight); letter-spacing: var(--site-title-spacing); text-transform: ${c.uppercase ? "uppercase" : "none"}; }`,
    "h1 { font-size: clamp(2.2rem, 6vw, var(--site-title-scale)); line-height: 1.05; }",
    "p, li { line-height: 1.6; }",
  ];
  if (c.motion !== "none") {
    lines.push(`.site-display { animation: ida-type-${c.motion} 650ms ease-out both; }`);
    lines.push("@keyframes ida-type-fade { from { opacity: 0; } to { opacity: 1; } }");
    lines.push(
      "@keyframes ida-type-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }",
    );
    lines.push("@media (prefers-reduced-motion: reduce) { .site-display { animation: none; } }");
  }
  return `${lines.join("\n")}\n`;
}
