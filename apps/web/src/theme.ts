import type { HomeTheme } from "./worlds";

const themeKey = "ida.ui.theme.v1";
export function readTheme(storage?: Pick<Storage, "getItem">): HomeTheme {
  try {
    const saved = storage?.getItem(themeKey);
    return saved === "scifi" || saved === "immersive" ? saved : "classic";
  } catch {
    return "classic";
  }
}
export function applyTheme(theme: HomeTheme, root: HTMLElement, storage?: Pick<Storage, "setItem">): void {
  root.dataset.theme = themePalette(theme);
  root.dataset.experience = theme;
  try {
    storage?.setItem(themeKey, theme);
  } catch {
    /* La préférence reste valable pour cette visite. */
  }
}

/** Immersive est une présentation du même Core, avec la palette sombre existante. */
export function themePalette(theme: HomeTheme): "classic" | "scifi" {
  return theme === "classic" ? "classic" : "scifi";
}
