import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticsView, MemoryView } from "./App";
import { getLocalIdaResponse } from "./data";
import { statusLabelFr } from "./labels.fr";

describe("Démo française — données honnêtes et codes inchangés", () => {
  it.each(["aujourd’hui", "demain", "médias inutilisés", "campagne", "état système"])(
    "ne fabrique pas de résultat quand l’API manque : %s",
    (command) => {
      const response = getLocalIdaResponse(command);
      expect(response).toContain("ne peux pas confirmer");
      expect(response).toContain("Aucune demande n’est relancée automatiquement");
      expect(response).not.toMatch(
        /trois propositions|cinq moments|Afterimage|VITE_IDA_API_URL|aucune action.*exécutée/iu,
      );
    },
  );
  it("laisse les trois métriques indisponibles plutôt que d’inventer un score", () => {
    const html = renderToStaticMarkup(createElement(AnalyticsView));
    expect(html.match(/<strong>—<\/strong>/g)).toHaveLength(3);
    expect(html).not.toContain("86");
    expect(html).toContain("Données non connectées");
  });
  it("n’expose aucun faux profil modifiable avant la lecture API", () => {
    const html = renderToStaticMarkup(createElement(MemoryView));
    expect(html).toContain('class="artist-brain-fields" disabled=""');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enregistrer le profil/);
    expect(html).not.toContain("Producteur et DJ électronique");
    expect(html).not.toContain("Nuits de club");
  });
  it("présente des libellés français sans transformer les valeurs techniques", () => {
    const codes = ["UNRELEASED", "UNUSED", "PLANNED", "NOT_CONFIGURED"];
    expect(codes.map(statusLabelFr)).toEqual(["Inédit", "Inutilisé", "Prévu — inactif", "Publication non configurée"]);
    expect(codes).toEqual(["UNRELEASED", "UNUSED", "PLANNED", "NOT_CONFIGURED"]);
    expect(statusLabelFr("FUTURE_STATUS")).toBe("FUTURE_STATUS");
    expect(statusLabelFr("constructor")).toBe("constructor");
  });
});
