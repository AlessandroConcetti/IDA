import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HubWorldEmblem } from "./HubWorldEmblem";
import { ModernBubble } from "./ModernWorlds";
import { hubArtwork } from "./orbital-wheel";
import { WorldWheel } from "./WorldWheel";
import { worlds } from "./worlds";

describe("Le Hub · emblème partagé dans les roues", () => {
  it("réutilise l’orbe de la barre IDA sans action ni capteur", () => {
    const html = renderToStaticMarkup(createElement(HubWorldEmblem));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("ida-quickbar__orb hub-world-emblem__orb");
    expect(html.match(/<i>/gu)).toHaveLength(3);
    expect(html).not.toMatch(/<button|<canvas|<video|<img|<iframe/gu);
  });

  it.each(["classic", "scifi", "modern", "orbital", "immersive"] as const)(
    "superpose l’orbe à chaque représentation du Hub en %s, avec mouvement initialement arrêté",
    (theme) => {
      const navigate = vi.fn();
      const html = renderToStaticMarkup(createElement(WorldWheel, { theme, onNavigate: navigate }));
      expect(html.match(/class="hub-world-emblem /gu)).toHaveLength(theme === "orbital" ? 1 : 3);
      expect(html).toContain('data-motion-level="OFF"');
      expect(html).toContain('data-motion-paused="true"');
      expect(html).toContain(theme === "orbital" ? "Sélectionner Le Hub" : "Ouvrir Le Hub");
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it("garde le décor Hub et le visuel automobile sur leurs identifiants respectifs", () => {
    const hub = worlds.find((world) => world.id === "social");
    const car = worlds.find((world) => world.id === "idacar");
    expect(hub?.title).toBe("Le Hub");
    expect(car?.title).toBe("IDACAR");
    if (!hub || !car) return;
    const hubHtml = renderToStaticMarkup(createElement(ModernBubble, { world: hub }));
    const carHtml = renderToStaticMarkup(createElement(ModernBubble, { world: car }));
    expect(hubHtml).toContain(hubArtwork);
    expect(hubHtml).toContain("hub-world-emblem--bubble");
    expect(hubHtml).not.toContain("<svg");
    expect(carHtml).toContain("modern-idacar.png");
    expect(carHtml).not.toContain("hub-world-emblem");
  });
});
