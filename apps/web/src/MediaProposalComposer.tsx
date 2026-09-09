import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fetchMediaDetail } from "./api";
import { IdaApiError } from "./api-transport";
import {
  canPrepareMedia,
  PostProposalSubmission,
  type ProposalFields,
  type ProposalReceipt,
  proposalPlatforms,
} from "./post-proposal";
import { SnapshotReader } from "./snapshot-reader";
import "./post-proposal.css";

export function MediaProposalComposer({
  mediaId,
  onClose,
  renderApprovals,
}: {
  mediaId: string;
  onClose: () => void;
  renderApprovals: () => ReactNode;
}) {
  const reader = useMemo(() => new SnapshotReader(() => fetchMediaDetail(mediaId)), [mediaId]);
  const mediaState = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  const [submission] = useState(() => new PostProposalSubmission());
  const [form, setForm] = useState<ProposalFields>({
    mediaId,
    postTitle: "",
    platform: "INSTAGRAM",
    caption: "",
    objective: "",
    hashtags: [],
  });
  const [hashtags, setHashtags] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ProposalReceipt>();
  const [error, setError] = useState("");
  const [showApprovals, setShowApprovals] = useState(false);
  const mounted = useRef(false);
  const resultRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    mounted.current = true;
    const disconnect = reader.connect();
    return () => {
      mounted.current = false;
      disconnect();
    };
  }, [reader]);
  useEffect(() => {
    if (receipt) resultRef.current?.focus();
  }, [receipt]);
  const eligible = mediaState.phase === "ready" && canPrepareMedia(mediaState.data);
  const locked = submission.locked;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || receipt || !eligible) return;
    setBusy(true);
    setError("");
    try {
      const result = await submission.submit({ ...form, hashtags: hashtags.split(/[,\n]/u) });
      if (mounted.current) setReceipt(result);
    } catch (reason) {
      if (mounted.current)
        setError(reason instanceof IdaApiError ? reason.message : "La demande est momentanément indisponible.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="proposal-workspace">
      <section className="panel post-proposal-composer" aria-labelledby="post-proposal-title" aria-busy={busy}>
        <p className="eyebrow">PRÉPARATION MANUELLE</p>
        <h2 id="post-proposal-title">Préparer une publication.</h2>
        <p>
          Choisissez le texte et sa destination. Cette étape crée seulement une proposition dans IDA, sans publication
          ni programmation.
        </p>
        {mediaState.phase === "idle" || mediaState.phase === "loading" ? (
          <p role="status">Vérification du média…</p>
        ) : null}
        {mediaState.phase === "unavailable" ? (
          <div role="alert">
            <p>Média inaccessible. Aucune proposition ne peut être préparée.</p>
            <button type="button" className="command-suggestion" onClick={reader.refresh}>
              Réessayer le média
            </button>
          </div>
        ) : null}
        {mediaState.phase === "ready" ? (
          <p className="proposal-selected-media">
            Média : <strong>{mediaState.data.filename}</strong>
          </p>
        ) : null}
        {mediaState.phase === "ready" && !eligible ? (
          <p role="alert">Choisissez une image ou vidéo non archivée.</p>
        ) : null}
        {receipt ? (
          <div role="status">
            <h3 tabIndex={-1} ref={resultRef}>
              {receipt.replayed ? "Proposition déjà enregistrée." : "Proposition enregistrée, à valider."}
            </h3>
            <p>Aucune publication déclenchée. Retrouvez son état actuel dans le centre de validation.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="proposal-form">
            <fieldset disabled={!eligible || busy || locked}>
              <legend className="sr-only">Contenu de la proposition</legend>
              <label>
                Titre interne
                <input
                  maxLength={240}
                  required
                  value={form.postTitle}
                  onChange={(e) => setForm({ ...form, postTitle: e.target.value })}
                />
              </label>
              <label>
                Plateforme cible
                <select
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value as ProposalFields["platform"] })}
                >
                  {proposalPlatforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>
              <label className="proposal-full">
                Texte de la publication
                <textarea
                  required
                  maxLength={4000}
                  rows={5}
                  value={form.caption}
                  onChange={(e) => setForm({ ...form, caption: e.target.value })}
                />
              </label>
              <label className="proposal-full">
                Objectif
                <textarea
                  required
                  maxLength={2000}
                  rows={2}
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                />
              </label>
              <label>
                Hashtags (facultatif, séparés par virgule)
                <input maxLength={3029} value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
              </label>
              <label>
                Appel à l’action (facultatif)
                <input
                  maxLength={500}
                  value={form.cta ?? ""}
                  onChange={(e) => setForm({ ...form, cta: e.target.value })}
                />
              </label>
            </fieldset>
            <p>
              Un média déjà lié à une proposition peut être réutilisé. Vérifiez les répétitions ; la préparation ne le
              marque pas comme utilisé. La compatibilité de publication réelle sera vérifiée lors du branchement des
              réseaux.
            </p>
            {error ? (
              <p role="alert">
                {error}{" "}
                {locked
                  ? "Le résultat peut être incertain : réessayez cette même demande ou consultez les propositions. Ne recréez pas une nouvelle demande sans vérifier."
                  : ""}
              </p>
            ) : null}
            <button type="submit" className="send-button" disabled={!eligible || busy}>
              {busy ? "Enregistrement…" : locked ? "Réessayer la même demande" : "Créer la proposition à valider"}
            </button>
          </form>
        )}
        <div className="catalog-detail-actions">
          <button className="command-suggestion" type="button" onClick={() => setShowApprovals(true)} disabled={busy}>
            Voir les propositions à valider
          </button>
          <button className="command-suggestion" type="button" onClick={onClose} disabled={busy}>
            Retour à la bibliothèque
          </button>
        </div>
      </section>
      {showApprovals ? <div key={receipt?.variantId ?? "before-creation"}>{renderApprovals()}</div> : null}
    </div>
  );
}
