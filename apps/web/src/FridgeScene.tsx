import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import type { NavigationId } from "./data";
import { type FridgeItem, FridgePanel } from "./FridgePanel";
import type { HomeTheme } from "./worlds";

type FridgeView = "inventory" | "edit" | "shopping" | "history" | "stats" | "settings" | "scan";
type SceneIcon =
  | "home"
  | "chat"
  | "calendar"
  | "files"
  | "fridge"
  | "bag"
  | "clock"
  | "chart"
  | "settings"
  | "arrow"
  | "search"
  | "scan"
  | "plus"
  | "idea"
  | "box"
  | "mic"
  | "heart";
export function FridgeIcon({ name }: { name: SceneIcon }) {
  const paths: Record<SceneIcon, string> = {
    home: "m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
    chat: "M21 11a9 9 0 0 1-9 9H4l-2 2v-10a9 9 0 1 1 19-1ZM7 11h.01M12 11h.01M17 11h.01",
    calendar: "M4 5h16v16H4V5Zm0 5h16M8 2v6m8-6v6M8 14h3m2 3h3",
    files: "M5 3h9l5 5v13H5V3Zm9 0v5h5M8 12h8m-8 4h6",
    fridge: "M5 2h14v20H5V2Zm0 8h14M8 5v1m0 6v4",
    bag: "M4 7h16l1 14H3L4 7Zm4 1V6a4 4 0 0 1 8 0v2",
    clock: "M12 3a9 9 0 1 1-9 9M3 3v5h5m4-2v6l4 2",
    chart: "M4 13h3v8H4v-8Zm7-5h3v13h-3V8Zm7-5h3v18h-3V3Z",
    settings:
      "m9 3 1-2h4l1 2 3 2 2 1v4l-2 2 1 3-2 3-3-1-2 2-4-1-1-3-3-1v-4l2-2V6l3-3Zm6 9a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
    arrow: "M4 12h16m-6-6 6 6-6 6",
    search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 6 6",
    scan: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 8h10M7 12h10M7 16h6",
    plus: "M12 4v16M4 12h16",
    idea: "M9 18h6m-6 3h6M8 14a6 6 0 1 1 8 0l-1 2H9l-1-2ZM12 0v1M1 7h2m18 0h2",
    box: "m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10M7 5l10 4",
    mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8",
    heart: "M12 21S2 14 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 6-10 13-10 13Z",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
const Icon = FridgeIcon;

const viewNames: Record<FridgeView, string> = {
  inventory: "Aujourd’hui",
  edit: "Gérer mon inventaire",
  shopping: "Ma liste de courses",
  history: "Historique",
  stats: "Statistiques",
  settings: "Paramètres",
  scan: "Analyser le contenu",
};

/** Une scène cliente de la maison. L'inventaire reste le brouillon du parent. */
export function FridgeScene({
  items,
  onChange,
  onBack,
  onNavigate,
  onSelectWorld,
  theme,
  titleRef,
}: {
  items: FridgeItem[];
  onChange: (items: FridgeItem[]) => void;
  onBack: () => void;
  onNavigate: (id: NavigationId) => void;
  onSelectWorld: (id: string) => void;
  theme: HomeTheme;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [view, setView] = useState<FridgeView>("inventory");
  const [query, setQuery] = useState("");
  const [solid, setSolid] = useState(false);
  const [large, setLarge] = useState(false);
  const [history, setHistory] = useState<{ text: string; at: number }[]>([]);
  const [notice, setNotice] = useState("");
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const previousView = useRef(view);
  const buyItems = items.filter((item) => item.toBuy);
  const filtered = items.filter((item) =>
    `${item.name} ${item.quantity}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")),
  );

  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    if (document.activeElement === searchInput.current) return;
    panelTitle.current?.focus({ preventScroll: true });
    panelTitle.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [view]);

  function changeItems(next: FridgeItem[]) {
    const changes: string[] = [];
    for (const item of next) {
      const before = items.find((value) => value.id === item.id);
      if (!before) changes.push(`${item.name} ajouté au frigo`);
      else if (before.toBuy !== item.toBuy)
        changes.push(`${item.name} ${item.toBuy ? "ajouté à" : "retiré de"} la liste de courses`);
    }
    for (const item of items)
      if (!next.some((value) => value.id === item.id)) changes.push(`${item.name} retiré du frigo`);
    if (changes.length) {
      const at = Date.now();
      setHistory((current) => [...changes.map((text) => ({ text, at })), ...current].slice(0, 50));
      setNotice(changes.join(". "));
    }
    onChange(next);
  }

  function openView(next: FridgeView) {
    setView(next);
    setNotice("");
  }
  return (
    <section
      className="environment-screen fridge-screen"
      data-surface={solid ? "solid" : "glass"}
      data-cards={large ? "large" : "normal"}
      aria-labelledby="fridge-scene-title"
      style={{ "--environment-image": 'url("/design/user-20260909/fridge-scene-v1.png")' } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (view !== "inventory") openView("inventory");
          else onBack();
        }
      }}
    >
      <aside className="fridge-sidebar">
        <button className="fridge-brand" type="button" onClick={onBack} aria-label="Retour à IDA Home">
          <strong>IDA</strong>
          <span>{theme === "classic" ? "CLASSIC" : theme === "scifi" ? "SCI-FI" : "IMMERSIVE"}</span>
        </button>
        <nav aria-label="Navigation de la maison">
          <button type="button" onClick={onBack}>
            <Icon name="home" />
            Accueil Home
          </button>
          <button type="button" onClick={() => onNavigate("ida")}>
            <Icon name="chat" />
            Chat
          </button>
          <button type="button" onClick={() => onNavigate("calendar")}>
            <Icon name="calendar" />
            Agenda
          </button>
          <button type="button" onClick={() => onNavigate("content")}>
            <Icon name="files" />
            Fichiers
          </button>
          <button type="button" onClick={onBack}>
            <Icon name="home" />
            Maison
          </button>
          <button type="button" onClick={() => onSelectWorld("health")}>
            <Icon name="heart" />
            IDA Care
          </button>
          <span className="fridge-nav-divider" />
          <button
            type="button"
            aria-current={view === "inventory" || view === "edit" || view === "scan" ? "page" : undefined}
            onClick={() => openView("inventory")}
          >
            <Icon name="fridge" />
            Mon frigo
          </button>
          <button
            type="button"
            aria-current={view === "shopping" ? "page" : undefined}
            onClick={() => openView("shopping")}
          >
            <Icon name="bag" />
            Courses{buyItems.length ? <span className="fridge-badge">{buyItems.length}</span> : null}
          </button>
          <button
            type="button"
            aria-current={view === "history" ? "page" : undefined}
            onClick={() => openView("history")}
          >
            <Icon name="clock" />
            Historique
          </button>
          <button type="button" aria-current={view === "stats" ? "page" : undefined} onClick={() => openView("stats")}>
            <Icon name="chart" />
            Statistiques
          </button>
          <button
            type="button"
            aria-current={view === "settings" ? "page" : undefined}
            onClick={() => openView("settings")}
          >
            <Icon name="settings" />
            Paramètres
          </button>
        </nav>
        <div className="fridge-sidebar-footer">
          <span>✦</span>
          <p>
            Toujours
            <br />à tes côtés.
          </p>
          <small>IDA HOME / CUISINE</small>
        </div>
      </aside>

      <div className="fridge-workspace">
        <header className="fridge-header">
          <div className="fridge-title">
            <Icon name="fridge" />
            <div>
              <h1 id="fridge-scene-title" ref={titleRef} tabIndex={-1}>
                Mon frigo
              </h1>
              <p>Votre cuisine, en un regard.</p>
            </div>
          </div>
          <div className="fridge-search-row">
            <label className="fridge-search">
              <Icon name="search" />
              <span className="sr-only">Rechercher un produit dans le frigo</span>
              <input
                ref={searchInput}
                type="search"
                value={query}
                maxLength={100}
                placeholder="Rechercher dans mon frigo…"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setView("inventory");
                }}
              />
            </label>
            <button
              type="button"
              className="fridge-round-button"
              aria-label="Informations sur la commande vocale, non connectée"
              onClick={() => setNotice("La commande vocale n’est pas connectée. Aucun microphone n’a été activé.")}
            >
              <Icon name="mic" />
            </button>
            <button
              type="button"
              className="fridge-round-button"
              aria-label="Paramètres du frigo"
              onClick={() => openView("settings")}
            >
              <Icon name="settings" />
            </button>
          </div>
        </header>
        <nav className="fridge-mobile-nav" aria-label="Navigation mobile du frigo">
          <button type="button" onClick={onBack}>
            ← IDA Home
          </button>
          <button type="button" aria-pressed={view === "inventory"} onClick={() => openView("inventory")}>
            Frigo
          </button>
          <button type="button" aria-pressed={view === "shopping"} onClick={() => openView("shopping")}>
            Courses
          </button>
          <button type="button" onClick={() => openView("settings")} aria-label="Paramètres">
            <Icon name="settings" />
          </button>
        </nav>

        <div className="fridge-composition">
          <div className="fridge-character-stage">
            <p className="fridge-speech">
              {items.length ? (
                <>
                  Votre inventaire compte{" "}
                  <strong>
                    {items.length} produit{items.length > 1 ? "s" : ""}
                  </strong>
                  .<br />
                  On prépare la suite ?
                </>
              ) : (
                <>
                  Bienvenue dans votre cuisine.
                  <br />
                  Ajoutons votre premier produit.
                </>
              )}
            </p>
            <div className="fridge-holograms">
              <button type="button" onClick={() => openView("edit")}>
                <Icon name="fridge" />
                <span>
                  Inventaire
                  <strong>
                    {items.length} produit{items.length > 1 ? "s" : ""}
                  </strong>
                </span>
                <Icon name="arrow" />
              </button>
              <button type="button" onClick={() => openView("shopping")}>
                <Icon name="bag" />
                <span>
                  Courses<strong>{buyItems.length} à racheter</strong>
                </span>
                <Icon name="arrow" />
              </button>
            </div>
            <span className="fridge-art-label">Décor illustré · produits non détectés</span>
          </div>

          <div className="fridge-panels">
            <p className="fridge-local-state">
              <span />
              Saisie manuelle · brouillon non enregistré
            </p>
            <section className="fridge-glass fridge-primary-panel" aria-labelledby="fridge-view-title">
              <header className="fridge-panel-heading">
                <div>
                  <h2 id="fridge-view-title" ref={panelTitle} tabIndex={-1}>
                    {viewNames[view]}
                  </h2>
                  <p>
                    {view === "inventory"
                      ? `${items.length} produit${items.length > 1 ? "s" : ""} renseigné${items.length > 1 ? "s" : ""}`
                      : "Votre espace Frigo"}
                  </p>
                </div>
                {view !== "inventory" ? (
                  <button
                    type="button"
                    className="fridge-round-button"
                    aria-label="Revenir à l’inventaire"
                    onClick={() => openView("inventory")}
                  >
                    ×
                  </button>
                ) : (
                  <span className="fridge-manual-indicator">Manuel</span>
                )}
              </header>
              {view === "inventory" ? (
                <>
                  {filtered.length ? (
                    <div className="fridge-product-grid">
                      {filtered.slice(0, 6).map((item) => (
                        <button
                          className="fridge-product-card"
                          type="button"
                          key={item.id}
                          onClick={() => openView("edit")}
                        >
                          <span className="fridge-product-tile">
                            <Icon name="box" />
                            {item.toBuy ? <span>À racheter</span> : null}
                          </span>
                          <strong>{item.name}</strong>
                          <small>{item.quantity || "Quantité à préciser"}</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="fridge-empty">
                      <Icon name={query ? "search" : "fridge"} />
                      <p>
                        {query
                          ? "Aucun produit ne correspond à votre recherche."
                          : "Votre frigo attend vos premiers produits."}
                      </p>
                      <small>
                        {query
                          ? "Essayez un autre nom ou une quantité."
                          : "Les aliments du décor ne sont pas votre inventaire."}
                      </small>
                    </div>
                  )}
                  <div className="fridge-primary-actions">
                    <button type="button" className="fridge-accent" onClick={() => openView("edit")}>
                      <Icon name="plus" />
                      {items.length ? "Gérer les produits" : "Ajouter mon premier produit"}
                      <Icon name="arrow" />
                    </button>
                    <button type="button" onClick={() => openView("scan")}>
                      <Icon name="scan" />
                      <span>
                        Analyser le contenu <small>Caméra / OCR · à connecter</small>
                      </span>
                      <Icon name="arrow" />
                    </button>
                  </div>
                  {filtered.length > 6 ? (
                    <button className="fridge-see-all" type="button" onClick={() => openView("edit")}>
                      Voir les {items.length} produits →
                    </button>
                  ) : null}
                </>
              ) : null}
              {view === "edit" ? <FridgePanel items={items} onChange={changeItems} compact /> : null}
              {view === "shopping" ? (
                <>
                  <p>Les produits marqués « À racheter » dans votre inventaire.</p>
                  {buyItems.length ? (
                    <ul className="fridge-shopping-list">
                      {buyItems.map((item) => (
                        <li key={item.id}>
                          <div>
                            <strong>{item.name}</strong>
                            <small>{item.quantity || "Quantité à préciser"}</small>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              changeItems(
                                items.map((value) => (value.id === item.id ? { ...value, toBuy: false } : value)),
                              )
                            }
                          >
                            Retirer de la liste
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="fridge-empty">Aucun produit à racheter pour le moment.</p>
                  )}
                  <button type="button" onClick={() => openView("edit")}>
                    <Icon name="plus" />
                    Choisir les produits à racheter
                  </button>
                </>
              ) : null}
              {view === "history" ? (
                <>
                  <p>Les 50 dernières modifications depuis l’ouverture de cet écran. Aucun journal permanent.</p>
                  {history.length ? (
                    <ol className="fridge-history">
                      {history.map((entry, index) => (
                        <li key={`${entry.at}-${index}`}>
                          <Icon name="clock" />
                          <span>
                            {entry.text}
                            <time dateTime={new Date(entry.at).toISOString()}>
                              {new Date(entry.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                            </time>
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="fridge-empty">Les prochains changements apparaîtront ici.</p>
                  )}
                </>
              ) : null}
              {view === "stats" ? (
                <>
                  <div className="fridge-stats">
                    <div>
                      <Icon name="fridge" />
                      <strong>{items.length}</strong>
                      <span>Produits renseignés</span>
                    </div>
                    <div>
                      <Icon name="bag" />
                      <strong>{buyItems.length}</strong>
                      <span>À racheter</span>
                    </div>
                    <div>
                      <Icon name="box" />
                      <strong>{items.filter((item) => Boolean(item.quantity)).length}</strong>
                      <span>Quantités précisées</span>
                    </div>
                  </div>
                  <p>
                    Ces compteurs viennent uniquement de votre saisie. Températures, dates de péremption et consommation
                    ne sont pas mesurées.
                  </p>
                </>
              ) : null}
              {view === "settings" ? (
                <>
                  <div className="fridge-setting-row">
                    <span>
                      Grandes cartes produits<small>Un affichage plus confortable.</small>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Grandes cartes produits"
                      aria-checked={large}
                      onClick={() => setLarge(!large)}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="fridge-setting-row">
                    <span>
                      Réduire les effets Glass<small>Surfaces opaques, reflets désactivés.</small>
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Réduire les effets Glass"
                      aria-checked={solid}
                      onClick={() => setSolid(!solid)}
                    >
                      <span />
                    </button>
                  </div>
                  <p>
                    Ces réglages durent pendant cette visite. Les produits restent un brouillon de la maison et
                    disparaissent à la sortie de cet environnement ou au verrouillage d’IDA.
                  </p>
                  <p>Aucun appareil connecté. Caméra et microphone désactivés.</p>
                </>
              ) : null}
              {view === "scan" ? (
                <div className="fridge-scan-info">
                  <Icon name="scan" />
                  <h3>Le scan sera relié ici.</h3>
                  <p>
                    La caméra, l’OCR et la détection d’aliments ne sont pas encore branchés. Aucun capteur ni fichier
                    n’a été ouvert.
                  </p>
                  <button type="button" className="fridge-accent" onClick={() => openView("edit")}>
                    Ajouter manuellement →
                  </button>
                </div>
              ) : null}
              <nav className="fridge-panel-tabs" aria-label="Vues du frigo">
                {(
                  [
                    { view: "history", icon: "clock" },
                    { view: "stats", icon: "chart" },
                    { view: "settings", icon: "settings" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.view}
                    type="button"
                    aria-pressed={view === item.view}
                    onClick={() => openView(item.view)}
                  >
                    <Icon name={item.icon} />
                    {viewNames[item.view]}
                  </button>
                ))}
              </nav>
            </section>

            <section className="fridge-glass fridge-suggestions">
              <h2>
                <Icon name="idea" />
                Avec IDA
              </h2>
              <button type="button" onClick={() => openView("shopping")}>
                <Icon name="bag" />
                <span>
                  {buyItems.length
                    ? `${buyItems.length} produit${buyItems.length > 1 ? "s" : ""} dans votre liste de courses.`
                    : "Préparer ma liste de courses."}
                </span>
                <Icon name="arrow" />
              </button>
              <button type="button" onClick={() => openView("edit")}>
                <Icon name="fridge" />
                <span>Mettre à jour le contenu du frigo.</span>
                <Icon name="arrow" />
              </button>
              <button type="button" onClick={() => onNavigate("ida")}>
                <Icon name="chat" />
                <span>
                  Ouvrir la conversation IDA.<small>L’inventaire n’est pas transmis.</small>
                </span>
                <Icon name="arrow" />
              </button>
            </section>
            <div className="fridge-glass fridge-bottom-note">
              <span>✦</span>
              <p>
                Un quotidien plus simple.
                <br />
                <small>Une chose à la fois.</small>
              </p>
              <button type="button" className="fridge-round-button" onClick={onBack} aria-label="Retour à la maison">
                <Icon name="arrow" />
              </button>
            </div>
            <p className="fridge-feedback" role="status">
              {notice || "Aucune synchronisation avec un appareil ou un service de courses."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
