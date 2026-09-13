import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { type CreativeProjectDetail, creativeSections } from "../../../packages/contracts/src/creative-engine";
import { CreativeEngineWorkspace } from "./CreativeEngineWorkspace";
import { creativeDossierExport } from "./creative-engine-export";

const detail: CreativeProjectDetail = {
  project: {
    id: "task_fixture",
    title: "Fabrique · Exemple de test",
    description: "```\n<script>never()</script>",
    status: "TODO",
  },
  references: [],
  plans: [],
  notes: [],
  reviews: [],
};
describe("Creative Engine — interface et export honnêtes", () => {
  it("présente l'arborescence sans activer de capteur, provider ou callback", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const onClose = vi.fn();
    const onCreateProject = vi.fn();
    try {
      const html = renderToStaticMarkup(createElement(CreativeEngineWorkspace, { onClose, onCreateProject }));
      for (const section of creativeSections) expect(html).toContain(section.label);
      expect(html).toContain("Chargement du workspace");
      expect(html).not.toMatch(/<iframe|<video|<canvas|Aucun dossier\./u);
      expect(fetch).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(onCreateProject).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("exporte uniquement les données du dossier avec une limite explicite", () => {
    const json = JSON.parse(creativeDossierExport(detail, "json"));
    expect(json.project.id).toBe("task_fixture");
    expect(json.warning).toContain("Aucune exécution");
    expect(json).not.toHaveProperty("provider");
    const markdown = creativeDossierExport(detail, "markdown");
    expect(markdown).toContain("````text");
    expect(markdown).toContain("sans autorisation d’exécution");
  });
  it("refuse un export de réponse non conforme", () => {
    expect(() =>
      creativeDossierExport({ ...detail, plans: [{ execute: true }] } as unknown as CreativeProjectDetail, "json"),
    ).toThrow();
  });
});
