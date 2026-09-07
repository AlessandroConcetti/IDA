export type HomeStartView = "worlds" | "home";
const homeStartKey = "ida.ui.start-view.v1";

/** Préférence d’affichage locale, lue seulement après la frontière d’accès. Aucune donnée de compte. */
export function readHomeStart(storage: Pick<Storage, "getItem">): HomeStartView {
  try {
    return storage.getItem(homeStartKey) === "home" ? "home" : "worlds";
  } catch {
    return "worlds";
  }
}

export function saveHomeStart(storage: Pick<Storage, "setItem">, view: HomeStartView): boolean {
  try {
    storage.setItem(homeStartKey, view);
    return true;
  } catch {
    return false;
  }
}
