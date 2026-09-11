import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { LineIcon } from "./ReferenceChrome";
import { filterDestinations } from "./travel-destinations";
import "./destination-menu.css";

/** Suggestions éditoriales fixes. Aucun prix, conseil personnalisé ou accès réseau implicite. */
export function DestinationMenu({
  motion,
  onSelect,
  suspended = false,
}: {
  motion: boolean;
  onSelect: (name: string) => void;
  suspended?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState("Toutes");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const surface = useRef<HTMLElement>(null);
  const list = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const places = filterDestinations(query, theme);
  const activeIndex = Math.min(index, Math.max(0, places.length - 1));
  const running =
    motion &&
    !paused &&
    !reduced &&
    !interacting &&
    !focused &&
    visible &&
    inView &&
    expanded &&
    !suspended &&
    places.length > 1;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    update();
    visibility();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    const element = surface.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function reveal(next: number, smooth: boolean) {
    const viewport = list.current;
    const item = viewport?.children.item(next) as HTMLElement | null;
    if (!viewport || !item) return;
    const offset = item.offsetLeft - viewport.offsetLeft;
    viewport.scrollTo({
      left: offset - (viewport.clientWidth - item.clientWidth) / 2,
      behavior: smooth && !reduced ? "smooth" : "auto",
    });
  }

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      const next = (activeIndex + 1) % places.length;
      setIndex(next);
      reveal(next, true);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [running, activeIndex, places.length]);

  function move(direction: -1 | 1) {
    const next = (activeIndex + direction + places.length) % places.length;
    setPaused(true);
    setIndex(next);
    reveal(next, true);
  }

  return (
    <section
      ref={surface}
      className="destination-menu"
      data-expanded={expanded}
      data-running={running}
      data-animated={motion && !reduced && !paused && visible && inView && !suspended}
      aria-label="Suggestions de destinations"
      onPointerEnter={() => setInteracting(true)}
      onPointerLeave={() => setInteracting(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.stopPropagation();
          setExpanded(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="destination-menu-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded(!expanded)}
      >
        <span>
          <LineIcon kind="globe" />
          <span>
            <strong>Où partons-nous ?</strong>
            <small>Suggestions de destinations</small>
          </span>
        </span>
        <span className="destination-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>
      <div className="destination-menu-body" id={panelId} hidden={!expanded}>
        <div className="destination-menu-filters">
          <label>
            <span className="sr-only">Rechercher une destination suggérée</span>
            <LineIcon kind="search" />
            <input
              value={query}
              maxLength={120}
              placeholder="Un pays, une ville, une envie…"
              onChange={(event) => {
                setQuery(event.target.value);
                setIndex(0);
                setPaused(true);
                list.current?.scrollTo({ left: 0 });
              }}
            />
          </label>
          <label>
            <span className="sr-only">Style de voyage</span>
            <select
              value={theme}
              onChange={(event) => {
                setTheme(event.target.value);
                setIndex(0);
                setPaused(true);
                list.current?.scrollTo({ left: 0 });
              }}
            >
              {["Toutes", "Culture", "Nature", "Villes"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </div>
        <nav
          ref={list}
          className="destination-menu-track"
          aria-label="Destinations à explorer"
          onPointerDown={() => setPaused(true)}
          onWheel={() => setPaused(true)}
        >
          {places.map((place, position) => (
            <button
              type="button"
              className="destination-menu-card"
              key={place.name}
              data-highlighted={position === activeIndex}
              style={{ "--destination-crop": place.crop } as CSSProperties}
              onClick={() => onSelect(place.name)}
            >
              <span className="destination-menu-photo" aria-hidden="true" />
              <span className="destination-menu-tag">{place.theme}</span>
              <span className="destination-menu-caption">
                <strong>{place.name}</strong>
                <small>{place.detail}</small>
                <span>
                  Préparer mon voyage <span aria-hidden="true">↗</span>
                </span>
              </span>
            </button>
          ))}
        </nav>
        {!places.length ? (
          <p className="destination-menu-empty">
            Aucune suggestion dans cette sélection.{" "}
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTheme("Toutes");
                setIndex(0);
              }}
            >
              Tout afficher
            </button>
          </p>
        ) : null}
        <footer className="destination-menu-controls">
          <span>
            {places.length} destination{places.length > 1 ? "s" : ""} · sélection éditoriale
          </span>
          <div>
            <button
              type="button"
              onClick={() => move(-1)}
              disabled={places.length < 2}
              aria-label="Suggestion précédente"
            >
              ←
            </button>
            <button
              type="button"
              aria-pressed={paused}
              disabled={reduced || !motion}
              onClick={() => setPaused(!paused)}
            >
              {paused || reduced || !motion ? "Animer" : "Pause"}
            </button>
            <button type="button" onClick={() => move(1)} disabled={places.length < 2} aria-label="Suggestion suivante">
              →
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
