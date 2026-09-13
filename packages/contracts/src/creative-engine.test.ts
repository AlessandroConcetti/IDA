import { describe, expect, it } from "vitest";
import { creativeInputSchemas, creativeProjectParamsSchema, creativeSections } from "./creative-engine.js";

describe("Creative Engine — contrats documentaires fermés", () => {
  it("normalise les champs et accepte une référence sans réseau", () => {
    expect(
      creativeInputSchemas.references.parse({
        title: " Source ",
        notes: " Mes observations ",
        url: "https://example.com/reference",
      }),
    ).toEqual({ title: "Source", notes: "Mes observations", url: "https://example.com/reference" });
  });
  it.each([
    "javascript:alert(1)",
    "http://example.com",
    "https://user:password@example.com",
    "file:///F:/IDA/file",
    "pas-un-lien",
  ])("refuse une URL non admissible : %s", (url) => {
    expect(creativeInputSchemas.references.safeParse({ title: "Source", notes: "Texte", url }).success).toBe(false);
  });
  it("refuse l'identité, les permissions et les champs d'exécution du client", () => {
    for (const addition of [
      { workspaceId: "wsp_other" },
      { status: "ACTIVE" },
      { execute: true },
      { provider: "MuAPI" },
    ]) {
      expect(creativeInputSchemas.notes.safeParse({ content: "Note", ...addition }).success).toBe(false);
    }
    expect(
      creativeInputSchemas.reviews.safeParse({ planId: "cr_plan", decision: "APPROVED", note: "Exécuter" }).success,
    ).toBe(false);
  });
  it("borne les listes et refuse les saisies vides", () => {
    const plan = { title: "Plan", steps: ["Étape"], acceptanceCriteria: ["Résultat vérifiable"] };
    expect(creativeInputSchemas.plans.safeParse(plan).success).toBe(true);
    for (const steps of [[], [" "], ["a".repeat(301)], Array(13).fill("Étape")])
      expect(creativeInputSchemas.plans.safeParse({ ...plan, steps }).success).toBe(false);
    expect(creativeInputSchemas.notes.safeParse({ content: "a".repeat(2001) }).success).toBe(false);
    expect(creativeProjectParamsSchema.safeParse({ projectId: "../secrets" }).success).toBe(false);
  });
  it("décrit les limites sans inventer des agents et jobs actifs", () => {
    expect(new Set(creativeSections.map((s) => s.key)).size).toBe(10);
    expect(creativeSections.find((s) => s.key === "agents")?.state).toBe("PLANNED");
    expect(creativeSections.find((s) => s.key === "jobs")?.state).toBe("BLOCKED");
    expect(creativeSections.find((s) => s.key === "providers")?.detail).toContain("MuAPI exclu");
  });
});
