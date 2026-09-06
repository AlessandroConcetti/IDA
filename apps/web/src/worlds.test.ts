import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuroraHome } from "./AuroraHome";
import { navigation } from "./data";
import { WorldAmbience } from "./WorldAmbience";
import { WorldWheel } from "./WorldWheel";
import { canPlayAmbience, initialWorldIndex, nearestWorldIndex, worldIndexForKey, worlds } from "./worlds";

describe("Roue des Mondes : navigation sans pouvoirs supplémentaires", () => {
  it("couvre exactement tous les modules actuels sans fabriquer de route", () => {
    const targets = new Set(worlds.flatMap((world) => world.spaces.map((space) => space.target)));
    expect([...targets].sort()).toEqual(navigation.map((item) => item.id).sort());
    expect(new Set(worlds.map((world) => world.id)).size).toBe(worlds.length);
  });
  it("regroupe Artist Brain et Music Brain dans Music Studio", () => {
    expect(worlds[initialWorldIndex]?.spaces).toEqual([
      expect.objectContaining({ title: "Artist Brain", target: "memory" }),
      expect.objectContaining({ title: "Music Brain", target: "music" }),
    ]);
    expect(worlds.find((world) => world.id === "workspace")?.spaces.some((space) => space.target === "memory")).toBe(
      true,
    );
  });
  it("ne donne aucun accès métier aux mondes futurs", () => {
    for (const id of ["travel", "finance", "research", "admin", "legal", "health", "home", "idacar"]) {
      expect(worlds.find((world) => world.id === id)?.spaces).toEqual([]);
    }
  });
  it("conserve les approbations et tous les modules éditoriaux dans Social Hub", () => {
    const spaces = worlds.find((world) => world.id === "social")?.spaces ?? [];
    expect(spaces.map((space) => space.target)).toEqual(["social", "content", "calendar", "campaigns", "analytics"]);
    expect(spaces.find((space) => space.title === "Approval Center")?.target).toBe("content");
  });
  it("ne navigue pas, ne lance pas de vidéo et n'appelle aucun outil au rendu", () => {
    const onNavigate = vi.fn();
    const html = renderToStaticMarkup(createElement(WorldWheel, { onNavigate, theme: "classic" }));
    expect(html).toContain('aria-label="La Roue des Mondes"');
    expect(html).toContain("Entrer dans Music Studio");
    expect(html).toContain("À venir");
    expect(html).not.toMatch(/<video|autoplay|<iframe/iu);
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it.each(["classic", "scifi"] as const)("le thème %s ne change que la présentation", (theme) => {
    const onNavigate = vi.fn();
    const onCommand = vi.fn();
    const onThemeChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(AuroraHome, { onNavigate, onCommand, onThemeChange, theme, source: "local", isSubmitting: false }),
    );
    expect(html).toContain(`data-theme="${theme}"`);
    expect(html).toContain("Thème de l’accueil");
    expect(html).not.toMatch(/<video|autoplay|<iframe/iu);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onCommand).not.toHaveBeenCalled();
    expect(onThemeChange).not.toHaveBeenCalled();
  });
  it("offre une navigation clavier bornée, sans capturer les autres touches", () => {
    expect(worldIndexForKey("ArrowLeft", 0, 12)).toBe(0);
    expect(worldIndexForKey("ArrowRight", 11, 12)).toBe(11);
    expect(worldIndexForKey("ArrowLeft", 3, 12)).toBe(2);
    expect(worldIndexForKey("ArrowRight", 3, 12)).toBe(4);
    expect(worldIndexForKey("Home", 3, 12)).toBe(0);
    expect(worldIndexForKey("End", 3, 12)).toBe(11);
    expect(worldIndexForKey("Enter", 3, 12)).toBeUndefined();
    expect(worldIndexForKey("Tab", 3, 12)).toBeUndefined();
    expect(worldIndexForKey("ArrowLeft", 0, 0)).toBeUndefined();
  });
  it("sélectionne la carte centrée après un défilement tactile, y compris aux extrémités", () => {
    const centers = [100, 320, 540, 760];
    expect(nearestWorldIndex(centers, -50)).toBe(0);
    expect(nearestWorldIndex(centers, 501)).toBe(2);
    expect(nearestWorldIndex(centers, 650)).toBe(2);
    expect(nearestWorldIndex(centers, 900)).toBe(3);
  });
});

describe("Ambiance vidéo opt-in", () => {
  it("ne rend aucun lecteur ni source avant une demande explicite", () => {
    const html = renderToStaticMarkup(createElement(WorldAmbience, { src: "/design/world-reference-v1.mp4" }));
    expect(html).toContain("Lire l’ambiance vidéo");
    expect(html).not.toContain("<video");
    expect(html).not.toContain(".mp4");
  });
  it("refuse chaque condition empêchant la lecture, même après une demande", () => {
    const allowed = { requested: true, visible: true, reducedMotion: false, saveData: false, failed: false };
    expect(canPlayAmbience(allowed)).toBe(true);
    expect(canPlayAmbience({ ...allowed, requested: false })).toBe(false);
    expect(canPlayAmbience({ ...allowed, visible: false })).toBe(false);
    expect(canPlayAmbience({ ...allowed, reducedMotion: true })).toBe(false);
    expect(canPlayAmbience({ ...allowed, saveData: true })).toBe(false);
    expect(canPlayAmbience({ ...allowed, failed: true })).toBe(false);
  });
  it("référence uniquement la vidéo fournie, sans image de remplacement ni URL externe", () => {
    expect(worlds.filter((world) => world.video).map((world) => world.id)).toEqual(["music"]);
    expect(worlds[initialWorldIndex]?.video).toBe("/design/world-reference-v1.mp4");
  });
});
