import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HomeConnections, homeConnectionAdvice } from "./HomeConnections";

describe("IDA Home — préparer sans connecter implicitement", () => {
  it.each(["unknown", "home-assistant", "voice-apps"] as const)(
    "donne une prochaine étape honnête pour %s",
    (setup) => {
      const advice = homeConnectionAdvice(setup);
      expect(advice.title).not.toBe("");
      expect(advice.next).not.toBe("");
      expect(advice.next).not.toMatch(/connecté|authentifié|en ligne/iu);
    },
  );
  it("ne confond pas un assistant vocal avec une passerelle installée", () => {
    expect(homeConnectionAdvice("voice-apps").next).toContain("ne suffit pas");
    expect(homeConnectionAdvice("home-assistant").next).toContain("apparaît déjà");
    expect(homeConnectionAdvice("unknown").next).toContain("N’installez pas");
  });
  it("ne collecte aucun secret, ne fait aucune lecture réseau ni seconde page", () => {
    const fetch = vi.fn();
    const getUserMedia = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    try {
      const html = renderToStaticMarkup(createElement(HomeConnections));
      expect(html).toContain("Non connectée");
      expect(html).toContain("Votre installation actuelle");
      expect(html).toContain('value="unknown" selected');
      expect(html).toContain("état d’une lampe");
      expect(html).not.toMatch(/<main|<form|<input|<iframe|<video|autoplay/iu);
      expect(html).not.toMatch(/Connecter Alexa|Connecter Google Home|Allumer|Éteindre/iu);
      expect(fetch).not.toHaveBeenCalled();
      expect(getUserMedia).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
