import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { requestAssistantHome } from "./assistant-navigation";
import type { NavigationId } from "./data";
import { HubAnimatedIcon, isHubAnimatedIconKind } from "./HubAnimatedIcon";
import { HubAtmosphere } from "./HubAtmosphere";
import { HubMessageJournal } from "./HubMessageJournal";
import { HubOrbFilaments } from "./HubOrbFilaments";
import { HubWidgetAtmosphere } from "./HubWidgetAtmosphere";
import { redactedHubData } from "./hub-data";
import { hubClock, hubTemperature, hubTime } from "./hub-presentation";
import { fabriqueMotionProfile } from "./motion";
import { LineIcon, Sheet } from "./ReferenceChrome";
import { ThemePicker } from "./ThemePicker";
import { useEnvironmentMotion } from "./useEnvironmentMotion";
import { useHubData } from "./useHubData";
import { weatherIcon } from "./weather-display";
import type { HomeTheme } from "./worlds";
import "./hub-environment.css";

function HubIcon({ kind }: { kind: string }) {
  if (isHubAnimatedIconKind(kind)) return <HubAnimatedIcon kind={kind} />;
  const paths: Record<string, string> = {
    moon: "M20 16A9 9 0 0 1 8 4a9 9 0 1 0 12 12Z",
    research: "M9 2h6M10 2v7L3 21h18L14 9V2M7 15h10",
    run: "M17 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5 11l4-4 5 2 3 5 4-1M11 9l-2 6 5 2-1 5M9 15l-4 5H2",
    arrow: "m9 5 7 7-7 7",
    play: "m8 4 12 8-12 8V4Z",
    expand: "M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6",
    pause: "M7 4v16M17 4v16",
  };
  return paths[kind] ? (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  ) : (
    <LineIcon kind={kind} />
  );
}

function HubOrb({ className = "", detailed = false }: { className?: string; detailed?: boolean }) {
  return (
    <span className={`ida-quickbar__orb ${className}`} aria-hidden="true">
      <i />
      <i />
      <i />
      {detailed ? <HubOrbFilaments /> : null}
    </span>
  );
}

function Widget({
  id,
  title,
  icon,
  caption,
  action,
  actionLabel = "Voir tout",
  badge,
  children,
  className = "",
  weatherCode,
}: {
  id: string;
  title: string;
  icon: string;
  caption?: string | undefined;
  action: () => void;
  actionLabel?: string;
  badge?: number | undefined;
  children: ReactNode;
  className?: string;
  weatherCode?: number | null | undefined;
}) {
  return (
    <section className={`hub-widget hub-${id} ${className}`} aria-labelledby={`hub-${id}-title`}>
      <HubWidgetAtmosphere kind={id} weatherCode={weatherCode} />
      <header className="hub-widget__head">
        <span className="hub-icon-disc">
          <HubIcon kind={icon} />
        </span>
        <div>
          <h2 id={`hub-${id}-title`}>
            {title}
            {badge !== undefined && badge > 0 ? <span className="hub-badge">{badge}</span> : null}
          </h2>
          {caption ? <p>{caption}</p> : null}
        </div>
        <button type="button" className="hub-more" onClick={action} aria-label={`${actionLabel} · ${title}`}>
          <span>{actionLabel}</span>
          <HubIcon kind="arrow" />
        </button>
      </header>
      {children}
    </section>
  );
}

function Empty({ title, detail }: { title: string; detail?: string | undefined }) {
  return (
    <div className="hub-empty">
      <span className="hub-empty__line" aria-hidden="true" />
      <p>{title}</p>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function HubEnvironment({
  theme,
  titleRef,
  onBack,
  onSelect,
  onNavigate,
  onThemeChange,
}: {
  theme: HomeTheme;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onSelect: (id: string) => void;
  onNavigate: (id: NavigationId) => void;
  onThemeChange?: ((theme: HomeTheme) => void) | undefined;
}) {
  const root = useRef<HTMLElement>(null);
  const [now, setNow] = useState(() => new Date());
  const [menu, setMenu] = useState(false);
  const [paused, setPaused] = useState(false);
  const [privateView, setPrivateView] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const motion = useEnvironmentMotion(root, fabriqueMotionProfile, menu || paused);
  const { data: liveData, refreshing, refresh, readConnectedSources } = useHubData();
  const data = privateView ? redactedHubData() : liveData;
  const clock = hubClock(now);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setNow(new Date());
    }, 15_000);
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("fullscreenchange", sync);
    };
  }, []);
  const focusAssistant = () => document.getElementById("ida-global-message")?.focus();
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setNotice("");
    } catch {
      setNotice("Le plein écran n’est pas disponible dans ce navigateur. Le Hub reste utilisable dans cette fenêtre.");
    }
  };
  return (
    <section
      ref={root}
      className="hub-environment"
      data-theme={theme}
      data-private={privateView}
      data-paused={paused || menu}
      {...motion.attributes}
      style={motion.style}
      aria-label="Le Hub · votre journal IDA"
    >
      <HubAtmosphere theme={theme} paused={paused || menu} />
      <div className="hub-board">
        <header className="hub-masthead">
          <button
            className="hub-brand"
            type="button"
            onClick={requestAssistantHome}
            aria-label="Le Hub · retour à l’accueil IDA"
          >
            <span className="hub-wordmark">I D Λ</span>
            <span className="hub-brand__name">LE HUB</span>
            <small>
              UN SEUL SYSTÈME.
              <br />
              TOUS TES MONDES.
            </small>
          </button>
          <div className="hub-journal">
            <h1 ref={titleRef} tabIndex={-1}>
              JOURNAL
            </h1>
            <p>VOTRE JOURNÉE, EN PERSPECTIVE</p>
          </div>
          <div className="hub-header-info">
            <div
              className="hub-clock"
              style={{ "--clock-density": Math.min(1, 9 / clock.roman.length) } as CSSProperties}
            >
              <span>{clock.date}</span>
              <strong aria-hidden="true">{clock.roman}</strong>
              <time dateTime={now.toISOString()}>{clock.time}</time>
            </div>
            <button
              className="hub-header-weather"
              type="button"
              onClick={() => onSelect("home")}
              aria-label="Ouvrir la météo dans IDA Home"
            >
              <LineIcon kind={weatherIcon(data.weather.data?.code)} />
              <span>
                <small>{data.weather.data?.location ?? "Météo"}</small>
                <strong>{hubTemperature(data.weather.data?.temperatureC)}</strong>
              </span>
            </button>
            <HubOrb className="hub-mini-orb" />
          </div>
        </header>

        <div className="hub-hero">
          <Widget
            id="agenda"
            title="Aujourd’hui"
            icon="calendar"
            caption="Votre journée, en un regard"
            action={() => onNavigate("calendar")}
          >
            <div className="hub-timeline">
              {data.agenda.data?.length ? (
                data.agenda.data.slice(0, 4).map((event, index) => (
                  <button
                    className="hub-timeline__row hub-personal"
                    type="button"
                    key={event.id}
                    onClick={() => onNavigate("calendar")}
                    style={
                      { "--event-color": ["#54b5ff", "#55edab", "#3b91ff", "#ffd075"][index % 4] } as CSSProperties
                    }
                  >
                    <span className="hub-timeline__pin" />
                    <span className="hub-timeline__time">{hubTime(event.start, event.timezone)}</span>
                    <span className="hub-timeline__text">
                      <strong>{event.title}</strong>
                      <small>{event.detail}</small>
                    </span>
                  </button>
                ))
              ) : (
                <div className="hub-agenda-empty">
                  <div className="hub-timeline__ghost" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <Empty
                    title={data.agenda.state === "loading" ? "Votre agenda se prépare…" : "Votre agenda vous attend"}
                    detail={data.agenda.notice ?? "Ouvrez le calendrier pour retrouver votre planning."}
                  />
                  <button className="hub-inline" type="button" onClick={() => onNavigate("calendar")}>
                    Ouvrir mon calendrier <HubIcon kind="arrow" />
                  </button>
                </div>
              )}
            </div>
          </Widget>

          <button
            className="hub-presence"
            type="button"
            onClick={focusAssistant}
            aria-label="Parler à IDA · écrire dans la barre commune"
          >
            <span className="hub-orbit hub-orbit--one" />
            <span className="hub-orbit hub-orbit--two" />
            <span className="hub-orbit hub-orbit--three" />
            <HubOrb className="hub-main-orb" detailed />
            <span className="hub-presence__label">
              <strong>I D Λ</strong>
              <span>
                ÉCOUTE
                <br />
                COMPREND
                <br />
                AGIT
              </span>
              <HubIcon kind="music" />
            </span>
            <span className="hub-presence__reflection" aria-hidden="true" />
          </button>

          <div className="hub-hero-right">
            <Widget
              id="house"
              title="Maison"
              icon="home"
              caption={data.home.state === "ready" ? "Votre appareil connecté" : "Votre espace connecté"}
              action={() => onSelect("home")}
              actionLabel="Ouvrir"
            >
              <div className="hub-house-metrics">
                <button type="button" onClick={() => onSelect("home")}>
                  <HubIcon kind="ideas" />
                  <strong>{data.home.data?.label ?? "—"}</strong>
                  <span>Lumières</span>
                  <small>{data.home.notice ?? "État à consulter"}</small>
                </button>
                <button type="button" onClick={() => onSelect("home")}>
                  <HubIcon kind="thermometer" />
                  <strong>
                    —<small> °C</small>
                  </strong>
                  <span>Température</span>
                  <small>Capteur non relié</small>
                </button>
                <button type="button" onClick={() => onSelect("home")}>
                  <HubIcon kind="lock" />
                  <strong>—</strong>
                  <span>Sécurité</span>
                  <small>État non disponible</small>
                </button>
              </div>
            </Widget>
            <Widget
              id="weather"
              title="Météo / déplacements"
              icon="cloud"
              weatherCode={data.weather.data?.code}
              action={() => onSelect("travel")}
              actionLabel="Voir détails"
            >
              <div className="hub-weather-content">
                <button className="hub-weather-reading" type="button" onClick={() => onSelect("home")}>
                  <strong>{hubTemperature(data.weather.data?.temperatureC)}</strong>
                  <span>
                    {data.weather.data?.description ??
                      (data.weather.state === "loading" ? "Météo en cours…" : "Météo indisponible")}
                  </span>
                  <small>{data.weather.data?.location ?? "IDA Home"}</small>
                  {!data.weather.data && data.weather.notice ? <small>{data.weather.notice}</small> : null}
                </button>
                <div className="hub-travel-list">
                  <button type="button" onClick={() => onSelect("idacar")}>
                    <HubIcon kind="car" />
                    <span>
                      Mes trajets<small>Ouvrir IDACAR</small>
                    </span>
                    <HubIcon kind="arrow" />
                  </button>
                  <button type="button" onClick={() => onSelect("travel")}>
                    <HubIcon kind="plane" />
                    <span>
                      Mes voyages<small>Préparer mon départ</small>
                    </span>
                    <HubIcon kind="arrow" />
                  </button>
                </div>
              </div>
            </Widget>
          </div>
        </div>

        <div className="hub-domains">
          <Widget
            id="messages"
            title="Messages"
            icon="mail"
            action={() => onNavigate("mail")}
            badge={data.messages.data?.length}
            caption={data.messages.data?.length ? data.messages.notice : "Messages et emails importants"}
          >
            {data.messages.data?.length ? (
              <HubMessageJournal messages={data.messages.data} onOpen={() => onNavigate("mail")} />
            ) : (
              <Empty
                title="Votre courrier, au même endroit"
                detail={data.messages.notice ?? "Ouvrir Mail pour lire vos messages."}
              />
            )}
          </Widget>
          <Widget
            id="finance"
            title="Finance"
            icon="finance"
            action={() => onSelect("finance")}
            actionLabel="Voir détails"
          >
            <div className="hub-finance-content">
              <div>
                <span>Budget du mois</span>
                <strong>
                  —<small> %</small>
                </strong>
                <div className="hub-budget-track" aria-hidden="true" />
                <small>Budget à renseigner</small>
              </div>
              <div className="hub-expenses">
                <span>Dépenses récentes</span>
                {["Restaurant", "Transport", "Logiciels", "Maison"].map((label, index) => (
                  <div key={label}>
                    <HubIcon kind={["case", "car", "grid", "home"][index] ?? "case"} />
                    <small>{label}</small>
                    <span>—</span>
                  </div>
                ))}
              </div>
            </div>
          </Widget>
          <Widget id="care" title="Care" icon="heart" action={() => onSelect("health")}>
            <div className="hub-care-content">
              <button
                className="hub-care-ring"
                type="button"
                onClick={() => onSelect("health")}
                aria-label="Ouvrir mon suivi CARE · aucun score calculé"
              >
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="44" />
                  <circle className="hub-care-ring__light" cx="50" cy="50" r="44" />
                </svg>
                <span>
                  <strong>—</strong>
                  <small>Votre suivi</small>
                  <em>À compléter</em>
                </span>
              </button>
              <div className="hub-care-list">
                {[
                  ["run", "Sport", "Votre activité"],
                  ["moon", "Sommeil", "Votre rythme"],
                  ["plus", "Rappel médical", "Votre dossier CARE"],
                ].map(([icon, label, detail]) => (
                  <button key={label} type="button" onClick={() => onSelect("health")}>
                    <HubIcon kind={icon ?? "heart"} />
                    <span>
                      {label}
                      <small>{detail}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Widget>
          <Widget id="music" title="Music / création" icon="note" action={() => onSelect("music")}>
            <button
              className="hub-music-track"
              type="button"
              onClick={() => onSelect("music")}
              aria-label="Ouvrir mon projet dans Music Studio"
            >
              <span className="hub-music-art" aria-hidden="true">
                <HubIcon kind="note" />
              </span>
              <span className="hub-music-info">
                <small>Mon studio</small>
                <strong>{data.music.data?.title ?? "Place à la création"}</strong>
                <small>{data.music.data?.detail ?? "Retrouvez vos projets musicaux"}</small>
                <span className="hub-equalizer" aria-hidden="true">
                  {Array.from({ length: 30 }, (_, i) => (
                    <i
                      // biome-ignore lint/suspicious/noArrayIndexKey: Fixed decorative bars, no state or reordering.
                      key={`bar-${i}`}
                      style={
                        {
                          "--bar-height": `${15 + ((i * 17 + 9) % 80)}%`,
                          "--bar-delay": `${-i * 0.12}s`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </span>
              </span>
              <span className="hub-play">
                <HubIcon kind="arrow" />
              </span>
            </button>
          </Widget>
        </div>

        <div className="hub-bottom-row">
          <Widget
            id="agents"
            title="Agents"
            icon="automation"
            caption="Validations requises"
            badge={data.approvals.data?.length}
            action={() => onNavigate("system")}
          >
            {data.approvals.data?.length ? (
              <div className="hub-approval-list hub-personal">
                {data.approvals.data.slice(0, 2).map((approval) => (
                  <div key={approval.id}>
                    <HubIcon kind="document" />
                    <span>
                      <strong>{approval.title}</strong>
                      <small>{approval.detail}</small>
                    </span>
                    <button type="button" onClick={() => onNavigate("content")}>
                      Examiner <HubIcon kind="arrow" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="hub-agent-ready">
                <HubIcon kind="automation" />
                <span>
                  {data.approvals.state === "loading"
                    ? "Lecture des validations…"
                    : data.approvals.state === "ready" || data.approvals.state === "empty"
                      ? "Aucune validation en attente"
                      : "Validations à consulter"}
                  <small>Vous gardez le dernier mot.</small>
                </span>
                <button type="button" onClick={() => onNavigate("system")}>
                  Ouvrir
                </button>
              </div>
            )}
          </Widget>
          <Widget
            id="activity"
            title="Depuis ta dernière visite"
            icon="clock"
            caption="Dernières actions enregistrées"
            action={() => onNavigate("system")}
          >
            <div className="hub-activity-list">
              {data.activity.data?.length ? (
                data.activity.data.slice(0, 4).map((item) => (
                  <button
                    className="hub-activity-item hub-personal"
                    type="button"
                    key={item.id}
                    onClick={() => onNavigate("system")}
                  >
                    <span className="hub-small-icon">
                      <HubIcon kind="document" />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small className="hub-activity-excerpt">
                        <span>{item.detail}</span>
                      </small>
                    </span>
                    <HubIcon kind="arrow" />
                  </button>
                ))
              ) : (
                <>
                  <button className="hub-activity-item" type="button" onClick={() => onNavigate("mail")}>
                    <HubIcon kind="mail" />
                    <span>
                      Votre courrier<small>Retrouver mes messages</small>
                    </span>
                  </button>
                  <button className="hub-activity-item" type="button" onClick={() => onSelect("finance")}>
                    <HubIcon kind="finance" />
                    <span>
                      Votre budget<small>Ouvrir Finance</small>
                    </span>
                  </button>
                  <button className="hub-activity-item" type="button" onClick={() => onSelect("home")}>
                    <HubIcon kind="home" />
                    <span>
                      Votre maison<small>Consulter les appareils</small>
                    </span>
                  </button>
                  <button className="hub-activity-item" type="button" onClick={() => onNavigate("system")}>
                    <HubIcon kind="automation" />
                    <span>
                      Votre activité<small>{data.activity.notice ?? "Aucun événement disponible"}</small>
                    </span>
                  </button>
                </>
              )}
            </div>
          </Widget>
        </div>

        <nav className="hub-dock" aria-label="Navigation du Hub">
          <div>
            {[
              ["home", "Maison", () => onSelect("home")],
              ["calendar", "Agenda", () => onNavigate("calendar")],
              ["globe", "Explorer", onBack],
              ["research", "Recherche", () => onSelect("research")],
            ].map(([icon, label, action]) => (
              <button type="button" key={String(label)} onClick={action as () => void}>
                <span>
                  <HubIcon kind={String(icon)} />
                </span>
                <small>{String(label)}</small>
              </button>
            ))}
          </div>
          <div className="hub-dock__gap" aria-hidden="true" />
          <div>
            {[
              ["note", "Music", () => onSelect("music")],
              ["heart", "Care", () => onSelect("health")],
              ["finance", "Finance", () => onSelect("finance")],
              ["automation", "Agents", () => onNavigate("system")],
              ["grid", "Plus", () => setMenu(true)],
            ].map(([icon, label, action]) => (
              <button type="button" key={String(label)} onClick={action as () => void}>
                <span>
                  <HubIcon kind={String(icon)} />
                </span>
                <small>{String(label)}</small>
              </button>
            ))}
          </div>
        </nav>
      </div>
      {menu ? (
        <Sheet title="Votre Hub" close={() => setMenu(false)} context="LE HUB · AFFICHAGE ET CONNEXIONS">
          <div className="hub-menu">
            <p>Un regard sur tous vos mondes. Les lectures et validations restent contrôlées par IDA.</p>
            {onThemeChange ? <ThemePicker value={theme} onChange={onThemeChange} /> : null}
            <button type="button" onClick={() => setPaused(!paused)}>
              <HubIcon kind={paused ? "play" : "pause"} />
              {paused ? "Reprendre les animations" : "Mettre les animations en pause"}
            </button>
            <button type="button" onClick={() => void toggleFullscreen()}>
              <HubIcon kind="expand" />
              {fullscreen ? "Quitter le plein écran" : "Affichage TV / plein écran"}
            </button>
            <label>
              <input type="checkbox" checked={privateView} onChange={(event) => setPrivateView(event.target.checked)} />
              Masquer les données de ce tableau
            </label>
            <small>
              Les autres écrans et la barre de discussion restent visibles. Ce réglage masque uniquement le résumé du
              Hub.
            </small>
            <button type="button" disabled={refreshing} onClick={() => void refresh()}>
              Actualiser le résumé local
            </button>
            <button type="button" disabled={refreshing} onClick={() => void readConnectedSources()}>
              Lire mes connexions autorisées
            </button>
            <small>
              Lecture seule des sources déjà configurées. Aucun email envoyé, aucune commande domotique et aucun accès
              caméra ou micro automatique.
            </small>
            <button type="button" onClick={onBack}>
              La Roue des Mondes
            </button>
            <button type="button" onClick={requestAssistantHome}>
              Retour à l’accueil IDA
            </button>
            {notice ? <p role="status">{notice}</p> : null}
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}
