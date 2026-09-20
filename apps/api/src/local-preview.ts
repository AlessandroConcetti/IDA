import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { demoContext } from "./demo-context.js";
import { loadHomeAssistantBinding } from "./home-assistant-config.js";

// Point de lancement local dédié, réutilise les données existantes sans seed.
const app = await createApp({
  dataDir: fileURLToPath(new URL("../../../tmp/ida-preview-relative-dates/data", import.meta.url)),
  storageDir: fileURLToPath(new URL("../../../tmp/ida-preview-relative-dates/media", import.meta.url)),
  seed: false,
  identityMode: "LOCAL_LOCK",
  ...(process.env.IDA_BUILT_WEB === "1"
    ? {
        localBuiltWeb: {
          root: fileURLToPath(new URL("../../web/dist", import.meta.url)),
          origin: "http://127.0.0.1:8787",
        },
      }
    : {}),
  // Lecture météo personnelle uniquement, déclenchée et consentie dans l'écran Home.
  weatherEnabled: true,
  // Reviewed project documentation only, never a general filesystem/root grant.
  mcpFiles: {
    workspaceId: demoContext.workspaceId,
    root: fileURLToPath(new URL("../../../docs", import.meta.url)),
    resources: [
      { id: "mcp-guide", name: "Guide MCP IDA", relativePath: "MCP_INTEGRATION.md" },
      { id: "open-source-triage", name: "Comparatif GitHub / open source", relativePath: "OPEN_SOURCE_TRIAGE_20260919.md" },
    ],
  },
  homeAssistant: await loadHomeAssistantBinding(
    fileURLToPath(new URL("../../../.data", import.meta.url)),
    demoContext.workspaceId,
  ),
  localDialogueEnabled: process.env.IDA_LOCAL_DIALOGUE === "1" && process.env.OLLAMA_NO_CLOUD === "1",
});
await app.listen({ host: "127.0.0.1", port: 8787 });
console.log("IDA locale disponible sur 127.0.0.1:8787. Aucune exposition réseau.");
