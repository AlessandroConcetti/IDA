import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TypographyAtelier } from "./TypographyAtelier";

describe("Fabrique typography atelier — guarded UI", () => {
  it("renders four brand selectors, controls and explicit non-deployment notice", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      const html = renderToStaticMarkup(createElement(TypographyAtelier, { onClose: vi.fn() }));
      expect(html).toContain("Atelier typographique");
      expect(html).toContain("Egeri");
      expect(html).toContain("Alessandro");
      expect(html).toContain("Astromer / Makerz");
      expect(html).toContain("Sauvegarder le brouillon");
      expect(html).toContain("Exporter CSS");
      expect(html).toContain("Restaurer le préréglage");
      expect(html).toContain("Aucune publication");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
