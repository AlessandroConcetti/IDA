import { z } from "zod";

/** Document de préparation stocké comme texte d'une tâche, pas un domaine de réservation. */
export const notebookMarker = "IDA · Carnet de voyage · v1\n";
const date = z.string().refine((value) => value === "" || validTravelDate(value), "Date invalide");
const amount = z
  .string()
  .max(12)
  .refine((value) => value === "" || moneyCents(value) !== null, "Montant invalide");
const line = (length: number) => z.string().max(length);
const notebookSchema = z
  .object({
    version: z.literal(1),
    destination: line(120),
    start: date,
    end: date,
    travelers: z.number().int().min(1).max(30),
    currency: z.enum(["EUR", "CHF", "USD", "GBP", "JPY"]),
    budget: amount,
    notes: line(600),
    stops: z.array(z.object({ id: line(50), place: line(80), date, note: line(140) }).strict()).max(8),
    expenses: z.array(z.object({ id: line(50), label: line(60), amount }).strict()).max(8),
    checklist: z.array(z.object({ id: line(50), text: line(80), done: z.boolean() }).strict()).max(12),
  })
  .strict();
export type TravelDraft = z.infer<typeof notebookSchema>;

export function newTravelDraft(destination = ""): TravelDraft {
  return {
    version: 1,
    destination,
    start: "",
    end: "",
    travelers: 1,
    currency: "EUR",
    budget: "",
    notes: "",
    stops: [],
    expenses: [],
    checklist: [],
  };
}

export function validTravelDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2199-12-31") return false;
  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value;
}

export function moneyCents(value: string): number | null {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(value)) return null;
  const [whole = "", decimals = ""] = value.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

export function tripDays(draft: Pick<TravelDraft, "start" | "end">): number | null {
  if (!validTravelDate(draft.start) || !validTravelDate(draft.end) || draft.end < draft.start) return null;
  return Math.round((Date.parse(`${draft.end}T00:00:00Z`) - Date.parse(`${draft.start}T00:00:00Z`)) / 86400000) + 1;
}

export function travelDate(value: string): string {
  return validTravelDate(value)
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "À définir";
}

export function budgetSummary(draft: TravelDraft) {
  const filled = draft.expenses.filter((entry) => entry.amount !== "");
  const valid = filled.every((entry) => moneyCents(entry.amount) !== null);
  const total = valid && filled.length ? filled.reduce((sum, entry) => sum + (moneyCents(entry.amount) ?? 0), 0) : null;
  const target = moneyCents(draft.budget);
  return {
    total,
    target,
    remaining: total !== null && target !== null ? target - total : null,
    complete: draft.expenses.length > 0 && filled.length === draft.expenses.length && valid,
  };
}

export function formatTravelMoney(cents: number | null, currency: TravelDraft["currency"]): string {
  return cents === null
    ? "À définir"
    : new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      }).format(cents / 100);
}

export function serializeNotebook(draft: TravelDraft): string {
  return notebookMarker + JSON.stringify(draft);
}

export function notebookErrors(draft: TravelDraft): string[] {
  const errors: string[] = [];
  if (!draft.destination.trim()) errors.push("Indiquez une destination.");
  if (!notebookSchema.safeParse(draft).success)
    errors.push("Vérifiez les dates, les montants positifs et la longueur des champs.");
  if (draft.start && draft.end && draft.end < draft.start)
    errors.push("Le retour doit suivre le départ ou être le même jour.");
  if (draft.stops.some((stop) => !stop.place.trim()))
    errors.push("Donnez un lieu à chaque étape ou retirez les étapes vides.");
  if (
    draft.stops.some(
      (stop) => stop.date && ((draft.start && stop.date < draft.start) || (draft.end && stop.date > draft.end)),
    )
  )
    errors.push("Les étapes datées doivent se situer entre le départ et le retour.");
  if (draft.expenses.some((entry) => !entry.label.trim()))
    errors.push("Nommez chaque poste du budget ou retirez les postes vides.");
  if (draft.checklist.some((entry) => !entry.text.trim()))
    errors.push("Nommez chaque élément de la checklist ou retirez les lignes vides.");
  if (
    [draft.stops, draft.expenses, draft.checklist].some(
      (rows) => new Set(rows.map((row) => row.id)).size !== rows.length,
    )
  )
    errors.push("Des lignes ont le même identifiant ; ce carnet ne peut pas être enregistré.");
  if (serializeNotebook(draft).length > 4000)
    errors.push(
      "Ce carnet dépasse la capacité d’une tâche (4 000 caractères). Raccourcissez vos notes ; aucun texte n’est tronqué.",
    );
  return errors;
}

export function readNotebook(description: string | undefined): TravelDraft | null {
  if (!description?.startsWith(notebookMarker) || description.length > 4000) return null;
  try {
    const parsed = notebookSchema.safeParse(JSON.parse(description.slice(notebookMarker.length)));
    return parsed.success && notebookErrors(parsed.data).length === 0 ? parsed.data : null;
  } catch {
    return null;
  }
}

export function moveTravelRow<T>(rows: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  const copy = [...rows];
  if (index < 0 || target < 0 || index >= rows.length || target >= rows.length) return copy;
  const current = copy[index];
  const other = copy[target];
  if (current === undefined || other === undefined) return copy;
  [copy[index], copy[target]] = [other, current];
  return copy;
}

export function notebookText(draft: TravelDraft): string {
  const budget = budgetSummary(draft);
  return [
    `IDA — Carnet de préparation : ${draft.destination}`,
    `Du ${travelDate(draft.start)} au ${travelDate(draft.end)} · ${draft.travelers} voyageur(s)`,
    "Projet personnel. Aucun trajet, hébergement ou tarif vérifié ou réservé.",
    "",
    "ITINÉRAIRE",
    ...draft.stops.map((stop, index) => `${index + 1}. ${stop.place} · ${travelDate(stop.date)}\n${stop.note}`),
    "",
    `BUDGET PRÉVISIONNEL · ${draft.currency}`,
    `Enveloppe : ${formatTravelMoney(budget.target, draft.currency)}`,
    ...draft.expenses.map((entry) => `${entry.label} : ${formatTravelMoney(moneyCents(entry.amount), draft.currency)}`),
    `Sous-total renseigné : ${formatTravelMoney(budget.total, draft.currency)}`,
    "",
    "CHECKLIST",
    ...draft.checklist.map((entry) => `${entry.done ? "[x]" : "[ ]"} ${entry.text}`),
    "",
    "NOTES",
    draft.notes,
  ].join("\n");
}
