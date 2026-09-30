import { expect, test } from "@playwright/test";

for (const theme of ["classic", "scifi"]) {
  test(`Music followups ${theme}: one Workspace task, retry, completion, failures and mobile`, async ({
    page,
    context,
  }, info) => {
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === "http://127.0.0.1:8791" ? route.continue() : route.abort(),
    );
    await context.routeWebSocket("**/*", (socket) => socket.close());
    await context.addInitScript((value) => localStorage.setItem("ida.ui.theme.v1", value), theme);
    const errors: string[] = [];
    const unsafe: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/send|\/mcp\/tools\/call|generate|tts/u.test(new URL(request.url()).pathname)) unsafe.push(request.url());
    });
    await page.goto("/");
    await page.getByLabel("Phrase de passe", { exact: true }).fill(process.env.IDA_E2E_PASSPHRASE ?? "");
    await page.getByRole("button", { name: "Entrer dans IDA", exact: true }).click();
    await page.getByRole("button", { name: "Ouvrir Music Studio", exact: true }).click();
    const nextAction = `Vérifier le contact avant de proposer une date. ${"Détail à conserver. ".repeat(20)}`.trim();
    const created = await page.request.post("/v1/music/contacts", {
      headers: { origin: "http://127.0.0.1:8791" },
      data: {
        idempotencyKey: crypto.randomUUID(),
        artistProjectId: "prj_demo_aless",
        organisation: `Piste relance ${theme}`,
        kind: "BAR",
        nextAction,
        sourceUrl: "https://music.example.com/booking",
      },
    });
    expect(created.status()).toBe(201);
    const c = (await created.json()).data;
    await page.getByRole("button", { name: /^Labels & dates/u }).click();
    let panel = page.getByRole("dialog", { name: "Labels & dates", exact: true });
    await panel.getByRole("button", { name: `Ouvrir Piste relance ${theme}`, exact: true }).click();
    await panel.getByRole("button", { name: "Relances datées", exact: true }).click();
    await expect(panel.getByText("Aucune relance dans cette sélection.", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Planifier une relance", exact: true }).click();
    let form = panel.getByRole("form", { name: "Planifier une relance", exact: true });
    await expect(form.getByLabel("Action à réaliser", { exact: true })).toHaveValue(nextAction.slice(0, 240));
    await expect(form.getByRole("textbox", { name: "Détails de la relance", exact: true })).toHaveValue(nextAction);
    const title = `Relance bar ${theme}`;
    await form.getByLabel("Action à réaliser", { exact: true }).fill(title);
    await form
      .getByRole("textbox", { name: "Détails de la relance", exact: true })
      .fill("Vérifier le responsable de programmation, sans email automatique.");
    await form.getByLabel("Échéance locale", { exact: true }).fill("2020-10-15T10:30");
    let taskId = "";
    const createPattern = `**/v1/music/contacts/${c.id}/followups`;
    await page.route(createPattern, async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      taskId = (await response.json()).data.task.id;
      await route.abort("failed");
    });
    await form.getByRole("button", { name: "Enregistrer la relance", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("Tes champs sont conservés");
    await page.unroute(createPattern);
    await form.getByRole("button", { name: "Enregistrer la relance", exact: true }).click();
    await expect(form).toHaveCount(0);
    const rows = (await (await page.request.get(`/v1/music/followups?musicContactId=${c.id}`)).json()).data;
    expect(rows).toHaveLength(1);
    expect(rows[0].task.dueAt).toBe("2020-10-15T08:30:00.000Z");
    let article = panel.getByRole("article", { name: title, exact: true });
    await expect(article).toContainText("En retard");
    await article.getByRole("button", { name: "Voir cette relance dans Workspace", exact: true }).click();
    panel = page.getByRole("dialog", { name: "Relances Music", exact: true });
    await expect(panel.getByRole("article", { name: title, exact: true })).toContainText(taskId);
    await page.keyboard.press("Escape");
    // Complete the very same record with the pre-existing general TASKS interface.
    await page
      .getByRole("navigation", { name: "Navigation Workspace", exact: true })
      .getByRole("button", { name: /^Tâches/u })
      .click();
    const tasksPanel = page.getByRole("dialog", { name: "Tâches", exact: true });
    const taskCard = tasksPanel
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await taskCard.getByRole("button", { name: "Marquer terminée", exact: true }).click();
    await tasksPanel.getByRole("button", { name: "Confirmer l’achèvement", exact: true }).click();
    await expect(tasksPanel.getByRole("status").filter({ hasText: "maintenant terminée" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("navigation", { name: "Navigation Workspace", exact: true })
      .getByRole("button", { name: "Relances Music", exact: true })
      .click();
    await panel.getByRole("combobox", { name: "État des relances", exact: true }).selectOption("CLOSED");
    article = panel.getByRole("article", { name: title, exact: true });
    await expect(article).toContainText("Terminée le");
    await article.getByRole("button", { name: "Ouvrir le contact dans Music", exact: true }).click();
    panel = page.getByRole("dialog", { name: "Labels & dates", exact: true });
    await expect(panel.getByRole("heading", { name: `Piste relance ${theme}`, exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Relances datées", exact: true }).click();
    await expect(panel.getByRole("article", { name: title, exact: true })).toContainText("Terminée le");
    // A second action exercises explicit completion and its error state inside Music.
    await panel.getByRole("button", { name: "Planifier une relance", exact: true }).click();
    form = panel.getByRole("form", { name: "Planifier une relance", exact: true });
    await form.getByLabel("Action à réaliser", { exact: true }).fill(`Deuxième ${title}`);
    await form.getByLabel("Échéance locale", { exact: true }).fill("2027-10-15T10:30");
    await form.getByRole("button", { name: "Enregistrer la relance", exact: true }).click();
    article = panel.getByRole("article", { name: `Deuxième ${title}`, exact: true });
    await article.getByRole("button", { name: "Marquer la relance terminée", exact: true }).click();
    await page.route("**/v1/tasks/*/complete", (route) =>
      route.fulfill({ status: 503, json: { error: { message: "Clôture indisponible pour la recette." } } }),
    );
    await panel.getByRole("button", { name: "Confirmer la relance terminée", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Clôture indisponible");
    await expect(article).toContainText("À faire");
    await page.unroute("**/v1/tasks/*/complete");
    await panel.getByRole("button", { name: "Confirmer la relance terminée", exact: true }).click();
    await expect(article).toContainText("Terminée le");
    expect((await (await page.request.get(`/v1/music/contacts/${c.id}`)).json()).data.stage).toBe("DISCOVERED");
    await page.route("**/v1/music/followups?*", (route) =>
      route.fulfill({ status: 503, json: { error: { message: "Lecture indisponible pour la recette." } } }),
    );
    await panel.getByRole("button", { name: "Actualiser les relances", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("Lecture indisponible");
    await expect(panel.getByRole("article")).toHaveCount(0);
    await page.unroute("**/v1/music/followups?*");
    await panel.getByRole("button", { name: "Réessayer les relances", exact: true }).click();
    await expect(article).toContainText("Terminée le");
    await panel.getByRole("region", { name: "Relances Music", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`music-followups-${theme}-desktop.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`music-followups-${theme}-390.png`) });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /^Labels & dates/u }).click();
    await panel.getByRole("button", { name: `Ouvrir Piste relance ${theme}`, exact: true }).click();
    await panel.getByRole("button", { name: "Relances datées", exact: true }).click();
    await expect(panel.getByRole("article", { name: title, exact: true })).toContainText("Terminée le");
    expect(errors).toEqual([]);
    expect(unsafe).toEqual([]);
  });
}
