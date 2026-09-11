import { useEffect, useRef, useState } from "react";
import { deviceRecognitionConstructor, frenchLocalVoices, inspectLocalDictation, LocalDictation } from "./local-voice";
import "./voice-controls.css";

export type VoiceActivity = "IDLE" | "LISTENING" | "SPEAKING";
export function VoiceControls({
  answer,
  disabled,
  onTranscript,
  onActivity,
}: {
  answer: string;
  disabled: boolean;
  onTranscript: (text: string) => boolean;
  onActivity?: ((activity: VoiceActivity) => void) | undefined;
}) {
  const [availability, setAvailability] = useState<
    "UNCHECKED" | "CHECKING" | "AVAILABLE" | "PACK_MISSING" | "UNSUPPORTED"
  >("UNCHECKED");
  const [activity, setActivity] = useState<VoiceActivity>("IDLE");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [notice, setNotice] = useState("");
  const [transcript, setTranscript] = useState("");
  const recognizer = useRef<LocalDictation | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const alive = useRef(true);
  const busyCheck = useRef(false);
  const activityCallback = useRef(onActivity);
  activityCallback.current = onActivity;

  function updateActivity(next: VoiceActivity) {
    if (alive.current) setActivity(next);
    activityCallback.current?.(next);
  }
  function stop() {
    recognizer.current?.stop();
    recognizer.current = null;
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      utterance.current = null;
      window.speechSynthesis?.cancel();
    }
    updateActivity("IDLE");
  }
  useEffect(() => {
    alive.current = true;
    const synthesis = window.speechSynthesis;
    const refresh = () => {
      if (alive.current) setVoices(synthesis ? frenchLocalVoices(synthesis.getVoices()) : []);
    };
    const hide = () => {
      if (document.hidden) stop();
    };
    refresh();
    synthesis?.addEventListener("voiceschanged", refresh);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => {
      alive.current = false;
      stop();
      synthesis?.removeEventListener("voiceschanged", refresh);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", stop);
    };
  }, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);
  useEffect(() => {
    if (utterance.current) stop();
  }, [answer]);

  async function check() {
    if (busyCheck.current || activity !== "IDLE") return;
    busyCheck.current = true;
    setAvailability("CHECKING");
    setNotice("");
    try {
      const result = window.isSecureContext
        ? await inspectLocalDictation(deviceRecognitionConstructor())
        : "UNSUPPORTED";
      if (alive.current) setAvailability(result);
    } catch {
      if (alive.current) setAvailability("UNSUPPORTED");
    } finally {
      busyCheck.current = false;
    }
  }
  function dictate() {
    if (availability !== "AVAILABLE" || disabled || document.hidden) return;
    stop();
    setTranscript("");
    setNotice("");
    const Recognition = deviceRecognitionConstructor();
    if (!Recognition) return;
    recognizer.current = new LocalDictation(Recognition, {
      text: (text) => {
        if (alive.current) {
          setTranscript(text);
          setNotice("Relisez la dictée avant de l’utiliser dans votre demande.");
        }
      },
      ended: () => updateActivity("IDLE"),
      failed: () => {
        if (alive.current)
          setNotice(
            "Dictée interrompue ou micro refusé. Aucun service cloud n’a été appelé. Le clavier reste disponible.",
          );
      },
    });
    try {
      updateActivity("LISTENING");
      recognizer.current.start();
    } catch {
      stop();
      setNotice(
        "Ce navigateur ne peut pas démarrer la dictée locale. Utilisez le clavier ou vérifiez la disponibilité.",
      );
    }
  }
  function speak() {
    if (!answer.trim() || disabled || document.hidden) return;
    const synthesis = window.speechSynthesis;
    const available = synthesis ? frenchLocalVoices(synthesis.getVoices()) : [];
    const voice = available.find((entry) => entry.voiceURI === voiceId) ?? available[0];
    if (!voice) {
      setNotice("Aucune voix française locale disponible. Aucune voix distante ne sera utilisée.");
      return;
    }
    stop();
    setNotice("");
    const message = new SpeechSynthesisUtterance(answer.slice(0, 6000));
    message.voice = voice;
    message.lang = voice.lang;
    message.rate = 1;
    utterance.current = message;
    message.onend = () => {
      if (utterance.current === message) {
        utterance.current = null;
        updateActivity("IDLE");
      }
    };
    message.onerror = () => {
      if (utterance.current === message) {
        utterance.current = null;
        updateActivity("IDLE");
        if (alive.current) setNotice("La lecture vocale n’a pas pu se terminer.");
      }
    };
    updateActivity("SPEAKING");
    try {
      synthesis.speak(message);
    } catch {
      stop();
      setNotice("Lecture vocale indisponible.");
    }
  }

  return (
    <section className="voice-controls" data-voice={activity} aria-label="Voix locale d’IDA">
      <header>
        <span className="voice-indicator" aria-hidden="true" />
        <strong>
          {activity === "LISTENING"
            ? "Micro ouvert · 25 secondes maximum"
            : activity === "SPEAKING"
              ? "IDA parle"
              : "Voix · micro fermé"}
        </strong>
      </header>
      <p>Dictée sur cet appareil uniquement, puis relecture avant envoi. La caméra reste éteinte.</p>
      <div className="voice-buttons">
        <button
          type="button"
          disabled={disabled || availability === "CHECKING" || activity !== "IDLE"}
          onClick={() => void check()}
        >
          {availability === "CHECKING" ? "Vérification…" : "Vérifier la dictée locale"}
        </button>
        <button
          type="button"
          disabled={disabled || availability !== "AVAILABLE" || activity !== "IDLE"}
          onClick={dictate}
        >
          Parler à IDA
        </button>
        <button
          type="button"
          disabled={disabled || !answer.trim() || !voices.length || activity !== "IDLE"}
          onClick={speak}
        >
          Écouter la réponse
        </button>
        {activity !== "IDLE" ? (
          <button type="button" onClick={stop}>
            Arrêter la voix
          </button>
        ) : null}
      </div>
      {availability === "AVAILABLE" ? (
        <p className="voice-status">
          Dictée française locale disponible. « Parler à IDA » vous demandera l’accès au micro.
        </p>
      ) : null}
      {availability === "PACK_MISSING" ? (
        <p className="voice-status">
          Le pack français local n’est pas installé dans ce navigateur. Aucun téléchargement ni fallback cloud
          automatique. Le clavier fonctionne en attendant.
        </p>
      ) : null}
      {availability === "UNSUPPORTED" ? (
        <p className="voice-status">
          Ce navigateur ne confirme pas la dictée française sur l’appareil. Le micro reste fermé ; utilisez le clavier.
        </p>
      ) : null}
      {voices.length ? (
        <label>
          Voix française de cet appareil
          <select
            value={voiceId || voices[0]?.voiceURI}
            disabled={activity !== "IDLE"}
            onChange={(event) => setVoiceId(event.target.value)}
          >
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="voice-status">Aucune voix française locale détectée pour la lecture.</p>
      )}
      {transcript ? (
        <div className="voice-transcript">
          <label>
            Votre dictée à relire
            <textarea
              rows={3}
              maxLength={3000}
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
            />
          </label>
          <div className="voice-buttons">
            <button
              type="button"
              disabled={disabled || !transcript.trim()}
              onClick={() => {
                if (onTranscript(transcript.trim())) {
                  setTranscript("");
                  setNotice("Dictée ajoutée au champ. Vérifiez votre demande puis choisissez Envoyer.");
                } else {
                  setNotice(
                    "La demande dépasserait 3 000 caractères. Raccourcissez-la avant d’ajouter la dictée ; aucun texte n’a été perdu.",
                  );
                }
              }}
            >
              Ajouter cette dictée à ma demande
            </button>
            <button type="button" onClick={() => setTranscript("")}>
              Effacer la dictée
            </button>
          </div>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="voice-status">
          {notice}
        </p>
      ) : null}
      <p className="voice-status">
        Aucun réveil permanent, enregistrement audio, fichier vocal ou commande d’appareil. Une voix locale n’est pas
        une synchronisation des lèvres du robot.
      </p>
    </section>
  );
}
