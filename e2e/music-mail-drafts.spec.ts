import { expect, test } from "@playwright/test";

for (const theme of ["classic", "scifi"]) {
  test(`Music mail drafts ${theme}: shared across worlds, safe retries, edit, errors, reopen and mobile`, async ({
    page,
    context,
  }, info) => {
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === "http://127.0.0.1:8791" ? route.continue() : route.abort(),
    );
    await context.routeWebSocket("**/*", (socket) => socket.close());
    await context.addInitScript((value) => localStorage.setItem("ida.ui.theme.v1", value), theme);
    const errors: string[] = [];
    const unsafeRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/send|\/mcp\/tools\/call|generate|tts/u.test(new URL(request.url()).pathname))
        unsafeRequests.push(request.url());
    });
    await page.goto("/");
    await page.getByLabel("Phrase de passe", { exact: true }).fill(process.env.IDA_E2E_PASSPHRASE ?? "");
    await page.getByRole("button", { name: "Entrer dans IDA", exact: true }).click();
    await page.getByRole("button", { name: "Ouvrir Music Studio", exact: true }).click();
    const headers = { origin: "http://127.0.0.1:8791" };
    const created = await page.request.post("/v1/music/contacts", {
      headers,
      data: {
        idempotencyKey: crypto.randomUUID(),
        artistProjectId: "prj_demo_aless",
        organisation: `Piste brouillon ${theme}`,
        kind: "EVENT_PLANNER",
        sourceUrl: "https://music.example.com/contact",
        email: `public-${theme}@example.com`,
      },
    });
    expect(created.status()).toBe(201);
    const c = (await created.json()).data;
    await page.getByRole("button", { name: /^Labels & dates/u }).click();
    let panel = page.getByRole("dialog", { name: "Labels & dates", exact: true });
    await panel.getByRole("button", { name: `Ouvrir Piste brouillon ${theme}`, exact: true }).click();
    await panel.getByRole("button", { name: "Brouillons pour ce contact", exact: true }).click();
    await expect(panel.getByText("Aucun brouillon enregistré dans cette sélection.", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Préparer un message", exact: true }).click();
    const creator = panel.getByRole("form", { name: "Créer un brouillon musical", exact: true });
    await creator.getByRole("combobox", { name: "Intention", exact: true }).selectOption("PRIVATE_EVENT");
    await creator
      .getByRole("textbox", { name: "Ta présentation factuelle (facultatif)", exact: true })
      .fill("Je dispose de mon matériel et pratique depuis plusieurs années.");
    await creator.getByRole("button", { name: /^Préremplir l’objet/u }).click();
    await expect(creator.getByRole("textbox", { name: "Message", exact: true })).toContainText(
      "mariages, baptêmes et anniversaires",
    );
    const subject = `Prestation privée ${theme}`;
    await creator.getByRole("textbox", { name: "Objet", exact: true }).fill(subject);
    const postPattern = `**/v1/music/contacts/${c.id}/mail-drafts`;
    let draftId = "";
    await page.route(postPattern, async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      draftId = (await response.json()).data.id;
      await route.abort("failed");
    });
    await creator.getByRole("button", { name: "Créer le brouillon partagé", exact: true }).click();
    await expect(creator.getByRole("alert")).toContainText("Tes champs sont conservés");
    await expect(creator.getByRole("textbox", { name: "Objet", exact: true })).toHaveValue(subject);
    await page.unroute(postPattern);
    await creator.getByRole("button", { name: "Créer le brouillon partagé", exact: true }).click();
    await expect(panel.getByRole("status").filter({ hasText: "Brouillon enregistré dans Workspace" })).toBeVisible();
    expect(
      (await (await page.request.get(`/v1/workspace/mail-drafts?musicContactId=${c.id}`)).json()).data,
    ).toHaveLength(1);
    await panel.getByRole("button", { name: "Ouvrir ce même brouillon dans Workspace", exact: true }).click();
    await expect(page.locator(".workspace-environment")).toBeVisible();
    panel = page.getByRole("dialog", { name: "Brouillons partagés", exact: true });
    const editor = panel.getByRole("form", { name: "Modifier le brouillon partagé", exact: true });
    await expect(editor.getByRole("textbox", { name: "Objet", exact: true })).toHaveValue(subject);
    await expect(panel.locator(".mail-drafts__record")).toContainText(draftId);
    const finalBody = `Bonjour,\n\nTexte révisé dans Workspace ${theme}.\n\nMerci.`;
    await editor.getByRole("textbox", { name: "Message", exact: true }).fill(finalBody);
    // A source lookup or another tab must not unmount the unsaved editor.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(editor.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(finalBody);
    await page.evaluate(() => {
      delete (document as Document & { hidden?: boolean }).hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await editor.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    await expect(editor).toContainText("révision 1");
    expect((await (await page.request.get(`/v1/workspace/mail-drafts/${draftId}`)).json()).data.body).toBe(finalBody);
    expect((await (await page.request.get(`/v1/music/contacts/${c.id}`)).json()).data.stage).toBe("DISCOVERED");
    // Concurrent update must preserve the local unsaved message, never silently overwrite.
    expect(
      (
        await page.request.patch(`/v1/workspace/mail-drafts/${draftId}`, {
          headers,
          data: { expectedRevision: 1, subject: `Autre titre ${theme}` },
        })
      ).status(),
    ).toBe(200);
    await editor.getByRole("textbox", { name: "Message", exact: true }).fill("Brouillon local à conserver");
    await editor.getByRole("button", { name: "Enregistrer le brouillon", exact: true }).click();
    await expect(editor.getByRole("alert")).toContainText("Ce brouillon a changé");
    await expect(editor.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(
      "Brouillon local à conserver",
    );
    await panel.getByRole("button", { name: /^Recharger le brouillon/u }).click();
    await expect(editor.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(finalBody);
    const detailPattern = `**/v1/workspace/mail-drafts/${draftId}`;
    await page.route(detailPattern, (route) =>
      route.fulfill({ status: 503, json: { error: { message: "Brouillon indisponible pour la recette." } } }),
    );
    await panel.getByRole("button", { name: /^Recharger le brouillon/u }).click();
    await expect(panel.getByRole("alert")).toContainText("Brouillon indisponible");
    await expect(editor).toHaveCount(0);
    await page.unroute(detailPattern);
    await panel.getByRole("button", { name: "Réessayer le brouillon", exact: true }).click();
    await expect(editor.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(finalBody);
    await panel.locator(".mail-drafts").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`music-drafts-${theme}-workspace.png`) });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Brouillons Music", exact: true }).click();
    await panel.getByRole("button", { name: `Ouvrir le brouillon Autre titre ${theme}`, exact: true }).click();
    await expect(editor.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(finalBody);
    await page.keyboard.press("Escape");
    await page.locator(".workspace-environment").getByRole("button", { name: "Mail", exact: true }).click();
    const mailPanel = page.getByRole("dialog", { name: "Mail", exact: true });
    await mailPanel.getByRole("button", { name: "Brouillons Music", exact: true }).click();
    await mailPanel.getByRole("button", { name: `Ouvrir le brouillon Autre titre ${theme}`, exact: true }).click();
    await expect(mailPanel.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(finalBody);
    await expect(mailPanel.locator(".mail-drafts__record")).toContainText(draftId);
    // Return through the common home entry and confirm the same edited record in Music.
    await mailPanel.getByRole("button", { name: "Retour à l’accueil IDA", exact: true }).click();
    await page.getByRole("button", { name: "Ouvrir Music Studio", exact: true }).click();
    await page.getByRole("button", { name: /^Labels & dates/u }).click();
    panel = page.getByRole("dialog", { name: "Labels & dates", exact: true });
    await panel.getByRole("button", { name: `Ouvrir Piste brouillon ${theme}`, exact: true }).click();
    await panel.getByRole("button", { name: "Brouillons pour ce contact", exact: true }).click();
    await panel.getByRole("button", { name: `Ouvrir le brouillon Autre titre ${theme}`, exact: true }).click();
    await expect(panel.getByRole("textbox", { name: "Message", exact: true })).toHaveValue(finalBody);
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.locator(".mail-drafts").scrollIntoViewIfNeeded();
    expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`music-drafts-${theme}-390.png`) });
    expect(errors).toEqual([]);
    expect(unsafeRequests).toEqual([]);
  });
}
