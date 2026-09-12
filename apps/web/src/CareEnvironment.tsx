import { type RefObject, useRef, useState } from "react";
import { CareProfile } from "./CareProfile";
import type { NavigationId } from "./data";
import { LocalDialogue } from "./LocalDialogue";
import { LineIcon, Sheet } from "./ReferenceChrome";
import { ThemePicker } from "./ThemePicker";
import type { HomeTheme } from "./worlds";
import "./care-environment.css";

export const careSections = [
  { id: "profile", label: "Mon dossier", icon: "case", detail: "Personnalisation facultative, sans enregistrement" },
  {
    id: "conditions",
    label: "Pathologies",
    icon: "heart",
    detail: "Préparer les éléments à discuter avec votre médecin",
  },
  { id: "research", label: "Recherche", icon: "book", detail: "Rejoindre la bibliothèque et les outils Research" },
  { id: "analysis", label: "Analyses", icon: "gauge", detail: "Distinguer observations, hypothèses et preuves" },
  {
    id: "treatments",
    label: "Traitements",
    icon: "leaf",
    detail: "Préparer une consultation, sans modifier un traitement",
  },
  { id: "followup", label: "Suivi", icon: "music", detail: "Comprendre le futur suivi personnel" },
] as const;
type CareSection = (typeof careSections)[number]["id"];
type Panel = CareSection | "clinical" | "science" | "dialogue" | "settings" | null;
const teams = [
  {
    id: "clinical",
    title: "Team Clinique",
    subtitle: "PATIENT · SUIVI · QUALITÉ DE VIE",
    icon: "heart",
    members: ["Rhumatologie", "Dermatologie", "Neurologie"],
  },
  {
    id: "science",
    title: "Team Recherche",
    subtitle: "SCIENCE · DONNÉES · COMPRÉHENSION",
    icon: "globe",
    members: ["Recherche scientifique", "Littérature", "Data Science", "Synthèse"],
  },
] as const;
const panelCopy: Record<
  "conditions" | "analysis" | "treatments" | "followup",
  { title: string; text: string; items: string[] }
> = {
  conditions: {
    title: "Vos pathologies, votre dossier",
    text: "Aucune pathologie n’est enregistrée. Les exemples des maquettes ne sont pas votre dossier médical.",
    items: [
      "Rassembler les comptes rendus établis par vos soignants",
      "Noter les questions que vous souhaitez leur poser",
      "Prévoir un partage consenti avant tout import dans IDA",
    ],
  },
  analysis: {
    title: "Comprendre avant de conclure",
    text: "Aucune analyse clinique ou interprétation de résultat n’est exécutée dans cette version.",
    items: [
      "Observation : une donnée constatée et datée",
      "Source : une publication ou un document identifié",
      "Hypothèse : une piste, pas une conclusion",
      "Décision médicale : à discuter avec un professionnel",
    ],
  },
  treatments: {
    title: "Préparer votre prochaine consultation",
    text: "IDA n’a accès à aucune ordonnance. Ne modifiez pas un traitement à partir de cette interface.",
    items: [
      "Préparer la liste prescrite avec votre soignant",
      "Rassembler les questions sur la tolérance et le suivi",
      "Faire valider toute décision par le professionnel responsable",
    ],
  },
  followup: {
    title: "Un suivi à votre rythme",
    text: "Le suivi de santé sécurisé n’est pas encore connecté. Aucun indicateur, score ou historique médical n’est calculé.",
    items: [
      "Personnalisation corporelle : brouillon facultatif disponible",
      "Historique médical et courbes : non disponibles",
      "Alertes et rendez-vous médicaux : non connectés",
    ],
  },
};

/** Couche de navigation Care, sans simulation de dossier ni de service clinique. */
export function CareEnvironment({
  titleRef,
  theme,
  onThemeChange,
  onBack,
  onSelect,
  onNavigate,
}: {
  titleRef: RefObject<HTMLHeadingElement | null>;
  theme: HomeTheme;
  onThemeChange?: ((theme: HomeTheme) => void) | undefined;
  onBack: () => void;
  onSelect: (id: string) => void;
  onNavigate: (id: NavigationId) => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState("");
  const [motion, setMotion] = useState(true);
  const [showLab, setShowLab] = useState(false);
  const teamRef = useRef<HTMLDivElement>(null);
  const filtered = careSections.filter((item) =>
    `${item.label} ${item.detail}`
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .includes(
        query
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase()
          .trim(),
      ),
  );
  function open(id: CareSection) {
    if (id === "research") onSelect("research");
    else setPanel(id);
  }
  function laboratory() {
    setShowLab(true);
    teamRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
    teamRef.current?.focus({ preventScroll: true });
  }
  const activeTeam = teams.find((team) => team.id === panel);
  const copy = panel && panel in panelCopy ? panelCopy[panel as keyof typeof panelCopy] : null;
  return (
    <section
      className="environment-screen care-environment"
      data-care-theme={theme}
      data-lab={showLab}
      data-motion={motion && !panel}
      aria-label="Environnement IDA Care"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !panel && !event.defaultPrevented) {
          event.preventDefault();
          onBack();
        }
      }}
    >
      <aside className="care-rail">
        <button className="care-brand" type="button" onClick={onBack} aria-label="Retour à la roue des mondes">
          I D A<span>C A R E</span>
        </button>
        <p>
          SCIENCE
          <br />
          HUMANITY
          <br />
          LONGEVITY
        </p>
        <nav aria-label="Navigation IDA Care">
          <button type="button" onClick={onBack}>
            <LineIcon kind="home" />
            Accueil IDA
          </button>
          <button type="button" onClick={laboratory} aria-current="page">
            <LineIcon kind="agent" />
            Laboratoire
          </button>
          {careSections.map((item) => (
            <button type="button" key={item.id} onClick={() => open(item.id)}>
              <LineIcon kind={item.icon} />
              {item.label}
            </button>
          ))}
          <button type="button" onClick={() => setPanel("clinical")}>
            <LineIcon kind="users" />
            Teams
          </button>
          <button type="button" onClick={() => setPanel("settings")}>
            <LineIcon kind="tool" />
            Paramètres
          </button>
        </nav>
        <p className="care-rail-footer">
          PRIVATE
          <br />
          CONSENTED
          <br />
          YOURS
        </p>
      </aside>
      <main className="care-main">
        <header className="care-topbar">
          <button type="button" className="care-back" onClick={onBack} aria-label="Retour aux mondes">
            ←
          </button>
          <label className="care-search">
            <LineIcon kind="search" />
            <span className="sr-only">Rechercher une rubrique Care</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={80}
              placeholder="Rechercher une rubrique Care…"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche">
                ×
              </button>
            )}
          </label>
          <button className="care-account" type="button" onClick={() => setPanel("profile")}>
            <span>A</span>
            <span>
              Votre espace<small>Profil facultatif</small>
            </span>
          </button>
          <button
            type="button"
            className="care-gear"
            onClick={() => setPanel("settings")}
            aria-label="Personnaliser Care"
          >
            <LineIcon kind="sliders" />
          </button>
        </header>
        <section className="care-hero" aria-label="Accueil du laboratoire">
          <p className="care-mobile-brand">
            I D A<span>C A R E</span>
          </p>
          <div className="care-hero-heading">
            <p className="care-eyebrow">IDA CARE · MEDICAL RESEARCH CENTER</p>
            <h1 ref={titleRef} tabIndex={-1}>
              Votre laboratoire
              <br />
              personnel.
            </h1>
            <p>
              Des données comprises.
              <br />
              Une vie plus libre.
            </p>
            <button type="button" className="care-enter" onClick={laboratory}>
              Entrer dans le laboratoire <span>→</span>
            </button>
          </div>
          <blockquote>
            « Comprendre aujourd’hui
            <br />
            pour mieux vivre demain. »
          </blockquote>
          <span className="care-illustration">Laboratoire illustré · aucun scan corporel</span>
        </section>
        <nav className="care-shortcuts" aria-label="Rubriques du laboratoire">
          {filtered.map((item) => (
            <button type="button" key={item.id} onClick={() => open(item.id)}>
              <LineIcon kind={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        {query && (
          <p className="care-search-result" role="status">
            {filtered.length} rubrique{filtered.length > 1 ? "s" : ""} correspondante{filtered.length > 1 ? "s" : ""}.
          </p>
        )}
        <div className="care-teams" ref={teamRef} tabIndex={-1}>
          {teams.map((team) => (
            <section className="care-glass care-team" key={team.id}>
              <header>
                <div>
                  <h2>{team.title}</h2>
                  <p>{team.subtitle}</p>
                </div>
                <LineIcon kind={team.icon} />
              </header>
              <p className="care-team-state">Rôles prévus · non activés</p>
              {team.members.map((member) => (
                <button className="care-member" type="button" key={member} onClick={() => setPanel(team.id)}>
                  <span className="care-member-icon">
                    <LineIcon kind={team.icon} />
                  </span>
                  <span>
                    {member}
                    <small>Découvrir le rôle et ses limites</small>
                  </span>
                  <span>↗</span>
                </button>
              ))}
              <button type="button" className="care-team-link" onClick={() => setPanel(team.id)}>
                Voir l’équipe {team.id === "clinical" ? "clinique" : "recherche"} <span>→</span>
              </button>
            </section>
          ))}
        </div>
        <div className="care-summary">
          <section className="care-glass care-record">
            <header>
              <h2>Mon dossier & pathologies</h2>
              <LineIcon kind="case" />
            </header>
            <p>Un espace à construire avec vous.</p>
            <div className="care-empty-record">
              <LineIcon kind="heart" />
              <span>
                Aucun dossier médical enregistré<small>Vos informations restent sous votre contrôle.</small>
              </span>
            </div>
            <button type="button" onClick={() => setPanel("profile")}>
              Personnaliser mon profil →
            </button>
          </section>
          <section className="care-glass">
            <header>
              <h2>Recherche & connaissances</h2>
              <LineIcon kind="book" />
            </header>
            <p>Retrouvez les outils de bibliothèque, de notes et de recherche manuelle.</p>
            <button className="care-research-row" type="button" onClick={() => onSelect("research")}>
              <LineIcon kind="search" />
              Ouvrir IDA Research <span>→</span>
            </button>
            <small>Pas de recherche clinique automatique en cours.</small>
          </section>
          <section className="care-glass">
            <header>
              <h2>Objectifs & suivi</h2>
              <LineIcon kind="gauge" />
            </header>
            <p>Aucune tendance de santé calculée. Le suivi sécurisé reste à connecter.</p>
            <button type="button" onClick={() => setPanel("followup")}>
              Voir les possibilités →
            </button>
            <button type="button" onClick={() => onNavigate("tasks")}>
              Ouvrir mes tâches générales →
            </button>
          </section>
        </div>
        <p className="care-safety">
          Interface de préparation · ne remplace pas un professionnel de santé. Aucun diagnostic, équipe clinique active
          ou dossier connecté.
        </p>
        <nav className="care-dock" aria-label="Navigation rapide Care">
          <button type="button" onClick={onBack}>
            <LineIcon kind="home" />
            <span>Accueil</span>
          </button>
          <button type="button" onClick={laboratory} aria-current="page">
            <LineIcon kind="agent" />
            <span>Laboratoire</span>
          </button>
          <button className="care-voice" type="button" onClick={() => setPanel("dialogue")}>
            <span className="care-orb" aria-hidden="true" />
            <span>Parler à IDA</span>
          </button>
          <button type="button" onClick={() => onSelect("research")}>
            <LineIcon kind="book" />
            <span>Recherche</span>
          </button>
          <button type="button" onClick={() => setPanel("settings")}>
            <LineIcon kind="grid" />
            <span>Plus</span>
          </button>
        </nav>
      </main>
      {panel && (
        <Sheet
          title={
            activeTeam?.title ??
            copy?.title ??
            (panel === "profile"
              ? "Votre profil Care"
              : panel === "dialogue"
                ? "Dialoguer avec IDA"
                : "Personnaliser Care")
          }
          close={() => setPanel(null)}
        >
          {panel === "profile" && <CareProfile onComplete={() => setPanel(null)} />}
          {copy && (
            <div className="care-panel-copy">
              <p>{copy.text}</p>
              <ul>
                {copy.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <button type="button" onClick={() => setPanel("profile")}>
                Ouvrir le brouillon de personnalisation
              </button>
            </div>
          )}
          {activeTeam && (
            <div className="care-panel-copy">
              <p>
                Ces spécialités décrivent l’organisation prévue de Care. Aucun professionnel ou agent clinique n’est
                connecté.
              </p>
              <ul>
                {activeTeam.members.map((member) => (
                  <li key={member}>
                    <strong>{member}</strong> · rôle préparé, non exécutant
                  </li>
                ))}
              </ul>
              <p>
                Les futurs outils devront séparer vos observations, les sources, les hypothèses et les questions à
                soumettre à votre soignant. Aucune donnée de santé n’est envoyée depuis cet écran.
              </p>
              <button type="button" onClick={() => onSelect("research")}>
                Accéder aux outils Research existants →
              </button>
            </div>
          )}
          {panel === "dialogue" && (
            <>
              <p className="care-panel-copy">
                Dialogue général local, pas une consultation médicale. Le profil Care n’est pas transmis au modèle.
              </p>
              <LocalDialogue />
            </>
          )}
          {panel === "settings" && (
            <div className="care-panel-copy">
              <h3>Votre ambiance</h3>
              {onThemeChange && <ThemePicker value={theme} onChange={onThemeChange} />}
              <button type="button" aria-pressed={motion} onClick={() => setMotion(!motion)}>
                {motion ? "Suspendre les reflets animés" : "Activer les reflets animés"}
              </button>
              <h3>Vos données</h3>
              <p>
                Le profil est un brouillon éphémère. Il n’existe pas de sauvegarde médicale, d’analyse ou de capteur
                activé en arrière-plan.
              </p>
              <button type="button" onClick={() => setPanel("profile")}>
                Gérer mon brouillon →
              </button>
            </div>
          )}
        </Sheet>
      )}
    </section>
  );
}
