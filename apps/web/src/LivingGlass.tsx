import { useEffect } from "react";

const controlSelector =
  'button:not(.world-card):not(.mobile-more-dismiss), [role="tab"], .home-sidebar a, .aurora-mobile-navigation a, .aurora-more-spaces summary';

/** Reflet purement local : un seul contrôle éclairé, aucune boucle au repos. */
export function LivingGlass({ root }: { root: HTMLElement }) {
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)",
    );
    let active: HTMLElement | null = null;
    let pending: { target: HTMLElement; x: number; y: number } | null = null;
    let frame = 0;

    function clear() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      if (active) {
        delete active.dataset.glassHot;
        active.style.removeProperty("--glass-light-x");
        active.style.removeProperty("--glass-light-y");
        active = null;
      }
    }

    function paint() {
      frame = 0;
      if (!pending) return;
      const { target, x, y } = pending;
      pending = null;
      if (
        !root.contains(target) || document.hidden || reduced.matches ||
        target.matches(':disabled, [aria-disabled="true"]') || target.closest('[data-surface="solid"]')
      ) {
        clear();
        return;
      }
      const bounds = target.getBoundingClientRect();
      if (active !== target) clear();
      active = target;
      target.dataset.glassHot = "true";
      target.style.setProperty("--glass-light-x", `${Math.round(x - bounds.left)}px`);
      target.style.setProperty("--glass-light-y", `${Math.round(y - bounds.top)}px`);
    }

    function point(event: PointerEvent) {
      if (reduced.matches || document.hidden) return clear();
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(controlSelector) : null;
      if (
        !target || !root.contains(target) || target.matches(':disabled, [aria-disabled="true"]') ||
        target.closest('[data-surface="solid"]')
      ) return clear();
      pending = { target, x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    }

    function release(event: PointerEvent) {
      if (event.pointerType !== "mouse") clear();
    }
    function updateVisibility() {
      root.dataset.glassPaused = String(document.hidden || reduced.matches);
      if (document.hidden || reduced.matches) clear();
    }

    updateVisibility();
    root.addEventListener("pointermove", point, { passive: true });
    root.addEventListener("pointerdown", point, { passive: true });
    root.addEventListener("pointerup", release, { passive: true });
    root.addEventListener("pointerleave", clear);
    root.addEventListener("pointercancel", clear);
    root.addEventListener("scroll", clear, { passive: true, capture: true });
    window.addEventListener("blur", clear);
    window.addEventListener("scroll", clear, { passive: true });
    document.addEventListener("visibilitychange", updateVisibility);
    reduced.addEventListener("change", updateVisibility);
    return () => {
      clear();
      delete root.dataset.glassPaused;
      root.removeEventListener("pointermove", point);
      root.removeEventListener("pointerdown", point);
      root.removeEventListener("pointerup", release);
      root.removeEventListener("pointerleave", clear);
      root.removeEventListener("pointercancel", clear);
      root.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
      window.removeEventListener("scroll", clear);
      document.removeEventListener("visibilitychange", updateVisibility);
      reduced.removeEventListener("change", updateVisibility);
    };
  }, [root]);
  return null;
}
