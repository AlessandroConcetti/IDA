import { type FormEvent, useEffect, useRef, useState } from "react";
import type { CommandCenterSummary } from "./api";
import type { NavigationId } from "./data";

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

const featuredSpaces: { title: string; detail: string; target: NavigationId; icon: AuroraIconName; tone: string }[] = [
  {
    title: "Command Center",
    detail: "Votre journée, vos priorités et l’ensemble de votre univers.",
    target: "home",
    icon: "layers",
    tone: "blue",
  },
  {
    title: "Artist Brain",
    detail: "Votre identité artistique, vos inspirations et votre direction.",
    target: "memory",
    icon: "brain",
    tone: "sand",
  },
  {
    title: "Music Brain",
    detail: "Vos morceaux, vos releases et tout ce qui fait votre son.",
    target: "music",
    icon: "music",
    tone: "blue",
  },
  {
    title: "Content Library",
    detail: "Vos images, sons et vidéos, dans une bibliothèque partagée.",
    target: "content",
    icon: "content",
    tone: "pearl",
  },
  {
    title: "Social Brain",
    detail: "Vos plateformes et leurs possibilités, en toute clarté.",
    target: "social",
    icon: "social",
    tone: "blue",
  },
];

const moreSpaces: { title: string; target: NavigationId }[] = [
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
}: {
  onNavigate: (id: NavigationId) => void;
  onCommand: (command: string) => void;
  onLock?: (() => void) | undefined;
  isSubmitting: boolean;
  summary?: CommandCenterSummary | undefined;
  source: "loading" | "api" | "local";
}) {
  const [command, setCommand] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [solid, setSolid] = useState(false);
  const [railStart, setRailStart] = useState(true);
  const [railEnd, setRailEnd] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLElement>(null);
  useEffect(() => {
    if (expanded) more.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [expanded]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.trim() && !isSubmitting) onCommand(command.trim());
  }
  function scrollCards(direction: number) {
    if (rail.current) rail.current.scrollBy({ left: direction * rail.current.clientWidth * 0.7, behavior: "auto" });
  }
  return (
    <div className="aurora-home" data-surface={solid ? "solid" : "glass"}>
      <header className="aurora-topbar">
        <span className="aurora-corner-wordmark">IDA</span>
        <div className="aurora-access-actions">
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

      <main className="aurora-welcome">
        <div className="aurora-signature">
          <h1 id="aurora-start" tabIndex={-1}>
            IDA
          </h1>
          <p>Intelligent Digital Assistant</p>
        </div>
        <p className="aurora-greeting">
          Bienvenue. <span>Comment puis-je vous assister aujourd’hui ?</span>
        </p>
        <form className="aurora-command" onSubmit={submit} aria-busy={isSubmitting}>
          <label className="sr-only" htmlFor="aurora-command">
            Votre demande à IDA
          </label>
          <textarea
            id="aurora-command"
            rows={2}
            enterKeyHint="send"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Décrivez votre demande ou choisissez un espace"
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

        <section className="aurora-spaces" aria-labelledby="aurora-spaces-title">
          <h2 id="aurora-spaces-title">Votre univers IDA</h2>
          <div
            className="aurora-agent-rail"
            ref={rail}
            onScroll={(event) => {
              const current = event.currentTarget;
              setRailStart(current.scrollLeft <= 2);
              setRailEnd(current.scrollLeft + current.clientWidth >= current.scrollWidth - 2);
            }}
          >
            {featuredSpaces.map((space) => (
              <button
                className="aurora-agent-card"
                key={space.title}
                type="button"
                onClick={() => onNavigate(space.target)}
              >
                <span className={`aurora-agent-icon ${space.tone}`}>
                  <AuroraIcon name={space.icon} />
                </span>
                <span className="aurora-agent-name">{space.title}</span>
                <span className="aurora-agent-description">{space.detail}</span>
                <span className="aurora-agent-open" aria-hidden="true">
                  Explorer <AuroraIcon name="arrow" />
                </span>
              </button>
            ))}
          </div>
          <div className="aurora-carousel-controls">
            <button
              className="aurora-icon-button"
              type="button"
              onClick={() => scrollCards(-1)}
              aria-label="Espaces précédents"
              disabled={railStart}
            >
              <span className="aurora-arrow-back">
                <AuroraIcon name="arrow" />
              </span>
            </button>
            <span>Vos cinq espaces principaux</span>
            <button
              className="aurora-icon-button"
              type="button"
              onClick={() => scrollCards(1)}
              aria-label="Espaces suivants"
              disabled={railEnd}
            >
              <AuroraIcon name="arrow" />
            </button>
          </div>
        </section>

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

        <p className="aurora-day-context" role="status">
          {source === "api" && summary ? (
            <>
              <span className="aurora-presence-dot" aria-hidden="true" />
              {summary.pendingApprovals} proposition{summary.pendingApprovals !== 1 ? "s" : ""} à valider
              <span aria-hidden="true">·</span>
              {summary.upcomingReleases} release{summary.upcomingReleases !== 1 ? "s" : ""} à venir
            </>
          ) : source === "loading" ? (
            "Connexion à votre univers…"
          ) : (
            "Les données sont momentanément indisponibles."
          )}
        </p>
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
