import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import { completeTask, createTask, fetchTasks, type TaskRecord } from "./api";
import { IdaApiError } from "./api-transport";
import { CreativeEngineWorkspace } from "./CreativeEngineWorkspace";
import type { NavigationId } from "./data";
import { LocalDialogue } from "./LocalDialogue";
import { McpToolsPanel } from "./McpToolsPanel";
import { LineIcon, ReferenceRail, Sheet } from "./ReferenceChrome";

type ProjectKind = "Application" | "Agent" | "Automatisation" | "Outil";
type View = "create" | "templates" | "projects" | "detail" | "collaborate" | "dialogue" | "mcp";
const kinds: { name: ProjectKind; icon: string; description: string }[] = [
  { name: "Application", icon: "grid", description: "Dessiner une application utile" },
  { name: "Agent", icon: "agent", description: "Concevoir un agent spécialisé" },
  { name: "Automatisation", icon: "automation", description: "Préparer un processus contrôlé" },
  { name: "Outil", icon: "tool", description: "Définir un outil personnalisé" },
];
const templates: { title: string; kind: ProjectKind; goal: string; deliverable: string; limits: string }[] = [
  {
    title: "Assistant documentaire",
    kind: "Agent",
    goal: "Aider à retrouver les informations d’une collection de documents explicitement choisis.",
    deliverable: "Une synthèse courte avec références aux passages consultés.",
    limits:
      "Lecture seule. Aucun document hors sélection, aucune mémoire automatique ni envoi cloud sans consentement.",
  },
  {
    title: "Tableau de projet",
    kind: "Application",
    goal: "Réunir les objectifs, tâches et décisions d’un projet dans une vue partagée.",
    deliverable: "Une interface de suivi reliée aux tâches IDA existantes.",
    limits: "Même workspace et mêmes permissions que le Core. Aucune nouvelle base parallèle.",
  },
  {
    title: "Préparation de release",
    kind: "Automatisation",
    goal: "Préparer les étapes nécessaires à la sortie d’un morceau.",
    deliverable: "Une checklist de validation et les propositions de contenus à relire.",
    limits: "Pas de publication, distribution ou contact externe sans confirmation humaine finale.",
  },
  {
    title: "Comparateur de versions",
    kind: "Outil",
    goal: "Comparer deux versions de fichiers fournis pour mettre en évidence leurs différences.",
    deliverable: "Un rapport lisible des changements, sans modification des originaux.",
    limits: "Lecture de fichiers sélectionnés uniquement. Formats, tailles et erreurs à valider côté serveur.",
  },
];
const labels: Record<TaskRecord["status"], string> = {
  TODO: "À préparer",
  IN_PROGRESS: "En cours",
  DONE: "Terminé",
  CANCELLED: "Annulé",
};
const projectPrefix = "Fabrique · ";
function exportBrief(title: string, description: string) {
  const url = URL.createObjectURL(
    new Blob([`# ${title}\n\n${description}\n`], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "ida-fabrique-brief.md";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Les projets sont une projection des tâches existantes : pas de registre bis. */
export function FabriqueEnvironment({
  titleRef,
  onBack,
  onSelect,
  onNavigate,
}: {
  titleRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onSelect: (id: string) => void;
  onNavigate: (id: NavigationId) => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [engineOpen, setEngineOpen] = useState(false);
  const [kind, setKind] = useState<ProjectKind>("Application");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [limits, setLimits] = useState("");
  const [owner, setOwner] = useState("");
  const [collaboration, setCollaboration] = useState("");
  const [motion, setMotion] = useState(true);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [active, setActive] = useState<TaskRecord | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const viewGeneration = useRef(0);
  const mutation = useRef(false);
  const mounted = useRef(true);
  const savedDrafts = useRef(new Map<string, TaskRecord>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setFailure("");
    void fetchTasks()
      .then((rows) => {
        if (current === generation.current) setTasks(rows.filter((row) => row.title.startsWith(projectPrefix)));
      })
      .catch(() => {
        if (current === generation.current)
          setFailure("Les projets ne sont pas accessibles pour le moment. Réessayez après connexion à IDA.");
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [revision]);
  const title = `${projectPrefix}${kind} · ${name.trim()}`;
  const description = `TYPE : ${kind}\n\nOBJECTIF\n${goal.trim()}\n\nLIVRABLE\n${deliverable.trim()}\n\nLIMITES ET VALIDATION\n${limits.trim()}\n\nRESPONSABLE\n${owner.trim() || "À désigner"}\n\nSTATUT : brief de conception uniquement. Aucun agent enregistré, outil exécuté, automatisation activée ou application déployée.`;
  const filtered = tasks.filter(
    (task) =>
      (filter === "all" || task.status === filter) &&
      `${task.title} ${task.description ?? ""}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")),
  );
  function open(next: View | null) {
    viewGeneration.current++;
    setNotice("");
    setView(next);
  }
  function selectTask(task: TaskRecord) {
    setActive(task);
    open("detail");
  }
  function newProject(value: ProjectKind) {
    setKind(value);
    setName("");
    setGoal("");
    setDeliverable("");
    setLimits("");
    setOwner("");
    open("create");
  }
  function useTemplate(template: (typeof templates)[number]) {
    setKind(template.kind);
    setName(template.title);
    setGoal(template.goal);
    setDeliverable(template.deliverable);
    setLimits(template.limits);
    setOwner("");
    open("create");
  }
  async function persist(titleValue: string, bodyValue: string) {
    if (mutation.current) return;
    if (loading || failure) {
      setNotice(
        "Actualisez les projets avant d’enregistrer afin de vérifier les briefs existants. Votre saisie reste disponible.",
      );
      return;
    }
    const key = `${titleValue}\n${bodyValue}`;
    const previous =
      tasks.find((task) => task.title === titleValue && task.description === bodyValue) ?? savedDrafts.current.get(key);
    if (previous) {
      setActive(previous);
      setView("detail");
      setNotice("Ce brief est déjà enregistré. Voici sa fiche existante.");
      return;
    }
    if (titleValue.length > 240 || bodyValue.length > 4000) {
      setNotice("Le brief dépasse la taille autorisée. Réduisez les champs avant de l’enregistrer.");
      return;
    }
    mutation.current = true;
    generation.current++;
    setLoading(false);
    const originView = viewGeneration.current;
    setSaving(true);
    setNotice("");
    try {
      const created = await createTask({ title: titleValue, description: bodyValue });
      if (mounted.current) {
        savedDrafts.current.set(key, created);
        setTasks((rows) => [created, ...rows.filter((row) => row.id !== created.id)]);
        if (originView === viewGeneration.current) {
          setActive(created);
          setView("detail");
          setNotice("Brief enregistré dans les tâches partagées. Rien n’a été exécuté ou déployé.");
        }
      }
    } catch (error) {
      if (mounted.current && originView === viewGeneration.current)
        setNotice(
          error instanceof IdaApiError
            ? error.message
            : "Enregistrement impossible. Votre saisie reste dans le formulaire.",
        );
    } finally {
      mutation.current = false;
      if (mounted.current) {
        setSaving(false);
        setRevision((value) => value + 1);
      }
    }
  }
  async function finishTask(task: TaskRecord) {
    if (mutation.current || task.status === "DONE" || task.status === "CANCELLED") return;
    mutation.current = true;
    generation.current++;
    setLoading(false);
    const originView = viewGeneration.current;
    setSaving(true);
    setNotice("");
    try {
      const result = await completeTask(task.id);
      if (mounted.current) {
        setTasks((rows) => rows.map((row) => (row.id === result.id ? result : row)));
        for (const [key, value] of savedDrafts.current)
          if (value.id === result.id) savedDrafts.current.set(key, result);
        if (originView === viewGeneration.current) {
          setActive(result);
          setNotice("Tâche terminée. Cela ne déploie pas le projet et n’active aucun agent.");
        }
      }
    } catch (error) {
      if (mounted.current && originView === viewGeneration.current)
        setNotice(error instanceof IdaApiError ? error.message : "Modification indisponible. Le statut est inchangé.");
    } finally {
      mutation.current = false;
      if (mounted.current) {
        setSaving(false);
        setRevision((value) => value + 1);
      }
    }
  }
  if (engineOpen)
    return (
      <CreativeEngineWorkspace
        onClose={() => {
          setEngineOpen(false);
          setRevision((value) => value + 1);
        }}
        onCreateProject={() => {
          setEngineOpen(false);
          newProject("Application");
        }}
      />
    );
  return (
    <section
      className="environment-screen reference-environment fabrique-reference"
      data-environment="fabrique"
      data-motion={motion}
      data-surface={motion ? "glass" : "solid"}
      aria-label="Environnement La Fabrique"
      style={{ "--environment-image": 'url("/design/user-20260909/fabrique-reference-v2.png")' } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !view) {
          event.preventDefault();
          onBack();
        }
      }}
    >
      <ReferenceRail active="fabrique" onBack={onBack} onSelect={onSelect} onNavigate={onNavigate} />
      <main className="reference-main">
        <div className="reference-top">
          <button type="button" onClick={onBack}>
            ← La Roue des Mondes
          </button>
          <button type="button" aria-pressed={motion} onClick={() => setMotion(!motion)}>
            {motion ? "Ⅱ" : "▷"} Reflets
          </button>
        </div>
        <header className="reference-intro">
          <h1 ref={titleRef} tabIndex={-1}>
            LA FABRIQUE
          </h1>
          <p className="reference-subtitle">CONCEVOIR · DÉVELOPPER · DÉPLOYER</p>
          <hr />
          <p className="reference-quote">
            “Des idées aux applications.
            <br />
            Avec toi. Plus loin.”
          </p>
          <small className="scene-kicker">IDA</small>
        </header>
        <div className="reference-panels fabrique-panels">
          <section className="reference-glass fabrique-new">
            <button className="reference-row" type="button" onClick={() => open("mcp")}>
              <LineIcon kind="tool" />
              <span>
                <strong>Outils MCP</strong>
                <small>Lire et rechercher dans les documents autorisés</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
            <button className="reference-row" type="button" onClick={() => setEngineOpen(true)}>
              <LineIcon kind="grid" />
              <span>
                <strong>IDA Creative Engine</strong>
                <small>Références · plans · dossiers de conception</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
            <button className="fabrique-new-title" type="button" onClick={() => newProject("Application")}>
              <LineIcon kind="case" />
              <span>Nouveau projet</span>
              <LineIcon kind="plus" />
            </button>
            {kinds.map((item) => (
              <button className="reference-row" type="button" key={item.name} onClick={() => newProject(item.name)}>
                <LineIcon kind={item.icon} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
            <button className="reference-row" type="button" onClick={() => open("templates")}>
              <LineIcon kind="book" />
              <span>
                <strong>Template</strong>
                <small>Démarrer depuis un modèle</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          </section>
          <section className="reference-glass fabrique-recents">
            <header>
              <h2>Projets récents</h2>
              <button type="button" onClick={() => open("projects")}>
                Voir tout →
              </button>
            </header>
            {loading ? <p role="status">Chargement de vos projets…</p> : null}
            {failure ? (
              <p role="alert">
                {failure}
                <button type="button" disabled={saving} onClick={() => setRevision((value) => value + 1)}>
                  Réessayer
                </button>
              </p>
            ) : null}
            {!loading && !failure && !tasks.length ? (
              <div className="fabrique-empty">
                <LineIcon kind="case" />
                <p>Votre première idée commence ici.</p>
                <button type="button" onClick={() => newProject("Application")}>
                  Créer mon premier brief →
                </button>
              </div>
            ) : null}
            {tasks.slice(0, 4).map((task) => (
              <button className="reference-row" type="button" key={task.id} onClick={() => selectTask(task)}>
                <span className="fabrique-project-icon">
                  <LineIcon kind="case" />
                </span>
                <span>
                  <strong>{task.title.slice(projectPrefix.length)}</strong>
                  <small>{labels[task.status]} · tâche de conception</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
          </section>
          <p className="fabrique-truth">
            Vos briefs sont sauvegardés dans les tâches IDA.
            <br />
            Exécution et déploiement non connectés.
          </p>
        </div>
        <nav className="reference-dock" aria-label="Actions de La Fabrique">
          <button type="button" onClick={() => setEngineOpen(true)}>
            <LineIcon kind="grid" />
            Creative Engine
          </button>
          <button type="button" onClick={() => open("projects")}>
            <LineIcon kind="search" />
            Explorer
          </button>
          <button type="button" onClick={() => open("templates")}>
            <LineIcon kind="grid" />
            Templates
          </button>
          <button type="button" onClick={() => open("projects")}>
            <LineIcon kind="case" />
            Mes projets
          </button>
          <button type="button" onClick={() => open("collaborate")}>
            <LineIcon kind="users" />
            Collaborer
          </button>
        </nav>
        <p className="fabrique-signature">
          DES IDÉES
          <br />
          AUX RÉALITÉS.
        </p>
      </main>
      {view ? (
        <Sheet
          title={
            view === "mcp"
              ? "Outils MCP · lecture documentaire"
              : view === "create"
              ? `Nouveau projet · ${kind}`
              : view === "templates"
                ? "Templates"
                : view === "projects"
                  ? "Mes projets"
                  : view === "detail"
                    ? "Mon brief de projet"
                    : view === "collaborate"
                      ? "Préparer une collaboration"
                      : "Réfléchir avec IDA"
          }
          close={() => open(null)}
        >
          {view === "mcp" ? <McpToolsPanel /> : null}
          {view === "create" ? (
            <form
              className="fabrique-form"
              onSubmit={(event) => {
                event.preventDefault();
                void persist(title, description);
              }}
            >
              <p>
                Enregistre un brief dans ton espace. Cette étape ne construit pas d’application et n’active aucun agent.
              </p>
              <fieldset disabled={saving}>
                <label>
                  Type de projet
                  <select value={kind} onChange={(event) => setKind(event.target.value as ProjectKind)}>
                    {kinds.map((item) => (
                      <option key={item.name}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Nom
                  <input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={150}
                    placeholder="Le nom de ton projet"
                  />
                </label>
                <label>
                  Objectif
                  <textarea
                    required
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    maxLength={900}
                    rows={3}
                    placeholder="À qui sera-t-il utile ? Pour quel besoin ?"
                  />
                </label>
                <label>
                  Livrable attendu
                  <textarea
                    required
                    value={deliverable}
                    onChange={(event) => setDeliverable(event.target.value)}
                    maxLength={800}
                    rows={3}
                    placeholder="Ce que tu souhaites pouvoir voir ou utiliser"
                  />
                </label>
                <label>
                  Limites et validation humaine
                  <textarea
                    required
                    value={limits}
                    onChange={(event) => setLimits(event.target.value)}
                    maxLength={900}
                    rows={3}
                    placeholder="Données autorisées, actions interdites, validations nécessaires…"
                  />
                </label>
                <label>
                  Responsable de validation
                  <input
                    value={owner}
                    onChange={(event) => setOwner(event.target.value)}
                    maxLength={150}
                    placeholder="À désigner"
                  />
                </label>
                {kind === "Agent" ? (
                  <p className="reference-hint">
                    Avant activation : manifeste versionné, outils et contexte autorisés, permissions serveur,
                    évaluations et responsable humain. Ce formulaire n’accorde aucun accès.
                  </p>
                ) : null}
                <div className="reference-actions">
                  <button
                    className="reference-primary"
                    type="submit"
                    disabled={!name.trim() || !goal.trim() || !deliverable.trim() || !limits.trim()}
                  >
                    {saving ? "Enregistrement…" : "Enregistrer le brief"}
                  </button>
                  <button type="button" disabled={!name.trim()} onClick={() => exportBrief(title, description)}>
                    Télécharger en Markdown
                  </button>
                </div>
              </fieldset>
            </form>
          ) : null}
          {view === "templates" ? (
            <>
              <p>Quatre points de départ à personnaliser. Aucun modèle n’est exécuté automatiquement.</p>
              <div className="fabrique-templates">
                {templates.map((item) => (
                  <article key={item.title}>
                    <LineIcon kind={kinds.find((value) => value.name === item.kind)?.icon ?? "book"} />
                    <span>{item.kind}</span>
                    <h3>{item.title}</h3>
                    <p>{item.goal}</p>
                    <button type="button" onClick={() => useTemplate(item)}>
                      Utiliser ce modèle →
                    </button>
                  </article>
                ))}
              </div>
            </>
          ) : null}
          {view === "projects" ? (
            <>
              <div className="fabrique-filters">
                <label>
                  Chercher un projet
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    maxLength={150}
                  />
                </label>
                <label>
                  État
                  <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                    <option value="all">Tous les projets</option>
                    {Object.entries(labels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="reference-actions">
                <button type="button" onClick={() => newProject("Application")}>
                  Nouveau projet +
                </button>
                <button type="button" disabled={loading || saving} onClick={() => setRevision((value) => value + 1)}>
                  Actualiser
                </button>
              </div>
              {loading ? <p role="status">Chargement…</p> : null}
              {failure ? <p role="alert">{failure}</p> : null}
              {filtered.map((task) => (
                <button className="fabrique-list-item" type="button" key={task.id} onClick={() => selectTask(task)}>
                  <LineIcon kind="case" />
                  <span>
                    <strong>{task.title.slice(projectPrefix.length)}</strong>
                    <small>{labels[task.status]}</small>
                  </span>
                  <span>→</span>
                </button>
              ))}
              {!loading && !failure && !filtered.length ? <p>Aucun projet dans cette sélection.</p> : null}
            </>
          ) : null}
          {view === "detail" && active ? (
            <div className="fabrique-detail">
              <p className="scene-kicker">{labels[active.status]} · tâche partagée</p>
              <h3>{active.title.slice(projectPrefix.length)}</h3>
              <p className="fabrique-description">{active.description || "Aucune description renseignée."}</p>
              <div className="reference-actions">
                <button type="button" onClick={() => exportBrief(active.title, active.description ?? "")}>
                  Exporter le brief
                </button>
                <button
                  type="button"
                  disabled={saving || active.status === "DONE" || active.status === "CANCELLED"}
                  onClick={() => void finishTask(active)}
                >
                  {saving ? "Enregistrement…" : "Marquer la tâche terminée"}
                </button>
                <button type="button" onClick={() => onNavigate("tasks")}>
                  Ouvrir les tâches IDA →
                </button>
                <button type="button" onClick={() => open("dialogue")}>
                  Réfléchir avec IDA
                </button>
              </div>
              <p className="reference-hint">
                Le brief n’est pas envoyé automatiquement au modèle. Aucun agent enregistré ni outil exécuté.
              </p>
            </div>
          ) : null}
          {view === "collaborate" ? (
            <form
              className="fabrique-form"
              onSubmit={(event) => {
                event.preventDefault();
                void persist(`${projectPrefix}Collaboration`, collaboration.trim());
              }}
            >
              <p>Prépare le brief de collaboration. Aucun message, invitation ou accès n’est envoyé à un tiers.</p>
              <label>
                Ce que nous voulons construire ensemble
                <textarea
                  rows={8}
                  required
                  maxLength={3500}
                  value={collaboration}
                  onChange={(event) => setCollaboration(event.target.value)}
                  placeholder="Objectif commun, rôles, décisions attendues…"
                  disabled={saving}
                />
              </label>
              <div className="reference-actions">
                <button className="reference-primary" type="submit" disabled={saving || !collaboration.trim()}>
                  Enregistrer la préparation
                </button>
                <button
                  type="button"
                  disabled={!collaboration.trim()}
                  onClick={() => exportBrief("Collaboration", collaboration)}
                >
                  Télécharger le brief
                </button>
              </div>
            </form>
          ) : null}
          {view === "dialogue" ? <LocalDialogue /> : null}
          {notice ? (
            <p className="reference-feedback" role="status">
              {notice}
            </p>
          ) : null}
        </Sheet>
      ) : null}
    </section>
  );
}
