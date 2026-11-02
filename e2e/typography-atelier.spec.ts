import { expect, test } from "@playwright/test";

test("isolated atelier: editing, brand switching, browser save and rollback", async ({ page }) => {
  await page.goto("/typography-preview.html");
  await expect(page.getByRole("heading", { name: /Atelier typographique/ })).toBeVisible();
  await page.getByRole("button", { name: /Alessandro.*Éditorial mariage/ }).click();
  await page.getByLabel("Texte à tester").fill("Une célébration unique");
  await page.getByLabel("Police des titres").selectOption("bodoni");
  await expect(page.locator(".typo-sample h3").last()).toHaveText("Une célébration unique");
  await page.getByRole("button", { name: /IDA Studio.*Précision technologique/ }).click();
  await page.getByRole("button", { name: /Alessandro.*Éditorial mariage/ }).click();
  await expect(page.getByLabel("Police des titres")).toHaveValue("bodoni");
  await page.getByRole("button", { name: "Sauvegarder le brouillon" }).click();
  await expect(page.getByRole("status")).toContainText("Brouillon sauvegardé");
  await page.reload();
  await page.getByRole("button", { name: /Alessandro.*Éditorial mariage/ }).click();
  await expect(page.getByLabel("Police des titres")).toHaveValue("bodoni");
  await page.getByRole("button", { name: "Restaurer le préréglage" }).click();
  await expect(page.getByLabel("Police des titres")).toHaveValue("cormorant");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});

test("same font pair cannot be saved as a distinct brand", async ({ page }) => {
  await page.goto("/typography-preview.html");
  await page.getByRole("button", { name: /Alessandro.*Éditorial mariage/ }).click();
  await page.getByLabel("Police des titres").selectOption("bodoni");
  await page.getByLabel("Police du corps").selectOption("helvetica");
  await expect(page.getByRole("alert")).toContainText("Même duo de polices");
  await expect(page.getByRole("button", { name: "Sauvegarder le brouillon" })).toBeDisabled();
});

test("reduced motion stays accessible and export remains local", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const outgoing: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:5174/")) outgoing.push(request.url());
  });
  await page.goto("/typography-preview.html");
  const animation = await page.locator(".typo-sample h3").last().evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("none");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter CSS" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("ida-typographie-ida-studio.css");
  expect(outgoing).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath(`atelier-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
