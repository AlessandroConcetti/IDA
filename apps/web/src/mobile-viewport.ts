/** Layout information only: no network, device ID, storage or hardware permission. */
export function connectMobileViewport(win: Window, doc: Document): () => void {
  const root = doc.documentElement;
  const viewport = win.visualViewport;
  const previousHeight = root.style.getPropertyValue("--ida-visible-height");
  const previousKeyboard = root.getAttribute("data-soft-keyboard");
  let frame: number | undefined;
  let disposed = false;

  const measure = () => {
    frame = undefined;
    if (disposed) return;
    const height = viewport?.height ?? win.innerHeight;
    if (!Number.isFinite(height) || height <= 0) return;
    root.style.setProperty("--ida-visible-height", `${Math.round(height)}px`);
    const active = doc.activeElement;
    const editable = active?.matches(
      'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), [contenteditable="true"]',
    );
    // Pinch zoom and browser toolbars must not be mistaken for a keyboard.
    const keyboard = Boolean(editable && (viewport?.scale ?? 1) <= 1.05 && win.innerHeight - height > 150);
    root.toggleAttribute("data-soft-keyboard", keyboard);
  };
  const schedule = () => {
    if (!disposed && frame === undefined) frame = win.requestAnimationFrame(measure);
  };
  measure();
  win.addEventListener("resize", schedule);
  viewport?.addEventListener("resize", schedule);
  doc.addEventListener("focusin", schedule);
  doc.addEventListener("focusout", schedule);
  return () => {
    disposed = true;
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    win.removeEventListener("resize", schedule);
    viewport?.removeEventListener("resize", schedule);
    doc.removeEventListener("focusin", schedule);
    doc.removeEventListener("focusout", schedule);
    if (previousHeight) root.style.setProperty("--ida-visible-height", previousHeight);
    else root.style.removeProperty("--ida-visible-height");
    if (previousKeyboard === null) root.removeAttribute("data-soft-keyboard");
    else root.setAttribute("data-soft-keyboard", previousKeyboard);
  };
}
