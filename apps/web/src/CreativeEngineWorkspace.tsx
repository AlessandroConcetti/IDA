import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type CreativeKind,
  type CreativeProject,
  type CreativeProjectDetail,
  creativeInputSchemas,
  creativeSections,
} from "../../../packages/contracts/src/creative-engine";
import { IdaApiError } from "./api-transport";
import { fetchCreativeDetail, fetchCreativeProjects, saveCreativeRecord } from "./creative-engine-api";
import { creativeDossierExport } from "./creative-engine-export";
import { LineIcon } from "./ReferenceChrome";
import "./creative-engine.css";

type Section = (typeof creativeSections)[number]["key"];
const states = { TODO: "À préparer", IN_PROGRESS: "En cours", DONE: "Terminé", CANCELLED: "Annulé" };
const message = (error: unknown) =>
  error instanceof IdaApiError
    ? error.message
    : "Les données n’ont pas pu être validées. Réessayez sans perdre votre saisie.";

function RecordForm({
  kind,
  detail,
  busy,
  onSave,
}: {
  kind: CreativeKind;
  detail: CreativeProjectDetail;
  busy: boolean;
  onSave: (kind: CreativeKind, input: unknown) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const get = (name: string) => String(data.get(name) ?? "").trim();
    const lines = (name: string) =>
      get(name)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    const body =
      kind === "references"
        ? { title: get("title"), ...(get("url") ? { url: get("url") } : {}), notes: get("notes") }
        : kind === "plans"
          ? { title: get("title"), steps: lines("steps"), acceptanceCriteria: lines("criteria") }
          : kind === "notes"
            ? { content: get("content") }
            : { planId: get("planId"), decision: get("decision"), note: get("note") };
    const parsed = creativeInputSchemas[kind].safeParse(body);
    if (!parsed.success) {
      setError(
        "Vérifiez les champs : URL HTTPS sans identifiants, 12 étapes et critères maximum, 300 caractères par ligne.",
      );
      return;
    }
    setError("");
    if (await onSave(kind, parsed.data)) form.reset();
  }
  if (kind === "reviews" && detail.plans.length === 0) return <p>Enregistrez un plan avant de consigner sa revue.</p>;
  return (
    <form className="creative-form" onSubmit={(event) => void submit(event)}>
      <h3>
        {kind === "references"
          ? "Ajouter une référence"
          : kind === "plans"
            ? "Préparer un plan"
            : kind === "notes"
              ? "Consigner une note"
              : "Consigner une revue"}
      </h3>
      <p>Aucune donnée sensible ni secret. Enregistrement partagé dans votre workspace IDA actuel.</p>
      <fieldset disabled={busy}>
        {(kind === "references" || kind === "plans") && (
          <label>
            Titre
            <input name="title" required maxLength={160} />
          </label>
        )}
        {kind === "references" && (
          <>
            <label>
              URL de référence (facultatif)
              <input name="url" type="url" maxLength={1000} placeholder="https://…" />
            </label>
            <p>Le lien est enregistré comme texte. Aucun site n’est ouvert, téléchargé ou analysé automatiquement.</p>
            <label>
              Vos observations
              <textarea name="notes" required rows={4} maxLength={2000} />
            </label>
          </>
        )}
        {kind === "plans" && (
          <>
            <label>
              Étapes — une par ligne, 12 maximum
              <textarea name="steps" required rows={5} maxLength={3611} />
            </label>
            <label>
              Critères de réussite — un par ligne, 12 maximum
              <textarea name="criteria" required rows={4} maxLength={3611} />
            </label>
            <p>Une nouvelle saisie crée une version indépendante. Aucune étape n’est exécutée.</p>
          </>
        )}
        {kind === "notes" && (
          <label>
            Décision, contexte ou point à retenir
            <textarea name="content" required rows={6} maxLength={2000} />
          </label>
        )}
        {kind === "reviews" && (
          <>
            <label>
              Plan examiné
              <select name="planId">
                {detail.plans.map((p, index) => (
                  <option key={p.id} value={p.id}>
                    {index + 1}. {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Constat documentaire
              <select name="decision">
                <option value="REVIEWED">Relu — sans autorisation d’exécution</option>
                <option value="CHANGES_REQUESTED">Modifications demandées</option>
              </select>
            </label>
            <label>
              Commentaire de revue
              <textarea name="note" required maxLength={1000} rows={4} />
            </label>
            <p>Cette revue ne remplace pas une approbation du Tool Gateway et n’autorise aucune publication.</p>
          </>
        )}
        <button type="submit">{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function CreativeEngineWorkspace({
  onClose,
  onCreateProject,
}: {
  onClose: () => void;
  onCreateProject: () => void;
}) {
  const [section, setSection] = useState<Section>("projects");
  const [projects, setProjects] = useState<CreativeProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [detail, setDetail] = useState<CreativeProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const epoch = useRef(0);
  const writing = useRef(false);
  const alive = useRef(true);
  const selectedSection = creativeSections.find((item) => item.key === section) ?? creativeSections[0];
  useEffect(() => {
    alive.current = true;
    heading.current?.focus();
    return () => {
      alive.current = false;
      epoch.current++;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++epoch.current;
    setLoading(true);
    setError("");
    setDetail(null);
    void fetchCreativeProjects(controller.signal)
      .then(async (rows) => {
        if (current !== epoch.current) return;
        setProjects(rows);
        if (projectId) {
          const record = await fetchCreativeDetail(projectId, controller.signal);
          if (current === epoch.current) setDetail(record);
        }
      })
      .catch((failure) => {
        if (current === epoch.current) {
          setProjects([]);
          setError(message(failure));
        }
      })
      .finally(() => {
        if (current === epoch.current) setLoading(false);
      });
    return () => {
      epoch.current++;
      controller.abort();
    };
  }, [projectId, revision]);
  function navigate(next: Section) {
    setSection(next);
    setNotice("");
  }
  async function save(kind: CreativeKind, body: unknown) {
    if (writing.current || !detail || loading || error) return false;
    writing.current = true;
    setBusy(true);
    setNotice("");
    const current = epoch.current;
    let saved = false;
    try {
      await saveCreativeRecord(detail.project.id, kind, body);
      saved = true;
      const updated = await fetchCreativeDetail(detail.project.id);
      if (alive.current && current === epoch.current) {
        setDetail(updated);
        setNotice("Enregistré dans IDA. Rien n’a été exécuté ou envoyé à un fournisseur.");
      }
      return true;
    } catch (failure) {
      if (alive.current && current === epoch.current)
        setNotice(
          saved
            ? "Enregistrement confirmé, mais actualisation impossible. Actualisez le dossier ; ne recréez pas l’entrée."
            : `${message(failure)} Une nouvelle tentative identique ne crée pas de doublon.`,
        );
      return saved;
    } finally {
      writing.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function download(format: "json" | "markdown") {
    if (!detail) return;
    const url = URL.createObjectURL(
      new Blob([creativeDossierExport(detail, format)], {
        type: format === "json" ? "application/json" : "text/markdown;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `ida-dossier.${format === "json" ? "json" : "md"}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Export demandé au navigateur. Aucun artefact généré par IA et aucun envoi externe.");
  }
  const editable = section === "references" || section === "plans" || section === "notes" || section === "reviews";
  return (
    <section className="environment-screen creative-workspace" aria-label="IDA Creative Engine">
      <header className="creative-header">
        <div>
          <p>LA FABRIQUE / ESPACE DE CONCEPTION</p>
          <h1 ref={heading} tabIndex={-1}>
            IDA Creative Engine
          </h1>
        </div>
        <button type="button" onClick={onClose} disabled={busy}>
          ← Retour à La Fabrique
        </button>
      </header>
      <div className="creative-layout">
        <nav className="creative-tree" aria-label="Arborescence Creative Engine">
          {creativeSections.map((item) => (
            <button
              type="button"
              key={item.key}
              aria-current={section === item.key ? "page" : undefined}
              disabled={busy}
              onClick={() => navigate(item.key)}
            >
              <LineIcon kind={item.icon} />
              <span>{item.label}</span>
              <small>{item.state}</small>
            </button>
          ))}
        </nav>
        <main className="creative-content">
          <header className="creative-section-header">
            <div>
              <span className="creative-state">{selectedSection.state}</span>
              <h2>{selectedSection.label}</h2>
              <p>{selectedSection.detail}</p>
            </div>
            <button type="button" disabled={busy || loading} onClick={() => setRevision((r) => r + 1)}>
              Actualiser
            </button>
          </header>
          {loading && <p role="status">Chargement du workspace…</p>}
          {error && <p role="alert">{error} Les données ne sont pas déclarées vides : elles sont indisponibles.</p>}
          {!loading && !error && (
            <>
              <div className="creative-project-picker">
                <label>
                  Dossier de conception
                  <select
                    value={projectId}
                    disabled={busy}
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      setNotice("");
                    }}
                  >
                    <option value="">Choisir un dossier</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title.replace(/^Fabrique · /u, "")}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={busy} onClick={onCreateProject}>
                  Nouveau brief +
                </button>
              </div>
              {section === "projects" && (
                <div className="creative-cards">
                  {projects.map((p) => (
                    <button type="button" className="creative-card" key={p.id} onClick={() => setProjectId(p.id)}>
                      <LineIcon kind="case" />
                      <strong>{p.title.replace(/^Fabrique · /u, "")}</strong>
                      <small>{states[p.status]} · conception uniquement</small>
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <p>
                      Aucun dossier. Créez votre premier brief pour commencer ; aucun projet de démonstration n’est
                      ajouté.
                    </p>
                  )}
                </div>
              )}
              {section === "projects" && detail && (
                <article className="creative-card">
                  <h3>{detail.project.title}</h3>
                  <p className="creative-text">{detail.project.description}</p>
                  <div className="creative-actions">
                    <button type="button" onClick={() => navigate("references")}>
                      Documenter une référence →
                    </button>
                    <button type="button" onClick={() => navigate("plans")}>
                      Préparer le plan →
                    </button>
                  </div>
                </article>
              )}
              {editable && !detail && <p>Choisissez un dossier pour consulter ou enregistrer ses éléments.</p>}
              {editable && detail && (
                <>
                  <div className="creative-records">
                    {section === "references" &&
                      detail.references.map((r) => (
                        <article className="creative-card" key={r.id}>
                          <h3>{r.title}</h3>
                          {r.url && <p className="creative-source">{r.url}</p>}
                          <p className="creative-text">{r.notes}</p>
                        </article>
                      ))}
                    {section === "plans" &&
                      detail.plans.map((p, index) => (
                        <article className="creative-card" key={p.id}>
                          <h3>
                            {index + 1}. {p.title}
                          </h3>
                          <ol>
                            {p.steps.map((s, i) => (
                              <li key={`${i}-${s}`}>{s}</li>
                            ))}
                          </ol>
                          <h4>Critères de réussite</h4>
                          <ul>
                            {p.acceptanceCriteria.map((s, i) => (
                              <li key={`${i}-${s}`}>{s}</li>
                            ))}
                          </ul>
                          <small>Version documentaire immuable · {new Date(p.createdAt).toLocaleString("fr-FR")}</small>
                        </article>
                      ))}
                    {section === "notes" &&
                      detail.notes.map((n) => (
                        <article className="creative-card" key={n.id}>
                          <p className="creative-text">{n.content}</p>
                          <small>{new Date(n.createdAt).toLocaleString("fr-FR")}</small>
                        </article>
                      ))}
                    {section === "reviews" &&
                      detail.reviews.map((r) => (
                        <article className="creative-card" key={r.id}>
                          <h3>{detail.plans.find((p) => p.id === r.planId)?.title ?? "Plan"}</h3>
                          <strong>
                            {r.decision === "REVIEWED"
                              ? "Relu — sans autorisation d’exécution"
                              : "Modifications demandées"}
                          </strong>
                          <p className="creative-text">{r.note}</p>
                        </article>
                      ))}
                    {detail[section].length === 0 && <p>Aucun élément enregistré dans cette rubrique.</p>}
                  </div>
                  <RecordForm
                    key={`${projectId}-${section}`}
                    kind={section}
                    detail={detail}
                    busy={busy}
                    onSave={save}
                  />
                </>
              )}
              {section === "agents" && (
                <div className="creative-cards">
                  {[
                    "Analyse produit / référence",
                    "Architecture logicielle",
                    "Construction logicielle",
                    "Qualité / vérification",
                    "Gouvernance créative",
                  ].map((role) => (
                    <article className="creative-card" key={role}>
                      <span className="creative-state">PLANNED</span>
                      <h3>{role}</h3>
                      <p>
                        Rôle proposé, non enregistré comme agent actif. Outils et contexte à valider avant invocation.
                      </p>
                    </article>
                  ))}
                </div>
              )}
              {section === "workflows" && (
                <div className="creative-cards">
                  {[
                    { key: "references", label: "1. Documenter" },
                    { key: "plans", label: "2. Planifier" },
                    { key: "reviews", label: "3. Relire" },
                    { key: "artifacts", label: "4. Exporter" },
                  ].map((step) => (
                    <button
                      type="button"
                      key={step.key}
                      className="creative-card"
                      onClick={() => navigate(step.key as Section)}
                    >
                      {step.label} →
                    </button>
                  ))}
                </div>
              )}
              {section === "providers" && (
                <div className="creative-cards">
                  {["Image locale · sd.cpp", "Vidéo locale · Wan2GP"].map((provider) => (
                    <article className="creative-card" key={provider}>
                      <span className="creative-state">NEEDS REVIEW</span>
                      <h3>{provider}</h3>
                      <p>
                        Installation, modèle, licence, isolation réseau et budget matériel à valider. Aucun moteur
                        créatif branché.
                      </p>
                    </article>
                  ))}
                  <article className="creative-card">
                    <h3>MuAPI exclu</h3>
                    <p>Aucune connexion, clé ni solution de repli vers MuAPI.</p>
                  </article>
                </div>
              )}
              {section === "jobs" && (
                <article className="creative-card">
                  <h3>Aucun job disponible</h3>
                  <p>
                    La création de dossiers ne lance aucun processus. Le runner et l’isolation des projets doivent être
                    validés.
                  </p>
                  <button type="button" disabled>
                    Exécution non activée
                  </button>
                </article>
              )}
              {section === "artifacts" && (
                <article className="creative-card">
                  <h3>Exporter votre dossier</h3>
                  <p>
                    Copie locale des informations réellement enregistrées. Ces exports ne sont pas des livrables
                    produits par un agent.
                  </p>
                  <div className="creative-actions">
                    <button type="button" disabled={!detail} onClick={() => download("markdown")}>
                      Télécharger Markdown
                    </button>
                    <button type="button" disabled={!detail} onClick={() => download("json")}>
                      Télécharger JSON
                    </button>
                  </div>
                </article>
              )}
            </>
          )}
          {notice && (
            <p className="creative-notice" role="status">
              {notice}
            </p>
          )}
          <footer>
            Conception manuelle · même API, mêmes permissions · aucune exécution ni installation · 200 éléments maximum
            par dossier
          </footer>
        </main>
      </div>
    </section>
  );
}
