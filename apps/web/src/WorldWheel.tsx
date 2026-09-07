import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type { NavigationId } from "./data";
import { WorldAmbience } from "./WorldAmbience";
import { initialWorldIndex, nearestWorldIndex, worldIndexForKey, worlds } from "./worlds";

export function WorldWheel({
  onNavigate,
  theme,
  initialWorldId,
  startOpened = false,
  renderEnvironment,
}: {
  onNavigate: (id: NavigationId) => void;
  theme: string;
  initialWorldId?: string;
  startOpened?: boolean;
  renderEnvironment?: (worldId: string) => ReactNode;
}) {
  const [selected, setSelected] = useState(() => {
    const index = worlds.findIndex((item) => item.id === initialWorldId);
    return index < 0 ? initialWorldIndex : index;
  });
  const [opened, setOpened] = useState(
    () => startOpened && worlds.some((item) => item.id === initialWorldId && item.spaces.length > 0),
  );
  const [grid, setGrid] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const title = useRef<HTMLHeadingElement>(null);
  const enter = useRef<HTMLButtonElement>(null);
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
    if (!opened && !grid) centerCard(selected);
    if (previousOpen.current !== opened) {
      if (opened) title.current?.focus({ preventScroll: true });
      else enter.current?.focus({ preventScroll: true });
    }
    previousOpen.current = opened;
    // Recentrage au changement de présentation, pas à chaque scroll tactile.
  }, [opened, grid]);
  if (!world) return null;
  return (
    <section className="worlds" aria-label="La Roue des Mondes">
      {opened ? (
        <section
          className="world-environment"
          aria-label={`Environnement ${world.title}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpened(false);
            }
          }}
        >
          <button className="world-back" type="button" onClick={() => setOpened(false)}>
            ← La Roue des Mondes
          </button>
          <header className="world-environment-heading">
            <span aria-hidden="true" className="world-glyph">
              {world.glyph}
            </span>
            <h2 ref={title} tabIndex={-1}>
              {world.title}
            </h2>
            <p>{world.description}</p>
          </header>
          {renderEnvironment?.(world.id)}
          <div className="world-spaces">
            {world.spaces.map((space) => (
              <button key={space.title} type="button" onClick={() => onNavigate(space.target)}>
                <strong>{space.title}</strong>
                <span>{space.detail}</span>
                <span aria-hidden="true">Ouvrir →</span>
              </button>
            ))}
          </div>
          {world.video ? (
            <WorldAmbience key={`${world.id}:${theme}`} src={world.video} />
          ) : (
            <p className="world-video-pending">Ambiance vidéo à venir</p>
          )}
        </section>
      ) : (
        <>
          <h2 className="worlds-heading">La Roue des Mondes</h2>
          <div
            className={grid ? "world-grid" : "world-rail"}
            ref={rail}
            onScroll={(event) => {
              if (grid) return;
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
                aria-pressed={selected === index}
                aria-label={`Sélectionner ${item.title}`}
                style={
                  {
                    "--world-distance": Math.min(2, Math.abs(index - selected)),
                    "--world-angle": `${Math.sign(index - selected) * -14}deg`,
                  } as CSSProperties
                }
                onClick={() => select(index)}
                onKeyDown={(event) => {
                  const indexForKey = worldIndexForKey(event.key, index, worlds.length);
                  if (indexForKey !== undefined) {
                    event.preventDefault();
                    select(indexForKey, true);
                  }
                }}
              >
                <span className="world-card-status">{item.spaces.length ? "Espaces disponibles" : "À venir"}</span>
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
              {world.spaces.length
                ? world.spaces.map((space) => space.title).join(" · ")
                : "Ce monde sera ajouté progressivement. Aucun agent ni service n’est activé."}
            </p>
            <button
              ref={enter}
              type="button"
              className="world-enter"
              disabled={!world.spaces.length}
              onClick={() => setOpened(true)}
            >
              {world.spaces.length ? `Entrer dans ${world.title}` : `${world.title} · À venir`}{" "}
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <button className="world-grid-toggle" type="button" aria-pressed={grid} onClick={() => setGrid(!grid)}>
            {grid ? "Revenir à la roue" : "Explorer tous les environnements"}
          </button>
        </>
      )}
    </section>
  );
}
