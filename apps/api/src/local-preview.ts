import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

// Point de lancement local dédié, réutilise les données existantes sans seed.
const app = await createApp({
  dataDir: fileURLToPath(new URL("../../../tmp/ida-preview-relative-dates/data", import.meta.url)),
  storageDir: fileURLToPath(new URL("../../../tmp/ida-preview-relative-dates/media", import.meta.url)),
  seed: false,
  identityMode: "LOCAL_LOCK",
  localDialogueEnabled: process.env.IDA_LOCAL_DIALOGUE === "1" && process.env.OLLAMA_NO_CLOUD === "1",
});
await app.listen({ host: "127.0.0.1", port: 8787 });
console.log("IDA locale disponible sur 127.0.0.1:8787. Aucune exposition réseau.");
