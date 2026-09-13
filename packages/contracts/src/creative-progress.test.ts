import { describe, expect, it } from "vitest";
import {
  type CreativeProgress,
  creativePlanProgress,
  creativeProgressCreateSchema,
  creativeProjectDetailSchema,
} from "./creative-engine.js";

const plan = {
  id: "cr_plan",
  projectId: "task_fixture",
  createdAt: "2026-09-14T01:00:00Z",
  title: "Conception",
  steps: ["Documenter", "Relire"],
  acceptanceCriteria: ["Dossier relu"],
};
const event = (revision: number, stepIndex: number, completed: boolean): CreativeProgress => ({
  id: `cp_event${revision}`,
  projectId: plan.projectId,
  planId: plan.id,
  createdAt: plan.createdAt,
  revision,
  stepIndex,
  completed,
  note: null,
});
const detail = {
  project: { id: plan.projectId, title: "Fabrique · Test", description: null, status: "TODO" },
  plans: [plan],
  references: [],
  notes: [],
  reviews: [],
  progress: [],
};
describe("Suivi manuel — contrats et projection", () => {
  it("compte les déclarations et réouvertures sans muter les événements ni les critères", () => {
    const events = [event(3, 0, false), event(1, 0, true), event(2, 1, true)];
    const snapshot = JSON.stringify(events);
    const result = creativePlanProgress(plan, events);
    expect(result).toMatchObject({ completed: 1, percent: 50, revision: 3, steps: [false, true] });
    expect(result.history.map((e) => e.revision)).toEqual([1, 2, 3]);
    expect(JSON.stringify(events)).toBe(snapshot);
    expect(plan.acceptanceCriteria).toEqual(["Dossier relu"]);
    expect(result).not.toHaveProperty("approved");
  });
  it("commence à zéro sans job implicite et isole les autres plans", () => {
    expect(creativePlanProgress(plan, [{ ...event(1, 0, true), planId: "cr_other" }])).toMatchObject({
      completed: 0,
      percent: 0,
      revision: 0,
      history: [],
    });
  });
  it("ferme le payload de déclaration et borne index, révision, note", () => {
    const input = { planId: plan.id, stepIndex: 0, completed: true, expectedRevision: 0 };
    expect(creativeProgressCreateSchema.parse({ ...input, note: " Travail fait " }).note).toBe("Travail fait");
    for (const change of [
      { workspaceId: "wsp_other" },
      { approved: true },
      { execute: true },
      { stepIndex: 12 },
      { stepIndex: -1 },
      { stepIndex: 0.5 },
      { expectedRevision: -1 },
      { expectedRevision: 501 },
      { completed: "true" },
      { note: "x".repeat(301) },
    ])
      expect(creativeProgressCreateSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("lit les anciens dossiers sans inventer de progression et refuse une histoire incohérente", () => {
    expect(creativeProjectDetailSchema.parse({ ...detail, progress: undefined }).progress).toEqual([]);
    expect(creativeProjectDetailSchema.safeParse({ ...detail, progress: [event(1, 0, true)] }).success).toBe(true);
    for (const progress of [
      [event(2, 0, true)],
      [event(1, 2, true)],
      [event(1, 0, true), event(1, 1, true)],
      [{ ...event(1, 0, true), planId: "cr_foreign" }],
      [{ ...event(1, 0, true), projectId: "task_foreign" }],
    ])
      expect(creativeProjectDetailSchema.safeParse({ ...detail, progress }).success).toBe(false);
  });
});
