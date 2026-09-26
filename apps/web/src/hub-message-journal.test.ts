import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HubMessageJournal } from "./HubMessageJournal";
import type { HubMessage } from "./hub-data";

const messages: HubMessage[] = [
  { id: "a", title: "Titre alpha", detail: "Expéditeur alpha · 2026-09-26" },
  { id: "b", title: "Titre bêta", detail: "Expéditeur bêta · 2026-09-26" },
  { id: "c", title: "Titre gamma", detail: "Expéditeur gamma · 2026-09-26" },
  { id: "d", title: "Titre delta", detail: "Expéditeur delta · 2026-09-26" },
];

describe("Le Hub · journal vivant des messages", () => {
  it("affiche trois vrais aperçus une seule fois, avec des boutons stationnaires", () => {
    const onOpen = vi.fn();
    const markup = renderToStaticMarkup(createElement(HubMessageJournal, { messages, onOpen }));
    expect(markup).toContain('aria-label="Aperçu des messages reçus"');
    expect(markup.match(/<li\b/gu)).toHaveLength(3);
    expect(markup.match(/<button\b/gu)).toHaveLength(3);
    for (const message of messages.slice(0, 3)) {
      expect(markup.split(message.title)).toHaveLength(2);
      expect(markup.split(message.detail)).toHaveLength(2);
    }
    expect(markup).not.toContain("Titre delta");
    expect(markup).not.toContain("aria-live");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ne montre pas de courrier de démonstration quand la source est vide ou masquée", () => {
    expect(renderToStaticMarkup(createElement(HubMessageJournal, { messages: [], onOpen: vi.fn() }))).toBe("");
  });

  it("expose une seule fois le vrai aperçu principal avec ses métadonnées fixes", () => {
    const markup = renderToStaticMarkup(
      createElement(HubMessageJournal, {
        messages: [
          { id: "first", title: "Premier", detail: "Expéditeur", preview: "PREVIEW_FROM_SERVER" },
          { id: "second", title: "Deuxième", detail: "Expéditeur", preview: "SECOND_PREVIEW_NOT_ON_BOARD" },
        ],
        onOpen: vi.fn(),
      }),
    );
    expect(markup.split("PREVIEW_FROM_SERVER")).toHaveLength(2);
    expect(markup).toContain('class="hub-message-journal__metadata"');
    expect(markup).toContain("hub-message-journal__preview");
    expect(markup).not.toContain("SECOND_PREVIEW_NOT_ON_BOARD");
  });

  it("échappe les contenus importés et n’en fait jamais des liens ou du HTML", () => {
    const markup = renderToStaticMarkup(
      createElement(HubMessageJournal, {
        messages: [
          {
            id: "injected",
            title: '<img src=x onerror="alert(1)">',
            detail: '<script>fetch("secret")</script>',
            preview: '<img src="https://example.test/tracking" onerror="alert(1)">',
          },
        ],
        onOpen: vi.fn(),
      }),
    );
    expect(markup).toContain("&lt;img");
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toMatch(/<(?:img|script)\b|<[^>]+\s(?:href|src|onerror)=/u);
  });

  it("reste exploitable pour un mail sans objet ni détail", () => {
    const markup = renderToStaticMarkup(
      createElement(HubMessageJournal, {
        messages: [{ id: "untitled", title: " ", detail: "" }],
        onOpen: vi.fn(),
      }),
    );
    expect(markup).toContain("Sans objet");
    expect(markup).not.toContain('class="hub-message-journal__viewport"');
  });

  it("anime seulement les détails débordants après une longue pause et respecte les préférences", () => {
    const css = readFileSync(new URL("./hub-message-journal.css", import.meta.url), "utf8");
    expect(css).toContain("min(0px, calc(100cqw - 100%))");
    expect(css).toContain("hub-journal-read 24s");
    expect(css).toContain("30%");
    expect(css).toContain(":hover, :focus-within");
    for (const guard of [
      'data-paused="true"',
      'data-motion-paused="true"',
      'data-motion-ambient-paused="true"',
      'data-motion-level="OFF"',
      "prefers-reduced-motion: reduce",
      "max-width: 800px",
    ])
      expect(css).toContain(guard);
    expect(css).toContain("animation: none");
    expect(css).toContain("white-space: normal");
    const frame = css.match(/@keyframes hub-journal-read\s*\{([\s\S]*?)(?=\n\})/u)?.[1];
    expect(frame).toBeTruthy();
    expect(
      [...(frame ?? "").matchAll(/\b([a-z-]+)\s*:/gu)]
        .map((match) => match[1])
        .every((property) => property === "transform"),
    ).toBe(true);
  });
});
