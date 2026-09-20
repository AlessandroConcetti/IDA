import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../apps/api/src/app.js";
import { demoContext } from "../apps/api/src/demo-context.js";

const passphrase = process.env.IDA_E2E_PASSPHRASE;
if (!passphrase || !/^[A-Za-z0-9_-]{43}$/u.test(passphrase)) {
  throw new Error("Run the isolated fixture through playwright.config.ts.");
}
const origin = "http://127.0.0.1:8791";
const temporaryRoot = await mkdtemp(join(tmpdir(), "ida-mcp-browser-fixture-"));
const documentRoot = join(temporaryRoot, "documents");
await mkdir(documentRoot);
await writeFile(
  join(documentRoot, "guide.txt"),
  [
    "DOCUMENT_MCP_SYNTHETIQUE",
    "BALISE_MCP_SYNTHETIQUE : la lecture reste dans les documents autorisés.",
    "<script>window.MCP_DOCUMENT_EXECUTED = true</script>",
    "Rechercher [MCP].* reste une recherche littérale.",
  ].join("\n"),
  "utf8",
);
const app = await createApp({
  dataDir: "memory://",
  storageDir: join(temporaryRoot, "media"),
  identityMode: "LOCAL_LOCK",
  localDialogueEnabled: false,
  weatherEnabled: false,
  localBuiltWeb: { root: fileURLToPath(new URL("../apps/web/dist", import.meta.url)), origin },
  mcpFiles: {
    workspaceId: demoContext.workspaceId,
    root: documentRoot,
    resources: [{ id: "guide", name: "Guide synthétique MCP", relativePath: "guide.txt" }],
  },
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  // Delete only this process's fresh, synthetic fixture directory.
  if (
    dirname(resolve(temporaryRoot)) === resolve(tmpdir()) &&
    basename(temporaryRoot).startsWith("ida-mcp-browser-fixture-")
  )
    await rm(temporaryRoot, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void close().then(() => process.exit(0));
  });
}
try {
  const setup = await app.inject({
    method: "POST",
    url: "/v1/auth/setup",
    headers: { host: "127.0.0.1:8791", origin },
    payload: { passphrase },
  });
  if (setup.statusCode !== 201) throw new Error("Synthetic owner setup failed.");
  const cookies = setup.headers["set-cookie"];
  const cookie = (Array.isArray(cookies) ? cookies[0] : cookies)?.split(";", 1)[0] ?? "";
  const lock = await app.inject({
    method: "POST",
    url: "/v1/auth/lock",
    headers: { host: "127.0.0.1:8791", origin, cookie },
  });
  if (lock.statusCode !== 204) throw new Error("Synthetic owner lock failed.");
  await app.listen({ host: "127.0.0.1", port: 8791 });
} catch (error) {
  await close();
  throw error;
}
