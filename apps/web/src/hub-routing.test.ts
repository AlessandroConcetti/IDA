import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuroraHome } from "./AuroraHome";
import { HubEnvironment } from "./HubEnvironment";
import { ImmersivePresence } from "./ImmersivePresence";
import { ModernBubble } from "./ModernWorlds";
import { hubArtwork } from "./orbital-wheel";
import { WorldWheel } from "./WorldWheel";
import { worlds } from "./worlds";

afterEach(() => vi.unstubAllGlobals());

describe("Le Hub · intégration des environnements", () => {
  it.each(["classic", "scifi", "modern", "orbital", "immersive"] as const)(
    "ouvre Le Hub avec l’identifiant historique social sous %s",
    (theme) => {
      const onNavigate = vi.fn();
      const html = renderToStaticMarkup(
        createElement(WorldWheel, { theme, onNavigate, initialWorldId: "social", startOpened: true }),
      );
      expect(html).toContain('data-opened="true"');
      expect(html).toMatch(/Ouverture du Hub|Le Hub · votre journal IDA/u);
      expect(html).not.toContain("Interface disponible · outils métier à venir");
      expect(onNavigate).not.toHaveBeenCalled();
    },
  );

  it("conserve l’entrée directe en Immersive et le retour aux mondes", () => {
    const onNavigate = vi.fn();
    const onThemeChange = vi.fn();
    const html = renderToStaticMarkup(
      createElement(AuroraHome, {
        theme: "immersive",
        initialWorldId: "social",
        onThemeChange,
        onNavigate,
        onCommand: vi.fn(),
        source: "local",
        isSubmitting: false,
      }),
    );
    expect(html).toContain('data-opened="true"');
    expect(html).toMatch(/Ouverture du Hub|Le Hub · votre journal IDA/u);
    expect(onThemeChange).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    const presence = renderToStaticMarkup(
      createElement(ImmersivePresence, { onThemeChange, onNavigate, onWelcome: vi.fn() }),
    );
    expect(presence).toContain("Ouvrir Le Hub");
  });

  it("partage le décor Sci-Fi du Hub avec Modern et Carrousel", () => {
    const world = worlds.find((entry) => entry.id === "social");
    expect(world).toBeDefined();
    if (!world) return;
    expect(renderToStaticMarkup(createElement(ModernBubble, { world }))).toContain(hubArtwork);
    expect(renderToStaticMarkup(createElement(WorldWheel, { theme: "orbital", onNavigate: vi.fn() }))).toContain(
      hubArtwork,
    );
  });

  it("rend les accès utiles sans seconde saisie IDA, sans déclencher de lecture ni de capteur", () => {
    const fetch = vi.fn();
    const onNavigate = vi.fn();
    const onSelect = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const html = renderToStaticMarkup(
      createElement(HubEnvironment, {
        theme: "classic",
        titleRef: createRef<HTMLHeadingElement>(),
        onBack: vi.fn(),
        onSelect,
        onNavigate,
      }),
    );
    expect(html).toContain("JOURNAL");
    expect(html).toContain('aria-label="Le Hub · retour à l’accueil IDA"');
    expect(html).toContain('data-motion-level="OFF"');
    expect(html).toContain('data-motion-paused="true"');
    expect(html).toContain("ida-quickbar__orb");
    expect(html).toContain("Ouvrir mon suivi CARE");
    expect(html).toContain("Ouvrir mon projet dans Music Studio");
    expect(html).not.toMatch(/<form|<input|<video|<audio|<iframe/u);
    expect(html.replace(/<[^>]*>/gu, " ")).not.toMatch(/78\s*%|80\s*%|21,5\s*°|3\s*200\s*€/u);
    expect(fetch).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
