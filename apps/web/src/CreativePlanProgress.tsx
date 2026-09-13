import { useState } from "react";
import {
  type CreativeProgress,
  type CreativeProgressInput,
  type CreativeProjectDetail,
  creativePlanProgress,
} from "../../../packages/contracts/src/creative-engine";

export function CreativePlanProgress({
  plan,
  events,
  busy,
  onUpdate,
}: {
  plan: CreativeProjectDetail["plans"][number];
  events: CreativeProgress[];
  busy: boolean;
  onUpdate: (input: CreativeProgressInput) => Promise<boolean>;
}) {
  const [note, setNote] = useState("");
  const progress = creativePlanProgress(plan, events);
  async function update(stepIndex: number, completed: boolean) {
    if (
      await onUpdate({
        planId: plan.id,
        stepIndex,
        completed,
        expectedRevision: progress.revision,
        ...(note.trim() ? { note: note.trim() } : {}),
      })
    )
      setNote("");
  }
  return (
    <section className="creative-progress" aria-label={`Suivi manuel : ${plan.title}`}>
      <header>
        <h4>Suivi manuel</h4>
        <span>
          {progress.completed} / {plan.steps.length} étapes déclarées terminées
        </span>
      </header>
      <progress max={plan.steps.length} value={progress.completed} aria-label="Progression déclarée manuellement" />
      <p>
        Votre déclaration de travail, pas un résultat d’agent. Elle ne valide pas les critères et n’autorise aucune
        exécution.
      </p>
      <fieldset disabled={busy}>
        <legend className="sr-only">Déclarer ou rouvrir une étape</legend>
        {plan.steps.map((step, index) => (
          <label className="creative-step" key={`${plan.id}-${index}`}>
            <input
              type="checkbox"
              checked={progress.steps[index]}
              onChange={(event) => void update(index, event.currentTarget.checked)}
            />
            <span>
              <small>ÉTAPE {index + 1}</small>
              {step}
            </span>
          </label>
        ))}
        <label>
          Note pour la prochaine déclaration (facultatif)
          <textarea
            maxLength={300}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ce qui a été fait ou pourquoi l’étape est rouverte"
          />
        </label>
      </fieldset>
      <details>
        <summary>
          Historique manuel · {progress.history.length} déclaration{progress.history.length > 1 ? "s" : ""}
        </summary>
        {progress.history.length === 0 ? (
          <p>Aucune progression déclarée.</p>
        ) : (
          <ol className="creative-progress-history">
            {[...progress.history].reverse().map((event) => (
              <li key={event.id}>
                <strong>
                  Étape {event.stepIndex + 1} · {event.completed ? "Déclarée terminée" : "Rouverte"}
                </strong>
                <small>
                  Révision {event.revision} · {new Date(event.createdAt).toLocaleString("fr-FR")}
                </small>
                {event.note && <p className="creative-text">{event.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}
