import { type FormEvent, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type AccessView, LocalAccessController } from "./local-access";
import { CareOnboarding } from "./CareProfile";
import "./local-access.css";

function AccessForm({
  view,
  controller,
}: {
  view: Extract<AccessView, { phase: "closed" }>;
  controller: LocalAccessController;
}) {
  const setup = view.screen === "setup";
  const inputRef = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [validation, setValidation] = useState("");
  const [clock, setClock] = useState(Date.now());
  const remaining = Math.max(0, Math.ceil(((view.retryAt ?? 0) - clock) / 1_000));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!view.retryAt) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [view.retryAt]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view.busy || remaining > 0) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const passphrase = String(data.get("passphrase") ?? "");
    if (setup && passphrase !== data.get("confirmation")) {
      setValidation("Les deux phrases de passe doivent être identiques.");
      return;
    }
    setValidation("");
    setVisible(false);
    form.reset();
    // La phrase est transmise une seule fois puis retirée des champs ; aucun
    // localStorage, historique de conversation ou état global ne la reçoit.
    void controller.authenticate(passphrase);
  }

  return (
    <form className="access-form" onSubmit={submit} aria-busy={view.busy}>
      <fieldset disabled={view.busy}>
        <legend className="sr-only">{setup ? "Créer le verrou local" : "Déverrouiller IDA"}</legend>
        <label htmlFor="local-passphrase">Phrase de passe</label>
        <div className="access-password">
          <input
            ref={inputRef}
            id="local-passphrase"
            name="passphrase"
            type={visible ? "text" : "password"}
            autoComplete={setup ? "new-password" : "current-password"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            minLength={15}
            maxLength={1024}
            aria-describedby="access-help access-notice"
            aria-invalid={validation ? true : undefined}
          />
          <button
            type="button"
            className="access-reveal"
            onClick={() => setVisible((value) => !value)}
            aria-pressed={visible}
          >
            {visible ? "Masquer" : "Afficher"}
          </button>
        </div>
        {setup ? (
          <>
            <label htmlFor="local-confirmation">Confirmer la phrase de passe</label>
            <input
              id="local-confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              minLength={15}
              maxLength={1024}
              aria-describedby="access-help access-notice"
              aria-invalid={validation ? true : undefined}
            />
          </>
        ) : null}
        <p className="access-help" id="access-help">
          {setup
            ? "Au moins 15 caractères. Plusieurs mots faciles à retenir font une bonne phrase de passe."
            : "La phrase de passe que tu as choisie sur cet ordinateur."}
        </p>
        <p id="access-notice" className="access-notice" role="status" aria-live="polite">
          {validation || view.message || (view.busy ? "Vérification en cours…" : "")}
          {remaining > 0 ? ` Nouvel essai possible dans ${remaining} s.` : ""}
        </p>
        <button className="access-primary" type="submit" disabled={view.busy || remaining > 0}>
          {view.busy ? "Un instant…" : setup ? "Créer mon verrou" : "Entrer dans IDA"}
          <span aria-hidden="true">↗</span>
        </button>
      </fieldset>
      {setup ? (
        <p className="access-footnote">
          Conserve cette phrase en lieu sûr : la récupération n’est pas encore disponible dans cette démo. Le verrou
          restera actif aux prochains démarrages.
        </p>
      ) : (
        <details className="access-recovery">
          <summary>Phrase de passe oubliée ?</summary>
          <p>
            La récupération n’est pas encore disponible dans cette démo locale. Ne supprime pas tes données pour tenter
            de réinitialiser le verrou.
          </p>
        </details>
      )}
      <button className="access-secondary" type="button" onClick={() => void controller.check()} disabled={view.busy}>
        Vérifier l’état d’IDA
      </button>
    </form>
  );
}

export function LocalAccessGate({ children }: { children: (onLock?: () => void) => ReactNode }) {
  const [controller] = useState(() => new LocalAccessController());
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [welcomePending, setWelcomePending] = useState(false);

  useEffect(() => {
    if (view.phase === "closed" && view.screen === "setup") setWelcomePending(true);
  }, [view]);

  useEffect(() => controller.connect(), [controller]);
  useEffect(() => {
    const hide = () => controller.conceal();
    const show = () => {
      if (document.visibilityState === "visible") void controller.check();
    };
    const visibility = () => (document.visibilityState === "hidden" ? hide() : show());
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && controller.getSnapshot().phase === "open") void controller.check();
    }, 15_000);
    const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("ida-local-lock");
    if (channel) {
      controller.broadcast = () => channel.postMessage("LOCK");
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data === "LOCK") controller.expire();
      };
    }
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      window.clearInterval(timer);
      controller.broadcast = undefined;
      channel?.close();
    };
  }, [controller]);

  if (view.phase === "open") {
    if (welcomePending) return <CareOnboarding onComplete={() => setWelcomePending(false)} />;
    return children(view.mode === "LOCAL_LOCK" ? () => void controller.lock() : undefined);
  }
  const setup = view.phase === "closed" && view.screen === "setup";
  const busy = view.phase === "checking" || view.phase === "locking";

  return (
    <main className="access-shell">
      <div className="access-brand">
        I D A<span>TON UNIVERS. UNE PRÉSENCE.</span>
      </div>
      <section className="access-card" aria-labelledby="access-title">
        <div className="access-orb" aria-hidden="true">
          ✦
        </div>
        <p className="eyebrow">{setup ? "PREMIER ACCÈS" : "ESPACE PERSONNEL"}</p>
        <h1 id="access-title">
          {setup
            ? "Ton espace, à toi."
            : busy
              ? "Un instant."
              : view.phase === "unavailable"
                ? "Reprenons contact."
                : "Heureux de te retrouver."}
        </h1>
        <p className="access-intro">
          {setup
            ? "Choisis une phrase de passe pour ouvrir ton univers IDA sur cet ordinateur."
            : view.phase === "locking"
              ? "Fermeture de ta session…"
              : view.phase === "checking"
                ? "IDA vérifie ton accès…"
                : view.phase === "unavailable"
                  ? "Le Command Center t’attend."
                  : "Déverrouille ton Command Center pour retrouver ta musique, tes contenus et tes projets."}
        </p>
        {view.phase === "closed" ? <AccessForm key={view.screen} view={view} controller={controller} /> : null}
        {busy ? (
          <p className="access-notice" role="status">
            {view.phase === "checking"
              ? "Vérification de l’accès en cours."
              : "Les données sont masquées pendant le verrouillage."}
          </p>
        ) : null}
        {view.phase === "unavailable" ? (
          <div className="access-unavailable">
            <p className="access-notice" role="alert">
              {view.message}
            </p>
            <button
              className="access-primary"
              type="button"
              onClick={() => void (view.retry === "lock" ? controller.lock() : controller.check())}
            >
              {view.retry === "lock" ? "Réessayer le verrouillage" : "Réessayer"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        ) : null}
      </section>
      <p className="access-local-note">Un seul cœur pour tout ton univers.</p>
    </main>
  );
}
