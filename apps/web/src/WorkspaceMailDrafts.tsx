import {
  type MailDraftPurpose,
  type MusicContact,
  musicMailDraftCreateSchema,
  type WorkspaceMailDraft,
  workspaceMailDraftListSchema,
  workspaceMailDraftPatchSchema,
  workspaceMailDraftResponseSchema,
} from "@ida/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { IdaApiError, onWorkspaceInvalidated, requestApi } from "./api-transport";
import { proposeMusicMail } from "./mail-draft-template";
import "./music-readiness.css";
import "./music-releases.css";
import "./workspace-mail-drafts.css";

const purposes: Record<MailDraftPurpose, string> = {
  LABEL_DEMO: "Proposition à un label",
  GIG: "Date en bar / club",
  PRIVATE_EVENT: "Prestation privée",
};
const tracksSchema = z.object({
  data: z.array(z.object({ id: z.string(), title: z.string(), artistProjectId: z.string() })),
});
type Track = z.infer<typeof tracksSchema>["data"][number];
const message = (error: unknown) =>
  error instanceof IdaApiError
    ? error.message
    : "Réponse invalide ou connexion interrompue. Réessaie : tes champs restent ici.";

function DraftEditor({
  draft,
  contact,
  onSaved,
}: {
  draft?: WorkspaceMailDraft;
  contact?: MusicContact;
  onSaved: (draft: WorkspaceMailDraft) => void;
}) {
  const [form, setForm] = useState({
    purpose: draft?.purpose ?? ((contact?.kind === "LABEL" ? "LABEL_DEMO" : "GIG") as MailDraftPurpose),
    trackId: draft?.trackId ?? "",
    listeningUrl: draft?.listeningUrl ?? "",
    recipientEmail: draft?.recipientEmail ?? contact?.email ?? "",
    subject: draft?.subject ?? "",
    body: draft?.body ?? "",
    status: draft?.status ?? "DRAFT",
  });
  const [presentation, setPresentation] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksError, setTracksError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const intent = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry reloads references.
  useEffect(() => {
    if (draft || !contact) return;
    const controller = new AbortController();
    setTracksError("");
    void requestApi("/v1/tracks", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted)
          setTracks(
            tracksSchema.parse(value).data.filter((track) => track.artistProjectId === contact.artistProjectId),
          );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setTracksError(message(error));
      });
    return () => controller.abort();
  }, [draft, contact, attempt]);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || (!draft && !contact)) return;
    const fields = {
      subject: form.subject,
      body: form.body,
      recipientEmail: form.recipientEmail.trim() || null,
      listeningUrl: form.listeningUrl.trim() || null,
    };
    const payload = draft
      ? { ...fields, expectedRevision: draft.revision, status: form.status }
      : { ...fields, purpose: form.purpose, trackId: form.trackId || null, expectedContactRevision: contact?.revision };
    const serialized = JSON.stringify(payload);
    if (!intent.current || intent.current.body !== serialized)
      intent.current = { body: serialized, key: crypto.randomUUID() };
    const parsed = draft
      ? workspaceMailDraftPatchSchema.safeParse(payload)
      : musicMailDraftCreateSchema.safeParse({ ...payload, idempotencyKey: intent.current.key });
    if (!parsed.success) {
      setError(
        "Vérifie l’objet, le texte (12 000 caractères maximum), l’email facultatif et le lien HTTPS public. Aucun message envoyé.",
      );
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = workspaceMailDraftResponseSchema.parse(
        await requestApi(
          draft ? `/v1/workspace/mail-drafts/${draft.id}` : `/v1/music/contacts/${contact?.id}/mail-drafts`,
          {
            method: draft ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
            signal: controller.signal,
          },
          false,
          20000,
        ),
      );
      if (!controller.signal.aborted) onSaved(result.data);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(`${message(error)} Tes champs sont conservés. Copie-les avant une relecture si nécessaire.`);
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <form
      aria-label={draft ? "Modifier le brouillon partagé" : "Créer un brouillon musical"}
      className="music-release__editor mail-drafts__editor"
      onSubmit={(event) => void save(event)}
    >
      <fieldset disabled={busy}>
        <legend>
          {draft ? `Brouillon partagé · révision ${draft.revision}` : "Préparer le message — aucun envoi"}
        </legend>
        {!draft && contact ? (
          <>
            <label>
              Intention
              <select value={form.purpose} onChange={(event) => update("purpose", event.target.value)}>
                {Object.entries(purposes).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Morceau de ce projet (facultatif)
              <select value={form.trackId} onChange={(event) => update("trackId", event.target.value)}>
                <option value="">Sans morceau associé</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.title}
                  </option>
                ))}
              </select>
            </label>
            {tracksError ? (
              <p role="alert">
                {tracksError}{" "}
                <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                  Réessayer les morceaux
                </button>
              </p>
            ) : null}
            <label>
              Ta présentation factuelle (facultatif)
              <textarea
                maxLength={3000}
                rows={3}
                value={presentation}
                onChange={(event) => setPresentation(event.target.value)}
                placeholder="Ton expérience et ton matériel, uniquement ce que tu confirmes."
              />
            </label>
            <p>
              Pas besoin d’inventer un portfolio privé. Précise ton expérience et ton matériel si tu souhaites les
              présenter ; vérifie le genre, le destinataire et les conditions avant tout démarchage.
            </p>
            <button
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  ...proposeMusicMail({
                    purpose: current.purpose,
                    projectName: contact.projectName,
                    presentation,
                    trackTitle: tracks.find((track) => track.id === current.trackId)?.title,
                    listeningUrl: current.listeningUrl,
                  }),
                }))
              }
            >
              Préremplir l’objet et le texte (remplace ces champs)
            </button>
          </>
        ) : null}
        <label>
          Destinataire (email facultatif)
          <input
            type="email"
            maxLength={254}
            value={form.recipientEmail}
            onChange={(event) => update("recipientEmail", event.target.value)}
          />
        </label>
        <p>
          L’adresse est une copie choisie pour ce brouillon, pas une adresse vérifiée. L’absence d’email n’empêche pas
          de préparer un texte pour un formulaire officiel.
        </p>
        {draft && draft.recipientEmail !== draft.currentContactEmail ? (
          <p className="mail-drafts__warning">
            L’adresse de la fiche contact diffère de celle du brouillon. Vérifie le destinataire ; aucun remplacement
            automatique.
          </p>
        ) : null}
        <label>
          Lien d’écoute public ou non répertorié (facultatif)
          <input
            type="url"
            maxLength={2048}
            value={form.listeningUrl}
            onChange={(event) => update("listeningUrl", event.target.value)}
            placeholder="https://…"
          />
        </label>
        <p>
          Le lien est conservé, jamais visité ni créé par IDA. Une modification de ce champ ne réécrit pas le lien
          éventuellement présent dans ton texte.
        </p>
        <label>
          Objet
          <input
            required
            maxLength={240}
            value={form.subject}
            onChange={(event) => update("subject", event.target.value)}
          />
        </label>
        <label>
          Message
          <textarea
            required
            rows={12}
            maxLength={12000}
            value={form.body}
            onChange={(event) => update("body", event.target.value)}
          />
        </label>
        <small>
          {form.body.length.toLocaleString("fr-FR")} / 12 000 caractères · texte simple, aucune pièce jointe
        </small>
        {draft ? (
          <label>
            État interne
            <select value={form.status} onChange={(event) => update("status", event.target.value)}>
              <option value="DRAFT">Brouillon à relire</option>
              <option value="ARCHIVED">Archivé, conservé</option>
            </select>
          </label>
        ) : null}
        <p>
          Enregistre avant de fermer ou de changer de fiche. Ce brouillon n’est ni approuvé ni envoyé à Gmail, Outlook
          ou un autre service.
        </p>
        <button type="submit">
          {busy ? "Enregistrement…" : draft ? "Enregistrer le brouillon" : "Créer le brouillon partagé"}
        </button>
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

export function WorkspaceMailDrafts({
  contact,
  initialDraftId,
  onOpenWorkspace,
}: {
  contact?: MusicContact;
  initialDraftId?: string | undefined;
  onOpenWorkspace?: ((id: string) => void) | undefined;
}) {
  const [selection, setSelection] = useState(initialDraftId ?? "");
  const [list, setList] = useState<z.infer<typeof workspaceMailDraftListSchema> | null>(null);
  const [draft, setDraft] = useState<WorkspaceMailDraft | null>(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [offset, setOffset] = useState(0);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [invalidated, setInvalidated] = useState(false);
  useEffect(
    () =>
      onWorkspaceInvalidated(() => {
        setInvalidated(true);
        setDraft(null);
        setList(null);
      }),
    [],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry rereads the list.
  useEffect(() => {
    if (invalidated) return;
    const controller = new AbortController();
    setList(null);
    setError("");
    const query = new URLSearchParams({ offset: String(offset) });
    if (contact) query.set("musicContactId", contact.id);
    void requestApi(`/v1/workspace/mail-drafts?${query}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setList(workspaceMailDraftListSchema.parse(value));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(message(error));
      });
    return () => controller.abort();
  }, [contact?.id, offset, attempt, invalidated]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit detail retry.
  useEffect(() => {
    if (invalidated || !selection || selection === "new") return;
    const controller = new AbortController();
    setDraft(null);
    setDetailError("");
    void requestApi(`/v1/workspace/mail-drafts/${selection}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setDraft(workspaceMailDraftResponseSchema.parse(value).data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setDetailError(message(error));
      });
    return () => controller.abort();
  }, [selection, detailAttempt, invalidated]);
  function saved(value: WorkspaceMailDraft) {
    setSelection(value.id);
    setDraft(value);
    setAttempt((value) => value + 1);
    setNotice("Brouillon enregistré dans Workspace. Aucun message envoyé.");
  }
  if (invalidated) return <p role="alert">Session ou espace modifié. Ferme puis rouvre ce panneau.</p>;
  return (
    <section className="music-readiness music-release mail-drafts" aria-label="Brouillons partagés">
      <header>
        <p className="music-readiness__eyebrow">WORKSPACE · COURRIER À PRÉPARER</p>
        <h3>{contact ? `Messages pour ${contact.organisation}` : "Brouillons Music"}</h3>
        <p>Un seul texte partagé entre Music Studio et Workspace. Préparation locale, sans IA cloud ni envoi.</p>
      </header>
      {notice ? <p role="status">{notice}</p> : null}
      {selection ? (
        <>
          <div className="music-release__actions">
            <button
              type="button"
              onClick={() => {
                setSelection("");
                setNotice("");
                setAttempt((value) => value + 1);
              }}
            >
              ← Revenir aux brouillons
            </button>
            {selection !== "new" ? (
              <button
                type="button"
                onClick={() => {
                  setNotice("");
                  setDetailAttempt((value) => value + 1);
                }}
              >
                Recharger le brouillon (annule la saisie non enregistrée)
              </button>
            ) : null}
          </div>
          {selection === "new" && contact ? (
            <DraftEditor key={`new-${contact.id}`} contact={contact} onSaved={saved} />
          ) : draft ? (
            <>
              <p>
                {draft.projectName} · {draft.organisation} · {purposes[draft.purpose]}
                {draft.trackTitle ? ` · ${draft.trackTitle}` : ""}
              </p>
              <p>
                Source du contact :{" "}
                <a href={draft.contactSourceUrl} target="_blank" rel="noopener noreferrer">
                  consulter la page officielle ↗
                </a>
              </p>
              <p className="mail-drafts__record">Identifiant partagé : {draft.id}</p>
              {onOpenWorkspace ? (
                <button type="button" onClick={() => onOpenWorkspace(draft.id)}>
                  Ouvrir ce même brouillon dans Workspace
                </button>
              ) : null}
              <DraftEditor key={`${draft.id}-${draft.revision}`} draft={draft} onSaved={saved} />
            </>
          ) : detailError ? (
            <p role="alert">
              {detailError}{" "}
              <button type="button" onClick={() => setDetailAttempt((value) => value + 1)}>
                Réessayer le brouillon
              </button>
            </p>
          ) : (
            <p role="status">Lecture du brouillon…</p>
          )}
        </>
      ) : (
        <>
          <div className="music-release__actions">
            {contact ? (
              <button
                type="button"
                onClick={() => {
                  setSelection("new");
                  setNotice("");
                }}
              >
                Préparer un message
              </button>
            ) : (
              <p>Pour créer un brouillon, ouvre un contact dans Music Studio → Labels & dates.</p>
            )}
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              Actualiser les brouillons
            </button>
          </div>
          {!list && !error ? <p role="status">Lecture des brouillons…</p> : null}
          {error ? (
            <p role="alert">
              {error}{" "}
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                Réessayer les brouillons
              </button>
            </p>
          ) : null}
          {list ? (
            <>
              {!list.data.length ? <p>Aucun brouillon enregistré dans cette sélection.</p> : null}
              <ul className="music-release__list">
                {list.data.map((item) => (
                  <li key={item.id}>
                    <h4>{item.subject}</h4>
                    <p>
                      {item.projectName} → {item.organisation} · {item.status === "DRAFT" ? "À relire" : "Archivé"}
                    </p>
                    <p>
                      {item.recipientEmail ?? "Sans destinataire email"} ·{" "}
                      {new Date(item.updatedAt).toLocaleString("fr-FR")}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelection(item.id);
                        setNotice("");
                      }}
                    >
                      Ouvrir le brouillon {item.subject}
                    </button>
                  </li>
                ))}
              </ul>
              <nav aria-label="Pages des brouillons">
                <button type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 25))}>
                  Brouillons précédents
                </button>
                <button
                  type="button"
                  disabled={list.nextOffset === null}
                  onClick={() => setOffset(list.nextOffset ?? 0)}
                >
                  Brouillons suivants
                </button>
              </nav>
            </>
          ) : null}
        </>
      )}
      <p className="music-readiness__boundary">
        Envoi et approbation finale non raccordés ici. Aucun statut « contacté » n’est ajouté au carnet par la
        préparation d’un brouillon.
      </p>
    </section>
  );
}
