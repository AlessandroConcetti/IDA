import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type { NavigationId } from "./data";
import { EnvironmentLobby } from "./EnvironmentLobby";
import { WorldAmbience } from "./WorldAmbience";
import { type HomeTheme, initialWorldIndex, nearestWorldIndex, worldIndexForKey, worlds } from "./worlds";

export function WorldWheel({
  onNavigate,
  onEnvironmentNavigate,
  theme,
  onThemeChange,
  initialWorldId,
  startOpened = false,
  renderEnvironment,
}: {
  onNavigate: (id: NavigationId) => void;
  onEnvironmentNavigate?: ((id: NavigationId, worldId: string) => void) | undefined;
  theme: HomeTheme;
  onThemeChange?: ((theme: HomeTheme) => void) | undefined;
  initialWorldId?: string;
  startOpened?: boolean;
  renderEnvironment?: (worldId: string) => ReactNode;
}) {
  const [selected, setSelected] = useState(() => {
    const index = worlds.findIndex((item) => item.id === initialWorldId);
    return index < 0 ? initialWorldIndex : index;
  });
  const [opened, setOpened] = useState(() => startOpened && worlds.some((item) => item.id === initialWorldId));
  const rail = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const previousOpen = useRef(false);
  const world = worlds[selected] ?? worlds[initialWorldIndex];

  function centerCard(index: number) {
    const element = cards.current[index];
    if (element && rail.current)
      rail.current.scrollTo({
        left: element.offsetLeft + element.offsetWidth / 2 - rail.current.clientWidth / 2,
        behavior: "instant",
      });
  }
  function select(index: number, focus = false) {
    setSelected(index);
    centerCard(index);
    if (focus) cards.current[index]?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!opened) centerCard(selected);
    if (previousOpen.current !== opened) {
      if (!opened) cards.current[selected]?.focus({ preventScroll: true });
      surface.current?.scrollIntoView({ block: "start", behavior: "auto" });
    }
    previousOpen.current = opened;
    // Recentrage au changement de présentation, pas à chaque scroll tactile.
  }, [opened]);
  if (!world) return null;
  return (
    <section ref={surface} className="worlds" aria-label="La Roue des Mondes" data-theme={theme} data-opened={opened}>
      {opened ? (
        <EnvironmentLobby
          key={world.id}
          world={world}
          theme={theme}
          onThemeChange={onThemeChange}
          onBack={() => setOpened(false)}
          onNavigate={(id) => (onEnvironmentNavigate ? onEnvironmentNavigate(id, world.id) : onNavigate(id))}
          homeOverview={renderEnvironment?.(world.id)}
          onSelect={(id) => {
            const index = worlds.findIndex((item) => item.id === id);
            if (index >= 0) setSelected(index);
          }}
        />
      ) : (
        <>
          <h2 className="worlds-heading">La Roue des Mondes</h2>
          <div
            className="world-rail"
            ref={rail}
            onScroll={(event) => {
              const element = event.currentTarget;
              const centers = cards.current.map((card) => (card ? card.offsetLeft + card.offsetWidth / 2 : 0));
              setSelected(nearestWorldIndex(centers, element.scrollLeft + element.clientWidth / 2));
            }}
          >
            {worlds.map((item, index) => (
              <button
                key={item.id}
                ref={(element) => {
                  cards.current[index] = element;
                }}
                type="button"
                className="world-card"
                data-world={item.id}
                aria-pressed={selected === index}
                aria-label={`Ouvrir ${item.title}`}
                style={
                  {
                    "--world-distance": Math.min(2, Math.abs(index - selected)),
                    "--world-angle": `${Math.sign(index - selected) * -14}deg`,
                  } as CSSProperties
                }
                onClick={() => {
                  select(index);
                  setOpened(true);
                }}
                onKeyDown={(event) => {
                  const indexForKey = worldIndexForKey(event.key, index, worlds.length);
                  if (indexForKey !== undefined) {
                    event.preventDefault();
                    select(indexForKey, true);
                  }
                }}
              >
                {selected === index && item.video ? <WorldAmbience src={item.video} paused={false} /> : null}
                <span className="world-card-status">
                  {item.id === "health"
                    ? "Personnaliser mon espace"
                    : item.spaces.length
                      ? "Espaces disponibles"
                      : "Découvrir l’environnement"}
                </span>
                <span className="world-glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                <strong>{item.title}</strong>
                <span className="world-card-description">{item.description}</span>
                <span className="world-card-media">{item.video ? "Ambiance vidéo disponible" : "Vidéo à venir"}</span>
              </button>
            ))}
          </div>
          <div className="world-controls">
            <button
              type="button"
              aria-label="Monde précédent"
              disabled={selected === 0}
              onClick={() => select(selected - 1)}
            >
              ←
            </button>
            <span aria-live="polite" aria-atomic="true">
              {world.title}{" "}
              <small>
                {selected + 1} / {worlds.length}
              </small>
            </span>
            <button
              type="button"
              aria-label="Monde suivant"
              disabled={selected === worlds.length - 1}
              onClick={() => select(selected + 1)}
            >
              →
            </button>
          </div>
          <div className="world-selection">
            <p>
              {world.id === "health"
                ? "Profil corporel facultatif et personnalisation · brouillon non enregistré"
                : world.spaces.length
                  ? world.spaces.map((space) => space.title).join(" · ")
                  : "Ce monde sera ajouté progressivement. Aucun agent ni service n’est activé."}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
