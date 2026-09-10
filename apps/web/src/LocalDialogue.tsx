import { useEffect, useRef, useState } from "react";
import { IdaApiError, requestApi } from "./api-transport";

function payloadData(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || !("data" in value) || !value.data || typeof value.data !== "object")
    return undefined;
  return value.data as Record<string, unknown>;
}

/** Dialogue expérimental explicite, texte seul, sans mémoire ni outils automatiques. */
export function LocalDialogue() {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("Vérification du modèle local…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    const statusController = new AbortController();
    void requestApi("/v1/intelligence/local/status", { signal: statusController.signal })
      .then((payload) => {
        const data = payloadData(payload);
        if (!active) return;
        setReady(data?.state === "READY");
        setStatus(
          data?.state === "READY"
            ? "Qwen local disponible · expérimental · aucun cloud"
            : data?.state === "BUSY"
              ? "Modèle occupé · réessayez après sa réponse"
              : "Modèle local indisponible ou désactivé",
        );
      })
      .catch(() => {
        if (active) {
          setReady(false);
          setStatus("Connexion à l’IA locale indisponible");
        }
      });
    return () => {
      active = false;
      statusController.abort();
      controller.current?.abort();
    };
  }, [revision]);

  async function send() {
    if (busy || !ready || !prompt.trim()) return;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setReply("");
    try {
      const data = payloadData(
        await requestApi(
          "/v1/intelligence/local/reply",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: prompt.trim() }),
            signal: current.signal,
          },
          false,
          120_000,
        ),
      );
      if (!current.signal.aborted)
        setReply(typeof data?.text === "string" ? data.text : "Réponse incomplète. Réessayez.");
    } catch (error) {
      if (!current.signal.aborted)
        setReply(
          error instanceof IdaApiError
            ? error.message
            : "IDA n’a pas reçu de réponse complète du modèle local. Aucun appel cloud n’a été effectué. Réessayez avec une demande plus courte.",
        );
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="local-dialogue" aria-label="Dialogue avec l’IA locale">
      <p className="reference-feedback" role="status">
        {status}
      </p>
      <p>
        Échange direct avec le modèle installé sur ce PC. Vos fichiers, données Care et mémoires ne lui sont pas
        transmis. Ce modèle peut se tromper ; il ne réalise aucune action.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label>
          Votre demande
          <textarea
            value={prompt}
            maxLength={3000}
            rows={5}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Posez votre question à IDA…"
            disabled={busy}
          />
        </label>
        <div className="reference-actions">
          <button type="submit" disabled={!ready || busy || !prompt.trim()}>
            {busy ? "IDA réfléchit…" : "Envoyer à l’IA locale"}
          </button>
          {busy ? (
            <button
              type="button"
              onClick={() => {
                controller.current?.abort();
                setBusy(false);
                setReply("Demande annulée.");
              }}
            >
              Arrêter
            </button>
          ) : (
            <button type="button" onClick={() => setRevision((value) => value + 1)}>
              Vérifier la connexion
            </button>
          )}
        </div>
      </form>
      {busy ? (
        <p role="status">Le démarrage du modèle peut prendre jusqu’à deux minutes. Vous pouvez arrêter la demande.</p>
      ) : null}
      {reply ? (
        <div className="local-dialogue-answer" aria-live="polite">
          <h3>IDA · réponse locale</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{reply}</p>
        </div>
      ) : null}
      <p className="reference-hint">
        Texte temporaire non enregistré. Ne saisissez pas de mots de passe ni de clés API. Astra nécessite une clé API
        serveur distincte ; aucune session ChatGPT/Codex n’est réutilisée.
      </p>
    </section>
  );
}
