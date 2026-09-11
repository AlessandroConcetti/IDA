import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { connectMobileViewport } from "./mobile-viewport";

function fixture(withViewport = true) {
  const styles = new Map<string, string>();
  const attributes = new Map<string, string>();
  const root = {
    style: {
      getPropertyValue: (name: string) => styles.get(name) ?? "",
      setProperty: (name: string, value: string) => styles.set(name, value),
      removeProperty: (name: string) => styles.delete(name),
    },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
    toggleAttribute: (name: string, enabled: boolean) => (enabled ? attributes.set(name, "") : attributes.delete(name)),
  };
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  const viewport = Object.assign(new EventTarget(), { height: 844, scale: 1 });
  const win = Object.assign(new EventTarget(), {
    innerHeight: 844,
    visualViewport: withViewport ? viewport : null,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      frames.set(++id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((key: number) => frames.delete(key)),
  });
  const doc = Object.assign(new EventTarget(), {
    documentElement: root,
    activeElement: { matches: (): boolean => false },
  });
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  return { win, doc, viewport, styles, attributes, flush };
}

describe("mobile viewport lifecycle", () => {
  it("keeps the editor clear while a virtual keyboard is open and restores navigation on blur", () => {
    const f = fixture();
    const stop = connectMobileViewport(f.win as unknown as Window, f.doc as unknown as Document);
    expect(f.styles.get("--ida-visible-height")).toBe("844px");
    f.doc.activeElement.matches = () => true;
    f.viewport.height = 410;
    f.doc.dispatchEvent(new Event("focusin"));
    f.viewport.dispatchEvent(new Event("resize"));
    expect(f.win.requestAnimationFrame).toHaveBeenCalledTimes(1);
    f.flush();
    expect(f.styles.get("--ida-visible-height")).toBe("410px");
    expect(f.attributes.has("data-soft-keyboard")).toBe(true);
    f.doc.activeElement.matches = () => false;
    f.doc.dispatchEvent(new Event("focusout"));
    f.flush();
    expect(f.attributes.has("data-soft-keyboard")).toBe(false);
    stop();
  });
  it("does not mistake pinch zoom or a browser toolbar for keyboard activation", () => {
    const f = fixture();
    const stop = connectMobileViewport(f.win as unknown as Window, f.doc as unknown as Document);
    f.doc.activeElement.matches = () => true;
    f.viewport.height = 400;
    f.viewport.scale = 2;
    f.viewport.dispatchEvent(new Event("resize"));
    f.flush();
    expect(f.attributes.has("data-soft-keyboard")).toBe(false);
    f.viewport.scale = 1;
    f.viewport.height = 780;
    f.viewport.dispatchEvent(new Event("resize"));
    f.flush();
    expect(f.attributes.has("data-soft-keyboard")).toBe(false);
    stop();
  });
  it("cleans listeners and a queued frame on unmount, including StrictMode remounts", () => {
    const f = fixture();
    f.styles.set("--ida-visible-height", "99px");
    const stop = connectMobileViewport(f.win as unknown as Window, f.doc as unknown as Document);
    f.viewport.dispatchEvent(new Event("resize"));
    stop();
    f.flush();
    expect(f.win.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(f.styles.get("--ida-visible-height")).toBe("99px");
    expect(f.attributes.has("data-soft-keyboard")).toBe(false);
    f.viewport.dispatchEvent(new Event("resize"));
    expect(f.win.requestAnimationFrame).toHaveBeenCalledTimes(1);
    const stopAgain = connectMobileViewport(f.win as unknown as Window, f.doc as unknown as Document);
    stopAgain();
    expect(f.styles.get("--ida-visible-height")).toBe("99px");
  });
  it("supports browsers without VisualViewport and ignores invalid measurements", () => {
    const f = fixture(false);
    const stop = connectMobileViewport(f.win as unknown as Window, f.doc as unknown as Document);
    f.win.innerHeight = 0;
    f.win.dispatchEvent(new Event("resize"));
    f.flush();
    expect(f.styles.get("--ida-visible-height")).toBe("844px");
    f.win.innerHeight = 600;
    f.win.dispatchEvent(new Event("resize"));
    f.flush();
    expect(f.styles.get("--ida-visible-height")).toBe("600px");
    stop();
  });
});

describe("mobile entry metadata", () => {
  it("has a scoped standalone manifest without token, remote URLs or an offline data cache", () => {
    const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
    expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone", lang: "fr" });
    expect(manifest.icons).toEqual([
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(/token|https?:|serviceworker/i);
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toContain("viewport-fit=cover");
    expect(html).not.toMatch(/user-scalable=no|maximum-scale=1/);
  });
});
