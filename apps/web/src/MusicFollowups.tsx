import {
  type MusicContact,
  type MusicFollowup,
  musicFollowupCreateSchema,
  musicFollowupListSchema,
  musicFollowupResponseSchema,
} from "@ida/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { completeTask } from "./api";
import { IdaApiError, onWorkspaceInvalidated, requestApi } from "./api-transport";
import { followupDueUtc } from "./music-followup-date";
import "./music-readiness.css";
import "./music-releases.css";

const errorMessage = (error: unknown) =>
  error instanceof IdaApiError
    ? error.message
    : "La réponse est indisponible. Vérifie la connexion à IDA puis réessaie.";
const labels = { TODO: "À faire", IN_PROGRESS: "En cours", DONE: "Terminée", CANCELLED: "Annulée" };
const dateLabel = (date: string, timeZone: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(date));

function FollowupForm({ contact, onSaved }: { contact: MusicContact; onSaved: () => void }) {
  const [title, setTitle] = useState((contact.nextAction ?? `Recontacter ${contact.organisation}`).slice(0, 240));
  const [description, setDescription] = useState(
    contact.nextAction && contact.nextAction.length > 240 ? contact.nextAction : "",
  );
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const pending = useRef<AbortController | null>(null);
  const intent = useRef<{ text: string; key: string } | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const dueAt = followupDueUtc(due);
    if (!dueAt) {
      setError(
        "Choisis une date et une heure valides dans le fuseau indiqué (hors heure supprimée au changement d’heure).",
      );
      return;
    }
    const fields = {
      title,
      ...(description.trim() ? { description } : {}),
      dueAt,
      timeZone,
      expectedContactRevision: contact.revision,
    };
    const text = JSON.stringify(fields);
    if (!intent.current || intent.current.text !== text) intent.current = { text, key: crypto.randomUUID() };
    const parsed = musicFollowupCreateSchema.safeParse({ ...fields, idempotencyKey: intent.current.key });
    if (!parsed.success) {
      setError("Vérifie le titre (240 caractères maximum), la description et l’échéance.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      musicFollowupResponseSchema.parse(
        await requestApi(
          `/v1/music/contacts/${contact.id}/followups`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed.data),
            signal: controller.signal,
          },
          false,
          20000,
        ),
      );
      if (!controller.signal.aborted) onSaved();
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          `${errorMessage(failure)} Tes champs sont conservés. Si la fiche contact a changé, copie-les avant de la recharger.`,
        );
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <form className="music-release__editor" aria-label="Planifier une relance" onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy}>
        <legend>Une tâche partagée, aucun message automatique</legend>
        <label>
          Action à réaliser
          <input required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Détails de la relance
          <textarea
            rows={3}
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label>
          Échéance locale
          <input type="datetime-local" required value={due} onChange={(event) => setDue(event.target.value)} />
        </label>
        <p>
          Fuseau de cet appareil : {timeZone}. L’échéance est enregistrée en UTC ; en cas d’heure répétée au passage à
          l’heure d’hiver, la première occurrence est retenue.
        </p>
        <p>
          Une échéance passée reste permise et apparaît en retard. Ce n’est pas une notification programmée ni un envoi
          de relance.
        </p>
        <button type="submit">{busy ? "Enregistrement…" : "Enregistrer la relance"}</button>
      </fieldset>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

export function MusicFollowups({
  contact,
  initialTaskId,
  onOpenWorkspace,
  onOpenContact,
}: {
  contact?: MusicContact;
  initialTaskId?: string | undefined;
  onOpenWorkspace?: ((taskId: string) => void) | undefined;
  onOpenContact?: ((contactId: string) => void) | undefined;
}) {
  const [page, setPage] = useState<{ data: MusicFollowup[]; nextOffset: number | null } | null>(null);
  const [state, setState] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [taskId, setTaskId] = useState(initialTaskId);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [finish, setFinish] = useState<MusicFollowup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [notice, setNotice] = useState("");
  const [invalidated, setInvalidated] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const unsubscribe = onWorkspaceInvalidated(() => {
      pending.current?.abort();
      setInvalidated(true);
      setPage(null);
      setFinish(null);
      setCreating(false);
    });
    return () => {
      pending.current?.abort();
      unsubscribe();
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit refresh rereads shared task states.
  useEffect(() => {
    if (invalidated) return;
    const controller = new AbortController();
    setPage(null);
    setError("");
    setFinish(null);
    const query = new URLSearchParams({ state, offset: String(offset) });
    if (contact) query.set("musicContactId", contact.id);
    if (taskId) query.set("taskId", taskId);
    void requestApi(`/v1/music/followups?${query}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setPage(musicFollowupListSchema.parse(data));
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      });
    return () => controller.abort();
  }, [contact?.id, state, offset, attempt, taskId, invalidated]);
  async function finishTask() {
    if (!finish || pending.current) return;
    const selected = finish;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setWriteError("");
    try {
      const task = await completeTask(selected.task.id, controller.signal);
      if (task.id !== selected.task.id || task.status !== "DONE") throw new Error("Completion not confirmed");
      if (!controller.signal.aborted) {
        setFinish(null);
        setNotice("Relance marquée terminée dans la tâche partagée. Aucun message envoyé.");
        setAttempt((value) => value + 1);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setWriteError(errorMessage(failure));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  if (invalidated) return <p role="alert">Session ou espace modifié. Ferme puis rouvre les relances.</p>;
  return (
    <section className="music-readiness music-release" aria-label="Relances Music">
      <header>
        <p className="music-readiness__eyebrow">MUSIC · SUIVI DES DÉMARCHES</p>
        <h3>{contact ? `Relances · ${contact.organisation}` : "Relances Music"}</h3>
        <p>
          Une échéance et un état partagés avec les tâches Workspace. Aucun email envoyé, aucun contact marqué «
          contacté » automatiquement.
        </p>
      </header>
      <div className="music-release__actions">
        {contact ? (
          <button type="button" disabled={busy} onClick={() => setCreating((value) => !value)}>
            {creating ? "Fermer le formulaire (sans enregistrer)" : "Planifier une relance"}
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>
          Actualiser les relances
        </button>
        {taskId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setTaskId(undefined);
              setOffset(0);
            }}
          >
            Toutes les relances Music
          </button>
        ) : null}
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      {creating && contact ? (
        <FollowupForm
          contact={contact}
          onSaved={() => {
            setCreating(false);
            setState("ALL");
            setOffset(0);
            setAttempt((value) => value + 1);
            setNotice("Relance enregistrée dans les tâches Workspace. Aucun envoi programmé.");
          }}
        />
      ) : null}
      <label>
        État des relances
        <select
          disabled={busy}
          value={state}
          onChange={(event) => {
            setState(event.target.value as typeof state);
            setOffset(0);
          }}
        >
          <option value="ALL">Toutes</option>
          <option value="OPEN">À faire / en cours</option>
          <option value="CLOSED">Terminées / annulées</option>
        </select>
      </label>
      {!page && !error ? <p role="status">Lecture des relances…</p> : null}
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Réessayer les relances
          </button>
        </p>
      ) : null}
      {page ? (
        <>
          {!page.data.length ? <p>Aucune relance dans cette sélection.</p> : null}
          <ul className="music-release__list">
            {page.data.map((item) => (
              <li key={item.id}>
                <article aria-label={item.task.title}>
                  <h4>{item.task.title}</h4>
                  <p>
                    {item.projectName} · {item.organisation}
                  </p>
                  <p>
                    {labels[item.task.status]}
                    {item.task.dueAt &&
                    (item.task.status === "TODO" || item.task.status === "IN_PROGRESS") &&
                    Date.parse(item.task.dueAt) < Date.now()
                      ? " · En retard"
                      : ""}
                  </p>
                  {item.task.dueAt ? (
                    <p>
                      Échéance : <time dateTime={item.task.dueAt}>{dateLabel(item.task.dueAt, item.timeZone)}</time> ·{" "}
                      {item.timeZone}
                    </p>
                  ) : null}
                  {item.task.description ? <p>{item.task.description}</p> : null}
                  <p>
                    Créée le {dateLabel(item.task.createdAt, item.timeZone)}
                    {item.task.completedAt ? ` · Terminée le ${dateLabel(item.task.completedAt, item.timeZone)}` : ""}
                  </p>
                  <small>Référence de la tâche : {item.task.id}</small>
                  <div className="music-release__actions">
                    {onOpenWorkspace ? (
                      <button type="button" disabled={busy} onClick={() => onOpenWorkspace(item.task.id)}>
                        Voir cette relance dans Workspace
                      </button>
                    ) : null}
                    {onOpenContact ? (
                      <button type="button" disabled={busy} onClick={() => onOpenContact(item.musicContactId)}>
                        Ouvrir le contact dans Music
                      </button>
                    ) : null}
                    {item.task.status === "TODO" || item.task.status === "IN_PROGRESS" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setWriteError("");
                          setFinish(item);
                        }}
                      >
                        Marquer la relance terminée
                      </button>
                    ) : null}
                  </div>
                </article>
              </li>
            ))}
          </ul>
          <nav aria-label="Pages des relances">
            <button type="button" disabled={busy || !offset} onClick={() => setOffset(Math.max(0, offset - 25))}>
              Relances précédentes
            </button>
            <button
              type="button"
              disabled={busy || page.nextOffset === null}
              onClick={() => setOffset(page.nextOffset ?? 0)}
            >
              Relances suivantes
            </button>
          </nav>
        </>
      ) : null}
      {finish ? (
        <section aria-label="Confirmer la fin de relance">
          <h4>Terminer « {finish.task.title} » ?</h4>
          <p>
            Tu confirmes avoir effectué cette action toi-même. Cela ne prouve pas un envoi ou une réponse du
            destinataire.
          </p>
          <button type="button" disabled={busy} onClick={() => void finishTask()}>
            {busy ? "Enregistrement…" : "Confirmer la relance terminée"}
          </button>
          <button type="button" disabled={busy} onClick={() => setFinish(null)}>
            Annuler
          </button>
          {writeError ? <p role="alert">{writeError}</p> : null}
        </section>
      ) : null}
      <p className="music-readiness__boundary">
        Échéances recalculées à l’ouverture ou à l’actualisation. Pas de notification en arrière-plan, de report
        d’échéance ni de synchronisation Google Calendar dans cette tranche. Enregistre avant de fermer un formulaire.
      </p>
    </section>
  );
}
