import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HomeEnvironment } from "./HomeEnvironment";
import { homeActionLabels, homeAmbiences, homeSpaces, searchHomeSpaces } from "./home-spaces";

describe("IDA Home — espaces de navigation, sans faux appareil", () => {
  it.each([
    ["  MÉTÉO ", "terrace"],
    ["frigo", "kitchen"],
    ["musique", "living"],
    ["Care", "bedroom"],
  ])("retrouve %s sans dépendre des accents", (query, id) => {
    expect(searchHomeSpaces(query).map((room) => room.id)).toContain(id);
  });
  it("ne crée pas de pièce pour une recherche inconnue", () => {
    expect(searchHomeSpaces("")).toHaveLength(4);
    expect(searchHomeSpaces("garage absent")).toEqual([]);
  });
  it("déclare des destinations concrètes pour chaque pièce et aucune commande physique", () => {
    expect(new Set(homeSpaces.map((room) => room.id)).size).toBe(homeSpaces.length);
    for (const room of homeSpaces) {
      expect(room.actions.length).toBeGreaterThan(0);
      for (const action of room.actions) expect(homeActionLabels[action]).toBeTruthy();
      expect(room.x).toBeGreaterThan(0);
      expect(room.x).toBeLessThan(100);
      expect(room.y).toBeGreaterThan(0);
      expect(room.y).toBeLessThan(100);
    }
    expect(homeAmbiences.map((item) => item.id)).toEqual(["home", "reading", "cinema", "night"]);
  });
  it.each(["scifi", "classic"] as const)(
    "rend le décor %s sans API, micro, vidéo ou connexion automatique",
    (theme) => {
      const fetch = vi.fn();
      const getUserMedia = vi.fn();
      const navigate = vi.fn();
      vi.stubGlobal("fetch", fetch);
      vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
      try {
        const html = renderToStaticMarkup(
          createElement(HomeEnvironment, {
            titleRef: { current: null },
            theme,
            onBack: navigate,
            onFridge: navigate,
            onWeather: navigate,
            onSelect: navigate,
            onNavigate: navigate,
          }),
        );
        expect(html).toContain("home-hologram-v1.png");
        expect(html).toContain("pas le plan de votre domicile");
        expect(html).toContain("Non supervisée");
        expect(html).toContain("Aucun compteur");
        expect(html).toContain("Parler à IDA");
        expect(html).toContain('data-animated="false"');
        expect(html).not.toMatch(/<video|<iframe|<audio|<canvas|7\/12|Maison connectée/u);
        expect(fetch).not.toHaveBeenCalled();
        expect(getUserMedia).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});
