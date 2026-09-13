import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CreativeProjectDetail } from "../../../packages/contracts/src/creative-engine";
import { CreativePlanProgress } from "./CreativePlanProgress";
import { creativeDossierExport } from "./creative-engine-export";

const plan = {
  id: "cr_plan",
  projectId: "task_fixture",
  createdAt: "2026-09-14T01:00:00Z",
  title: "Conception",
  steps: ["Documenter", "Relire"],
  acceptanceCriteria: ["Dossier relu"],
};
const progress = [
  {
    id: "cp_one",
    projectId: plan.projectId,
    planId: plan.id,
    createdAt: plan.createdAt,
    revision: 1,
    stepIndex: 0,
    completed: true,
    note: "<script>intrusion()</script>",
  },
];
describe("Plans — suivi réel déclaré, jamais simulé", () => {
  it("affiche une case persistée, échappe les notes et ne déclenche rien au rendu", () => {
    const onUpdate = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CreativePlanProgress, { plan, events: progress, busy: false, onUpdate }),
    );
    expect(html).toContain('value="1"');
    expect(html.match(/checked=""/gu)).toHaveLength(1);
    expect(html).toContain("Progression déclarée manuellement");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(onUpdate).not.toHaveBeenCalled();
  });
  it("bloque le formulaire pendant une écriture ou un état périmé", () => {
    const html = renderToStaticMarkup(
      createElement(CreativePlanProgress, { plan, events: [], busy: true, onUpdate: vi.fn() }),
    );
    expect(html).toContain('<fieldset disabled="">');
    expect(html).toContain("Aucune progression déclarée");
  });
  it("exporte l'historique et l'état déclaré sans attribuer une validation aux critères", () => {
    const detail: CreativeProjectDetail = {
      project: { id: plan.projectId, title: "Fabrique · Test", description: null, status: "TODO" },
      plans: [plan],
      references: [],
      notes: [],
      reviews: [],
      progress,
    };
    const json = JSON.parse(creativeDossierExport(detail, "json"));
    expect(json.version).toBe("creative-dossier.v2");
    expect(json.progress).toEqual(progress);
    const md = creativeDossierExport(detail, "markdown");
    expect(md).toContain("1/2 étapes déclarées terminées");
    expect(md).toContain("[x] Documenter\n[ ] Relire");
    expect(md).toContain("sans validation automatique");
  });
});
