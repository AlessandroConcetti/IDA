import { useCallback, useEffect, useId, useRef, useState } from "react";
import { type ChatExchange, localChatHistoryResponseSchema } from "../../../packages/contracts/src/local-chat";
import { IdaApiError, requestApi } from "./api-transport";
import {
  chronologicalChat,
  PendingLocalChatRequests,
  readLocalChatReply,
  reconcileChatExchange,
} from "./local-chat-state";
import { readLocalDialogueStatus } from "./local-dialogue-state";
import { type VoiceActivity, VoiceControls } from "./VoiceControls";
import "./local-chat.css";

const exchangeDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/** Historique serveur distinct d'une mémoire personnelle ; aucun outil ou capteur automatique. */
export function LocalDialogue({
  onVoiceActivity,
}: {
  onVoiceActivity?: ((activity: VoiceActivity) => void) | undefined;
} = {}) {
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [hasAnswer, setHasAnswer] = useState(false);
  const [savedAnswer, setSavedAnswer] = useState(false);
  const [history, setHistory] = useState<ChatExchange[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [status, setStatus] = useState("Vérification du modèle local…");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const historyController = useRef<AbortController | null>(null);
  // Retained only while this screen is mounted. A lost reply never silently receives
  // a new key if the same exact prompt is retried (including after editing the draft).
  const uncertainRequests = useRef(new PendingLocalChatRequests());
  const busyGuard = useRef(false);
  const historyId = useId();

  const refreshHistory = useCallback(async () => {
    historyController.current?.abort();
    const current = new AbortController();
    historyController.current = current;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const payload = await requestApi("/v1/intelligence/local/history", { signal: current.signal });
      const { data } = localChatHistoryResponseSchema.parse(payload);
      if (current.signal.aborted || historyController.current !== current) return;
      setHistory(chronologicalChat(data.items));
      setHistoryLoaded(true);
    } catch (error) {
      if (current.signal.aborted || historyController.current !== current) return;
      setHistoryError(
        error instanceof IdaApiError
          ? error.message
          : "L’historique reçu n’a pas pu être vérifié. Aucune donnée de remplacement n’est affichée.",
      );
    } finally {
      if (!current.signal.aborted && historyController.current === current) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
    return () => {
      historyController.current?.abort();
      controller.current?.abort();
    };
  }, [refreshHistory]);

  useEffect(() => {
    let active = true;
    setReady(false);
    setStatus("Vérification du modèle local…");
    const statusController = new AbortController();
    void requestApi("/v1/intelligence/local/status", { signal: statusController.signal })
      .then((payload) => {
        if (!active) return;
        const data = readLocalDialogueStatus(payload);
        setReady(data.ready);
        setStatus(data.message);
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
    };
  }, [revision]);

  async function send() {
    if (busyGuard.current || !ready || !prompt.trim()) return;
    busyGuard.current = true;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setReply("");
    setHasAnswer(false);
    setSavedAnswer(false);
    const submittedPrompt = prompt.trim();
    try {
      const request = uncertainRequests.current.prepare(submittedPrompt, () => crypto.randomUUID());
      const payload = await requestApi(
        "/v1/intelligence/local/reply",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: current.signal,
        },
        false,
        120_000,
      );
      const { text, exchange } = readLocalChatReply(payload, request);
      if (!current.signal.aborted) {
        uncertainRequests.current.confirm(request);
        setReply(text);
        setHasAnswer(true);
        setSavedAnswer(Boolean(exchange));
        if (exchange) {
          setHistory((items) => reconcileChatExchange(items, exchange));
          setPrompt("");
          void refreshHistory();
        }
      }
    } catch (error) {
      if (!current.signal.aborted)
        setReply(
          error instanceof IdaApiError
            ? `${error.message} Votre brouillon est conservé. L’enregistrement n’est pas confirmé ; actualisez l’historique ou réessayez le même texte.`
            : "La réponse et son enregistrement n’ont pas pu être confirmés. Votre demande reste dans le champ ; réessayez le même texte pour retrouver cet échange sans le dupliquer. Aucun appel cloud n’a été effectué.",
        );
    } finally {
      if (controller.current === current) {
        busyGuard.current = false;
        if (!current.signal.aborted) setBusy(false);
      }
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
      <section className="local-chat-history" aria-labelledby={historyId}>
        <div className="local-chat-history__heading">
          <div>
            <h3 id={historyId}>Vos échanges avec IDA</h3>
            <p>Historique enregistré sur le serveur IDA de ce PC · 30 jours · 100 échanges maximum.</p>
          </div>
          <button type="button" disabled={historyLoading || busy} onClick={() => void refreshHistory()}>
            {historyLoading ? "Actualisation…" : "Actualiser l’historique"}
          </button>
        </div>
        {historyError ? (
          <p className="local-chat-history__error" role="alert">
            {historyError}
          </p>
        ) : null}
        {historyLoading && !historyLoaded ? <p role="status">Chargement des échanges enregistrés…</p> : null}
        {historyLoaded && history.length === 0 ? (
          <p className="local-chat-history__empty">Aucun échange enregistré pour le moment.</p>
        ) : null}
        {history.length > 0 ? (
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll this bounded conversation region.
          <ol className="local-chat-history__list" aria-label="Échanges, du plus ancien au plus récent" tabIndex={0}>
            {history.map((exchange) => (
              <li key={exchange.id} className="local-chat-exchange">
                <div className="local-chat-exchange__meta">
                  <time dateTime={exchange.createdAt}>{exchangeDate.format(new Date(exchange.createdAt))}</time>
                  <span>Enregistré sur ce PC</span>
                </div>
                <div className="local-chat-exchange__question">
                  <h4>Vous</h4>
                  <p>{exchange.prompt}</p>
                </div>
                <div className="local-chat-exchange__answer">
                  <h4>IDA · réponse locale</h4>
                  <p>{exchange.answer}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <p className="local-chat-history__privacy">
          Seul le message que vous envoyez est transmis au modèle. Cet historique n’est pas encore utilisé comme
          contexte et ne constitue pas une mémoire personnelle. Aucun échange n’est enregistré dans le stockage du
          navigateur.
        </p>
      </section>
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
                controller.current = null;
                busyGuard.current = false;
                setBusy(false);
                setHasAnswer(false);
                setSavedAnswer(false);
                setReply(
                  "Attente arrêtée. L’enregistrement n’est pas confirmé. Actualisez l’historique ou renvoyez le même texte pour retrouver cet échange sans doublon.",
                );
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
      <VoiceControls
        answer={hasAnswer ? reply : ""}
        disabled={busy}
        onActivity={onVoiceActivity}
        onTranscript={(text) => {
          const next = prompt.trim() ? `${prompt.trim()}\n${text}` : text;
          if (next.length > 3000) return false;
          setPrompt(next);
          return true;
        }}
      />
      {busy ? (
        <p role="status">Le démarrage du modèle peut prendre jusqu’à deux minutes. Vous pouvez arrêter la demande.</p>
      ) : null}
      {savedAnswer ? (
        <p className="local-chat-saved" role="status">
          Réponse enregistrée sur ce PC. Retrouvez-la dans vos échanges ci-dessus.
        </p>
      ) : null}
      {reply && !savedAnswer ? (
        <div className="local-dialogue-answer" aria-live="polite">
          <h3>{hasAnswer ? "IDA · réponse temporaire, non enregistrée" : "État de la demande"}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{reply}</p>
        </div>
      ) : null}
      <p className="reference-hint">
        Votre brouillon reste temporaire tant que vous ne l’envoyez pas. Ne saisissez pas de mots de passe ni de clés
        API. Aucun enregistrement n’est annoncé sans confirmation du serveur ; aucune session ChatGPT/Codex n’est
        réutilisée.
      </p>
      <details className="local-chat-history">
        <summary>Astra · connexion requise</summary>
        <p>
          L’adaptateur OpenAI est préparé, mais Astra n’est pas connecté à IDA. Une adresse e-mail ou un abonnement
          ChatGPT/Codex ne remplace pas une clé API. Aucun appel payant n’est actif dans ce dialogue.
        </p>
        <p>
          L’activation nécessite un accès API autorisé côté serveur, un budget approuvé et votre consentement pour
          transmettre des messages au cloud. Le parcours sécurisé de configuration reste à préparer : ne collez jamais
          de clé dans cette conversation.
        </p>
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
          Ouvrir OpenAI Platform
        </a>
      </details>
    </section>
  );
}
