import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { stripTypeScriptTypes } from "node:module";

// Préparation privée seulement. Aucun import métier, aucun fichier source modifié.
const sourceRoot = "F:/MUSIQUES 2K26";
const destination = resolve("tmp/music-import-plan");
const helper = await readFile("apps/web/src/music-import-selection.ts", "utf8");
const emitted = stripTypeScriptTypes(helper);
const { newestMusicFiles, canonicalMusicTitle } = await import(
  `data:text/javascript;base64,${Buffer.from(emitted).toString("base64")}`
);
const audio = [];
async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) continue;
    const path = join(directory, item.name);
    if (item.isDirectory()) await walk(path);
    else if (/^\.(mp3|wav|flac|aiff?|m4a|ogg|aac)$/i.test(extname(item.name))) {
      const info = await stat(path);
      audio.push({ name: item.name, path, size: info.size, lastModified: info.mtimeMs });
    }
  }
}
await walk(sourceRoot);
// Les fichiers explicitement crédités Astromer/MARLA seulement ; les bibliothèques
// commerciales et stems non attribués ne sont pas assimilés aux productions.
const productions = audio.filter((item) => /^(?:Astromer|MARLA)(?:\s|[-_])/iu.test(item.name));
const selection = newestMusicFiles(productions).map((file) => ({
  ...file,
  canonicalTitle: canonicalMusicTitle(file.name),
  imported: false,
  importStatus: file.size > 25 * 1024 * 1024 ? "WAITING_LARGE_MASTER_SUPPORT" : "WAITING_AUTHENTICATED_IMPORT",
}));
await mkdir(destination, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  sourceRoot,
  policy: "NEWEST_MTIME_EXACT_NORMALIZED_NAME",
  originalFilesChanged: false,
  audioFiles: audio.length,
  productionFiles: productions.length,
  selectedTitles: selection.length,
  excludedUnattributed: audio.length - productions.length,
  requiresNameReview: true,
  selection,
};
await writeFile(join(destination, "selection.json"), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    audioFiles: audio.length,
    productionFiles: productions.length,
    selectedTitles: selection.length,
    largeMasters: selection.filter((file) => file.size > 25 * 1024 * 1024).length,
    selectedGiB: +(selection.reduce((sum, file) => sum + file.size, 0) / 1024 ** 3).toFixed(2),
    report: join(destination, "selection.json"),
    imported: 0,
    originalsModified: 0,
  }),
);
