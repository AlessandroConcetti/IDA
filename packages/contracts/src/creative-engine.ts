import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
export const creativeIdSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,100}$/u);
export const creativeProjectParamsSchema = z.object({ projectId: creativeIdSchema }).strict();
const referenceUrl = text(1000).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Une URL HTTPS sans identifiants est requise. Elle ne sera pas consultée automatiquement.");
export const creativeReferenceCreateSchema = z
  .object({
    title: text(160),
    url: referenceUrl.optional(),
    notes: text(2000),
  })
  .strict();
export const creativePlanCreateSchema = z
  .object({
    title: text(160),
    steps: z.array(text(300)).min(1).max(12),
    acceptanceCriteria: z.array(text(300)).min(1).max(12),
  })
  .strict();
export const creativeNoteCreateSchema = z.object({ content: text(2000) }).strict();
export const creativeReviewCreateSchema = z
  .object({
    planId: creativeIdSchema,
    decision: z.enum(["REVIEWED", "CHANGES_REQUESTED"]),
    note: text(1000),
  })
  .strict();
export const creativeProgressCreateSchema = z
  .object({
    planId: creativeIdSchema,
    stepIndex: z.number().int().min(0).max(11),
    completed: z.boolean(),
    expectedRevision: z.number().int().min(0).max(500),
    note: text(300).optional(),
  })
  .strict();
export const creativeInputSchemas = {
  references: creativeReferenceCreateSchema,
  plans: creativePlanCreateSchema,
  notes: creativeNoteCreateSchema,
  reviews: creativeReviewCreateSchema,
} as const;
export const creativeKindSchema = z.enum(["references", "plans", "notes", "reviews"]);
export type CreativeKind = z.infer<typeof creativeKindSchema>;
const recordFields = { id: creativeIdSchema, projectId: creativeIdSchema, createdAt: z.string().datetime() };
export const creativeProgressSchema = z
  .object({
    ...recordFields,
    planId: creativeIdSchema,
    stepIndex: z.number().int().min(0).max(11),
    completed: z.boolean(),
    revision: z.number().int().min(1).max(500),
    note: text(300).nullable(),
  })
  .strict();
export const creativeProgressResponseSchema = z.object({ data: creativeProgressSchema }).strict();
export type CreativeProgress = z.infer<typeof creativeProgressSchema>;
export type CreativeProgressInput = z.infer<typeof creativeProgressCreateSchema>;
export const creativeReferenceSchema = creativeReferenceCreateSchema.extend({
  ...recordFields,
  url: referenceUrl.nullable(),
});
export const creativePlanSchema = creativePlanCreateSchema.extend(recordFields);
export const creativeNoteSchema = creativeNoteCreateSchema.extend(recordFields);
export const creativeReviewSchema = creativeReviewCreateSchema.extend(recordFields);
export const creativeRecordSchemas = {
  references: creativeReferenceSchema,
  plans: creativePlanSchema,
  notes: creativeNoteSchema,
  reviews: creativeReviewSchema,
} as const;
export const creativeProjectSchema = z
  .object({
    id: creativeIdSchema,
    title: text(240),
    description: z.string().max(4000).nullable(),
    status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]),
  })
  .strict();
export const creativeProjectDetailSchema = z
  .object({
    project: creativeProjectSchema,
    references: z.array(creativeReferenceSchema).max(200),
    plans: z.array(creativePlanSchema).max(200),
    notes: z.array(creativeNoteSchema).max(200),
    reviews: z.array(creativeReviewSchema).max(200),
    progress: z.array(creativeProgressSchema).max(500).default([]),
  })
  .strict()
  .superRefine((detail, context) => {
    const plans = new Map(detail.plans.map((plan) => [plan.id, plan]));
    const revisions = new Map<string, Set<number>>();
    for (const [index, event] of detail.progress.entries()) {
      const plan = plans.get(event.planId);
      const seen = revisions.get(event.planId) ?? new Set<number>();
      if (
        !plan ||
        event.projectId !== detail.project.id ||
        plan.projectId !== detail.project.id ||
        event.stepIndex >= plan.steps.length ||
        seen.has(event.revision)
      ) {
        context.addIssue({ code: "custom", path: ["progress", index], message: "Historique de plan incohérent." });
      }
      seen.add(event.revision);
      revisions.set(event.planId, seen);
    }
    for (const seen of revisions.values()) {
      if (Math.max(...seen) !== seen.size)
        context.addIssue({ code: "custom", path: ["progress"], message: "Historique de plan incomplet." });
    }
  });
export const creativeProjectsResponseSchema = z.object({ data: z.array(creativeProjectSchema).max(200) }).strict();
export const creativeDetailResponseSchema = z.object({ data: creativeProjectDetailSchema }).strict();
export type CreativeProject = z.infer<typeof creativeProjectSchema>;
export type CreativeProjectDetail = z.infer<typeof creativeProjectDetailSchema>;
export type CreativeRecord = z.infer<(typeof creativeRecordSchemas)[CreativeKind]>;

/** Déclarations humaines uniquement : ce calcul ne prouve aucune exécution. */
export function creativePlanProgress(plan: z.infer<typeof creativePlanSchema>, events: CreativeProgress[]) {
  const history = events.filter((event) => event.planId === plan.id).sort((a, b) => a.revision - b.revision);
  const steps = plan.steps.map(() => false);
  for (const event of history) if (event.stepIndex < steps.length) steps[event.stepIndex] = event.completed;
  const completed = steps.filter(Boolean).length;
  return {
    history,
    steps,
    completed,
    revision: history.at(-1)?.revision ?? 0,
    percent: Math.round((completed / steps.length) * 100),
  };
}

// Catalogue documentaire uniquement. Aucune déclaration d'agent ou activation de provider.
export const creativeSections = [
  {
    key: "projects",
    label: "Projets",
    icon: "case",
    state: "REAL",
    detail: "Dossiers de conception reliés à vos tâches IDA. Pas de workspace d’exécution.",
  },
  {
    key: "references",
    label: "Références",
    icon: "book",
    state: "REAL",
    detail: "Sources et observations saisies par vous. Aucun téléchargement ni analyse IA automatique.",
  },
  {
    key: "plans",
    label: "Plans",
    icon: "map",
    state: "REAL",
    detail:
      "Plans versionnés et suivi manuel des étapes. Progression déclarée, sans exécution ni validation automatique.",
  },
  {
    key: "agents",
    label: "Agents",
    icon: "agent",
    state: "PLANNED",
    detail: "Aucun agent logiciel actif. Manifestes, outils limités et évaluations requis avant activation.",
  },
  {
    key: "workflows",
    label: "Workflows",
    icon: "automation",
    state: "PREPARED",
    detail:
      "La séquence référence → plan → revue est disponible manuellement. L’orchestration automatique n’est pas branchée.",
  },
  {
    key: "providers",
    label: "Providers",
    icon: "sliders",
    state: "BLOCKED",
    detail: "MuAPI exclu. Aucun moteur créatif installé ou activé. Revue et validation requises pour sd.cpp / Wan2GP.",
  },
  {
    key: "jobs",
    label: "Jobs",
    icon: "clock",
    state: "BLOCKED",
    detail: "Aucun job exécutable. Il manque le runner isolé, ses limites et l’autorisation d’exécution.",
  },
  {
    key: "artifacts",
    label: "Artefacts",
    icon: "export",
    state: "PREPARED",
    detail: "Le dossier peut être téléchargé en JSON ou Markdown. Aucun logiciel, image ou vidéo généré par un agent.",
  },
  {
    key: "notes",
    label: "Mémoire de travail",
    icon: "ideas",
    state: "REAL",
    detail:
      "Notes explicites du dossier, séparées de la mémoire personnelle. Partagées avec les membres autorisés du workspace actuel.",
  },
  {
    key: "reviews",
    label: "Gouvernance / validation",
    icon: "users",
    state: "REAL",
    detail: "Revue documentaire d’un plan immuable. Ne donne aucune permission d’exécuter, publier ou déployer.",
  },
] as const;
