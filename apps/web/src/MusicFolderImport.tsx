import { type InputHTMLAttributes, useEffect, useRef, useState } from "react";
import { fetchMediaAssets, uploadMediaAsset } from "./api";
import { canonicalMusicTitle, newestMusicFiles } from "./music-import-selection";

const MAX_BYTES = 25 * 1024 * 1024;
/** Sélection explicite par le navigateur, puis import via le stockage privé existant. */
export function MusicFolderImport({ onImported }: { onImported: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  const stop = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, []);
  const allowed = files.filter((file) => file.size <= MAX_BYTES);
  const blocked = files.length - allowed.length;
  async function importFiles() {
    if (busy) return;
    stop.current = false;
    setBusy(true);
    setNotice("");
    setFailures([]);
    const imported = [...done];
    try {
      // Recherche par nom avant import et hash serveur : reprise sans doublon exact.
      for (const file of allowed) {
        if (stop.current) break;
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (imported.includes(key)) continue;
        if (mounted.current) setNotice(`Import de ${file.name}…`);
        try {
          const title = canonicalMusicTitle(file.name);
          const existing = await fetchMediaAssets({ q: title, type: "AUDIO", limit: 50 });
          if (
            existing.some(
              (item) =>
                canonicalMusicTitle(item.filename).normalize("NFKC").toLocaleLowerCase("fr") ===
                title.normalize("NFKC").toLocaleLowerCase("fr"),
            )
          ) {
            if (mounted.current)
              setFailures((items) => [
                ...items,
                `${file.name} : ce titre existe déjà ; conservé sans écrasement. La comparaison de ses versions archivées reste à effectuer.`,
              ]);
            continue;
          }
          await uploadMediaAsset({
            file,
            description: `Import local · ${canonicalMusicTitle(file.name)} · export sélectionné du ${new Date(file.lastModified).toISOString()}`,
            tags: "studio,import-local",
          });
          imported.push(key);
          if (mounted.current) setDone([...imported]);
        } catch {
          if (mounted.current)
            setFailures((items) => [...items, `${file.name} : non importé (doublon, limite ou connexion).`]);
        }
      }
      if (mounted.current) {
        setNotice(`${imported.length} fichier(s) importé(s). Les originaux sont inchangés.`);
        onImported();
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="music-folder-import">
      <h3>Importer mes exports sans doublons</h3>
      <p>
        Choisissez le dossier de vos productions sur F:. La sélection conserve le fichier le plus récent de chaque nom
        normalisé. Les noms proches ne sont pas fusionnés arbitrairement.
      </p>
      <label>
        Choisir un dossier de productions
        <input
          type="file"
          multiple
          {...({ webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
          disabled={busy}
          onChange={(event) => {
            const input = Array.from(event.target.files ?? []);
            setTotal(input.length);
            setFiles(newestMusicFiles(input));
            setDone([]);
            setFailures([]);
            setNotice("");
          }}
        />
      </label>
      {files.length ? (
        <>
          <p>
            {files.length} titres retenus parmi {total} fichiers.{" "}
            {blocked
              ? `${blocked} dépassent 25 Mio et resteront en attente, sans remplacement par un ancien export.`
              : ""}
          </p>
          <details>
            <summary>Voir les fichiers sélectionnés</summary>
            <ul>
              {files.map((file) => (
                <li key={`${file.name}:${file.lastModified}`}>
                  {file.name} · {new Date(file.lastModified).toLocaleDateString("fr-FR")} ·{" "}
                  {(file.size / 1024 / 1024).toFixed(1)} Mio
                </li>
              ))}
            </ul>
          </details>
          <div className="reference-actions">
            <button type="button" disabled={busy || !allowed.length} onClick={() => void importFiles()}>
              Importer {allowed.length} fichier(s) dans IDA
            </button>
            {busy ? (
              <button
                type="button"
                onClick={() => {
                  stop.current = true;
                  setNotice("Arrêt après le fichier en cours…");
                }}
              >
                Arrêter après ce fichier
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {failures.length ? (
        <ul>
          {failures.map((failure, i) => (
            <li key={i}>{failure}</li>
          ))}
        </ul>
      ) : null}
      <p className="reference-hint">
        Import dans la bibliothèque privée, pas de copie dans les fichiers publics ni de suppression sur F:. Les gros
        masters nécessitent encore un import adapté.
      </p>
    </section>
  );
}
