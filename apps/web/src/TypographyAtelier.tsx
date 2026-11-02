import "@fontsource-variable/bodoni-moda";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/manrope";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/syne";
import { type CSSProperties, useEffect, useState } from "react";
import {
  type BrandId,
  brandIds,
  brandMeta,
  defaultTypography,
  duplicateOf,
  type FontId,
  fontIds,
  fonts,
  parseTypography,
  sameTypography,
  type TypographyConfig,
  typographyCss,
  typographyFontPackages,
} from "./typography-system";
import "./typography-atelier.css";

const key = "ida-fabrique-typography-drafts-v1";
type SavedDrafts = Record<BrandId, TypographyConfig>;

function freshDrafts(): SavedDrafts {
  return {
    "ida-studio": { ...defaultTypography["ida-studio"] },
    alessandro: { ...defaultTypography.alessandro },
    egeri: { ...defaultTypography.egeri },
    astromer: { ...defaultTypography.astromer },
  };
}

function readDrafts(): { drafts: SavedDrafts; error: string } {
  const defaults = freshDrafts();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { drafts: defaults, error: "" };
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input))
      return { drafts: defaults, error: "Sauvegarde invalide : préréglages rétablis." };
    const records = input as Record<string, unknown>;
    for (const id of brandIds) defaults[id] = parseTypography(records[id], id);
    return { drafts: defaults, error: "" };
  } catch {
    return {
      drafts: defaults,
      error: "Stockage indisponible : les modifications de cette session ne sont pas persistantes.",
    };
  }
}

function downloadFile(name: string, data: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TypographicSample({
  config,
  original,
  sampleText,
}: {
  config: TypographyConfig;
  original?: boolean;
  sampleText?: string;
}) {
  const info = brandMeta[config.brand];
  const style = {
    "--typo-display": fonts[config.display].stack,
    "--typo-body": fonts[config.body].stack,
    "--typo-spacing": `${config.tracking}em`,
    "--typo-size": `${config.scale * 4.2}rem`,
    "--typo-weight": config.weight,
    "--typo-case": config.uppercase ? "uppercase" : "none",
  } as CSSProperties;
  return (
    <article className={`typo-sample typo-brand-${config.brand}`} style={style}>
      <div className="typo-sample-eyebrow">{original ? "01 / PRÉRÉGLAGE DE RÉFÉRENCE" : "02 / PROPOSITION"}</div>
      <div className="typo-sample-content">
        <small>TYPOGRAPHY / CREATIVE DIRECTION</small>
        <h3 className={config.motion !== "none" && !original ? `typo-motion-${config.motion}` : ""}>
          {sampleText?.trim() || info.name}
        </h3>
        <p className="typo-sample-statement">{info.mood}</p>
        <p className="typo-sample-description">
          {info.description}. Un langage visuel propre à chaque identité, sans modèle standard imposé.
        </p>
      </div>
      <div className="typo-sample-footer">
        <span>Aa Bb Cc 0123456789</span>
        <span>{fonts[config.display].name}</span>
      </div>
    </article>
  );
}

export function TypographyAtelier({ onClose }: { onClose: () => void }) {
  const [brand, setBrand] = useState<BrandId>("ida-studio");
  const [saved, setSaved] = useState<SavedDrafts>(freshDrafts);
  const [pending, setPending] = useState<SavedDrafts>(freshDrafts);
  const [sampleText, setSampleText] = useState("");
  const draft = pending[brand];
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  const [showCompare, setShowCompare] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const restored = readDrafts();
    setSaved(restored.drafts);
    setPending(restored.drafts);
    setStorageError(restored.error);
    setReady(true);
  }, []);
  const duplicate = duplicateOf(draft, { ...saved, [brand]: draft });
  const modified = !sameTypography(draft, saved[brand]);
  const resetDiff = !sameTypography(draft, defaultTypography[brand]);
  const set = (next: Partial<TypographyConfig>) => {
    setPending((previous) => ({
      ...previous,
      [brand]: parseTypography({ ...previous[brand], ...next }, brand),
    }));
    setNotice("");
  };
  const chooseBrand = (next: BrandId) => {
    setBrand(next);
    setSampleText("");
    setNotice("");
  };
  function save() {
    if (!ready || duplicate) return;
    const next = { ...saved, [brand]: { ...draft } };
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSaved(next);
      setStorageError("");
      setNotice("Brouillon sauvegardé dans ce navigateur. Aucun site n’a été modifié ni publié.");
    } catch {
      setStorageError("Sauvegarde refusée par le navigateur. Exportez le JSON pour conserver vos choix.");
      setNotice("");
    }
  }
  function restore() {
    setPending((previous) => ({ ...previous, [brand]: { ...defaultTypography[brand] } }));
    setNotice("Préréglage d’origine rétabli dans l’aperçu. Cliquez sur Sauvegarder pour le conserver.");
  }
  function exportFile(format: "css" | "json") {
    if (duplicate) return;
    const file = `ida-typographie-${brand}`;
    const text =
      format === "css"
        ? typographyCss(draft)
        : JSON.stringify(
            {
              format: "ida-typography-v1",
              status: "design-proposal",
              requiresFontInstallation: typographyFontPackages(draft).length > 0,
              fontPackages: typographyFontPackages(draft),
              ...draft,
            },
            null,
            2,
          );
    downloadFile(
      `${file}.${format}`,
      text,
      format === "css" ? "text/css;charset=utf-8" : "application/json;charset=utf-8",
    );
    setNotice(
      "Export demandé. Aucun déploiement automatique. Ajouter les packages Fontsource exportés au site client avant publication.",
    );
  }
  return (
    <section className="environment-screen typography-atelier" aria-label="Atelier typographique IDA">
      <header className="typo-header">
        <div>
          <p className="typo-kicker">IDA STUDIO / LA FABRIQUE / DESIGN SYSTEM</p>
          <h1 tabIndex={-1}>
            Atelier typographique<span aria-hidden="true">.</span>
          </h1>
          <p>Une signature différente pour chaque marque. Prévisualisation locale, sans affecter les sites publiés.</p>
        </div>
        <button type="button" onClick={onClose}>
          ← Retour à La Fabrique
        </button>
      </header>
      <nav className="typo-brands" aria-label="Sélectionner une identité">
        {brandIds.map((id) => (
          <button type="button" key={id} aria-pressed={brand === id} onClick={() => chooseBrand(id)}>
            <span>{brandMeta[id].name}</span>
            <small>{brandMeta[id].description}</small>
          </button>
        ))}
      </nav>
      <div className="typo-workspace">
        <main className="typo-stage">
          <div className="typo-stage-heading">
            <div>
              <span className="typo-kicker">LIVE PREVIEW / ÉDITEUR LOCAL</span>
              <h2>
                {brandMeta[brand].name}
                {modified ? " · Modifié" : ""}
              </h2>
            </div>
            <label className="typo-toggle">
              <input type="checkbox" checked={showCompare} onChange={(event) => setShowCompare(event.target.checked)} />
              Comparer les versions
            </label>
          </div>
          <label className="typo-sample-input">
            Texte à tester
            <input
              type="text"
              maxLength={80}
              value={sampleText}
              placeholder="Saisissez votre futur titre de site"
              onChange={(event) => setSampleText(event.target.value)}
            />
          </label>
          <div className={`typo-previews${showCompare ? "" : " typo-single"}`}>
            {showCompare && <TypographicSample config={defaultTypography[brand]} original sampleText={sampleText} />}
            <TypographicSample
              key={brand + draft.display + draft.motion + draft.tracking}
              config={draft}
              sampleText={sampleText}
            />
          </div>
          <p className="typo-disclaimer">
            L’aperçu utilise les polices présentes sur cet appareil et leurs polices de secours. Le rendu définitif
            exige l’hébergement des fichiers autorisés.
          </p>
          {duplicate && (
            <p className="typo-warning" role="alert">
              Même duo de polices que {brandMeta[duplicate].name}. Changez la police des titres ou du corps pour
              différencier réellement les marques.
            </p>
          )}
          {storageError && (
            <p className="typo-warning" role="alert">
              {storageError}
            </p>
          )}
          {notice && (
            <p className="typo-notice" role="status">
              {notice}
            </p>
          )}
        </main>
        <aside className="typo-controls" aria-label="Réglages typographiques">
          <div className="typo-panel-title">
            <span>01 / DIRECTION</span>
            <strong>{resetDiff ? "PERSONNALISÉ" : "PRÉRÉGLAGE"}</strong>
          </div>
          <label>
            Police des titres
            <select value={draft.display} onChange={(event) => set({ display: event.target.value as FontId })}>
              {fontIds.map((id) => (
                <option key={id} value={id}>
                  {fonts[id].name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Police du corps
            <select value={draft.body} onChange={(event) => set({ body: event.target.value as FontId })}>
              {fontIds.map((id) => (
                <option key={id} value={id}>
                  {fonts[id].name}
                </option>
              ))}
            </select>
          </label>
          <p className="typo-font-note">
            Police titre : {fonts[draft.display].note}. Police corps : {fonts[draft.body].note}.
          </p>
          <label>
            Échelle des titres <output>{Math.round(draft.scale * 100)} %</output>
            <input
              type="range"
              min="0.8"
              max="1.5"
              step="0.01"
              value={draft.scale}
              onChange={(event) => set({ scale: Number(event.target.value) })}
            />
          </label>
          <label>
            Espacement des lettres <output>{draft.tracking.toFixed(3)} em</output>
            <input
              type="range"
              min="-0.08"
              max="0.16"
              step="0.005"
              value={draft.tracking}
              onChange={(event) => set({ tracking: Number(event.target.value) })}
            />
          </label>
          <label>
            Graisse des titres
            <select
              value={draft.weight}
              onChange={(event) => set({ weight: Number(event.target.value) as TypographyConfig["weight"] })}
            >
              <option value={400}>Regular 400</option>
              <option value={500}>Medium 500</option>
              <option value={600}>Semibold 600</option>
              <option value={700}>Bold 700</option>
            </select>
          </label>
          <label>
            Apparition du titre
            <select
              value={draft.motion}
              onChange={(event) => set({ motion: event.target.value as TypographyConfig["motion"] })}
            >
              <option value="none">Sans animation</option>
              <option value="fade">Fondu</option>
              <option value="rise">Élévation</option>
            </select>
          </label>
          <label className="typo-toggle">
            <input
              type="checkbox"
              checked={draft.uppercase}
              onChange={(event) => set({ uppercase: event.target.checked })}
            />
            Titres en capitales
          </label>
          <div className="typo-panel-actions">
            <button type="button" className="typo-primary" disabled={!ready || !!duplicate || !modified} onClick={save}>
              Sauvegarder le brouillon
            </button>
            <button type="button" onClick={restore} disabled={!resetDiff}>
              Restaurer le préréglage
            </button>
            <div className="typo-export">
              <button type="button" disabled={!!duplicate} onClick={() => exportFile("css")}>
                Exporter CSS
              </button>
              <button type="button" disabled={!!duplicate} onClick={() => exportFile("json")}>
                Exporter JSON
              </button>
            </div>
          </div>
          <p className="typo-panel-footnote">
            Les modifications non sauvegardées restent disponibles entre les marques tant que cet atelier reste ouvert.
            Checkpoint Git séparé conservé. Les brouillons sont stockés dans ce navigateur uniquement, pas dans le
            compte IDA. Aucune publication ni changement des sites en ligne.
          </p>
        </aside>
      </div>
    </section>
  );
}
