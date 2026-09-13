import {
  type CreativeProjectDetail,
  creativePlanProgress,
  creativeProjectDetailSchema,
} from "../../../packages/contracts/src/creative-engine";

export function creativeDossierExport(raw: CreativeProjectDetail, format: "json" | "markdown") {
  const detail = creativeProjectDetailSchema.parse(raw);
  const warning = "Dossier documentaire IDA. Aucune exécution, génération IA ou autorisation de déploiement.";
  if (format === "json") return JSON.stringify({ version: "creative-dossier.v2", warning, ...detail }, null, 2);
  // Contenu utilisateur dans des blocs de texte, pas dans du HTML ou des liens exécutables.
  const block = (value: string) => {
    const fence = "`".repeat(Math.max(3, ...Array.from(value.matchAll(/`+/gu), (match) => match[0].length + 1)));
    return `${fence}text\n${value}\n${fence}`;
  };
  return [
    "# IDA Creative Engine — dossier",
    warning,
    "## Projet",
    block(`${detail.project.title}\n${detail.project.description ?? ""}`),
    "## Références",
    ...detail.references.map((r) => block(`${r.title}\n${r.url ?? "Source non renseignée"}\n${r.notes}`)),
    "## Plans",
    ...detail.plans.map((p) =>
      block(`${p.title}\nID : ${p.id}\nÉtapes\n${p.steps.join("\n")}\nCritères\n${p.acceptanceCriteria.join("\n")}`),
    ),
    "## Suivi manuel — déclarations humaines, sans validation automatique",
    ...detail.plans.map((p) => {
      const progress = creativePlanProgress(p, detail.progress);
      return block(
        `${p.title}\nRévision ${progress.revision} · ${progress.completed}/${p.steps.length} étapes déclarées terminées\n${p.steps.map((step, index) => `${progress.steps[index] ? "[x]" : "[ ]"} ${step}`).join("\n")}`,
      );
    }),
    ...detail.progress.map((event) =>
      block(
        `${event.planId} · révision ${event.revision} · étape ${event.stepIndex + 1} · ${event.completed ? "déclarée terminée" : "rouverte"}\n${event.createdAt}\n${event.note ?? ""}`,
      ),
    ),
    "## Notes de travail",
    ...detail.notes.map((n) => block(n.content)),
    "## Revues documentaires — sans autorisation d’exécution",
    ...detail.reviews.map((r) => block(`${r.planId} · ${r.decision}\n${r.note}`)),
  ].join("\n\n");
}
