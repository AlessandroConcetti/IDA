import { useState } from "react";
import {
  budgetSummary,
  formatTravelMoney,
  moneyCents,
  moveTravelRow,
  notebookErrors,
  notebookText,
  readNotebook,
  serializeNotebook,
  type TravelDraft,
  travelDate,
  tripDays,
} from "../../../packages/contracts/src/travel-notebook";
import type { TaskRecord } from "./api";
import { LineIcon } from "./ReferenceChrome";
import "./travel-notebook.css";

export type TravelSession = {
  draft: TravelDraft;
  initial: string;
  source: TaskRecord | null;
  pending: boolean;
  uncertain: boolean;
  notice: string;
};

const sections = [
  ["trip", "Le voyage", "plane"],
  ["route", "Itinéraire", "map"],
  ["budget", "Budget", "case"],
  ["checklist", "Checklist", "book"],
  ["review", "Mon carnet", "export"],
] as const;
type Section = (typeof sections)[number][0];

function download(draft: TravelDraft) {
  const url = URL.createObjectURL(new Blob([notebookText(draft)], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "ida-carnet-de-voyage.txt";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TravelNotebook({
  session,
  onChange,
  onSave,
  onCopy,
  onTasks,
}: {
  session: TravelSession;
  onChange: (draft: TravelDraft) => void;
  onSave: () => void;
  onCopy: () => void;
  onTasks: () => void;
}) {
  const [section, setSection] = useState<Section>(session.source ? "review" : "trip");
  const [showErrors, setShowErrors] = useState(false);
  const { draft, source, pending, uncertain } = session;
  const errors = notebookErrors(draft);
  const readonly = source !== null || pending || uncertain;
  const known = !source || readNotebook(source.description) !== null;
  const update = (patch: Partial<TravelDraft>) => onChange({ ...draft, ...patch });
  const summary = budgetSummary(draft);
  const days = tripDays(draft);
  const completed = draft.checklist.filter((item) => item.done).length;
  const money = (cents: number | null) => formatTravelMoney(cents, draft.currency);

  if (!known)
    return (
      <div className="travel-notebook">
        <h3>{source?.title.replace("Voyage · ", "")}</h3>
        <p>Ce projet utilise un ancien format ou un format non reconnu. Son contenu est conservé tel quel.</p>
        <pre className="notebook-legacy">{source?.description || "Aucune note."}</pre>
        <button type="button" onClick={onTasks}>
          Ouvrir la tâche d’origine
        </button>
      </div>
    );

  return (
    <div className="travel-notebook">
      <header className="notebook-banner">
        <div>
          <span className="notebook-eyebrow">{source ? "CARNET ENREGISTRÉ" : "CARNET DE PRÉPARATION"}</span>
          <h3>{draft.destination.trim() || "Votre prochaine destination"}</h3>
          <p>
            {travelDate(draft.start)} — {travelDate(draft.end)}
          </p>
        </div>
        <LineIcon kind="plane" />
      </header>
      <div className="notebook-facts">
        <span>
          <strong>{days ?? "—"}</strong> jours de voyage
        </span>
        <span>
          <strong>{draft.travelers}</strong> voyageur{draft.travelers > 1 ? "s" : ""}
        </span>
        <span>
          <strong>{draft.stops.length}</strong> étape{draft.stops.length > 1 ? "s" : ""}
        </span>
        <span>
          <strong>
            {completed}/{draft.checklist.length}
          </strong>{" "}
          préparatifs cochés
        </span>
      </div>
      {source ? (
        <p className="notebook-status">
          Version conservée dans les tâches. Pour la modifier, préparez une copie ; l’original reste intact.{" "}
          <button type="button" onClick={onCopy}>
            Préparer une copie
          </button>
        </p>
      ) : null}
      <nav className="notebook-tabs" aria-label="Sections du carnet">
        {sections.map(([id, label, icon]) => (
          <button type="button" key={id} aria-pressed={section === id} onClick={() => setSection(id)}>
            <LineIcon kind={icon} />
            {label}
          </button>
        ))}
      </nav>
      <fieldset disabled={readonly} className="notebook-editor">
        <legend className="sr-only">Préparation du voyage</legend>
        {section === "trip" ? (
          <>
            <h3>Les grandes lignes</h3>
            <label>
              Destination
              <input
                value={draft.destination}
                maxLength={120}
                onChange={(event) => update({ destination: event.target.value })}
                placeholder="Un pays, une ville, une région…"
              />
            </label>
            <div className="notebook-pair">
              <label>
                Départ
                <input
                  type="date"
                  min="1900-01-01"
                  max="2199-12-31"
                  value={draft.start}
                  onChange={(event) => update({ start: event.target.value })}
                />
              </label>
              <label>
                Retour
                <input
                  type="date"
                  min={draft.start || "1900-01-01"}
                  max="2199-12-31"
                  value={draft.end}
                  onChange={(event) => update({ end: event.target.value })}
                />
              </label>
            </div>
            <label>
              Nombre de voyageurs
              <select value={draft.travelers} onChange={(event) => update({ travelers: Number(event.target.value) })}>
                {Array.from({ length: 30 }, (_, index) => (
                  <option value={index + 1} key={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Envies et notes
              <textarea
                rows={4}
                value={draft.notes}
                maxLength={600}
                onChange={(event) => update({ notes: event.target.value })}
                placeholder="Le rythme, les lieux, ce que vous aimeriez vivre…"
              />
            </label>
            <p className="notebook-hint">
              Les dates sont facultatives. Ne saisissez pas de numéro de passeport, de carte bancaire ou de secret dans
              ce carnet.
            </p>
          </>
        ) : null}
        {section === "route" ? (
          <>
            <div className="notebook-section-heading">
              <h3>Votre itinéraire</h3>
              <span>{draft.stops.length}/8 étapes</span>
            </div>
            {!draft.stops.length ? (
              <div className="notebook-empty">
                <LineIcon kind="map" />
                <p>Commencez par un lieu. Ajoutez ensuite vos étapes, dans l’ordre qui vous convient.</p>
              </div>
            ) : null}
            <ol className="notebook-route">
              {draft.stops.map((stop, index) => (
                <li key={stop.id}>
                  <span className="notebook-step-number">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="notebook-pair">
                      <label>
                        Lieu de l’étape {index + 1}
                        <input
                          value={stop.place}
                          maxLength={80}
                          onChange={(event) =>
                            update({
                              stops: draft.stops.map((row) =>
                                row.id === stop.id ? { ...row, place: event.target.value } : row,
                              ),
                            })
                          }
                          placeholder="Ville, hébergement, visite…"
                        />
                      </label>
                      <label>
                        Date facultative
                        <input
                          type="date"
                          value={stop.date}
                          min={draft.start || "1900-01-01"}
                          max={draft.end || "2199-12-31"}
                          onChange={(event) =>
                            update({
                              stops: draft.stops.map((row) =>
                                row.id === stop.id ? { ...row, date: event.target.value } : row,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      À faire sur place
                      <input
                        value={stop.note}
                        maxLength={140}
                        onChange={(event) =>
                          update({
                            stops: draft.stops.map((row) =>
                              row.id === stop.id ? { ...row, note: event.target.value } : row,
                            ),
                          })
                        }
                        placeholder="Vos idées pour cette étape"
                      />
                    </label>
                    <div className="notebook-row-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`Monter l’étape ${index + 1}`}
                        onClick={() => update({ stops: moveTravelRow(draft.stops, index, -1) })}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === draft.stops.length - 1}
                        aria-label={`Descendre l’étape ${index + 1}`}
                        onClick={() => update({ stops: moveTravelRow(draft.stops, index, 1) })}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ stops: draft.stops.filter((row) => row.id !== stop.id) })}
                      >
                        Retirer l’étape {index + 1}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              disabled={draft.stops.length >= 8}
              onClick={() =>
                update({ stops: [...draft.stops, { id: crypto.randomUUID(), place: "", date: "", note: "" }] })
              }
            >
              + Ajouter une étape
            </button>
            <p className="notebook-hint">
              L’ordre reste votre choix ; IDA ne calcule pas de durée de trajet ou d’itinéraire optimal.
            </p>
          </>
        ) : null}
        {section === "budget" ? (
          <>
            <h3>Un budget à votre mesure</h3>
            <p>
              Montants prévisionnels pour l’ensemble du groupe, renseignés par vous. Aucun tarif en direct ni conversion
              de devise.
            </p>
            <div className="notebook-pair">
              <label>
                Enveloppe totale
                <input
                  value={draft.budget}
                  maxLength={12}
                  inputMode="decimal"
                  onChange={(event) => update({ budget: event.target.value })}
                  placeholder="À définir"
                />
              </label>
              <label>
                Devise des montants
                <select
                  value={draft.currency}
                  onChange={(event) => update({ currency: event.target.value as TravelDraft["currency"] })}
                >
                  {["EUR", "CHF", "USD", "GBP", "JPY"].map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="notebook-budget-lines">
              {draft.expenses.map((expense, index) => (
                <div key={expense.id}>
                  <label>
                    Poste {index + 1}
                    <input
                      value={expense.label}
                      maxLength={60}
                      onChange={(event) =>
                        update({
                          expenses: draft.expenses.map((row) =>
                            row.id === expense.id ? { ...row, label: event.target.value } : row,
                          ),
                        })
                      }
                      placeholder="Transport, hébergement…"
                    />
                  </label>
                  <label>
                    Montant ({draft.currency})
                    <input
                      value={expense.amount}
                      maxLength={12}
                      inputMode="decimal"
                      onChange={(event) =>
                        update({
                          expenses: draft.expenses.map((row) =>
                            row.id === expense.id ? { ...row, amount: event.target.value } : row,
                          ),
                        })
                      }
                      placeholder="À définir"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Retirer le poste ${index + 1}`}
                    onClick={() => update({ expenses: draft.expenses.filter((row) => row.id !== expense.id) })}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={draft.expenses.length >= 8}
              onClick={() =>
                update({ expenses: [...draft.expenses, { id: crypto.randomUUID(), label: "", amount: "" }] })
              }
            >
              + Ajouter un poste
            </button>
            <div className="notebook-budget-summary">
              <div>
                <span>{summary.complete ? "Total renseigné" : "Sous-total renseigné"}</span>
                <strong>{money(summary.total)}</strong>
              </div>
              <div data-over={summary.remaining !== null && summary.remaining < 0}>
                <span>
                  {summary.remaining !== null && summary.remaining < 0
                    ? "Dépassement prévu"
                    : "Marge sur les montants renseignés"}
                </span>
                <strong>{money(summary.remaining === null ? null : Math.abs(summary.remaining))}</strong>
              </div>
              <div>
                <span>Par voyageur · sous-total</span>
                <strong>{money(summary.total === null ? null : Math.round(summary.total / draft.travelers))}</strong>
              </div>
            </div>
          </>
        ) : null}
        {section === "checklist" ? (
          <>
            <div className="notebook-section-heading">
              <h3>Avant de partir</h3>
              <span>
                {completed}/{draft.checklist.length} cochés
              </span>
            </div>
            <progress
              max={Math.max(1, draft.checklist.length)}
              value={completed}
              aria-label="Progression de vos préparatifs"
            />
            {!draft.checklist.length ? (
              <div className="notebook-empty">
                <LineIcon kind="case" />
                <p>Ajoutez vos préparatifs : affaires, documents à vérifier, personnes à prévenir…</p>
              </div>
            ) : null}
            <ul className="notebook-checklist">
              {draft.checklist.map((item, index) => (
                <li key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    aria-label={`Marquer ${item.text || `l’élément ${index + 1}`} comme prêt`}
                    onChange={(event) =>
                      update({
                        checklist: draft.checklist.map((row) =>
                          row.id === item.id ? { ...row, done: event.target.checked } : row,
                        ),
                      })
                    }
                  />
                  <input
                    value={item.text}
                    maxLength={80}
                    aria-label={`Préparatif ${index + 1}`}
                    onChange={(event) =>
                      update({
                        checklist: draft.checklist.map((row) =>
                          row.id === item.id ? { ...row, text: event.target.value } : row,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Retirer le préparatif ${index + 1}`}
                    onClick={() => update({ checklist: draft.checklist.filter((row) => row.id !== item.id) })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={draft.checklist.length >= 12}
              onClick={() =>
                update({ checklist: [...draft.checklist, { id: crypto.randomUUID(), text: "", done: false }] })
              }
            >
              + Ajouter un préparatif
            </button>
          </>
        ) : null}
      </fieldset>
      {section === "review" ? (
        <div className="notebook-review">
          <h3>Votre carnet, en un regard</h3>
          <div className="notebook-pair">
            <section>
              <h4>Les étapes</h4>
              {draft.stops.length ? (
                <ol>
                  {draft.stops.map((stop) => (
                    <li key={stop.id}>
                      <strong>{stop.place || "Lieu à définir"}</strong>
                      <span>{travelDate(stop.date)}</span>
                      <p>{stop.note}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>Aucune étape renseignée.</p>
              )}
            </section>
            <section>
              <h4>Le budget</h4>
              <p>
                Enveloppe : <strong>{money(summary.target)}</strong>
              </p>
              {draft.expenses.map((entry) => (
                <p key={entry.id}>
                  {entry.label || "Poste à définir"} <strong>{money(moneyCents(entry.amount))}</strong>
                </p>
              ))}
              <hr />
              <p>
                Sous-total : <strong>{money(summary.total)}</strong>
              </p>
              <h4>Les préparatifs</h4>
              {draft.checklist.map((item) => (
                <p key={item.id}>
                  {item.done ? "✓" : "□"} {item.text || "À préciser"}
                </p>
              ))}
            </section>
          </div>
          {draft.notes ? (
            <section>
              <h4>Vos notes</h4>
              <p className="notebook-notes">{draft.notes}</p>
            </section>
          ) : null}
        </div>
      ) : null}
      {showErrors && errors.length ? (
        <div className="notebook-errors" role="alert">
          <strong>À compléter avant l’enregistrement</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {session.notice ? (
        <p className="notebook-status" role="status">
          {session.notice}
        </p>
      ) : null}
      <footer className="notebook-footer">
        <span>
          {serializeNotebook(draft).length}/4 000 caractères ·{" "}
          {source ? "version enregistrée" : "brouillon non enregistré"}
        </span>
        <div>
          {!source ? (
            <button
              type="button"
              className="notebook-save"
              disabled={pending || uncertain}
              onClick={() => {
                setShowErrors(true);
                if (!errors.length) onSave();
              }}
            >
              {pending ? "Enregistrement…" : "Enregistrer mon carnet"}
            </button>
          ) : null}
          <button type="button" disabled={!draft.destination.trim()} onClick={() => download(draft)}>
            Télécharger en texte
          </button>
          <button type="button" onClick={onTasks}>
            Mes voyages
          </button>
        </div>
        <p>
          Le carnet est une tâche privée du workspace. Rien n’est réservé, envoyé à un assistant IA ou ajouté à votre
          agenda.
        </p>
        {!source ? (
          <p>
            Fermer ce panneau conserve le brouillon. Quitter Travel, recharger ou verrouiller IDA efface ce qui n’a pas
            été enregistré.
          </p>
        ) : null}
      </footer>
    </div>
  );
}
