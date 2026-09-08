import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CommandSuggestions, ConversationText } from "./ConversationTools";

describe("Conversation — résultats locaux lisibles", () => {
  it("conserve les lignes, les lignes vides et les accents de la réponse serveur", () => {
    const content = "2 morceaux trouvés.\n\n1. Aurore — Brouillon\n2. Éclipse — Prêt";
    const html = renderToStaticMarkup(createElement(ConversationText, { content }));
    expect(html).toBe(`<p class="conversation-text">${content}</p>`);
  });

  it("échappe le texte hostile et laisse les liens et le Markdown en texte simple", () => {
    const content = '<img src=x onerror="alert(1)">\n<script>alert("secret")</script>\n[Ouvrir](https://example.com)';
    const html = renderToStaticMarkup(createElement(ConversationText, { content }));
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("\n&lt;script&gt;alert(&quot;secret&quot;)&lt;/script&gt;\n");
    expect(html).toContain("[Ouvrir](https://example.com)");
    expect(html).not.toMatch(/<img|<script|<a\b/u);
  });

  it.each([false, true])("propose quatre exemples sans bouton d’envoi implicite, disabled=%s", (disabled) => {
    const html = renderToStaticMarkup(createElement(CommandSuggestions, { onSelect: vi.fn(), disabled }));
    expect(html).toContain("<fieldset");
    expect(html).toContain("à adapter avant envoi");
    expect(html.match(/<button\b/gu)).toHaveLength(4);
    expect(html.match(/type="button"/gu)).toHaveLength(4);
    expect(html.match(/disabled=""/gu) ?? []).toHaveLength(disabled ? 4 : 0);
    expect(html).not.toContain('type="submit"');
  });

  it("transmet uniquement le texte de l’exemple lors d’un clic et ignore les clics désactivés", () => {
    const onSelect = vi.fn();
    for (const disabled of [false, true]) {
      const element = CommandSuggestions({ onSelect, disabled });
      const buttons = element.props.children as ReactElement<{ onClick: () => void }>[];
      for (const button of buttons) button.props.onClick();
    }
    expect(onSelect.mock.calls).toEqual([
      ["Qu’est-ce que j’ai aujourd’hui ?"],
      ["Liste mes morceaux"],
      ["Trouve le morceau « Aurore »"],
      ["Montre-moi cinq vidéos inutilisées"],
    ]);
  });

  it("ne déclenche aucune sélection ni lecture réseau au rendu", () => {
    const onSelect = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      renderToStaticMarkup(createElement(CommandSuggestions, { onSelect }));
      renderToStaticMarkup(createElement(ConversationText, { content: "Résultat local" }));
      expect(onSelect).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
