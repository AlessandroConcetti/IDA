import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import {
  newTravelDraft,
  notebookErrors,
  readNotebook,
  serializeNotebook,
  travelDate,
} from "../../../packages/contracts/src/travel-notebook";
import {
  createTask,
  fetchMediaAssets,
  fetchTasks,
  fetchTrackReferences,
  type TaskRecord,
  type TrackReference,
} from "./api";
import { IdaApiError } from "./api-transport";
import { DestinationMenu } from "./DestinationMenu";
import type { MediaAsset, NavigationId } from "./data";
import { LocalDialogue } from "./LocalDialogue";
import { MusicFolderImport } from "./MusicFolderImport";
import { LineIcon, ReferenceRail, Sheet } from "./ReferenceChrome";
import { StudioPlayer } from "./StudioPlayer";
import { TravelNotebook, type TravelSession } from "./TravelNotebook";
import { travelDestinations as destinations } from "./travel-destinations";

type Environment = "music" | "research" | "travel";
type Tool =
  | "dialogue"
  | "library"
  | "ideas"
  | "compose"
  | "mix"
  | "master"
  | "collaborate"
  | "export"
  | "research"
  | "sources"
  | "map"
  | "plan"
  | "trips"
  | "inspirations";
const topics = [
  "Intelligence artificielle",
  "Sciences & Univers",
  "Santé & Bien-être",
  "Société & Économie",
  "Créativité & Innovation",
];
const toolNames: Record<Tool, string> = {
  dialogue: "Dialogue avec IDA",
  library: "Ma bibliothèque",
  ideas: "Carte des idées",
  compose: "Composer · mon brief",
  mix: "Mix · écoute de référence",
  master: "Master · écoute de contrôle",
  collaborate: "Préparer une collaboration",
  export: "Exporter mon brief",
  research: "Recherche",
  sources: "Mes sources",
  map: "Carte du monde",
  plan: "Mon carnet de voyage",
  trips: "Mes voyages",
  inspirations: "Inspirations",
};

function exportText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function freshTravelSession(destination: string): TravelSession {
  const draft = newTravelDraft(destination);
  return { draft, initial: serializeNotebook(draft), source: null, pending: false, uncertain: false, notice: "" };
}

function tripPreview(task: TaskRecord): string {
  const draft = readNotebook(task.description);
  return draft
    ? `${travelDate(draft.start)} — ${travelDate(draft.end)} · ${draft.stops.length} étapes`
    : task.description || "Aucune note.";
}

/** Une scène de la roue existante ; les écritures passent par l'API partagée. */
export function ReferenceEnvironment({
  environment,
  titleRef,
  onBack,
  onSelect,
  onNavigate,
}: {
  environment: Environment;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onSelect: (id: string) => void;
  onNavigate: (id: NavigationId) => void;
}) {
  const [tool, setTool] = useState<Tool | null>(null);
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState("Japon");
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState("");
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [tracks, setTracks] = useState<TrackReference[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeAudio, setActiveAudio] = useState<MediaAsset | null>(null);
  const [currentTrack, setCurrentTrack] = useState<TrackReference | null>(null);
  const [motion, setMotion] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [travel, setTravel] = useState<TravelSession>(() => freshTravelSession(""));
  const [pendingTravel, setPendingTravel] = useState<TravelSession | null>(null);
  const travelSaving = useRef(false);
  const requestGeneration = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    const job =
      environment === "travel"
        ? fetchTasks().then((rows) => {
            if (generation === requestGeneration.current)
              setTasks(rows.filter((task) => task.title.startsWith("Voyage · ")));
          })
        : Promise.all([
            fetchMediaAssets({ type: environment === "music" ? "AUDIO" : "DOCUMENT", limit: 50 }),
            environment === "music" ? fetchTrackReferences() : Promise.resolve([]),
          ]).then(([rows, references]) => {
            if (generation === requestGeneration.current) {
              setMedia(rows);
              setTracks(references);
            }
          });
    void job
      .catch(() => {
        if (generation === requestGeneration.current)
          setError(
            environment === "travel"
              ? "Vos voyages sont indisponibles. Vérifiez la connexion à IDA puis réessayez."
              : "Bibliothèque indisponible. Vérifiez la connexion à IDA puis réessayez.",
          );
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });
    return () => {
      requestGeneration.current++;
    };
  }, [environment, refresh]);

  const title = environment === "music" ? "MUSIC STUDIO" : environment === "research" ? "KNOWLEDGE" : "EXPLORER";
  const upcomingTrips = tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELLED");
  const open = (next: Tool) => {
    setSaved("");
    if (next !== "plan") setPendingTravel(null);
    setTool(next);
  };
  const plan = (name: string) => {
    setDestination(name);
    if (travel.draft.destination !== name || travel.source) requestTravel(freshTravelSession(name));
    open("plan");
  };
  function requestTravel(next: TravelSession) {
    if (travelSaving.current) return;
    if (!travel.source && (travel.uncertain || serializeNotebook(travel.draft) !== travel.initial))
      setPendingTravel(next);
    else {
      setTravel(next);
      setPendingTravel(null);
    }
  }
  function openTrip(task: TaskRecord) {
    if (task.id !== travel.source?.id) {
      const next = freshTravelSession(task.title.replace("Voyage · ", ""));
      next.source = task;
      next.draft = readNotebook(task.description) ?? next.draft;
      next.initial = serializeNotebook(next.draft);
      requestTravel(next);
    }
    open("plan");
  }
  async function saveTravel() {
    if (travelSaving.current || travel.source || travel.uncertain || notebookErrors(travel.draft).length) return;
    travelSaving.current = true;
    const snapshot = travel.draft;
    const description = serializeNotebook(snapshot);
    setTravel((previous) => ({ ...previous, pending: true, notice: "" }));
    try {
      const row = await createTask({ title: `Voyage · ${snapshot.destination.trim()}`, description });
      if (mounted.current) {
        setTravel((previous) => ({
          ...previous,
          draft: snapshot,
          source: row,
          initial: description,
          pending: false,
          notice: "Carnet enregistré. Vous le retrouverez dans Mes voyages et dans les tâches d’IDA.",
        }));
        setTasks((previous) => [row, ...previous.filter((task) => task.id !== row.id)]);
        setRefresh((value) => value + 1);
      }
    } catch (error) {
      const rejected = error instanceof IdaApiError && [400, 403, 404, 413, 422, 429].includes(error.status ?? 0);
      if (mounted.current)
        setTravel((previous) => ({
          ...previous,
          pending: false,
          uncertain: !rejected,
          notice: rejected
            ? "Le serveur a refusé l’enregistrement. Votre brouillon est conservé. Vérifiez vos droits et les champs ; attendez si la limite de demandes est atteinte, puis réessayez."
            : "Enregistrement non confirmé. Votre brouillon est conservé ici. Consultez et actualisez Mes voyages avant toute nouvelle création : le serveur a peut-être reçu le carnet. Aucun renvoi automatique.",
        }));
    } finally {
      travelSaving.current = false;
    }
  }
  const library = media.filter((item) => item.filename.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
  async function saveTask(title: string, description: string) {
    if (saving) return;
    if (description.length > 4000) {
      setSaved(
        "Le texte dépasse les 4 000 caractères d’une tâche. Réduisez-le ou exportez le brief pour le conserver intégralement.",
      );
      return;
    }
    setSaving(true);
    setSaved("");
    try {
      await createTask({ title: title.slice(0, 200), description });
      if (mounted.current) {
        setSaved("Enregistré dans les tâches partagées d’IDA.");
        setRefresh((value) => value + 1);
      }
    } catch {
      if (mounted.current) setSaved("Enregistrement impossible. Votre brouillon reste dans cet écran ; réessayez.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  const Row = ({
    icon,
    label,
    detail,
    action,
  }: {
    icon: string;
    label: string;
    detail?: string;
    action: () => void;
  }) => (
    <button type="button" className="reference-row" onClick={action}>
      <LineIcon kind={icon} />
      <span>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
  const ask = () => open("dialogue");
  const dock: [string, string, () => void][] =
    environment === "music"
      ? [
          ["music", "Compose", () => open("compose")],
          ["sliders", "Mix", () => open("mix")],
          ["music", "Master", () => open("master")],
          ["users", "Collaborate", () => open("collaborate")],
          ["globe", "Explore", () => open("library")],
          ["export", "Export", () => open("export")],
        ]
      : environment === "research"
        ? [
            ["chat", "Dialogue", ask],
            ["search", "Recherche", () => open("research")],
            ["ideas", "Carte des idées", () => open("ideas")],
            ["book", "Bibliothèque", () => open("library")],
            ["plus", "Créer", () => open("compose")],
          ]
        : [
            ["search", "Explorer", () => open("inspirations")],
            ["case", "Mes voyages", () => open("trips")],
            ["map", "Carte du monde", () => open("map")],
            ["ideas", "Inspirations", () => open("inspirations")],
            ["users", "Assistant", ask],
          ];

  return (
    <section
      className="environment-screen reference-environment"
      data-world={environment}
      data-motion={motion}
      aria-label={`Environnement ${title}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !tool) {
          event.preventDefault();
          onBack();
        }
      }}
      style={{ "--environment-image": `url("/design/user-20260909/${environment}-scene-v1.png")` } as CSSProperties}
    >
      <ReferenceRail active={environment} onBack={onBack} onSelect={onSelect} onNavigate={onNavigate} />
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
            {title}
          </h1>
          <p className="reference-subtitle">
            {environment === "music"
              ? "CRÉER · EXPLORER · PARTAGER"
              : environment === "research"
                ? "CHERCHER · COMPRENDRE · RELIER · CRÉER"
                : "TRAVEL AGENCY"}
          </p>
          <hr />
          <p className="reference-quote">
            {environment === "music"
              ? "“La musique est une autre manière d’explorer l’univers.”"
              : environment === "research"
                ? "“Le savoir n’est pas une accumulation, mais une connexion.”"
                : "Le monde t’attend."}
          </p>
          {environment === "travel" ? (
            <>
              <p>
                Des destinations à explorer.
                <br />
                Des projets de voyage à construire.
              </p>
              <form
                className="reference-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  plan(query.trim() || "Japon");
                }}
              >
                <LineIcon kind="search" />
                <input
                  aria-label="Où veux-tu aller ?"
                  placeholder="Où veux-tu aller ?"
                  value={query}
                  maxLength={120}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button type="submit" aria-label="Préparer ce voyage">
                  →
                </button>
              </form>
            </>
          ) : (
            <small className="scene-kicker">IDA</small>
          )}
          {environment === "research" ? (
            <div className="reference-mini-actions">
              {[
                ["book", "Recherche", "research"],
                ["map", "Synthèse", "compose"],
                ["ideas", "Idées", "ideas"],
                ["globe", "Sources", "sources"],
              ].map(([icon, label, next]) => (
                <button key={label} type="button" onClick={() => open(next as Tool)}>
                  <LineIcon kind={icon ?? "book"} />
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </header>
        {environment === "travel" ? (
          <DestinationMenu motion={motion} suspended={tool !== null} onSelect={plan} />
        ) : (
          <div className="reference-light" aria-hidden="true" />
        )}
        <aside className="reference-panels" aria-label="Commandes de l’environnement">
          {environment === "music" ? (
            <>
              <section className="reference-glass">
                <Row
                  icon="case"
                  label="Projet actuel"
                  detail={currentTrack?.title ?? (loading ? "Chargement…" : "Choisir dans votre catalogue")}
                  action={() => open("library")}
                />
                <div className="reference-wave" aria-hidden="true">
                  {Array.from({ length: 42 }, (_, i) => (
                    <span key={i} style={{ height: `${7 + ((i * 17) % 33)}px` }} />
                  ))}
                </div>
              </section>
              <section className="reference-glass">
                <Row icon="ideas" label="Idées" detail="Votre carnet de création" action={() => open("ideas")} />
              </section>
              <section className="reference-glass">
                <Row
                  icon="book"
                  label="Bibliothèque"
                  detail={loading ? "Chargement…" : `${media.length} sons affichés · ${tracks.length} morceaux`}
                  action={() => open("library")}
                />
              </section>
              <section className="reference-glass reference-warm">
                <Row icon="ideas" label="Assistant créatif" detail="Dialogue et capacités du Core" action={ask} />
              </section>
              <section className="reference-glass">
                <Row icon="clock" label="Sons disponibles" action={() => open("library")} />
                {media.slice(0, 3).map((item) => (
                  <button
                    className="reference-recent"
                    key={item.id ?? item.filename}
                    type="button"
                    onClick={() => {
                      setActiveAudio(item);
                      open("mix");
                    }}
                  >
                    <span aria-hidden="true">▷</span>
                    <span>{item.filename}</span>
                  </button>
                ))}
                {!loading && !media.length ? <p>Aucun son chargé. Importez vos exports dans la bibliothèque.</p> : null}
              </section>
            </>
          ) : environment === "research" ? (
            <>
              <section className="reference-glass">
                <h2>Recherche</h2>
                <form
                  className="reference-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    open("research");
                  }}
                >
                  <LineIcon kind="search" />
                  <input
                    aria-label="Votre recherche"
                    placeholder="Pose ta question…"
                    value={query}
                    maxLength={300}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <button type="submit" aria-label="Ouvrir la recherche">
                    →
                  </button>
                </form>
                <Row
                  icon="globe"
                  label="Recherche web"
                  detail="Choisir et consulter vos sources"
                  action={() => open("research")}
                />
                <Row
                  icon="book"
                  label="Ma bibliothèque"
                  detail="Documents, notes, articles"
                  action={() => open("library")}
                />
                <Row
                  icon="book"
                  label="Analyse de documents"
                  detail="Ouvrir les documents du Core"
                  action={() => onNavigate("content")}
                />
                <Row
                  icon="map"
                  label="Tableaux et visualisations"
                  detail="Organiser votre carte des idées"
                  action={() => open("ideas")}
                />
                <Row icon="ideas" label="Assistant de recherche" detail="Approfondir avec IDA" action={ask} />
              </section>
              <section className="reference-glass">
                <h2>Sujets du moment</h2>
                {topics.map((topic) => (
                  <button
                    type="button"
                    className="reference-topic"
                    key={topic}
                    onClick={() => {
                      setQuery(topic);
                      open("research");
                    }}
                  >
                    <span aria-hidden="true">✧</span>
                    {topic}
                    <span>→</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="reference-pill"
                  onClick={() => {
                    setQuery("");
                    open("research");
                  }}
                >
                  Explorer tous les thèmes →
                </button>
              </section>
            </>
          ) : (
            <section className="reference-glass">
              <div className="travel-suggestion">
                <div className="travel-thumb" aria-hidden="true" />
                <div>
                  <small>Suggestion d’exploration</small>
                  <h2>THAÏLANDE</h2>
                  <p>“Des paysages qui changent ta façon de voir le monde.”</p>
                  <button type="button" onClick={() => plan("Thaïlande")} aria-label="Explorer la Thaïlande">
                    →
                  </button>
                </div>
              </div>
              <div className="reference-trip-heading">
                <h2>Mes prochains voyages</h2>
                <button type="button" onClick={() => open("trips")}>
                  Voir tout →
                </button>
              </div>
              <div className="reference-trip-previews">
                {upcomingTrips.slice(0, 3).map((task) => (
                  <button type="button" key={task.id} onClick={() => openTrip(task)}>
                    {task.title.replace("Voyage · ", "")}
                    <small>{task.status === "DONE" ? "Terminé" : "En préparation"}</small>
                  </button>
                ))}
              </div>
              {!upcomingTrips.length ? (
                <p>
                  {loading
                    ? "Chargement de vos voyages…"
                    : error
                      ? "Impossible de charger les voyages pour le moment."
                      : "Aucun voyage enregistré. Choisissez votre destination pour commencer."}
                </p>
              ) : null}
            </section>
          )}
          {error ? (
            <p className="reference-error" role="status">
              {error}
              <button type="button" onClick={() => setRefresh((value) => value + 1)}>
                Réessayer
              </button>
            </p>
          ) : null}
        </aside>
        <nav className="reference-dock" aria-label="Outils">
          {dock.map(([icon, label, action]) => (
            <button type="button" key={label} onClick={action}>
              <LineIcon kind={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <p className="reference-motto">
          {environment === "music"
            ? "LES IDÉES D’AUJOURD’HUI FAÇONNENT LES MONDES DE DEMAIN"
            : environment === "research"
              ? "DES QUESTIONS D’AUJOURD’HUI NAISSENT LES SOLUTIONS DE DEMAIN"
              : "PLUS LOIN · AUTREMENT"}
        </p>
      </main>
      {tool ? (
        <Sheet
          title={toolNames[tool]}
          close={() => {
            setTool(null);
            setPendingTravel(null);
          }}
        >
          {tool === "dialogue" ? (
            <>
              <LocalDialogue />
              <button type="button" onClick={() => onNavigate("ida")}>
                Ouvrir les commandes et l’historique du Core →
              </button>
            </>
          ) : null}
          {tool === "library" || tool === "mix" || tool === "master" ? (
            <>
              <p>
                {environment === "music"
                  ? "Écoutez vos fichiers privés. Aucun son ne démarre automatiquement."
                  : "Documents du workspace partagé ; aucune copie parallèle."}
              </p>
              {environment === "music" && tracks.length ? (
                <label>
                  Projet actuel
                  <select
                    value={currentTrack?.id ?? ""}
                    onChange={(event) =>
                      setCurrentTrack(tracks.find((track) => track.id === event.target.value) ?? null)
                    }
                  >
                    <option value="">Choisir un morceau</option>
                    {tracks.map((track) => (
                      <option key={track.id} value={track.id}>
                        {track.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                Filtrer les fichiers
                <input
                  value={query}
                  maxLength={300}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nom du fichier…"
                />
              </label>
              <div className="reference-library">
                {library.map((item) => (
                  <button
                    type="button"
                    key={item.id ?? item.filename}
                    onClick={() => (environment === "music" ? setActiveAudio(item) : onNavigate("content"))}
                  >
                    <LineIcon kind={environment === "music" ? "music" : "book"} />
                    <span>
                      {item.filename}
                      <small>{item.sizeLabel ?? item.detail}</small>
                    </span>
                    <span>→</span>
                  </button>
                ))}
              </div>
              {!library.length ? (
                <p>{loading ? "Chargement…" : error || "Aucun fichier correspondant dans les 50 éléments affichés."}</p>
              ) : null}
              {activeAudio && environment === "music" ? (
                <StudioPlayer key={activeAudio.id ?? activeAudio.filename} asset={activeAudio} />
              ) : null}
              {environment === "music" && tool === "library" ? (
                <MusicFolderImport onImported={() => setRefresh((value) => value + 1)} />
              ) : null}
              <button type="button" className="reference-primary" onClick={() => onNavigate("content")}>
                Importer / gérer les fichiers privés →
              </button>
              {environment === "music" ? (
                <button type="button" onClick={() => onNavigate("music")}>
                  Ouvrir les morceaux et releases →
                </button>
              ) : null}
            </>
          ) : null}
          {tool === "research" || tool === "sources" ? (
            <>
              <label>
                Que souhaitez-vous explorer ?
                <input
                  value={query}
                  maxLength={300}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Une question, un concept, un auteur…"
                />
              </label>
              <div className="reference-link-grid">
                <a
                  href={`https://duckduckgo.com/?q=${encodeURIComponent(query || "recherche documentaire")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Recherche web ↗
                </a>
                <a
                  href={`https://scholar.google.com/scholar?q=${encodeURIComponent(query || "recherche")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Publications scientifiques ↗
                </a>
                <button type="button" onClick={() => setTool("library")}>
                  Mes documents →
                </button>
              </div>
              <p className="reference-hint">
                Ces liens ouvrent le moteur choisi avec votre requête. IDA ne prétend pas avoir consulté ou vérifié ses
                résultats.
              </p>
              <label>
                Sources et annotations
                <textarea
                  rows={6}
                  maxLength={5000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Collez ici vos références et vos notes…"
                />
              </label>
              <button type="button" onClick={() => exportText("ida-sources.txt", `${query}\n\n${note}`)}>
                Exporter mes sources
              </button>
            </>
          ) : null}
          {["ideas", "compose", "collaborate", "export"].includes(tool) ? (
            <>
              <label>
                {environment === "music" ? "Titre du projet" : "Sujet"}
                <input
                  maxLength={160}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder={environment === "music" ? "Mon prochain morceau" : "Une idée à explorer"}
                />
              </label>
              <label>
                {tool === "ideas" ? "Une idée par ligne" : "Notes, intentions et prochaines actions"}
                <textarea
                  rows={7}
                  value={note}
                  maxLength={5000}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={
                    tool === "collaborate"
                      ? "Collaborateur, rôle, objectif, éléments à partager…"
                      : "Votre brouillon personnel…"
                  }
                />
              </label>
              {tool === "ideas" && note.trim() ? (
                <div className="reference-idea-map">
                  <strong>{subject || "Mon idée"}</strong>
                  <ul>
                    {note
                      .split("\n")
                      .filter((line) => line.trim())
                      .slice(0, 20)
                      .map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                  </ul>
                </div>
              ) : null}
              <div className="reference-actions">
                <button
                  type="button"
                  disabled={!subject.trim() || saving}
                  onClick={() =>
                    void saveTask(`${environment === "music" ? "Studio" : "Recherche"} · ${subject.trim()}`, note)
                  }
                >
                  {saving ? "Enregistrement…" : "Enregistrer dans mes tâches"}
                </button>
                <button
                  type="button"
                  disabled={!note.trim() && !subject.trim()}
                  onClick={() => exportText(`ida-${environment}-brief.txt`, `${subject}\n\n${note}`)}
                >
                  Télécharger le brief
                </button>
              </div>
              <p className="reference-hint">
                Brouillon temporaire jusqu’à l’enregistrement. Aucune invitation ni publication automatique.
              </p>
            </>
          ) : null}
          {tool === "inspirations" ? (
            <div className="reference-place-list">
              {destinations.map((place) => (
                <button type="button" key={place.name} onClick={() => plan(place.name)}>
                  <strong>{place.name}</strong>
                  <span>{place.detail}</span>
                  <span>Préparer →</span>
                </button>
              ))}
            </div>
          ) : null}
          {tool === "plan" ? (
            pendingTravel ? (
              <div className="notebook-status">
                <h3>Un carnet est déjà en cours</h3>
                <p>
                  Votre brouillon pour {travel.draft.destination || "ce voyage"} n’est pas enregistré. Le remplacer
                  effacera uniquement ce brouillon de l’écran.
                </p>
                {travel.uncertain ? (
                  <p>
                    Un enregistrement précédent reste non confirmé. Vérifiez Mes voyages avant de créer une autre
                    version.
                  </p>
                ) : null}
                <div className="reference-actions">
                  <button type="button" onClick={() => setPendingTravel(null)}>
                    Continuer mon brouillon
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTravel(pendingTravel);
                      setPendingTravel(null);
                    }}
                  >
                    Remplacer et ouvrir {pendingTravel.draft.destination}
                  </button>
                </div>
              </div>
            ) : (
              <TravelNotebook
                session={travel}
                onChange={(draft) =>
                  setTravel((previous) =>
                    previous.source || previous.pending || previous.uncertain
                      ? previous
                      : { ...previous, draft, notice: "" },
                  )
                }
                onSave={() => void saveTravel()}
                onCopy={() =>
                  setTravel((previous) => ({
                    ...previous,
                    source: null,
                    initial: serializeNotebook(newTravelDraft()),
                    uncertain: false,
                    notice:
                      "Copie en préparation. Son enregistrement créera une nouvelle tâche, sans modifier le carnet original.",
                  }))
                }
                onTasks={() => open("trips")}
              />
            )
          ) : null}
          {tool === "trips" ? (
            <>
              <div className="reference-actions">
                <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>
                  {loading ? "Actualisation…" : "Actualiser mes voyages"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingTravel(null);
                    open("plan");
                  }}
                >
                  Reprendre le carnet ouvert
                </button>
              </div>
              {tasks.length ? (
                tasks.map((task) => (
                  <div className="reference-saved-trip" key={task.id}>
                    <strong>{task.title.replace("Voyage · ", "")}</strong>
                    <p>{tripPreview(task)}</p>
                    <button type="button" onClick={() => openTrip(task)}>
                      Ouvrir le carnet →
                    </button>
                    <button type="button" onClick={() => onNavigate("tasks")}>
                      Gérer dans mes tâches →
                    </button>
                  </div>
                ))
              ) : (
                <p>{loading ? "Chargement…" : error || "Aucun projet de voyage enregistré."}</p>
              )}
              <button type="button" onClick={() => open("inspirations")}>
                Préparer un voyage →
              </button>
            </>
          ) : null}
          {tool === "map" ? (
            <>
              <label>
                Destination
                <input maxLength={120} value={destination} onChange={(event) => setDestination(event.target.value)} />
              </label>
              <a
                className="reference-primary"
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(destination)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir la carte interactive OpenStreetMap ↗
              </a>
              <p>La carte s’ouvre dans un nouvel onglet. Aucune géolocalisation n’est activée.</p>
            </>
          ) : null}
          {saved ? (
            <p className="reference-feedback" role="status">
              {saved}
            </p>
          ) : null}
        </Sheet>
      ) : null}
    </section>
  );
}
