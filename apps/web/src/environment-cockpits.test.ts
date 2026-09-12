import { readFileSync } from "node:fs";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CareEnvironment, careSections } from "./CareEnvironment";
import { HomeEnvironment } from "./HomeEnvironment";

describe("Cockpits Home et Care sans activation implicite", () => {
  it.each(["classic", "scifi"] as const)(
    "rend les vrais contrôles Home et Care en %s, sans capteur ni réseau",
    (theme) => {
      const fetch = vi.fn();
      const getUserMedia = vi.fn();
      const onNavigate = vi.fn();
      const onSelect = vi.fn();
      vi.stubGlobal("fetch", fetch);
      vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
      try {
        const common = { theme, titleRef: createRef<HTMLHeadingElement>(), onBack: vi.fn(), onNavigate, onSelect };
        const home = renderToStaticMarkup(
          createElement(HomeEnvironment, { ...common, onFridge: vi.fn(), onWeather: vi.fn() }),
        );
        expect(home).toContain("home-hologram-v1.png");
        expect(home).toContain("Voir la maison holographique");
        expect(home).toContain("Non supervisée");
        expect(home).toContain("Aucun compteur");
        const care = renderToStaticMarkup(createElement(CareEnvironment, common));
        expect(care).toContain("Team Clinique");
        expect(care).toContain("Team Recherche");
        for (const section of careSections) expect(care).toContain(section.label);
        expect(care).not.toMatch(/Suivi actif|Analyse en cours|68 %|Spondylarthrite/iu);
        expect(home + care).not.toMatch(/<video|<iframe|autoplay|<canvas/iu);
        expect(fetch).not.toHaveBeenCalled();
        expect(getUserMedia).not.toHaveBeenCalled();
        expect(onNavigate).not.toHaveBeenCalled();
        expect(onSelect).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
  it("garde Home hors de la colonne de la roue et supprime le sprite plein écran hérité", () => {
    const css = readFileSync(new URL("./home-environment.css", import.meta.url), "utf8");
    const base = css.match(/#root \.house-environment \{([^}]+)\}/u)?.[1];
    expect(base).toMatch(/position:\s*fixed/u);
    expect(css).toMatch(/\.environment-screen\.house-environment::after\s*\{\s*content:\s*none/u);
    expect(css).toContain("prefers-reduced-motion");
  });
});
