import { type CSSProperties, lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { CareProfile } from "./CareProfile";
import { ClassicFridge } from "./ClassicFridge";
import type { NavigationId } from "./data";
import { FabriqueEnvironment } from "./FabriqueEnvironment";
import type { FridgeItem } from "./FridgePanel";
import { FridgeScene } from "./FridgeScene";
import { useSceneViewport } from "./scene-viewport";
import { ThemePicker } from "./ThemePicker";
import { type HomeTheme, type IdaWorld, worlds } from "./worlds";

const WeatherEnvironment = lazy(() =>
  import("./WeatherEnvironment").then((module) => ({ default: module.WeatherEnvironment })),
);
const ReferenceEnvironment = lazy(() =>
  import("./ReferenceEnvironment").then((module) => ({ default: module.ReferenceEnvironment })),
);
const HomeEnvironment = lazy(() => import("./HomeEnvironment").then((module) => ({ default: module.HomeEnvironment })));
const CareEnvironment = lazy(() => import("./CareEnvironment").then((module) => ({ default: module.CareEnvironment })));

const sceneImages: Record<string, string> = {
  music: "/design/user-20260909/music-scene-v1.png",
  health: "/design/user-20260909/care-scene-v1.png",
  fabrique: "/design/user-20260909/fabrique-scene-v1.png",
  home: "/design/user-20260909/classic-atrium.png",
  workspace: "/design/scifi-observatory.png",
};

export function EnvironmentLobby({
  world,
  theme,
  onThemeChange,
  onBack,
  onSelect,
  onNavigate,
  homeOverview,
}: {
  world: IdaWorld;
  theme: HomeTheme;
  onThemeChange?: ((theme: HomeTheme) => void) | undefined;
  onBack: () => void;
  onSelect: (id: string) => void;
  onNavigate: (id: NavigationId) => void;
  homeOverview?: ReactNode;
}) {
  const title = useSceneViewport();
  const content = useRef<HTMLElement>(null);
  const [tab, setTab] = useState(world.id === "health" ? "care" : "spaces");
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [details, setDetails] = useState(false);
  const image = sceneImages[world.id];
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [tab]);
  if (world.id === "music" || world.id === "research" || world.id === "travel")
    return (
      <Suspense
        fallback={
          <section className="environment-screen" aria-label={`Ouverture de ${world.title}`}>
            <div className="scene-panel">
              <button type="button" onClick={onBack}>
                ← La Roue des Mondes
              </button>
              <p role="status">Ouverture de {world.title}…</p>
            </div>
          </section>
        }
      >
        <ReferenceEnvironment
          environment={world.id}
          titleRef={title}
          onBack={onBack}
          onSelect={onSelect}
          onNavigate={onNavigate}
        />
      </Suspense>
    );
  if (world.id === "fabrique")
    return <FabriqueEnvironment titleRef={title} onBack={onBack} onSelect={onSelect} onNavigate={onNavigate} />;
  if (world.id === "health")
    return (
      <Suspense
        fallback={
          <section className="environment-screen">
            <p role="status">Ouverture d’IDA Care…</p>
          </section>
        }
      >
        <CareEnvironment
          titleRef={title}
          theme={theme}
          onThemeChange={onThemeChange}
          onBack={onBack}
          onSelect={onSelect}
          onNavigate={onNavigate}
        />
      </Suspense>
    );
  if (world.id === "home" && tab === "weather")
    return (
      <Suspense
        fallback={
          <section className="environment-screen" aria-label="Ouverture de la météo">
            <div className="scene-panel">
              <button type="button" onClick={() => setTab("spaces")}>
                ← IDA Home
              </button>
              <p role="status">Ouverture de votre espace Météo…</p>
            </div>
          </section>
        }
      >
        <WeatherEnvironment
          titleRef={title}
          onBack={() => setTab("spaces")}
          onFridge={() => setTab("fridge")}
          onNavigate={onNavigate}
          onSelectWorld={onSelect}
        />
      </Suspense>
    );
  if (world.id === "home" && tab === "fridge")
    return theme === "classic" ? (
      <ClassicFridge
        items={items}
        onChange={setItems}
        titleRef={title}
        onBack={() => setTab("spaces")}
        onNavigate={onNavigate}
        onSelectWorld={onSelect}
      />
    ) : (
      <FridgeScene
        items={items}
        onChange={setItems}
        titleRef={title}
        theme={theme}
        onBack={() => setTab("spaces")}
        onNavigate={onNavigate}
        onSelectWorld={onSelect}
      />
    );
  if (world.id === "home")
    return (
      <Suspense
        fallback={
          <section className="environment-screen" aria-label="Ouverture d’IDA Home">
            <div className="scene-panel">
              <button type="button" onClick={onBack}>
                ← La Roue des Mondes
              </button>
              <p role="status">Ouverture de votre maison…</p>
            </div>
          </section>
        }
      >
        <HomeEnvironment
          titleRef={title}
          theme={theme}
          onThemeChange={onThemeChange}
          onBack={onBack}
          onFridge={() => setTab("fridge")}
          onWeather={() => setTab("weather")}
          onSelect={onSelect}
          onNavigate={onNavigate}
          homeOverview={homeOverview}
        />
      </Suspense>
    );
  return (
    <section
      className="world-environment environment-screen"
      data-world={world.id}
      data-section={tab}
      aria-label={`Environnement ${world.title}`}
      style={image ? ({ "--environment-image": `url("${image}")` } as CSSProperties) : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (tab !== "spaces" && world.id !== "health") setTab("spaces");
          else onBack();
        }
      }}
    >
      <aside className="environment-rail">
        <button type="button" className="scene-wordmark" onClick={onBack} aria-label="Retour à la roue des mondes">
          I D A
        </button>
        <span className="scene-kicker">
          INTELLIGENT
          <br />
          DIGITAL
          <br />
          AGENT
        </span>
        <nav aria-label="Environnements">
          {worlds.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === world.id ? "page" : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span aria-hidden="true">{item.glyph}</span>
              {item.title}
            </button>
          ))}
        </nav>
        <span className="scene-rail-signature">
          HUMAN
          <br />
          AI
          <br />
          TOGETHER
        </span>
      </aside>
      <div className="environment-body">
        <header className="scene-toolbar">
          <button type="button" onClick={onBack}>
            ← La Roue des Mondes
          </button>
          {onThemeChange ? <ThemePicker value={theme} onChange={onThemeChange} /> : null}
        </header>
        <details className="scene-mobile-worlds">
          <summary>
            <span aria-hidden="true">{world.glyph}</span>
            {world.title}
            <span>Changer de monde ⌄</span>
          </summary>
          <nav aria-label="Choisir un environnement sur mobile">
            {worlds.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === world.id ? "page" : undefined}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  if (item.id !== world.id) onSelect(item.id);
                }}
              >
                <span aria-hidden="true">{item.glyph}</span>
                {item.title}
              </button>
            ))}
          </nav>
        </details>
        <div className="environment-composition">
          <header className="scene-intro">
            <p className="scene-kicker">{world.id === "health" ? "VOTRE ESPACE CARE" : "VOTRE ENVIRONNEMENT"}</p>
            <h1 ref={title} tabIndex={-1}>
              {world.title}
            </h1>
            <p>{world.description}</p>
            <div className="scene-intro-line" />
            <p className="scene-manifesto">
              {world.id === "health"
                ? "Commençons par l’essentiel. Vous restez maître de vos informations."
                : world.id === "fabrique"
                  ? "Des idées au réel. Votre atelier, connecté au même IDA."
                  : world.id === "music"
                    ? "Un espace pour votre musique. Des idées aux prochaines releases."
                    : world.id === "home"
                      ? "Votre maison, votre quotidien. Tout commence ici."
                      : "Un seul IDA. Un espace pour chaque partie de votre univers."}
            </p>
            <span className="scene-meta">
              {world.spaces.length || world.id === "health"
                ? "Espaces accessibles ci-contre"
                : "Interface disponible · outils métier à venir"}
            </span>
            <button
              className="scene-jump"
              type="button"
              onClick={() => {
                content.current?.scrollIntoView({ block: "start", behavior: "auto" });
                content.current?.focus({ preventScroll: true });
              }}
            >
              {world.id === "health" ? "Personnaliser mon espace ↓" : "Accéder aux espaces ↓"}
            </button>
          </header>
          <section
            ref={content}
            tabIndex={-1}
            aria-label={`Espaces de ${world.title}`}
            className={`scene-content ${tab === "spaces" ? "scene-content-menu" : "scene-content-detail"}`}
          >
            {tab === "spaces" ? (
              <>
                <nav className="scene-panel scene-space-menu" aria-label={`Espaces de ${world.title}`}>
                  <p className="scene-kicker">VOS ESPACES</p>
                  {world.spaces.map((space) => (
                    <button key={space.title} type="button" onClick={() => onNavigate(space.target)}>
                      <span aria-hidden="true">◇</span>
                      <span>
                        <strong>{space.title}</strong>
                        <small>{space.detail}</small>
                      </span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                  {!world.spaces.length ? (
                    <p className="scene-empty">
                      Les services de ce monde ne sont pas encore connectés. Aucune donnée ni action n’est simulée.
                    </p>
                  ) : null}
                </nav>
                <section className="scene-panel scene-presence-card">
                  <span aria-hidden="true">✦</span>
                  <h2>Dialogue avec IDA</h2>
                  <p>Retrouvez la conversation et les capacités disponibles du Core.</p>
                  <button type="button" onClick={() => onNavigate("ida")}>
                    Ouvrir le dialogue →
                  </button>
                </section>
              </>
            ) : (
              <>
                {world.id !== "health" ? (
                  <button className="scene-section-back" type="button" onClick={() => setTab("spaces")}>
                    ← Les espaces de {world.title}
                  </button>
                ) : null}
                {tab === "care" ? <CareProfile /> : null}
              </>
            )}
          </section>
        </div>
        <nav className="scene-dock" aria-label="Actions de l’environnement">
          <button type="button" onClick={() => onNavigate("ida")}>
            <span aria-hidden="true">◌</span>Dialogue
          </button>
          <button
            type="button"
            aria-pressed={tab === "spaces" || tab === "care"}
            onClick={() => setTab(world.id === "health" ? "care" : "spaces")}
          >
            <span aria-hidden="true">◇</span>
            {world.id === "health" ? "Mon profil" : "Espaces"}
          </button>
          <span className="scene-meta">Ambiance illustrée · vidéos sur la roue</span>
          <button type="button" aria-expanded={details} onClick={() => setDetails(!details)}>
            <span aria-hidden="true">ⓘ</span>Confidentialité
          </button>
        </nav>
        {details ? (
          <p className="scene-panel scene-capability-note" role="status">
            Ce décor n’active aucun capteur. Caméra et microphone sont désactivés. Les actions métier conservent leurs
            permissions et validations ; les brouillons Care et Frigo ne sont pas enregistrés.
          </p>
        ) : null}
      </div>
    </section>
  );
}
