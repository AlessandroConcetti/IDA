import { useState } from "react";
import { useSceneViewport } from "./scene-viewport";

const careSteps = ["Bienvenue", "Votre corps", "Votre quotidien", "Confidentialité"] as const;

/** Brouillon d'écran uniquement : aucune API, mémoire, analytics ou persistance. */
export function CareProfile({ onboarding = false, onComplete }: { onboarding?: boolean; onComplete?: () => void }) {
  const [step, setStep] = useState(onboarding ? 0 : 1);
  const [draft, setDraft] = useState({ height: "", weight: "", waist: "", activity: "", health: "" });
  const [goals, setGoals] = useState<string[]>([]);
  const [allowDraft, setAllowDraft] = useState(false);
  const [notice, setNotice] = useState("");
  function clear() {
    setDraft({ height: "", weight: "", waist: "", activity: "", health: "" });
    setGoals([]);
    setAllowDraft(false);
    setNotice("Le brouillon a été effacé de cet écran.");
  }
  return (
    <section className="scene-panel care-profile" aria-label={onboarding ? "Premiers pas avec IDA" : "Personnaliser IDA Care"}>
      <nav className="care-stepper" aria-label="Étapes de personnalisation">
        {careSteps.map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined}
          aria-pressed={step === index} onClick={() => setStep(index)}><span>0{index + 1}</span>{label}</button>)}
      </nav>
      <div className="care-step-content">
        <p className="scene-kicker">{onboarding ? "PREMIERS PAS" : "PERSONNALISATION"} · {step + 1} / 4</p>
        <h2>{careSteps[step]}</h2>
        {step === 0 ? <>
          <p>Un espace pour prendre soin de vous, à votre rythme. Toutes les questions suivantes sont facultatives.</p>
          <p>Cette première interface ne crée pas de dossier médical et ne fournit pas de diagnostic.</p>
          <p className="scene-notice">Aucune donnée corporelle n’est nécessaire pour utiliser IDA.</p>
        </> : null}
        {step === 1 ? <>
          <p>Vous choisissez ce que vous souhaitez renseigner. Le mannequin est une illustration, pas un scan de votre corps.</p>
          <label className="scene-consent"><input type="checkbox" checked={allowDraft} onChange={(event) => {
            if (!event.target.checked) clear(); else setAllowDraft(true);
          }} />Activer les champs facultatifs pour essayer ce brouillon non enregistré.</label>
          <fieldset disabled={!allowDraft} className="care-fields">
            <legend className="sr-only">Mesures facultatives</legend>
            {([['height', 'Taille', 'cm'], ['weight', 'Poids', 'kg'], ['waist', 'Tour de taille', 'cm']] as const).map(([key, label, unit]) => (
              <label key={key}>{label}<span className="care-measure"><input type="number" min="0" step="0.1" inputMode="decimal"
                value={draft[key]} placeholder="Non renseigné" autoComplete="off"
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /><span>{unit}</span></span></label>
            ))}
            <label>Informations de santé à prendre en compte <span className="scene-meta">Facultatif</span>
              <textarea value={draft.health} autoComplete="off" maxLength={1000} rows={3}
                placeholder="Ce texte reste dans cet écran, sans analyse IA."
                onChange={(event) => setDraft({ ...draft, health: event.target.value })} /></label>
          </fieldset>
        </> : null}
        {step === 2 ? <>
          <p>Quels sujets aimeriez-vous retrouver dans votre futur espace Care ?</p>
          <div className="care-goals">{["Sommeil", "Mouvement", "Alimentation", "Énergie", "Bien-être"].map((goal) =>
            <button key={goal} type="button" aria-pressed={goals.includes(goal)} onClick={() => setGoals((current) =>
              current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal])}>{goal}</button>)}</div>
          <label>Votre rythme <select value={draft.activity} onChange={(event) => setDraft({ ...draft, activity: event.target.value })}>
            <option value="">Je préfère ne pas préciser</option><option value="calm">Plutôt calme</option>
            <option value="variable">Variable selon les jours</option><option value="active">Actif</option>
          </select></label>
        </> : null}
        {step === 3 ? <>
          <p>Les valeurs de cet écran ne sont envoyées à aucun modèle, serveur ou appareil. Elles ne sont pas ajoutées à la mémoire d’IDA.</p>
          <p>Le brouillon disparaît lorsque vous quittez ce parcours ou verrouillez IDA. La sauvegarde sécurisée d’un profil santé reste à développer.</p>
          <button type="button" onClick={clear}>Effacer le brouillon</button>
        </> : null}
        <p className="scene-notice">Brouillon de démonstration · non enregistré · aucune analyse médicale.</p>
        {notice ? <p role="status">{notice}</p> : null}
        <footer className="care-actions">
          <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>← Retour</button>
          {step < 3 ? <button type="button" onClick={() => setStep(step + 1)}>Continuer →</button>
            : <button type="button" onClick={() => { clear(); onComplete?.(); setNotice("Parcours terminé. Aucun profil santé n’a été sauvegardé."); }}>Terminer sans enregistrer →</button>}
        </footer>
        {onComplete ? <button className="care-skip" type="button" onClick={onComplete}>Passer sans renseigner ces données</button> : null}
      </div>
    </section>
  );
}

export function CareOnboarding({ onComplete }: { onComplete: () => void }) {
  const title = useSceneViewport();
  return (
    <section className="environment-screen care-onboarding" aria-label="Bienvenue dans IDA" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); onComplete(); }
    }}>
      <div className="scene-onboarding-intro"><p className="scene-wordmark">I D A</p><p className="scene-kicker">VOTRE ESPACE PERSONNEL</p>
        <h1 ref={title} tabIndex={-1}>Commençons<br />par l’essentiel.</h1>
        <p>Vous gardez la main sur les informations qui vous concernent.</p>
        <button type="button" onClick={onComplete}>Accéder à IDA sans profil santé →</button>
      </div>
      <CareProfile onboarding onComplete={onComplete} />
    </section>
  );
}
