import { useEffect, useRef, useState } from "react";
import { LocalSoundDesign, soundPeriod } from "./sound-design";

/** Local pad, independent of the movie's soundtrack and motion preferences. */
export function UnlockAmbience() {
  const engine = useRef<LocalSoundDesign | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const sound = new LocalSoundDesign(() => (window.AudioContext ? new AudioContext() : null), setEnabled);
    engine.current = sound;
    sound.setVolume(0.28);
    sound.configure("classic", soundPeriod(new Date().getHours()), true);
    const visibility = () => {
      sound.setPaused(document.hidden);
      setPaused(document.hidden);
    };
    const leave = () => sound.disable();
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      engine.current = null;
      sound.dispose();
    };
  }, []);

  return (
    <div className="access-sound-controls">
      <button
        className="access-sound-toggle"
        type="button"
        disabled={starting}
        aria-pressed={enabled}
        aria-label={enabled ? "Couper l’ambiance sonore" : "Activer l’ambiance sonore de l’accueil"}
        onClick={(event) => {
          if (!event.isTrusted) return;
          const sound = engine.current;
          if (!sound) return;
          setNotice("");
          if (enabled) {
            sound.disable();
            return;
          }
          setStarting(true);
          void sound.enable(true).then((active) => {
            if (engine.current !== sound) return;
            setStarting(false);
            if (!active) setNotice("Lecture audio impossible. Vérifie la sortie audio du navigateur, puis réessaie.");
          });
        }}
      >
        <span aria-hidden="true">{enabled ? "◖))" : "◖"}</span>
        {starting
          ? "Démarrage du son…"
          : enabled
            ? paused
              ? "Ambiance en pause"
              : "Ambiance activée"
            : "Activer l’ambiance"}
      </button>
      {notice ? (
        <p className="access-sound-notice" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
