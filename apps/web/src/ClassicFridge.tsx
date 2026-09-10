import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import { createTask } from "./api";
import { IdaApiError } from "./api-transport";
import type { NavigationId } from "./data";
import { type FridgeCategory, type FridgeItem, FridgePanel } from "./FridgePanel";
import { FridgeIcon as Icon } from "./FridgeScene";
import {
  addRecipeShopping,
  fridgeCategories,
  fridgeRecipes,
  type FridgeRecipe,
  missingIngredients,
  shoppingText,
} from "./fridge-recipes";

type View = "inventory" | "edit" | "shopping" | "recipe" | "week" | "organize" | "scan";
const titles: Record<View, string> = {
  inventory: "Dans mon frigo",
  edit: "Ajouter et gérer mes aliments",
  shopping: "Ma liste de courses",
  recipe: "En cuisine",
  week: "Mes idées pour la semaine",
  organize: "Organiser mon frigo",
  scan: "Scanner un ticket de courses",
};
const weekDays = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** Présentation Classic du même inventaire de brouillon, sans mémoire ou permissions parallèles. */
export function ClassicFridge({
  items,
  onChange,
  onBack,
  onNavigate,
  onSelectWorld,
  titleRef,
}: {
  items: FridgeItem[];
  onChange: (items: FridgeItem[]) => void;
  onBack: () => void;
  onNavigate: (id: NavigationId) => void;
  onSelectWorld: (id: string) => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const [view, setView] = useState<View | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FridgeCategory | "all">("all");
  const [recipe, setRecipe] = useState<FridgeRecipe>(fridgeRecipes[0]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [week, setWeek] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSnapshots, setSavedSnapshots] = useState<Set<string>>(() => new Set());
  const savingRef = useRef(false);
  const [still, setStill] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const trigger = useRef<HTMLElement | null>(null);
  const available = items.filter((item) => !item.toBuy);
  const shopping = items.filter((item) => item.toBuy);
  const possible = fridgeRecipes.filter((item) => missingIngredients(item, items).length === 0);
  const shown = fridgeRecipes.filter((item) => !favoritesOnly || favorites.includes(item.id));
  const filtered = items.filter(
    (item) =>
      (category === "all" || (item.category ?? "other") === category) &&
      item.name.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")),
  );
  const weekText = weekDays
    .filter((day) => week[day])
    .map((day) => `${day} : ${fridgeRecipes.find((item) => item.id === week[day])?.title ?? ""}`)
    .join("\n");
  const currentSnapshot = view === "week" ? weekText : shoppingText(items);
  const snapshotKey = `${view === "week" ? "week" : "shopping"}:${currentSnapshot}`;
  const snapshotSaved = savedSnapshots.has(snapshotKey);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (view && dialog.current && !dialog.current.open) dialog.current.showModal();
    else if (!view && dialog.current?.open) dialog.current.close();
  }, [view]);
  function open(next: View) {
    if (!dialog.current?.open)
      trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice("");
    setView(next);
  }
  function close() {
    dialog.current?.close();
    setView(null);
    trigger.current?.focus({ preventScroll: true });
  }
  function chooseRecipe(item: FridgeRecipe) {
    setRecipe(item);
    open("recipe");
  }
  function toggleBought(item: FridgeItem) {
    onChange(items.map((value) => (value.id === item.id ? { ...value, toBuy: !value.toBuy } : value)));
    setNotice(item.toBuy ? `${item.name} remis en stock.` : `${item.name} ajouté aux courses.`);
  }
  function addMissing(item: FridgeRecipe) {
    const next = addRecipeShopping(item, items);
    onChange(next.items);
    setNotice(
      next.full
        ? "La limite de 100 produits est atteinte. Certains ingrédients n’ont pas pu être ajoutés."
        : next.added
          ? `${next.added} ingrédient(s) ajouté(s) aux courses, sans doublon.`
          : "Les ingrédients manquants sont déjà dans la liste, ou tout est renseigné.",
    );
  }
  async function saveTask() {
    if (savingRef.current || !currentSnapshot || snapshotSaved) return;
    const snapshot = currentSnapshot;
    const savedKey = snapshotKey;
    const isWeek = view === "week";
    const description = `${snapshot}\n\nListe préparée manuellement dans IDA Home. Vérifier quantités et produits avant achat.`;
    if (description.length > 4000) {
      setNotice("Cette liste dépasse la taille d’une tâche. Télécharge-la en texte pour la conserver intégralement.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setNotice("");
    try {
      await createTask({ title: isWeek ? "Repas · Ma semaine" : "Courses · Mon frigo", description });
      if (alive.current) {
        setSavedSnapshots((current) => new Set([...current, savedKey]));
        setNotice("Copie enregistrée dans vos tâches IDA. Aucun achat effectué.");
      }
    } catch (error) {
      if (alive.current)
        setNotice(
          error instanceof IdaApiError
            ? error.message
            : "Enregistrement indisponible. Votre brouillon est conservé à l’écran.",
        );
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }
  function downloadList() {
    const blob = new Blob([`IDA HOME — LISTE DE COURSES\n\n${shoppingText(items)}\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ida-courses.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Liste préparée pour téléchargement.");
  }
  return (
    <section
      className="environment-screen classic-fridge"
      data-still={still}
      data-surface={still ? "solid" : "glass"}
      aria-labelledby="classic-fridge-title"
      style={{ "--environment-image": 'url("/design/user-20260909/fridge-classic-v1.png")' } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !view) {
          event.preventDefault();
          onBack();
        }
      }}
    >
      <aside className="cf-sidebar">
        <button className="cf-brand" type="button" onClick={onBack} aria-label="Retour à IDA Home">
          ida<span aria-hidden="true">◒</span>
        </button>
        <nav aria-label="Navigation de la cuisine">
          <button type="button" onClick={onBack}>
            <Icon name="home" />
            Accueil
          </button>
          <button type="button" onClick={() => onNavigate("ida")}>
            <Icon name="chat" />
            Chat
          </button>
          <button type="button" onClick={() => onSelectWorld("music")}>
            <span aria-hidden="true">♫</span>Musique
          </button>
          <button type="button" onClick={() => onSelectWorld("travel")}>
            <span aria-hidden="true">↗</span>Voyages
          </button>
          <button
            type="button"
            aria-current="page"
            onClick={() => {
              setCategory("all");
              setQuery("");
              open("inventory");
            }}
          >
            <Icon name="fridge" />
            Nutrition
          </button>
          <button type="button" onClick={() => onSelectWorld("health")}>
            <Icon name="heart" />
            Sport & bien-être
          </button>
          <button type="button" onClick={() => onNavigate("tasks")}>
            <Icon name="files" />
            Projets
          </button>
        </nav>
        <p className="cf-sidebar-note">
          <span aria-hidden="true">♡</span>Un quotidien plus simple.<small>IDA HOME / CUISINE</small>
        </p>
        <button className="cf-motion" type="button" aria-pressed={still} onClick={() => setStill(!still)}>
          {still ? "Réactiver les reflets" : "Mettre les reflets en pause"}
        </button>
      </aside>
      <main className="cf-main">
        <div className="cf-hero">
          <header className="cf-heading">
            <h1 id="classic-fridge-title" ref={titleRef} tabIndex={-1}>
              Mon frigo
            </h1>
            <p>Tout ce que tu as, bien organisé.</p>
            <button className="cf-organize" type="button" onClick={() => open("organize")}>
              <Icon name="idea" />
              Aide-moi à organiser
            </button>
          </header>
          <form
            className="cf-search"
            onSubmit={(event) => {
              event.preventDefault();
              setCategory("all");
              open("inventory");
            }}
          >
            <Icon name="search" />
            <label className="sr-only" htmlFor="cf-search">
              Rechercher un aliment
            </label>
            <input
              id="cf-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chercher un aliment (ex. : yaourt, poulet…)"
              maxLength={100}
            />
            <button type="submit" aria-label="Chercher dans mon inventaire">
              <Icon name="arrow" />
            </button>
            <button type="button" aria-label="Ajouter manuellement un aliment" onClick={() => open("edit")}>
              <Icon name="plus" />
            </button>
          </form>
          <nav className="cf-shelves" aria-label="Rayons du frigo">
            {fridgeCategories.map((item) => (
              <button
                key={item.id}
                type="button"
                data-category={item.id}
                onClick={() => {
                  setCategory(item.id);
                  setQuery("");
                  open("inventory");
                }}
              >
                <span>{item.label}</span>
                <strong>{available.filter((value) => (value.category ?? "other") === item.id).length}</strong>
              </button>
            ))}
          </nav>
          <aside className="cf-welcome cf-glass">
            <header>
              <span aria-hidden="true">☼</span>
              <div>
                <h2>Bonjour !</h2>
                <p>On cuisine quoi aujourd’hui ?</p>
              </div>
            </header>
            <button
              className="cf-recipe-count"
              type="button"
              onClick={() =>
                document.getElementById("cf-recipes")?.scrollIntoView({ block: "start", behavior: "auto" })
              }
            >
              <span>
                <strong>
                  {possible.length ? `${possible.length} recette(s) avec tes ingrédients` : "Une envie pour ce soir ?"}
                </strong>
                <small>
                  {items.length
                    ? "D’après les noms saisis. Quantités à vérifier."
                    : "Ajoute tes aliments pour trouver les recettes correspondantes."}
                </small>
              </span>
              <Icon name="arrow" />
            </button>
          </aside>
          <section className="cf-shopping-preview cf-glass">
            <header>
              <Icon name="bag" />
              <h2>Liste de courses</h2>
              <span>{shopping.length}</span>
            </header>
            {shopping.length ? (
              <ul>
                {shopping.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    <label>
                      <input type="checkbox" checked={false} onChange={() => toggleBought(item)} />
                      <span>{item.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Ta liste est vide. Ajoute les ingrédients manquants depuis une recette.</p>
            )}
            <button className="cf-green" type="button" onClick={() => open("shopping")}>
              Voir la liste complète
              <Icon name="arrow" />
            </button>
          </section>
          <p className="cf-speech cf-glass">
            Avec ce que tu as,
            <br />
            on peut imaginer
            <br />
            de délicieux repas ! <span aria-hidden="true">♥</span>
          </p>
          <p className="cf-draft">Décor illustré · {available.length} aliment(s) saisi(s) · brouillon temporaire</p>
        </div>
        <section id="cf-recipes" className="cf-recipes cf-glass" aria-labelledby="cf-recipes-title">
          <header>
            <h2 id="cf-recipes-title">
              {items.length ? "Recettes avec ce que tu as" : "Quelques idées pour commencer"}
            </h2>
            <button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>
              {favoritesOnly ? "Voir toutes les recettes" : `Mes favoris (${favorites.length})`}
              <Icon name="heart" />
            </button>
          </header>
          <div className="cf-recipe-grid">
            {shown.map((item) => (
              <article className="cf-recipe-card" key={item.id}>
                <button type="button" className="cf-recipe-open" onClick={() => chooseRecipe(item)}>
                  <span
                    className="cf-recipe-photo"
                    style={{ "--recipe-x": `${(fridgeRecipes.indexOf(item) * 100) / 3}%` } as CSSProperties}
                  />
                  <strong>{item.title}</strong>
                  <small>
                    <Icon name="clock" />
                    {item.minutes} min · {item.difficulty}
                  </small>
                  <span className="cf-missing">
                    {missingIngredients(item, items).length
                      ? `${missingIngredients(item, items).length} ingrédient(s) à compléter`
                      : "Ingrédients renseignés"}
                  </span>
                </button>
                <button
                  className="cf-favorite"
                  type="button"
                  aria-label={`${favorites.includes(item.id) ? "Retirer" : "Ajouter"} ${item.title} ${favorites.includes(item.id) ? "des" : "aux"} favoris`}
                  aria-pressed={favorites.includes(item.id)}
                  onClick={() =>
                    setFavorites((values) =>
                      values.includes(item.id) ? values.filter((value) => value !== item.id) : [...values, item.id],
                    )
                  }
                >
                  <Icon name="heart" />
                </button>
              </article>
            ))}
          </div>
          {favoritesOnly && !shown.length ? (
            <p>
              Aucun favori pour le moment. Utilise le cœur d’une recette pour la retrouver ici pendant cette visite.
            </p>
          ) : null}
        </section>
        <nav className="cf-quick-actions" aria-label="Actions du frigo">
          <button type="button" onClick={() => open("scan")}>
            <span>
              <Icon name="scan" />
            </span>
            Scanner un ticket
            <br />
            de courses<small>À connecter</small>
          </button>
          <button type="button" onClick={() => open("edit")}>
            <span>
              <Icon name="plus" />
            </span>
            Ajouter manuellement
            <br />
            un aliment
          </button>
          <button type="button" onClick={() => open("week")}>
            <span>
              <Icon name="calendar" />
            </span>
            Idées de repas
            <br />
            pour la semaine
          </button>
          <button type="button" onClick={() => open("shopping")}>
            <span>
              <Icon name="bag" />
            </span>
            Organiser
            <br />
            mes courses
          </button>
          <button type="button" onClick={() => onSelectWorld("health")}>
            <span>
              <Icon name="heart" />
            </span>
            Retrouver
            <br />
            mes objectifs Care
          </button>
        </nav>
        <footer className="cf-footer">
          <p>
            Inventaire, favoris et repas restent un brouillon de cette visite. Enregistre une copie de tes listes dans
            les tâches IDA avant de quitter ce monde.
          </p>
          <p>
            Recettes illustratives, non personnalisées médicalement. Vérifie les allergies, la fraîcheur et les
            quantités ; aucun scan ni appareil connecté.
          </p>
          <p role="status">{view ? "" : notice}</p>
        </footer>
      </main>
      <dialog
        ref={dialog}
        className="cf-dialog"
        aria-labelledby="cf-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => setView(null)}
      >
        <header>
          <div>
            <p>IDA HOME / CUISINE</p>
            <h2 id="cf-dialog-title">{view === "recipe" ? recipe.title : view ? titles[view] : "Mon frigo"}</h2>
          </div>
          <button type="button" aria-label="Fermer le panneau" onClick={close}>
            ×
          </button>
        </header>
        {view === "edit" ? <FridgePanel items={items} onChange={onChange} compact /> : null}
        {view === "inventory" ? (
          <>
            <div className="cf-filters">
              <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>
                Tout ({items.length})
              </button>
              {fridgeCategories.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={category === item.id}
                  onClick={() => setCategory(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="cf-filter-search">
              Chercher
              <input type="search" value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} />
            </label>
            {filtered.length ? (
              <ul className="cf-inventory-list">
                {filtered.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.quantity || "Quantité non précisée"} · {item.toBuy ? "À racheter" : "En stock (saisie)"}
                      </small>
                    </div>
                    <button type="button" onClick={() => toggleBought(item)}>
                      {item.toBuy ? "Remettre en stock" : "À racheter"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucun aliment dans cette sélection. Les produits du décor ne sont pas ajoutés automatiquement.</p>
            )}
            <button className="cf-green" type="button" onClick={() => open("edit")}>
              <Icon name="plus" />
              Ajouter ou gérer les aliments
            </button>
          </>
        ) : null}
        {view === "shopping" ? (
          <>
            <p>Coche un produit acheté pour le remettre en stock. Aucune commande n’est passée.</p>
            {shopping.length ? (
              <ul className="cf-inventory-list">
                {shopping.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input type="checkbox" checked={false} onChange={() => toggleBought(item)} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.quantity || "Quantité à préciser"}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucun produit à racheter pour le moment.</p>
            )}
            <div className="cf-actions">
              <button type="button" disabled={!shopping.length} onClick={downloadList}>
                Télécharger la liste
              </button>
              <button
                className="cf-green"
                type="button"
                disabled={!currentSnapshot || saving || snapshotSaved}
                onClick={() => void saveTask()}
              >
                {saving
                  ? "Enregistrement…"
                  : currentSnapshot && snapshotSaved
                    ? "Copie enregistrée"
                    : "Enregistrer dans mes tâches"}
              </button>
              <button type="button" onClick={() => onNavigate("tasks")}>
                Ouvrir mes tâches →
              </button>
            </div>
          </>
        ) : null}
        {view === "recipe" ? (
          <>
            <div
              className="cf-recipe-detail-photo cf-recipe-photo"
              style={{ "--recipe-x": `${(fridgeRecipes.indexOf(recipe) * 100) / 3}%` } as CSSProperties}
            />
            <p>
              Pour 2 personnes · environ {recipe.minutes} minutes · {recipe.difficulty}
            </p>
            <h3>Ingrédients</h3>
            <ul className="cf-ingredients">
              {recipe.ingredients.map((item) => (
                <li key={item.name}>
                  <span>
                    {item.name}
                    <small>{item.quantity}</small>
                  </span>
                  <strong>{missingIngredients(recipe, items).includes(item) ? "À compléter" : "Nom présent"}</strong>
                </li>
              ))}
            </ul>
            <p className="cf-hint">
              La correspondance utilise les noms, pas les quantités. Huile, eau et assaisonnements de base à vérifier
              séparément.
            </p>
            <button className="cf-green" type="button" onClick={() => addMissing(recipe)}>
              <Icon name="bag" />
              Ajouter les ingrédients manquants
            </button>
            <h3>Préparation</h3>
            <ol className="cf-steps">
              {recipe.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p>Allergènes : {recipe.allergens} Vérifie toujours les étiquettes.</p>
            <button type="button" onClick={() => open("shopping")}>
              Ouvrir ma liste de courses →
            </button>
          </>
        ) : null}
        {view === "week" ? (
          <>
            <p>Choisis librement une idée par jour. Cette liste n’est pas un programme nutritionnel.</p>
            <div className="cf-week">
              {weekDays.map((day) => (
                <label key={day}>
                  {day}
                  <select
                    value={week[day] ?? ""}
                    onChange={(event) => setWeek((current) => ({ ...current, [day]: event.target.value }))}
                  >
                    <option value="">Pas encore choisi</option>
                    {fridgeRecipes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              className="cf-green"
              type="button"
              disabled={!currentSnapshot || saving || snapshotSaved}
              onClick={() => void saveTask()}
            >
              {saving
                ? "Enregistrement…"
                : currentSnapshot && snapshotSaved
                  ? "Copie enregistrée"
                  : "Enregistrer ma semaine dans les tâches"}
            </button>
          </>
        ) : null}
        {view === "organize" ? (
          <>
            <p>
              {available.length} aliment(s) renseigné(s) en stock et {shopping.length} produit(s) à racheter.
            </p>
            <ul className="cf-organize-list">
              {fridgeCategories.map((item) => (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <strong>{available.filter((value) => (value.category ?? "other") === item.id).length}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setCategory(item.id);
                      setQuery("");
                      open("inventory");
                    }}
                  >
                    Voir le rayon →
                  </button>
                </li>
              ))}
            </ul>
            <p>
              Les rayons sont ceux choisis lors de l’ajout. Aucune détection automatique, mesure de température ou date
              de péremption n’est disponible.
            </p>
            <button className="cf-green" type="button" onClick={() => open("edit")}>
              Compléter mon inventaire
            </button>
          </>
        ) : null}
        {view === "scan" ? (
          <>
            <Icon name="scan" />
            <p>
              La lecture des tickets n’est pas encore connectée. Le bouton n’active ni caméra, ni microphone, ni envoi
              de fichier.
            </p>
            <button className="cf-green" type="button" onClick={() => open("edit")}>
              Saisir les produits de mon ticket
            </button>
          </>
        ) : null}
        <p className="cf-feedback" role="status">
          {notice}
        </p>
      </dialog>
    </section>
  );
}
