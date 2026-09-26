import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HubAnimatedIcon, isHubAnimatedIconKind } from "./HubAnimatedIcon";

const kinds = [
  "mail",
  "finance",
  "automation",
  "heart",
  "note",
  "cloud",
  "home",
  "clock",
  "grid",
  "calendar",
  "ideas",
  "globe",
  "document",
];

describe("Le Hub · pictogrammes vivants", () => {
  it.each(kinds)("rend %s comme dessin décoratif local, sans texte ni élément interactif", (kind) => {
    const markup = renderToStaticMarkup(createElement(HubAnimatedIcon, { kind }));
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('stroke-width="1.25"');
    expect(markup).toMatch(/<(path|rect|circle|g)\b/u);
    expect(markup).not.toMatch(/<(?:text|title|foreignObject|image|animate|button)\b|href=|tabindex=/iu);
  });

  it("laisse l’icône de repli au parent pour tout identifiant inconnu", () => {
    for (const kind of ["", "sun", "__proto__", "constructor", "<script>"]) {
      expect(isHubAnimatedIconKind(kind)).toBe(false);
      expect(renderToStaticMarkup(createElement(HubAnimatedIcon, { kind }))).toBe("");
    }
  });

  it("garde les nœuds des agents immobiles et anime seulement leurs liens", () => {
    const markup = renderToStaticMarkup(createElement(HubAnimatedIcon, { kind: "automation" }));
    expect(markup.match(/<circle\b/gu)).toHaveLength(3);
    expect(markup).toContain('class="hub-icon-links"');
    expect(markup).not.toMatch(/<circle[^>]*class=/u);
  });

  it("respecte les pauses du Hub, le mouvement réduit et ne fait pas varier la mise en page", () => {
    const css = readFileSync(new URL("./hub-animated-icon.css", import.meta.url), "utf8");
    for (const guard of [
      'data-paused="true"',
      'data-motion-paused="true"',
      'data-motion-ambient-paused="true"',
      'data-motion-level="OFF"',
      "prefers-reduced-motion: reduce",
    ])
      expect(css).toContain(guard);
    expect(css).toContain("animation-play-state: paused !important");
    expect(css).toContain("animation: none !important");
    const frames = [...css.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)(?=\n\})/gu)];
    expect(frames.length).toBeGreaterThanOrEqual(10);
    for (const [, body] of frames) {
      const properties = [...(body ?? "").matchAll(/\b([a-z-]+)\s*:/gu)].map((match) => match[1]);
      expect(
        properties.every((property) => ["transform", "opacity", "stroke-dashoffset"].includes(property ?? "")),
      ).toBe(true);
    }
    for (const [, value] of css.matchAll(/opacity:\s*([.\d]+)/gu)) expect(Number(value)).toBeGreaterThanOrEqual(0.4);
  });
});
