import { describe, expect, it } from "vitest";
import {
  budgetSummary,
  moneyCents,
  moveTravelRow,
  newTravelDraft,
  notebookErrors,
  notebookMarker,
  notebookText,
  readNotebook,
  serializeNotebook,
  tripDays,
  validTravelDate,
} from "./travel-notebook";

describe("Carnet Travel — représentation d'une tâche", () => {
  it("conserve le carnet complet sans altérer accents, lignes ou ordre", () => {
    const draft = {
      ...newTravelDraft("Japon"),
      start: "2026-10-03",
      end: "2026-10-09",
      notes: "Un voyage à deux\nKyoto puis Tokyo",
      stops: [{ id: "s1", place: "Kyoto", date: "2026-10-04", note: "Se promener" }],
      expenses: [{ id: "b1", label: "Train", amount: "35,40" }],
      checklist: [{ id: "c1", text: "Préparer le sac", done: true }],
    };
    expect(notebookErrors(draft)).toEqual([]);
    expect(readNotebook(serializeNotebook(draft))).toEqual(draft);
    expect(notebookText(draft)).toContain("[x] Préparer le sac");
  });
  it("préserve les anciens formats en refusant de les interpréter ou de les écraser", () => {
    expect(readNotebook("Départ : 2026-10-03\nBudget prévu : 400 EUR")).toBeNull();
    expect(readNotebook(`${notebookMarker}{`)).toBeNull();
    expect(readNotebook(notebookMarker + JSON.stringify({ ...newTravelDraft("Bali"), version: 2 }))).toBeNull();
    expect(
      readNotebook(notebookMarker + JSON.stringify({ ...newTravelDraft("Bali"), tools: ["purchase"] })),
    ).toBeNull();
  });
  it("valide des dates civiles réelles, sans effet DST", () => {
    expect(validTravelDate("2026-02-29")).toBe(false);
    expect(validTravelDate("2028-02-29")).toBe(true);
    expect(validTravelDate("2026-13-01")).toBe(false);
    expect(validTravelDate("0099-01-01")).toBe(false);
    expect(tripDays({ start: "2026-03-28", end: "2026-03-30" })).toBe(3);
    expect(tripDays({ start: "2026-03-28", end: "2026-03-28" })).toBe(1);
    expect(tripDays({ start: "", end: "2026-03-30" })).toBeNull();
  });
  it("refuse un retour antérieur et une étape hors du voyage", () => {
    expect(notebookErrors({ ...newTravelDraft("Italie"), start: "2026-10-05", end: "2026-10-03" }).join()).toContain(
      "retour",
    );
    const invalid = {
      ...newTravelDraft("Italie"),
      start: "2026-10-05",
      end: "2026-10-07",
      stops: [{ id: "s1", place: "Rome", date: "2026-10-08", note: "" }],
    };
    expect(notebookErrors(invalid).join()).toContain("étapes datées");
    expect(readNotebook(serializeNotebook(invalid))).toBeNull();
  });
  it("calcule en centimes et distingue zéro, inconnu et montant invalide", () => {
    expect(moneyCents("0")).toBe(0);
    expect(moneyCents("10,25")).toBe(1025);
    for (const value of ["", "-10", "NaN", "1e5", "0.123", "10000000"]) expect(moneyCents(value)).toBeNull();
    const draft = {
      ...newTravelDraft("Islande"),
      budget: "30",
      expenses: [
        { id: "a", label: "Un", amount: "20,10" },
        { id: "b", label: "Deux", amount: "10,20" },
      ],
    };
    expect(budgetSummary(draft)).toEqual({ total: 3030, target: 3000, remaining: -30, complete: true });
    expect(budgetSummary(newTravelDraft()).total).toBeNull();
    expect(
      budgetSummary({ ...draft, expenses: [...draft.expenses, { id: "c", label: "À préciser", amount: "" }] }).complete,
    ).toBe(false);
  });
  it("déplace les étapes sans mutation, ni tri automatique des dates", () => {
    const original = ["A", "B", "C"];
    expect(moveTravelRow(original, 1, -1)).toEqual(["B", "A", "C"]);
    expect(moveTravelRow(original, 0, -1)).toEqual(original);
    expect(moveTravelRow(original, 2, 1)).toEqual(original);
    expect(original).toEqual(["A", "B", "C"]);
  });
  it("bloque les carnets trop grands sans troncature", () => {
    const draft = newTravelDraft("Bali");
    draft.notes = "a".repeat(600);
    draft.stops = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      place: "p".repeat(80),
      date: "",
      note: "n".repeat(140),
    }));
    draft.checklist = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, text: "c".repeat(80), done: false }));
    expect(serializeNotebook(draft).length).toBeGreaterThan(4000);
    expect(notebookErrors(draft).join()).toContain("4 000");
    expect(readNotebook(serializeNotebook(draft))).toBeNull();
    expect(draft.notes.length).toBe(600);
  });
  it("refuse les lignes vides et les identifiants dupliqués", () => {
    const draft = {
      ...newTravelDraft("Paris"),
      checklist: [
        { id: "x", text: "", done: false },
        { id: "x", text: "Préparer", done: false },
      ],
    };
    expect(notebookErrors(draft).join()).toContain("lignes vides");
    expect(notebookErrors(draft).join()).toContain("identifiant");
  });
});
