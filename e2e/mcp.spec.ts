import { expect, type Locator, type Page, test } from "@playwright/test";

const origin = "http://127.0.0.1:8791";
const passphrase = process.env.IDA_E2E_PASSPHRASE;
if (!passphrase) throw new Error("Missing synthetic E2E credential.");

async function unlock(page: Page) {
  await page.getByLabel("Phrase de passe", { exact: true }).fill(passphrase as string);
  await page.getByRole("button", { name: "Entrer dans IDA" }).click();
  await expect(page.getByRole("button", { name: "Ouvrir La Fabrique", exact: true })).toBeVisible();
}

async function openTools(page: Page) {
  await page.getByRole("button", { name: "Ouvrir La Fabrique", exact: true }).click();
  await expect(page.getByRole("heading", { name: "LA FABRIQUE", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Outils MCP/u }).click();
  const panel = page.getByRole("region", { name: "Outils MCP documentaires", exact: true });
  await expect(panel.getByText("Outils non chargés.", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Lire document" })).toHaveCount(0);
  return panel;
}

async function loadAndRead(page: Page, panel: Locator) {
  const status = page.waitForResponse((response) => response.url() === `${origin}/v1/mcp/status`);
  await panel.getByRole("button", { name: "Charger les outils" }).click();
  expect((await status).status()).toBe(200);
  await expect(panel.getByText(/Configuré · lecture MCP non vérifiée/u)).toBeVisible();
  await panel.getByLabel("Document autorisé").selectOption("guide");
  const read = page.waitForResponse((response) => response.url() === `${origin}/v1/mcp/call`);
  await panel.getByRole("button", { name: "Lire document", exact: true }).click();
  expect((await read).status()).toBe(200);
  await expect(panel.getByRole("region", { name: "Texte du document" })).toContainText("DOCUMENT_MCP_SYNTHETIQUE");
  await expect(panel.getByText(/Lecture MCP vérifiée/u)).toBeVisible();
}

test.beforeEach(async ({ context, page }) => {
  await context.clearPermissions();
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin === origin) await route.continue();
    else await route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await page.goto("/");
  await unlock(page);
});

test("La Fabrique lit et recherche via l’API et le vrai MCP sans exécuter le document", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(`${origin}/v1/mcp/`)) calls.push(request.url());
  });
  const panel = await openTools(page);
  expect(calls).toEqual([]);
  await loadAndRead(page, panel);
  await expect(panel.getByRole("region", { name: "Texte du document" })).toContainText(
    "<script>window.MCP_DOCUMENT_EXECUTED = true</script>",
  );
  await expect(panel.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, "MCP_DOCUMENT_EXECUTED"))).toBe(false);
  await panel.getByLabel("Texte à rechercher · recherche littérale").fill("[MCP].*");
  const search = page.waitForResponse((response) => response.url() === `${origin}/v1/mcp/call`);
  await panel.getByRole("button", { name: "Rechercher", exact: true }).click();
  expect((await search).status()).toBe(200);
  await expect(panel.getByRole("list", { name: "Résultats de recherche" })).toContainText("ligne 4");
  await expect(panel.getByRole("list", { name: "Résultats de recherche" })).toContainText(
    "Rechercher [MCP].* reste une recherche littérale.",
  );
  expect(calls).toEqual([`${origin}/v1/mcp/status`, `${origin}/v1/mcp/call`, `${origin}/v1/mcp/call`]);
});

test("le panneau reste utilisable sur un écran de 390 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await openTools(page);
  await loadAndRead(page, panel);
  await expect(panel.getByRole("button", { name: "Rechercher", exact: true })).toBeVisible();
  const horizontalOverflow = await panel.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  for (const name of ["Lire document", "Rechercher"]) {
    const bounds = await panel.getByRole("button", { name, exact: true }).boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
  }
});

test("une session révoquée efface le résultat et impose un nouveau chargement", async ({ page, context }) => {
  const panel = await openTools(page);
  await loadAndRead(page, panel);
  const locked = await context.request.post(`${origin}/v1/auth/lock`, { headers: { origin } });
  expect(locked.status()).toBe(204);
  await panel.getByRole("button", { name: "Lire document", exact: true }).click();
  await expect(page.getByLabel("Phrase de passe", { exact: true })).toBeVisible();
  await expect(page.getByText("DOCUMENT_MCP_SYNTHETIQUE", { exact: false })).toHaveCount(0);
  await unlock(page);
  const newPanel = await openTools(page);
  await expect(newPanel.getByText(/Lecture MCP vérifiée/u)).toHaveCount(0);
  await expect(newPanel.getByRole("region", { name: "Texte du document" })).toHaveCount(0);
});
