import type { HomeTheme } from "./worlds";

const themeKey = "ida.ui.theme.v1";
export function readTheme(storage?: Pick<Storage, "getItem">): HomeTheme {
  try {
    return storage?.getItem(themeKey) === "scifi" ? "scifi" : "classic";
  } catch {
    return "classic";
  }
}
export function applyTheme(theme: HomeTheme, root: HTMLElement, storage?: Pick<Storage, "setItem">): void {
  root.dataset.theme = theme;
  try {
    storage?.setItem(themeKey, theme);
  } catch {
    /* La préférence reste valable pour cette visite. */
  }
}
