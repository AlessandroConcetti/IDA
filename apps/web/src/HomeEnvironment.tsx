import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { NavigationId } from "./data";
import { HomeConnections } from "./HomeConnections";
import {
  type HomeSpace,
  type HomeSpaceAction,
  homeActionLabels,
  homeAmbiences,
  homeSpaces,
  searchHomeSpaces,
} from "./home-spaces";
import { LocalDialogue } from "./LocalDialogue";
import { LineIcon, Sheet } from "./ReferenceChrome";
import { ThemePicker } from "./ThemePicker";
import type { HomeTheme } from "./worlds";
import "./reference-environments.css";
import "./home-environment.css";

type Panel =
  | "dialogue"
  | "devices"
  | "today"
  | "ambiences"
  | "settings"
  | "energy"
  | "security"
  | "climate"
  | "cameras"
  | "automations"
  | "room"
  | null;
const panelTitles: Record<Exclude<Panel, null>, string> = {
  dialogue: "Parler avec IDA",
  devices: "Connecter ma maison",
  today: "Votre journée",
  ambiences: "Ambiances de l’interface",
  settings: "Personnaliser IDA Home",
  energy: "Énergie",
  security: "Sécurité de la maison",
  climate: "Climatisation",
  cameras: "Caméras",
  automations: "Préparer une automatisation",
  room: "Votre espace",
};
const scene = "/design/user-20260909/home-hologram-v1.png";

// Une identité de composant stable conserve les boutons/focus aux ticks de l'horloge.
function RoomCards({ rooms, onOpen }: { rooms: HomeSpace[]; onOpen: (room: HomeSpace) => void }) {
  return (
    <div className="house-room-grid">
      {rooms.map((item) => (
        <button key={item.id} type="button" className="house-room" onClick={() => onOpen(item)}>
          <span
            className="house-room-photo"
            style={{ backgroundImage: `url(${scene})`, backgroundPosition: item.crop }}
            aria-hidden="true"
          />
          <span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </span>
          <span className="house-room-arrow" aria-hidden="true">
            ↗
          </span>
        </button>
      ))}
    </div>
  );
}

export function HomeEnvironment({
  titleRef,
  theme,
  onThemeChange,
  onBack,
  onFridge,
  onWeather,
  onSelect,
  onNavigate,
  homeOverview,
}: {
  titleRef: RefObject<HTMLHeadingElement | null>;
  theme: HomeTheme;
  onThemeChange?: ((theme: HomeTheme) => void) | undefined;
  onBack: () => void;
  onFridge: () => void;
  onWeather: () => void;
  onSelect: (id: string) => void;
  onNavigate: (id: NavigationId) => void;
  homeOverview?: ReactNode;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [room, setRoom] = useState<HomeSpace>(homeSpaces[0]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"illustration" | "rooms">("illustration");
  const [ambience, setAmbience] = useState<(typeof homeAmbiences)[number]["id"]>("home");
  const [motion, setMotion] = useState(true);
  const [visible, setVisible] = useState(false);
  const [time, setTime] = useState(() => new Date());
  const [feedback, setFeedback] = useState("");
  const mainRef = useRef<HTMLDivElement>(null);
  const roomsRef = useRef<HTMLDivElement>(null);
  const filtered = searchHomeSpaces(query);
  useEffect(() => {
    const update = () => {
      setVisible(!document.hidden);
      if (!document.hidden) setTime(new Date());
    };
    update();
    document.addEventListener("visibilitychange", update);
    const timer = setInterval(() => {
      if (!document.hidden) setTime(new Date());
    }, 60_000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const animated = motion && visible && !panel && ambience !== "night";
  function openRoom(value: HomeSpace) {
    setRoom(value);
    setPanel("room");
  }
  function revealRooms() {
    setView("rooms");
    roomsRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
    roomsRef.current?.focus({ preventScroll: true });
  }
  function action(value: HomeSpaceAction) {
    if (value === "fridge") onFridge();
    else if (value === "weather") onWeather();
    else if (value === "music" || value === "travel") onSelect(value);
    else if (value === "care") onSelect("health");
    else if (value === "tasks") onNavigate("tasks");
    else setPanel(value);
  }
  function preview(id: typeof ambience) {
    setAmbience(id);
    setFeedback("Ambiance de l’écran modifiée. Aucun appareil de la maison n’a été commandé.");
  }
  return (
    <section
      className="environment-screen house-environment"
      data-home-theme={theme}
      data-ambience={ambience}
      data-animated={animated}
      aria-label="Environnement IDA Home"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !panel && !event.defaultPrevented) {
          event.preventDefault();
          if (query) setQuery("");
          else onBack();
        }
      }}
    >
      <aside className="house-rail">
        <button type="button" className="house-wordmark" onClick={onBack} aria-label="Retour à la roue des mondes">
          I D A<span>H O M E</span>
        </button>
        <p>
          LIVING
          <br />
          INTELLIGENCE
          <br />
          TOGETHER
        </p>
        <nav aria-label="Navigation IDA Home">
          <button
            type="button"
            aria-current="page"
            onClick={() => {
              setView("illustration");
              mainRef.current?.scrollIntoView({ block: "start" });
              titleRef.current?.focus({ preventScroll: true });
            }}
          >
            <LineIcon kind="home" />
            Accueil
          </button>
          <button type="button" onClick={revealRooms}>
            <LineIcon kind="grid" />
            Pièces
          </button>
          <button type="button" onClick={() => setPanel("ambiences")}>
            <LineIcon kind="ideas" />
            Ambiances
          </button>
          <button type="button" onClick={onFridge}>
            <LineIcon kind="fridge" />
            Mon frigo
          </button>
          <button type="button" onClick={onWeather}>
            <LineIcon kind="sun" />
            Météo
          </button>
          <button type="button" onClick={() => setPanel("automations")}>
            <LineIcon kind="automation" />
            Automatisations
          </button>
          <button type="button" onClick={() => setPanel("energy")}>
            <LineIcon kind="leaf" />
            Énergie
          </button>
          <button type="button" onClick={() => setPanel("security")}>
            <LineIcon kind="alert" />
            Sécurité
          </button>
          <button type="button" onClick={() => setPanel("devices")}>
            <LineIcon kind="sliders" />
            Appareils
          </button>
          <button type="button" onClick={() => onSelect("music")}>
            <LineIcon kind="music" />
            Médias
          </button>
          <button type="button" onClick={() => setPanel("cameras")}>
            <LineIcon kind="unknown" />
            Caméras
          </button>
          <button type="button" onClick={() => setPanel("settings")}>
            <LineIcon kind="tool" />
            Paramètres
          </button>
        </nav>
        <button type="button" className="house-profile" onClick={() => setPanel("today")}>
          <span>A</span>
          <span>
            Votre espace<small>Le même IDA</small>
          </span>
        </button>
        <p className="house-rail-signature">
          UNE MAISON
          <br />
          PLUS HUMAINE.
        </p>
      </aside>
      <div ref={mainRef} className="house-main">
        <header className="house-toolbar">
          <button className="house-mobile-back" type="button" onClick={onBack} aria-label="Retour aux mondes">
            ←
          </button>
          <label className="house-search">
            <LineIcon kind="search" />
            <span className="sr-only">Rechercher un espace Home</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une pièce, une fonction…"
              maxLength={80}
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche">
                ×
              </button>
            ) : null}
          </label>
          <button type="button" className="house-weather-link" onClick={onWeather}>
            <LineIcon kind="sun" />
            <span>
              Météo<small>Consulter les prévisions</small>
            </span>
          </button>
          <time dateTime={time.toISOString()}>
            {time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            <small>{time.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}</small>
          </time>
          <button
            type="button"
            className="house-toolbar-settings"
            onClick={() => setPanel("settings")}
            aria-label="Paramètres IDA Home"
          >
            <LineIcon kind="sliders" />
          </button>
        </header>
        <div className="house-layout">
          <div className="house-primary">
            <div className="house-hero" data-view={view}>
              <img
                src={scene}
                alt="Maison méditerranéenne illustrée, dessinée par des lignes holographiques bleues au crépuscule"
                fetchPriority="high"
              />
              <div className="house-hero-shade" />
              <header className="house-greeting">
                <span className="house-mobile-wordmark">I D A · HOME</span>
                <h1 ref={titleRef} tabIndex={-1}>
                  Bonjour.
                  <br />
                  Bienvenue chez vous.
                </h1>
                <p>Votre quotidien, en un seul endroit.</p>
                <blockquote>
                  « Un espace qui s’adapte
                  <br />à votre vie. »
                </blockquote>
              </header>
              {view === "illustration" ? (
                <nav className="house-hotspots" aria-label="Explorer les pièces illustrées">
                  {homeSpaces.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      style={{ "--spot-x": `${item.x}%`, "--spot-y": `${item.y}%` } as CSSProperties}
                      onClick={() => openRoom(item)}
                    >
                      <span>
                        <LineIcon kind={item.icon} />
                      </span>
                      {item.title}
                    </button>
                  ))}
                </nav>
              ) : null}
              <span className="house-illustration-label">Vue 3D illustrée · pas le plan de votre domicile</span>
            </div>
            <nav className="house-modes" aria-label="Ambiance de cet écran uniquement">
              {homeAmbiences.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={ambience === item.id}
                  onClick={() => preview(item.id)}
                >
                  <LineIcon
                    kind={
                      item.id === "night"
                        ? "unknown"
                        : item.id === "reading"
                          ? "book"
                          : item.id === "cinema"
                            ? "music"
                            : "home"
                    }
                  />
                  {item.label}
                </button>
              ))}
            </nav>
            <section
              className="house-panel house-spaces"
              data-view={view}
              ref={roomsRef}
              tabIndex={-1}
              aria-label="Espaces de la maison"
            >
              <nav className="house-view-tabs" aria-label="Afficher les espaces">
                <button
                  type="button"
                  aria-pressed={view === "illustration"}
                  onClick={() => {
                    setView("illustration");
                    mainRef.current?.scrollIntoView({ block: "start" });
                  }}
                >
                  Vue illustrée
                </button>
                <button type="button" aria-pressed={view === "rooms"} onClick={revealRooms}>
                  Pièces
                </button>
                <button type="button" onClick={() => setPanel("devices")}>
                  Appareils
                </button>
                <button type="button" onClick={() => setPanel("ambiences")}>
                  Ambiances
                </button>
              </nav>
              {query ? (
                <p role="status">
                  {filtered.length} espace{filtered.length > 1 ? "s" : ""} pour « {query} »
                </p>
              ) : null}
              <RoomCards rooms={filtered} onOpen={openRoom} />
              {!filtered.length ? (
                <div className="house-empty">
                  <p>Aucun espace correspondant. Essayez « frigo », « musique » ou « météo ».</p>
                  <button type="button" onClick={() => setQuery("")}>
                    Afficher tous les espaces
                  </button>
                </div>
              ) : null}
            </section>
            <div className="house-bottom-grid">
              <section className="house-panel">
                <header>
                  <h2>Votre maison, vos données</h2>
                  <LineIcon kind="home" />
                </header>
                <p>
                  Aucun suivi automatique. L’accès Home Assistant est limité à une lampe, en lecture seule et uniquement
                  à votre demande.
                </p>
                <button type="button" className="house-inline-link" onClick={() => setPanel("devices")}>
                  Ma connexion <span aria-hidden="true">→</span>
                </button>
              </section>
              <section className="house-panel house-energy">
                <header>
                  <h2>Consommation énergétique</h2>
                  <LineIcon kind="leaf" />
                </header>
                <div className="house-energy-body">
                  <span className="house-energy-ring">
                    —<small>Aucune mesure</small>
                  </span>
                  <p>Relier un compteur sera une étape distincte. Aucun chiffre simulé.</p>
                </div>
                <button type="button" className="house-inline-link" onClick={() => setPanel("energy")}>
                  Voir les prérequis →
                </button>
              </section>
            </div>
          </div>
          <aside className="house-secondary">
            <section className="house-panel">
              <header>
                <h2>État de la maison</h2>
                <button type="button" onClick={() => setPanel("devices")} aria-label="Ouvrir la connexion domotique">
                  →
                </button>
              </header>
              <span className="house-status">
                <i />
                Lecture ponctuelle · ouvrir pour vérifier
              </span>
              <div className="house-status-grid">
                {(
                  [
                    ["devices", "ideas", "Lumières", "Consulter la lampe"],
                    ["climate", "wind", "Climatisation", "Non reliée"],
                    ["energy", "leaf", "Énergie", "Aucun compteur"],
                    ["security", "alert", "Sécurité", "Non supervisée"],
                  ] as const
                ).map(([id, icon, label, detail]) => (
                  <button key={id} type="button" onClick={() => setPanel(id)}>
                    <span className={`house-status-icon house-status-${id}`}>
                      <LineIcon kind={icon} />
                    </span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </button>
                ))}
              </div>
            </section>
            <section className="house-panel">
              <header>
                <h2>Ambiances favorites</h2>
                <button type="button" onClick={() => setPanel("ambiences")} aria-label="Toutes les ambiances visuelles">
                  →
                </button>
              </header>
              <p className="house-caption">Pour l’interface uniquement</p>
              <div className="house-scene-grid">
                {homeAmbiences.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={ambience === item.id}
                    onClick={() => preview(item.id)}
                  >
                    <span
                      className={`house-scene-thumb house-thumb-${item.id}`}
                      style={{ backgroundImage: `url(${scene})`, backgroundPosition: item.position }}
                    />
                    <span>{item.title}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="house-panel">
              <header>
                <h2>Votre quotidien</h2>
                <button type="button" onClick={() => setPanel("today")} aria-label="Ouvrir ma journée">
                  →
                </button>
              </header>
              <button className="house-routine" type="button" onClick={onFridge}>
                <span>
                  <LineIcon kind="fridge" />
                </span>
                <span>
                  <strong>Organiser mon frigo</strong>
                  <small>Produits et liste à racheter</small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
              <button className="house-routine" type="button" onClick={() => onNavigate("tasks")}>
                <span>
                  <LineIcon kind="calendar" />
                </span>
                <span>
                  <strong>Mes tâches</strong>
                  <small>Reprendre et suivre mes priorités</small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
              <button className="house-routine" type="button" onClick={() => setPanel("automations")}>
                <span>
                  <LineIcon kind="automation" />
                </span>
                <span>
                  <strong>Préparer une routine</strong>
                  <small>Brief dans La Fabrique · pas d’exécution</small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            </section>
            <button
              className="house-quote"
              type="button"
              onClick={onWeather}
              style={{ backgroundImage: `linear-gradient(90deg, #06132266, #061322aa), url(${scene})` }}
            >
              <span>
                Une maison sereine,
                <br />
                un esprit libre.
              </span>
              <small>Explorer votre météo →</small>
            </button>
          </aside>
        </div>
        {feedback ? (
          <p className="house-feedback" role="status">
            {feedback}
          </p>
        ) : null}
        <nav className="house-command-bar" aria-label="Commandes rapides IDA Home">
          <button type="button" onClick={onBack}>
            <LineIcon kind="globe" />
            <span>Les mondes</span>
          </button>
          <button type="button" onClick={revealRooms}>
            <LineIcon kind="grid" />
            <span>Pièces</span>
          </button>
          <button
            type="button"
            className="house-voice"
            onClick={() => setPanel("dialogue")}
            aria-label="Ouvrir le dialogue vocal ou texte avec IDA"
          >
            <span className="house-orb" aria-hidden="true" />
            <span>Parler à IDA</span>
          </button>
          <button type="button" onClick={() => setPanel("ambiences")}>
            <LineIcon kind="ideas" />
            <span>Ambiances</span>
          </button>
          <button type="button" onClick={() => setPanel("settings")}>
            <LineIcon kind="sliders" />
            <span>Plus</span>
          </button>
        </nav>
      </div>
      {panel ? (
        <Sheet title={panel === "room" ? room.title : panelTitles[panel]} close={() => setPanel(null)}>
          {panel === "dialogue" ? <LocalDialogue /> : null}
          {panel === "devices" ? <HomeConnections /> : null}
          {panel === "today"
            ? (homeOverview ?? (
                <p>
                  Votre aperçu partagé est indisponible.{" "}
                  <button type="button" onClick={() => onNavigate("tasks")}>
                    Ouvrir mes tâches
                  </button>
                </p>
              ))
            : null}
          {panel === "room" ? (
            <div className="house-room-detail">
              <div
                className="house-room-detail-photo"
                style={{ backgroundImage: `url(${scene})`, backgroundPosition: room.crop }}
              />
              <p>{room.detail}.</p>
              <p>Un espace de navigation illustré. Aucun appareil ni plan réel n’est associé à cette pièce.</p>
              <div className="house-room-actions">
                {room.actions.map((value) => (
                  <button key={value} type="button" onClick={() => action(value)}>
                    {homeActionLabels[value]} →
                  </button>
                ))}
                <button type="button" onClick={() => setPanel("devices")}>
                  Préparer Home Assistant →
                </button>
              </div>
            </div>
          ) : null}
          {panel === "ambiences" || panel === "settings" ? (
            <div className="house-personalize">
              {panel === "settings" && onThemeChange ? <ThemePicker value={theme} onChange={onThemeChange} /> : null}
              <p>
                Personnalisez l’ambiance de cet écran. Ces réglages temporaires n’allument aucune lampe et ne lancent
                aucune scène domotique.
              </p>
              <div className="house-personalize-grid">
                {homeAmbiences.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={ambience === item.id}
                    onClick={() => preview(item.id)}
                  >
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </button>
                ))}
              </div>
              <button type="button" aria-pressed={motion} onClick={() => setMotion(!motion)}>
                {motion ? "Mettre les animations en pause" : "Autoriser les animations légères"}
              </button>
              <p className="reference-hint">
                Le mouvement réduit du système est respecté. Le mode Nuit met toujours l’animation en pause.
              </p>
              <button type="button" onClick={() => setPanel("devices")}>
                Configuration domotique →
              </button>
              <button type="button" onClick={() => onNavigate("system")}>
                État du système et capacités →
              </button>
            </div>
          ) : null}
          {panel === "automations" ? (
            <div>
              <p>
                Aucune routine domestique n’est active dans IDA. Vous pouvez préparer un brief dans La Fabrique ou créer
                une tâche ; cela ne déploie pas d’automatisation et n’actionne aucun appareil.
              </p>
              <div className="reference-actions">
                <button type="button" onClick={() => onSelect("fabrique")}>
                  Créer un brief dans La Fabrique →
                </button>
                <button type="button" onClick={() => onNavigate("tasks")}>
                  Créer une tâche →
                </button>
              </div>
            </div>
          ) : null}
          {panel === "energy" || panel === "security" || panel === "climate" || panel === "cameras" ? (
            <div className="house-capability">
              <LineIcon kind={panel === "energy" ? "leaf" : panel === "climate" ? "wind" : "alert"} />
              <h3>{panel === "cameras" ? "Aucune caméra ouverte" : "Service non connecté"}</h3>
              <p>
                {panel === "energy"
                  ? "Aucun compteur n’est lié. La consommation, les coûts et les économies ne sont pas calculés. La première connexion est limitée à la lecture d’une lampe."
                  : panel === "climate"
                    ? "Aucun thermostat ou climatiseur n’est piloté par IDA. L’accès au chauffage et aux équipements physiques nécessite une intégration et des permissions distinctes."
                    : panel === "cameras"
                      ? "Ce panneau n’accède ni à votre webcam ni à une caméra domestique. Une future vue nécessitera une demande explicite, des permissions dédiées et un indicateur d’arrêt."
                      : "IDA ne surveille pas votre maison. Aucune alarme, serrure ou commande de sécurité n’est intégrée. Continuez d’utiliser votre système habituel."}
              </p>
              <button type="button" onClick={() => setPanel("devices")}>
                Voir la connexion disponible →
              </button>
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </section>
  );
}
