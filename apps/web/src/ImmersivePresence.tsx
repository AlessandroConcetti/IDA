import { useState } from "react";
import type { NavigationId } from "./data";
import { LocalDialogue } from "./LocalDialogue";
import { Sheet } from "./ReferenceChrome";
import { useSceneViewport } from "./scene-viewport";
import { ThemePicker } from "./ThemePicker";
import type { VoiceActivity } from "./VoiceControls";
import { WorldAmbience } from "./WorldAmbience";
import "./reference-environments.css";
import type { HomeTheme } from "./worlds";

export function ImmersivePresence({
  onThemeChange,
  onNavigate,
  onWelcome,
}: {
  onThemeChange: (theme: HomeTheme) => void;
  onNavigate: (id: NavigationId) => void;
  onWelcome: () => void;
}) {
  const title = useSceneViewport();
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState(false);
  const [presenceOnly, setPresenceOnly] = useState(false);
  const [conversation, setConversation] = useState(false);
  const [voice, setVoice] = useState<VoiceActivity>("IDLE");
  return (
    <section
      className="environment-screen world-environment immersive-presence"
      aria-label="IDA Immersive"
      data-presence-only={presenceOnly}
      data-voice-state={voice}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !conversation && !event.defaultPrevented) {
          event.preventDefault();
          if (presenceOnly) setPresenceOnly(false);
          else onThemeChange("scifi");
        }
      }}
    >
      <WorldAmbience src="/design/user-20260909/ambient-1.mov" paused={paused} />
      <header className="scene-toolbar">
        <button type="button" onClick={() => onThemeChange("scifi")}>
          ← La Roue des Mondes
        </button>
        <ThemePicker value="immersive" onChange={onThemeChange} />
      </header>
      <div className="presence-intro">
        <p className="scene-kicker">UNE PRÉSENCE. LE MÊME IDA.</p>
        <h1 ref={title} tabIndex={-1}>
          I D A
        </h1>
        <p>Votre interface immersive.</p>
        <p className="scene-meta">Vidéo décorative · aucun suivi en direct</p>
      </div>
      <div className="presence-controls scene-panel">
        <p className="scene-kicker">IMMERSIVE</p>
        <h2>À vos côtés.</h2>
        <p>Le robot habite l’écran. La conversation utilise le Core partagé.</p>
        <button type="button" onClick={() => setConversation(true)}>
          Parler ou écrire à IDA →
        </button>
        <button type="button" onClick={() => onNavigate("ida")}>
          Ouvrir l’espace IDA →
        </button>
        <button type="button" onClick={onWelcome}>
          Découvrir mon espace Care →
        </button>
        <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
          {paused ? "Reprendre la vidéo" : "Mettre la vidéo en pause"}
        </button>
        <button type="button" aria-expanded={notice} onClick={() => setNotice(!notice)}>
          Voix locale et confidentialité
        </button>
        {notice ? (
          <p role="status">
            Le dialogue propose une dictée à relire et une lecture vocale locales, selon les capacités du navigateur. Le
            micro s’ouvre seulement au clic « Parler à IDA ». Le suivi de mouvement et la synchronisation des lèvres
            restent à connecter.
          </p>
        ) : null}
        <span className="scene-notice">
          {voice === "LISTENING" ? "Micro ouvert à votre demande" : "Micro fermé"} · caméra désactivée
        </span>
      </div>
      <nav className="presence-dock scene-dock" aria-label="Commandes de présence">
        <button type="button" aria-pressed={presenceOnly} onClick={() => setPresenceOnly(!presenceOnly)}>
          <span aria-hidden="true">◉</span>
          {presenceOnly ? "Afficher les commandes" : "Voir le robot seul"}
        </button>
        <button type="button" onClick={() => setConversation(true)}>
          <span aria-hidden="true">◌</span>Parler à IDA
        </button>
        <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
          <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>
          {paused ? "Reprendre" : "Pause"}
        </button>
        <button type="button" onClick={() => onThemeChange("scifi")}>
          <span aria-hidden="true">←</span>Les mondes
        </button>
      </nav>
      {conversation ? (
        <Sheet title="Dialoguer avec IDA" close={() => setConversation(false)}>
          <LocalDialogue onVoiceActivity={setVoice} />
        </Sheet>
      ) : null}
    </section>
  );
}
