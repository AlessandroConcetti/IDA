import { type FormEvent, useEffect, useRef, useState } from "react";
import type { CommandCenterSummary } from "./api";
import type { NavigationId } from "./data";
import { HomeConnections } from "./HomeConnections";
import { HomeMetrics, HomeOverview } from "./HomeOverview";
import { homeWorkspaceDate } from "./home-overview";
import { type HomeStartView, readHomeStart, saveHomeStart } from "./home-start";
import { WorldWheel } from "./WorldWheel";
import type { HomeTheme } from "./worlds";

export type AuroraIconName = "layers" | "brain" | "music" | "content" | "social" | "arrow" | "sun" | "chat" | "lock";

export function AuroraIcon({ name }: { name: AuroraIconName }) {
  const paths: Record<AuroraIconName, string> = {
    layers: "m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5",
    brain:
      "M12 5c-2-4-7-2-6 2-4 0-5 6-2 8-1 4 4 7 8 4V5Zm0 0c2-4 7-2 6 2 4 0 5 6 2 8 1 4-4 7-8 4M8 8v3l-2 2m2 2v3m8-10v3l2 2m-2 2v3",
    music: "M9 18V5l11-2v13M9 9l11-2M9 18c0 4-7 5-7 1s7-5 7-1Zm11-2c0 4-7 5-7 1s7-5 7-1Z",
    content: "M8 5V3h8v2M3 5h18v16H3V5Zm0 4h18M9 13h6v5H9v-5Z",
    social:
      "M9 7a3 3 0 1 0-6 0 3 3 0 0 0 6 0Zm12 0a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM1 21v-4c0-5 10-5 10 0v4m2 0v-4c0-5 10-5 10 0v4",
    arrow: "M4 12h16m-7-7 7 7-7 7",
    sun: "M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
    chat: "M21 11c0 6-5 10-11 9l-6 2 1-6C0 9 4 2 12 2c5 0 9 3 9 9Z",
    lock: "M7 10V7a5 5 0 0 1 10 0v3M4 10h16v12H4V10Zm8 5v3",
  };
  return (
    <svg
      viewBox="0 0 24 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

const moreSpaces: { title: string; target: NavigationId }[] = [
  { title: "Command Center", target: "home" },
  { title: "Conversation IDA", target: "ida" },
  { title: "Music Brain", target: "music" },
  { title: "Content Library", target: "content" },
  { title: "Social Brain", target: "social" },
  { title: "Calendrier", target: "calendar" },
  { title: "Campagnes", target: "campaigns" },
  { title: "Statistiques", target: "analytics" },
  { title: "Tâches", target: "tasks" },
  { title: "Mémoire", target: "memory" },
  { title: "Système & agents", target: "system" },
];

export function AuroraHome({
  onNavigate,
  onCommand,
  onLock,
  isSubmitting,
  summary,
  source,
  theme = "classic",
  onThemeChange,
}: {
  onNavigate: (id: NavigationId) => void;
  onCommand: (command: string) => void;
  onLock?: (() => void) | undefined;
  isSubmitting: boolean;
  summary?: CommandCenterSummary | undefined;
  source: "loading" | "api" | "local";
  theme?: HomeTheme;
  onThemeChange?: (theme: HomeTheme) => void;
}) {
  const [command, setCommand] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [solid, setSolid] = useState(false);
  const more = useRef<HTMLElement>(null);
  const worldArea = useRef<HTMLDivElement>(null);
  const commandInput = useRef<HTMLTextAreaElement>(null);
  const readySummary = source === "api" ? summary : undefined;
  const [startView, setStartView] = useState<HomeStartView>(() => {
    try {
      return readHomeStart(window.localStorage);
    } catch {
      return "worlds";
    }
  });
  const [wheelEntry, setWheelEntry] = useState(() => ({ view: startView, revision: 0 }));
  const [startNotice, setStartNotice] = useState<string | undefined>();

  function showWorlds() {
    setWheelEntry((current) => ({ view: "worlds", revision: current.revision + 1 }));
    worldArea.current?.scrollIntoView({ block: "start", behavior: "auto" });
    worldArea.current?.focus({ preventScroll: true });
  }

  function changeStartView(view: HomeStartView) {
    setStartView(view);
    let saved = false;
    try {
      saved = saveHomeStart(window.localStorage, view);
    } catch {
      /* Stockage navigateur indisponible. */
    }
    setStartNotice(
      saved
        ? "Choix enregistré sur ce navigateur uniquement."
        : "Choix conservé pour cette visite ; le navigateur ne permet pas son enregistrement.",
    );
  }
  useEffect(() => {
    if (expanded) more.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [expanded]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.trim() && !isSubmitting) onCommand(command.trim());
  }
  return (
    <div className="aurora-home ida-home-layout" data-theme={theme} data-surface={solid ? "solid" : "glass"}>
      <a className="home-skip-link" href="#aurora-command">
        Aller à la demande IDA
      </a>
      <header className="aurora-topbar">
        <div className="home-brand">
          <span className="aurora-corner-wordmark">IDA</span>
          <span>
            INTELLIGENT
            <br />
            DIGITAL AGENT
          </span>
        </div>
        <div className="aurora-access-actions">
          <span className="home-workspace-date">{homeWorkspaceDate(readySummary)}</span>
          {onThemeChange ? (
            <fieldset className="home-theme-picker">
              <legend className="sr-only">Thème global d’IDA</legend>
              <button type="button" aria-pressed={theme === "classic"} onClick={() => onThemeChange("classic")}>
                Classic
              </button>
              <button type="button" aria-pressed={theme === "scifi"} onClick={() => onThemeChange("scifi")}>
                Sci-Fi
              </button>
            </fieldset>
          ) : null}
          <span className="aurora-local-status">{onLock ? "Espace local privé" : "Démo locale"}</span>
          {onLock ? (
            <button
              className="aurora-icon-button"
              type="button"
              onClick={onLock}
              aria-label="Verrouiller IDA"
              title="Verrouiller IDA"
            >
              <AuroraIcon name="lock" />
            </button>
          ) : null}
        </div>
      </header>

      <aside className="home-sidebar" aria-label="Raccourcis de l’accueil">
        <nav aria-label="Navigation IDA Home">
          <a href="#aurora-start" aria-current="page">
            <span aria-hidden="true">⌂</span>Accueil
          </a>
          <button type="button" onClick={showWorlds}>
            <span aria-hidden="true">◎</span>La Roue des Mondes
          </button>
          <button
            type="button"
            onClick={() => setWheelEntry((current) => ({ view: "home", revision: current.revision + 1 }))}
          >
            <span aria-hidden="true">⌂</span>IDA Home
          </button>
          <button type="button" onClick={() => onNavigate("tasks")}>
            <span aria-hidden="true">✓</span>Mes tâches
          </button>
          <button type="button" onClick={() => onNavigate("content")}>
            <span aria-hidden="true">◇</span>À valider
          </button>
          <button type="button" onClick={() => onNavigate("calendar")}>
            <span aria-hidden="true">□</span>Calendrier
          </button>
          <button type="button" onClick={() => onNavigate("system")}>
            <span aria-hidden="true">⚙</span>Système & agents
          </button>
        </nav>
        <div className="home-sidebar-note">
          <span aria-hidden="true">✦</span>
          <p>
            De la place pour
            <br />
            chaque idée.
          </p>
          <small>Votre espace, à votre rythme.</small>
        </div>
      </aside>

      <main className="aurora-welcome">
        <div className="home-intro">
          <div className="aurora-signature">
            <h1 id="aurora-start" tabIndex={-1}>
              IDA
            </h1>
            <p>Votre univers. Une présence.</p>
          </div>
          <p className="aurora-greeting">
            Bienvenue. <span>Qu’allons-nous faire aujourd’hui ?</span>
          </p>
          <form className="aurora-command" onSubmit={submit} aria-busy={isSubmitting}>
            <label className="sr-only" htmlFor="aurora-command">
              Votre demande à IDA
            </label>
            <textarea
              ref={commandInput}
              id="aurora-command"
              rows={2}
              enterKeyHint="send"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="Décrivez votre demande ou choisissez un environnement"
              maxLength={2000}
              autoComplete="off"
              disabled={isSubmitting}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (command.trim() && !isSubmitting) onCommand(command.trim());
                }
              }}
            />
            <button type="submit" disabled={isSubmitting || !command.trim()} aria-label="Envoyer ma demande à IDA">
              <AuroraIcon name="arrow" />
            </button>
          </form>
          <fieldset className="home-command-suggestions">
            <legend className="sr-only">Suggestions de demande</legend>
            {[
              { label: "Ma journée", command: "Qu’est-ce que j’ai aujourd’hui ?" },
              { label: "Mes contenus inutilisés", command: "Montre-moi mes contenus inutilisés." },
              { label: "Mes publications à valider", command: "Montre-moi les posts en attente." },
            ].map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setCommand(suggestion.command);
                  commandInput.current?.focus();
                }}
              >
                {suggestion.label} <span aria-hidden="true">↗</span>
              </button>
            ))}
          </fieldset>
        </div>

        <div className="home-section-heading">
          <span>VOTRE UNIVERS, MAINTENANT</span>
          <p role="status">
            {readySummary
              ? "Données de votre espace IDA"
              : source === "loading"
                ? "Connexion à votre univers…"
                : "Données momentanément indisponibles"}
          </p>
        </div>
        <HomeMetrics summary={summary} source={source} onNavigate={onNavigate} />

        <div id="home-worlds" ref={worldArea} tabIndex={-1}>
          <WorldWheel
            key={wheelEntry.revision}
            onNavigate={onNavigate}
            theme={theme}
            initialWorldId={wheelEntry.view === "home" ? "home" : "music"}
            startOpened={wheelEntry.view === "home"}
            renderEnvironment={(worldId) =>
              worldId === "home" ? (
                <div className="ida-home-environment-content">
                  <p className="home-environment-intro">
                    Votre quotidien, dans le même univers IDA. Les espaces ci-dessous utilisent vos données existantes.
                  </p>
                  <label className="home-start-choice">
                    <input
                      type="checkbox"
                      checked={startView === "home"}
                      onChange={(event) => changeStartView(event.target.checked ? "home" : "worlds")}
                    />
                    Ouvrir IDA Home dans l’accueil au démarrage
                  </label>
                  <p className="home-start-notice" role="status">
                    {startNotice ?? "Facultatif · préférence locale à ce navigateur, sans changer votre compte."}
                  </p>
                  <HomeOverview source={source} timezone={readySummary?.timezone} onNavigate={onNavigate} />
                  <HomeConnections />
                  <p className="home-future-note">
                    Courses et budget : à venir. Aucun service bancaire n’est connecté.
                  </p>
                </div>
              ) : null
            }
          />
        </div>

        <button
          className="aurora-explore"
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="aurora-all-spaces"
        >
          <span aria-hidden="true">✦</span>
          {expanded ? "Refermer les autres espaces" : "Explorer tous les espaces"}
        </button>
        {expanded ? (
          <nav className="aurora-more-spaces" id="aurora-all-spaces" aria-label="Tous les espaces IDA" ref={more}>
            {moreSpaces.map((space) => (
              <button key={space.target} type="button" onClick={() => onNavigate(space.target)}>
                {space.title}
                <AuroraIcon name="arrow" />
              </button>
            ))}
          </nav>
        ) : null}
      </main>

      <footer className="aurora-footer">
        <button
          className="aurora-icon-button"
          type="button"
          onClick={() => setSolid(!solid)}
          aria-pressed={solid}
          aria-label="Réduire la transparence"
          title="Réduire la transparence"
        >
          <AuroraIcon name="sun" />
        </button>
        <p>
          <span aria-hidden="true">✦</span>L’intelligence au service de votre vision
        </p>
        <button
          className="aurora-icon-button"
          type="button"
          onClick={() => onNavigate("ida")}
          aria-label="Ouvrir la conversation avec IDA"
          title="Parler avec IDA"
        >
          <AuroraIcon name="chat" />
        </button>
      </footer>
      <nav className="aurora-mobile-navigation" aria-label="Navigation mobile">
        <a href="#aurora-start" aria-current="page">
          <span aria-hidden="true">⌂</span>Accueil
        </a>
        <button type="button" onClick={() => onNavigate("ida")}>
          <span aria-hidden="true">✦</span>IDA
        </button>
        <button type="button" onClick={() => onNavigate("content")}>
          <span aria-hidden="true">◇</span>Contenus
        </button>
        <button type="button" onClick={() => onNavigate("calendar")}>
          <span aria-hidden="true">□</span>Calendrier
        </button>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="aurora-all-spaces"
        >
          <span aria-hidden="true">···</span>Plus
        </button>
      </nav>
    </div>
  );
}
