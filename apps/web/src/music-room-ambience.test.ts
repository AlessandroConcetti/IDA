import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialMusicRoomLighting, MusicRoomAmbience, MusicRoomControls, musicRoomColors } from "./MusicRoomAmbience";

describe("Music Studio — ambiance strictement visuelle", () => {
  it("cale les flammes sur le décor original et reste arrêté avant hydratation", () => {
    const html = renderToStaticMarkup(
      createElement(MusicRoomAmbience, { paused: false, lighting: initialMusicRoomLighting }),
    );
    expect(html).toContain('viewBox="0 0 1536 1024"');
    expect(html).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(html.match(/class="music-room-ambience__flame"/g)).toHaveLength(7);
    expect(html).toContain('data-motion-level="OFF"');
    expect(html).toContain('data-motion-ambient-paused="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<audio|<video|https:|iframe/);
  });

  it("borne l’intensité et n’introduit pas de matériau réseau", () => {
    const html = renderToStaticMarkup(
      createElement(MusicRoomAmbience, { paused: true, lighting: { color: "#60d8ff", intensity: 400 } }),
    );
    expect(html).toContain('style="color:#60d8ff;opacity:1"');
    expect(html).not.toContain("opacity:4");
  });

  it("propose cinq couleurs accessibles et une intensité sans commande Home Assistant", () => {
    const html = renderToStaticMarkup(
      createElement(MusicRoomControls, { lighting: initialMusicRoomLighting, onChange: () => undefined }),
    );
    expect(musicRoomColors).toHaveLength(5);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    for (const preset of musicRoomColors) expect(html).toContain(`Néons ${preset.name.toLocaleLowerCase("fr")}`);
    expect(html).toContain('aria-label="Intensité des néons"');
    expect(html).toContain("Aucune lumière de l’appartement n’est commandée.");
  });
});
