import { expect, type Page, test } from "@playwright/test";

type HubTheme = "classic" | "scifi" | "modern" | "orbital" | "immersive";

function unexpectedHubMutation(path: string, method: string) {
  return (
    path.startsWith("/v1/") &&
    !path.startsWith("/v1/auth/") &&
    !(path === "/v1/home/weather" && method === "POST") &&
    method !== "GET"
  );
}

const animatedHubParts = [
  {
    selector: ".hub-presence__wave i:nth-child(4)",
    animation: "hub-presence-wave",
    property: "transform",
    peak: 0.85,
  },
  {
    selector: ".hub-messages .hub-widget__head .hub-icon-flap",
    animation: "hub-icon-open-envelope",
    property: "transform",
    peak: 0.84,
  },
  {
    selector: ".hub-finance .hub-widget__head .hub-icon-bar.hub-icon-part-1",
    animation: "hub-icon-chart-breathe",
    property: "transform",
    peak: 0.82,
  },
  {
    selector: ".hub-agents .hub-widget__head .hub-icon-links path",
    animation: "hub-icon-connect",
    property: "stroke-dashoffset",
    peak: 0.79,
  },
  {
    selector: ".hub-care .hub-widget__head .hub-icon-heart",
    animation: "hub-icon-double-beat",
    property: "transform",
    peak: 0.79,
  },
  {
    selector: ".hub-music .hub-widget__head .hub-icon-note",
    animation: "hub-icon-note-sway",
    property: "transform",
    peak: 0.8,
  },
  {
    selector: ".hub-weather .hub-widget__head .hub-icon-rain .hub-icon-part-1",
    animation: "hub-icon-rain-drift",
    property: "transform",
    peak: 0.83,
  },
  {
    selector: ".hub-dock .hub-animated-icon--grid .hub-icon-tile.hub-icon-part-1",
    animation: "hub-icon-domino",
    property: "transform",
    peak: 0.81,
  },
] as const;

async function hubIconAnimationTimes(page: Page) {
  return page.evaluate(
    (parts) =>
      parts.map(({ selector, animation: name }) => {
        const element = document.querySelector(selector);
        const animation = element
          ?.getAnimations()
          .find((item) => item instanceof CSSAnimation && item.animationName === name);
        if (!animation) throw new Error(`Missing Hub icon animation: ${name}`);
        return { name, state: animation.playState, time: Number(animation.currentTime) };
      }),
    animatedHubParts,
  );
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Phrase de passe", { exact: true }).fill(process.env.IDA_E2E_PASSPHRASE ?? "");
  await page.getByRole("button", { name: "Entrer dans IDA", exact: true }).click();
}

async function openHub(page: Page, theme: HubTheme) {
  if (theme === "orbital") {
    await page.getByRole("button", { name: "Sélectionner Le Hub", exact: true }).click();
    await page.getByRole("button", { name: /^Ouvrir Le Hub/u }).click();
  } else if (theme === "immersive") {
    await page
      .locator(".presence-controls")
      .getByRole("button", { name: /^Ouvrir Le Hub/u })
      .click();
  } else {
    const card = page.getByRole("button", { name: "Ouvrir Le Hub", exact: true });
    await expect(card).toHaveAttribute("data-world", "social");
    await expect(card.locator(".hub-world-emblem")).toHaveCount(1);
    await card.click();
  }
  await expect(page.getByRole("region", { name: "Le Hub · votre journal IDA", exact: true })).toBeVisible();
}

async function openMenu(page: Page) {
  await page
    .getByRole("navigation", { name: "Navigation du Hub", exact: true })
    .getByRole("button", { name: "Plus", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Votre Hub", exact: true })).toBeVisible();
}

async function closeMenu(page: Page) {
  await page.getByRole("button", { name: "Fermer · Votre Hub", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Votre Hub", exact: true })).toHaveCount(0);
}

async function hubCanvasSnapshot(page: Page, frames = 0) {
  return page.evaluate(async (frameCount) => {
    // Sample the real browser animation clock, not a screenshot or simulated activity indicator.
    for (let frame = 0; frame < frameCount; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const samples: Record<string, { hash: number; paintedPixels: number }> = {};
    const scratch = document.createElement("canvas");
    scratch.width = 160;
    scratch.height = 90;
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable in the isolated Hub fixture.");
    for (const layer of ["light", "foliage"]) {
      const canvas = document.querySelector<HTMLCanvasElement>(`.hub-atmosphere__${layer}`);
      if (!canvas) throw new Error(`Missing decorative Hub canvas: ${layer}`);
      context.clearRect(0, 0, scratch.width, scratch.height);
      context.drawImage(canvas, 0, 0, scratch.width, scratch.height);
      const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
      let hash = 2166136261;
      let paintedPixels = 0;
      for (let index = 0; index < pixels.length; index++) {
        hash = Math.imul(hash ^ (pixels[index] ?? 0), 16777619) >>> 0;
        if (index % 4 === 3 && (pixels[index] ?? 0) > 0) paintedPixels++;
      }
      samples[layer] = { hash, paintedPixels };
    }
    return samples;
  }, frames);
}

test.beforeEach(async ({ context, baseURL }) => {
  if (!baseURL) throw new Error("The Hub tests require the isolated IDA fixture baseURL.");
  const origin = new URL(baseURL).origin;
  // The fixture owns synthetic data; no real provider, socket or media device can be reached.
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  await context.routeWebSocket("**/*", (socket) => socket.close());
  // Default fixture cannot contact a weather provider; dedicated tests override with synthetic bulletins.
  await context.route("**/v1/home/weather/status", (route) => route.fulfill({ json: { data: { enabled: false } } }));
  await context.addInitScript(() => {
    const state = { requests: 0, locations: 0 };
    Object.assign(window, { hubCaptureFixture: state });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          state.requests++;
          throw new DOMException("No implicit sensor access in Hub tests", "NotAllowedError");
        },
      },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: () => {
          state.locations++;
          throw new DOMException("No precise location in Hub tests", "NotAllowedError");
        },
        watchPosition: () => {
          state.locations++;
          throw new DOMException("No location tracking in Hub tests", "NotAllowedError");
        },
        clearWatch: () => undefined,
      },
    });
  });
});

for (const theme of ["classic", "scifi"] as const) {
  for (const viewport of [
    { name: "iphone", width: 390, height: 844 },
    { name: "desktop", width: 1672, height: 941 },
    { name: "tv-4k", width: 3840, height: 2160 },
  ]) {
    test(`Le Hub ${theme} ${viewport.name} : composition, barre unique et retour accueil`, async ({
      context,
      page,
    }, info) => {
      await context.addInitScript((value) => localStorage.setItem("ida.ui.theme.v1", value), theme);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const errors: string[] = [];
      const effects: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (unexpectedHubMutation(path, request.method())) effects.push(path);
      });
      await login(page);
      await openHub(page, theme);
      const hub = page.locator(".hub-environment");
      await expect(hub).toHaveAttribute("data-theme", theme);
      await expect(hub.getByRole("heading", { name: "JOURNAL", exact: true })).toBeVisible();
      await expect(hub.locator(".hub-atmosphere__image")).toHaveAttribute(
        "src",
        `/design/hub-20260926/hub-${theme}.png`,
      );
      await expect(hub.locator(".hub-widget")).toHaveCount(9);
      for (const panel of [
        "agenda",
        "house",
        "weather",
        "messages",
        "finance",
        "care",
        "music",
        "agents",
        "activity",
      ]) {
        await expect(hub.locator(`.hub-${panel}.hub-widget`)).toBeVisible();
      }
      await expect(hub).toHaveAttribute("data-motion-level", "OFF");
      await expect(hub.locator(".hub-main-orb")).toHaveCSS("animation-name", "none");
      await expect(hub.locator(".hub-presence")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(hub.locator(".hub-presence")).toHaveCSS("background-image", "none");
      await expect(hub.locator(".hub-brand__orb.ida-quickbar__orb")).toBeVisible();
      await expect(hub.locator(".hub-wordmark")).toHaveCount(0);
      await expect(hub.locator(".hub-presence__wave i")).toHaveCount(7);
      await expect(hub.locator(".hub-presence__wave i").first()).toHaveCSS("animation-name", "none");
      await expect(page.locator(".ida-quickbar")).toHaveCount(1);
      await expect(page.locator("#ida-global-message")).toBeVisible();
      await expect(hub.locator("form")).toHaveCount(0);
      await hub.getByRole("button", { name: "Parler à IDA · écrire dans la barre commune", exact: true }).click();
      await expect(page.locator("#ida-global-message")).toBeFocused();
      await expect(hub.locator(".hub-finance")).not.toContainText(/\d[\d\s,.]*[€%]/u);
      await expect(hub.locator(".hub-care")).not.toContainText(/\d\s*%/u);
      expect(await hub.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      const bounds = await hub.boundingBox();
      expect(bounds).not.toBeNull();
      expect(Math.abs(bounds?.x ?? 100)).toBeLessThanOrEqual(1);
      expect(Math.abs(bounds?.y ?? 100)).toBeLessThanOrEqual(1);
      expect(Math.abs((bounds?.width ?? 0) - viewport.width)).toBeLessThanOrEqual(1);
      expect(Math.abs((bounds?.height ?? 0) - viewport.height)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`hub-${theme}-${viewport.name}.png`) });
      expect(effects).toEqual([]);
      expect(
        await page.evaluate(
          () => (window as unknown as { hubCaptureFixture: { requests: number } }).hubCaptureFixture.requests,
        ),
      ).toBe(0);
      await hub.getByRole("button", { name: "Le Hub · retour à l’accueil IDA", exact: true }).click();
      await expect(page.locator(".hub-environment")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Ouvrir Le Hub", exact: true })).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }

  test(`Le Hub ${theme} : IDACAR ouvre le bon environnement`, async ({ context, page }) => {
    await context.addInitScript((value) => localStorage.setItem("ida.ui.theme.v1", value), theme);
    await login(page);
    await openHub(page, theme);
    await page
      .locator(".hub-travel-list")
      .getByRole("button", { name: /Mes trajets.*Ouvrir IDACAR/u })
      .click();
    await expect(page.locator('.world-environment[data-world="idacar"]')).toBeVisible();
    await expect(page.locator(".hub-environment")).toHaveCount(0);
    await page.getByRole("button", { name: "Retour à l’accueil IDA", exact: true }).click();
    await expect(page.getByRole("button", { name: "Ouvrir Le Hub", exact: true })).toHaveCount(1);
  });
}

for (const theme of ["modern", "orbital", "immersive"] as const) {
  test(`Le Hub accessible en ${theme} avec le même journal et le même assistant`, async ({ context, page }) => {
    await context.addInitScript((value) => localStorage.setItem("ida.ui.theme.v1", value), theme);
    await login(page);
    await openHub(page, theme);
    await expect(page.locator(".hub-environment")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".hub-atmosphere")).toHaveAttribute("data-hub-scene", "scifi");
    await expect(page.locator(".ida-quickbar")).toHaveCount(1);
    await expect(page.locator("#ida-global-message")).toBeVisible();
    if (theme === "modern") {
      await expect(page.locator(".modern-topbar")).toBeHidden();
      await expect(page.locator(".modern-atmosphere")).toBeHidden();
    }
    await page.locator(".hub-dock").getByRole("button", { name: "Explorer", exact: true }).click();
    await expect(page.locator(".hub-environment")).toHaveCount(0);
    await expect(page.locator('.worlds[data-opened="false"]')).toBeVisible();
  });
}

test("Le Hub : connexions lues uniquement au clic, erreurs visibles et données masquées", async ({ context, page }) => {
  await context.addInitScript(() => localStorage.setItem("ida.ui.theme.v1", "scifi"));
  const calls: Array<{ path: string; body: unknown }> = [];
  let failReads = false;
  // These are synthetic transport responses, never requests to real accounts.
  await context.route("**/v1/home/device/status", (route) =>
    route.fulfill({
      json: {
        data: {
          provider: "HOME_ASSISTANT",
          mode: "READ_ONLY_PILOT",
          state: "CONFIGURED",
        },
      },
    }),
  );
  await context.route("**/v1/home/device/read", (route) => {
    calls.push({ path: "/v1/home/device/read", body: route.request().postDataJSON() });
    if (failReads) return route.fulfill({ status: 503, json: { error: "SYNTHETIC_UNAVAILABLE" } });
    const now = new Date().toISOString();
    return route.fulfill({ json: { data: { state: "ON", observedAt: now, providerUpdatedAt: now } } });
  });
  await context.route("**/v1/mcp/integrations/status", (route) =>
    route.fulfill({
      json: {
        data: {
          provider: "MCP",
          mode: "WORKSPACE_TOOLS",
          state: "CONFIGURED",
          tools: [
            { toolKey: "CALENDAR_READ", moduleKey: "CALENDAR", permission: "READ" },
            { toolKey: "EMAIL_READ", moduleKey: "IDA", permission: "READ" },
          ],
          externalCalendars: [{ provider: "google", state: "READY" }],
        },
      },
    }),
  );
  await context.route("**/v1/mcp/integrations/call", (route) => {
    const body = route.request().postDataJSON() as { tool: string };
    calls.push({ path: "/v1/mcp/integrations/call", body });
    if (failReads) return route.fulfill({ status: 503, json: { error: "SYNTHETIC_UNAVAILABLE" } });
    const now = Date.now();
    const start = new Date(now).toISOString();
    const end = new Date(now + 30 * 60_000).toISOString();
    if (body.tool === "CALENDAR_READ")
      return route.fulfill({
        json: {
          data: {
            tool: "CALENDAR_READ",
            range: {
              view: "WEEK",
              from: new Date(now - 3 * 86_400_000).toISOString(),
              to: new Date(now + 4 * 86_400_000).toISOString(),
              timezone: "Europe/Paris",
            },
            items: [],
            externalEvents: [
              {
                id: "hub-synthetic-calendar",
                title: "RENDEZ_VOUS_HUB_SYNTHETIQUE",
                source: "google",
                start,
                end,
                calendar: "Test Hub",
              },
            ],
          },
        },
      });
    if (body.tool === "EMAIL_READ")
      return route.fulfill({
        json: {
          data: {
            tool: "EMAIL_READ",
            messages: [
              {
                id: "hub-synthetic-mail",
                subject: "MESSAGE_HUB_SYNTHETIQUE",
                sender: "Fixture",
                receivedAt: start,
                preview: "Extrait synthétique Hub",
              },
            ],
          },
        },
      });
    return route.fulfill({ status: 400, json: { error: "UNEXPECTED_HUB_TOOL" } });
  });
  await login(page);
  await openHub(page, "scifi");
  await openMenu(page);
  const read = page.getByRole("button", { name: "Lire mes connexions autorisées", exact: true });
  await expect(read).toBeEnabled();
  expect(calls).toEqual([]);
  await read.click();
  await expect.poll(() => calls.length).toBe(3);
  await expect(read).toBeEnabled();
  await closeMenu(page);
  const hub = page.locator(".hub-environment");
  await expect(hub.locator(".hub-agenda")).toContainText("RENDEZ_VOUS_HUB_SYNTHETIQUE");
  await expect(hub.locator(".hub-messages")).toContainText("MESSAGE_HUB_SYNTHETIQUE");
  expect(calls.find((call) => call.path === "/v1/home/device/read")?.body).toEqual({ consent: true });
  expect(
    calls
      .filter((call) => call.path === "/v1/mcp/integrations/call")
      .map((call) => (call.body as { tool: string }).tool),
  ).toEqual(["CALENDAR_READ", "EMAIL_READ"]);
  await openMenu(page);
  await page.getByRole("checkbox", { name: "Masquer les données de ce tableau", exact: true }).check();
  await closeMenu(page);
  await expect(hub).toHaveAttribute("data-private", "true");
  await expect(hub).not.toContainText("MESSAGE_HUB_SYNTHETIQUE");
  await expect(hub).not.toContainText("RENDEZ_VOUS_HUB_SYNTHETIQUE");
  expect(calls).toHaveLength(3);
  await openMenu(page);
  await page.getByRole("checkbox", { name: "Masquer les données de ce tableau", exact: true }).uncheck();
  failReads = true;
  await read.click();
  await expect.poll(() => calls.length).toBe(6);
  await expect(read).toBeEnabled();
  await closeMenu(page);
  await expect(hub.locator(".hub-messages")).toContainText("Lecture indisponible");
  await expect(hub).not.toContainText("MESSAGE_HUB_SYNTHETIQUE");
  await expect(hub).not.toContainText("RENDEZ_VOUS_HUB_SYNTHETIQUE");
  expect(
    await page.evaluate(
      () => (window as unknown as { hubCaptureFixture: { requests: number } }).hubCaptureFixture.requests,
    ),
  ).toBe(0);
});

test.describe("Le Hub · animation réelle du décor", () => {
  test.use({ reducedMotion: "no-preference", viewport: { width: 1672, height: 941 } });

  test("météo automatique : bulletin visible, cache partagé, pluie/soleil/inconnu et changement de ville", async ({
    context,
    page,
  }) => {
    await context.addInitScript(() => localStorage.setItem("ida.ui.theme.v1", "classic"));
    let code: number | null = 63;
    let temperature = 13;
    let weatherReads = 0;
    const cities: string[] = [];
    const effects: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (unexpectedHubMutation(path, request.method())) effects.push(path);
    });
    await context.route("**/v1/home/weather/status", (route) => route.fulfill({ json: { data: { enabled: true } } }));
    await context.route("**/v1/home/weather", (route) => {
      weatherReads++;
      const { cityId } = route.request().postDataJSON() as { cityId: string };
      expect(["marseille", "geneva"]).toContain(cityId);
      expect(route.request().postDataJSON()).toEqual({ cityId });
      cities.push(cityId);
      const now = new Date();
      const instant = now.toISOString();
      return route.fulfill({
        json: {
          data: {
            version: 1,
            cityId,
            fetchedAt: instant,
            expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
            source: "OPEN_METEO",
            current: {
              at: instant,
              temperature,
              apparentTemperature: temperature,
              humidity: null,
              windSpeed: null,
              windDirection: null,
              pressure: null,
              code,
              isDay: true,
            },
            hourly: [],
            daily: [
              {
                date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(now),
                minimum: 10,
                maximum: 24,
                code,
                precipitationProbability: null,
                uvMax: null,
                sunrise: null,
                sunset: null,
                daylightSeconds: null,
                snowfall: null,
              },
            ],
            air: null,
          },
        },
      });
    });
    await login(page);
    await openHub(page, "classic");
    const widget = page.locator('.hub-weather .hub-widget-atmosphere[data-widget-atmosphere="weather"]');
    await expect(widget).toHaveAttribute("data-weather", "rain");
    await expect(page.locator(".hub-weather-reading")).toContainText("13");
    await expect(widget.locator(".hub-widget-atmosphere__fall")).toHaveCount(8);
    await expect(widget.locator(".hub-widget-atmosphere__sun")).toHaveCount(0);
    await expect(widget.locator(".hub-widget-atmosphere__fall").first()).not.toHaveCSS("animation-name", "none");
    expect(weatherReads).toBe(1); // The public-city request is now authorized on opening Hub.

    for (const [index, scenario] of [
      { code: 0, temperature: 24, decor: "sun" },
      { code: null, temperature: 18, decor: "neutral" },
    ].entries()) {
      code = scenario.code;
      temperature = scenario.temperature;
      await page.locator(".hub-weather-reading").click();
      await page.locator(".house-weather-link").click();
      const load = page.locator(".weather-load-button");
      await expect(load).toBeEnabled();
      await expect(load).toContainText("Actualiser");
      expect(weatherReads).toBe(index + 1); // A valid Hub cache avoids a duplicate tool request.
      await load.click();
      await expect.poll(() => weatherReads).toBe(index + 2);
      await expect(load).toBeEnabled();
      await expect(page.locator(".weather-temperature")).toContainText(String(temperature));
      await page.locator(".ida-quickbar__home").click();
      await openHub(page, "classic");
      await expect(widget).toHaveAttribute("data-weather", scenario.decor);
      if (scenario.decor === "sun") {
        await expect(widget.locator(".hub-widget-atmosphere__sun")).toBeVisible();
        await expect(widget.locator(".hub-widget-atmosphere__fall")).toHaveCount(0);
      } else {
        await expect(widget.locator(".hub-widget-atmosphere__neutral")).toHaveCount(1);
        await expect(widget.locator(".hub-widget-atmosphere__fall, .hub-widget-atmosphere__sun")).toHaveCount(0);
      }
      expect(weatherReads).toBe(index + 2); // Returning to Hub only reads the shared in-memory bulletin.
    }
    await page.locator(".hub-weather-reading").click();
    await page.locator(".house-weather-link").click();
    await expect(page.locator(".weather-temperature")).toContainText("18");
    expect(weatherReads).toBe(3);
    code = 63;
    temperature = 6;
    await page.locator(".weather-city select").selectOption("geneva");
    await expect(page.locator(".weather-temperature")).toContainText("6");
    expect(weatherReads).toBe(4);
    expect(cities).toEqual(["marseille", "marseille", "marseille", "geneva"]);
    await page.locator(".ida-quickbar__home").click();
    await openHub(page, "classic");
    await expect(page.locator(".hub-weather-reading")).toContainText("18");
    await expect(widget).toHaveAttribute("data-weather", "neutral");
    expect(weatherReads).toBe(4);
    expect(effects).toEqual([]);
    expect(
      await page.evaluate(
        () => (window as unknown as { hubCaptureFixture: { requests: number; locations: number } }).hubCaptureFixture,
      ),
    ).toEqual({ requests: 0, locations: 0 });
  });

  test("météo automatique : échec visible sans données inventées ni boucle de retry", async ({ context, page }) => {
    await context.addInitScript(() => localStorage.setItem("ida.ui.theme.v1", "scifi"));
    let reads = 0;
    const effects: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (unexpectedHubMutation(path, request.method())) effects.push(path);
    });
    await context.route("**/v1/home/weather/status", (route) => route.fulfill({ json: { data: { enabled: true } } }));
    await context.route("**/v1/home/weather", (route) => {
      reads++;
      expect(route.request().postDataJSON()).toEqual({ cityId: "marseille" });
      return route.fulfill({
        status: 503,
        json: { error: { code: "WEATHER_UNAVAILABLE", message: "Météo indisponible · échec synthétique" } },
      });
    });
    await login(page);
    await openHub(page, "scifi");
    const widget = page.locator('.hub-weather .hub-widget-atmosphere[data-widget-atmosphere="weather"]');
    await expect.poll(() => reads).toBe(1);
    await expect(page.locator(".hub-weather")).toContainText(/indisponible/iu);
    await expect(widget).toHaveAttribute("data-weather", "neutral");
    await expect(widget.locator(".hub-widget-atmosphere__fall, .hub-widget-atmosphere__sun")).toHaveCount(0);
    await expect(page.locator(".hub-weather-reading strong")).not.toContainText(/\d/u);
    await hubCanvasSnapshot(page, 30);
    expect(reads).toBe(1);
    await page.locator(".hub-weather-reading").click();
    await page.locator(".house-weather-link").click();
    await expect(page.locator(".weather-error")).toContainText(/indisponible|échec/iu);
    await expect(page.locator(".weather-temperature")).not.toContainText(/\d/u);
    const settledReads = reads;
    // A fresh screen may make a bounded retry; it must never start continuous background requests.
    expect(settledReads).toBeLessThanOrEqual(2);
    await page.evaluate(async () => {
      for (let frame = 0; frame < 30; frame++)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(reads).toBe(settledReads);
    expect(effects).toEqual([]);
    expect(
      await page.evaluate(
        () => (window as unknown as { hubCaptureFixture: { requests: number; locations: number } }).hubCaptureFixture,
      ),
    ).toEqual({ requests: 0, locations: 0 });
  });

  test("journal : extrait reçu, lecture animée, pause souris/clavier et confidentialité", async ({ context, page }) => {
    await context.addInitScript(() => localStorage.setItem("ida.ui.theme.v1", "scifi"));
    const preview = "EXTRAIT_REEL_FIXTURE — Le menuisier confirme les mesures, le bois et le créneau de visite. "
      .repeat(7)
      .trim();
    const otherPreview = "EXTRAIT_SECOND_MESSAGE_NE_DOIT_PAS_DEFILER";
    const calls: string[] = [];
    await context.route("**/v1/home/device/status", (route) =>
      route.fulfill({
        json: { data: { provider: "HOME_ASSISTANT", mode: "READ_ONLY_PILOT", state: "DISABLED" } },
      }),
    );
    await context.route("**/v1/mcp/integrations/status", (route) =>
      route.fulfill({
        json: {
          data: {
            provider: "MCP",
            mode: "WORKSPACE_TOOLS",
            state: "CONFIGURED",
            tools: [{ toolKey: "EMAIL_READ", moduleKey: "IDA", permission: "READ" }],
            externalCalendars: [{ provider: "google", state: "NEEDS_CONNECTOR" }],
          },
        },
      }),
    );
    await context.route("**/v1/mcp/integrations/call", (route) => {
      const tool = (route.request().postDataJSON() as { tool: string }).tool;
      calls.push(tool);
      if (tool !== "EMAIL_READ") return route.fulfill({ status: 400, json: { error: "UNEXPECTED_HUB_TOOL" } });
      return route.fulfill({
        json: {
          data: {
            tool,
            messages: [
              {
                id: "journal-1",
                subject: "Mesures confirmées · fixture",
                sender: "Atelier de test",
                receivedAt: new Date().toISOString(),
                preview,
              },
              {
                id: "journal-2",
                subject: "Document reçu · fixture",
                sender: "Compte de test",
                receivedAt: new Date().toISOString(),
                preview: otherPreview,
              },
              {
                id: "journal-3",
                subject: "Troisième message accessible · fixture",
                sender: "Dernier compte de test",
                receivedAt: new Date().toISOString(),
                preview: "Extrait tiers synthétique",
              },
            ],
          },
        },
      });
    });
    await login(page);
    await openHub(page, "scifi");
    expect(calls).toEqual([]);
    await expect(page.locator(".hub-message-journal")).toHaveCount(0);
    await openMenu(page);
    const read = page.getByRole("button", { name: "Lire mes connexions autorisées", exact: true });
    await expect(read).toBeEnabled();
    await read.click();
    await expect.poll(() => calls.length).toBe(1);
    await expect(read).toBeEnabled();
    await closeMenu(page);
    const journal = page.locator(".hub-message-journal");
    const entry = journal.locator(".hub-message-journal__entry").first();
    const detail = journal.locator(".hub-message-journal__preview .hub-message-journal__detail");
    await expect(journal.getByRole("button")).toHaveCount(3);
    await expect(detail).toHaveText(preview);
    await expect(journal).not.toContainText(otherPreview);
    await expect(journal.locator(".hub-message-journal__metadata")).toContainText("Atelier de test");
    await expect(detail).toHaveCSS("animation-name", "hub-journal-read");
    await expect(detail).toHaveCSS("animation-play-state", "running");
    const positions = await detail.evaluate((element) => {
      const animation = element
        .getAnimations()
        .find((item) => item instanceof CSSAnimation && item.animationName === "hub-journal-read");
      if (!animation?.effect) throw new Error("No real journal animation");
      const duration = Number(animation.effect.getComputedTiming().duration);
      const delay = animation.effect.getTiming().delay ?? 0;
      const originalTime = animation.currentTime;
      try {
        animation.currentTime = delay + duration * 2.1;
        const rest = getComputedStyle(element).transform;
        animation.currentTime = delay + duration * 2.7;
        return { rest, active: getComputedStyle(element).transform };
      } finally {
        animation.currentTime = originalTime;
      }
    });
    expect(positions.active).not.toBe(positions.rest);
    await entry.hover();
    await expect(detail).toHaveCSS("animation-play-state", "paused");
    const frozen = await detail.evaluate((element) => Number(element.getAnimations()[0]?.currentTime));
    await hubCanvasSnapshot(page, 12);
    expect(await detail.evaluate((element) => Number(element.getAnimations()[0]?.currentTime))).toBe(frozen);
    await entry.focus();
    await page.mouse.move(4, 4);
    await expect(entry).toBeFocused();
    await expect(detail).toHaveCSS("animation-play-state", "paused");
    await page.locator("#ida-global-message").focus();
    await expect(detail).toHaveCSS("animation-play-state", "running");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(detail).toHaveCSS("animation-name", "none");
    await expect(detail).toHaveCSS("white-space", "normal");
    await expect(detail).toHaveText(preview);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(journal).toHaveCSS("overflow-y", "auto");
    const thirdMessage = journal.getByRole("button", { name: /Troisième message accessible/u });
    await thirdMessage.scrollIntoViewIfNeeded();
    await expect(thirdMessage).toBeInViewport();
    expect(
      await thirdMessage.evaluate((element) => {
        const viewport = element.closest(".hub-message-journal")?.getBoundingClientRect();
        const item = element.getBoundingClientRect();
        return !!viewport && item.top >= viewport.top - 1 && item.bottom <= viewport.bottom + 1;
      }),
    ).toBe(true);
    await openMenu(page);
    await page.getByRole("checkbox", { name: "Masquer les données de ce tableau", exact: true }).check();
    await closeMenu(page);
    await expect(page.locator(".hub-message-journal")).toHaveCount(0);
    await expect(page.locator(".hub-environment")).not.toContainText(preview);
    await expect(page.locator(".hub-environment")).not.toContainText("Mesures confirmées · fixture");
    expect(calls).toEqual(["EMAIL_READ"]);
    expect(
      await page.evaluate(
        () => (window as unknown as { hubCaptureFixture: { requests: number } }).hubCaptureFixture.requests,
      ),
    ).toBe(0);
  });

  for (const theme of ["classic", "scifi"] as const) {
    test(`${theme} : lumière et feuillage animés, pause/reprise, réduction des mouvements`, async ({
      context,
      page,
    }) => {
      // Exercise the CSS/SVG fallback deterministically. A working WebGL
      // enhancement intentionally hides it; WebGL has its own spatial suite.
      await context.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
          value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
            if (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl") return null;
            return Reflect.apply(getContext, this, [kind, ...args]);
          },
          configurable: true,
        });
      });
      await context.addInitScript((value) => {
        localStorage.setItem("ida.ui.theme.v1", value);
        localStorage.setItem("ida.ui.motion.v1", "STANDARD");
      }, theme);
      const effects: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (unexpectedHubMutation(path, request.method())) effects.push(path);
      });
      await login(page);
      await openHub(page, theme);
      const hub = page.locator(".hub-environment");
      const atmosphere = hub.locator(".hub-atmosphere");
      const currents = hub.locator(".hub-main-orb > .hub-orb-filaments .hub-orb-filaments__current");
      await expect(hub).not.toHaveAttribute("data-motion-level", "OFF");
      await expect(atmosphere).toHaveAttribute("data-motion-ambient-paused", "false");
      await expect(hub.locator(".hub-main-orb > .hub-orb-filaments")).toBeVisible();
      await expect(currents).toHaveCount(3);
      await expect(currents.first()).not.toHaveCSS("animation-name", "none");
      for (const part of animatedHubParts) {
        const target = hub.locator(part.selector);
        await expect(target).toHaveCount(1);
        await expect(target).toHaveCSS("animation-name", part.animation);
        await expect(target).toHaveCSS("animation-play-state", "running");
        // Deterministically sample the existing CSS animation's rest and active phases.
        // This validates rendered geometry without waiting through the intentional long rest.
        const sample = await target.evaluate((element, definition) => {
          const animation = element
            .getAnimations()
            .find((item) => item instanceof CSSAnimation && item.animationName === definition.animation);
          if (!animation?.effect) throw new Error(`Missing live animation ${definition.animation}`);
          const duration = Number(animation.effect.getComputedTiming().duration);
          if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid icon animation duration");
          const delay = animation.effect.getTiming().delay ?? 0;
          const originalTime = animation.currentTime;
          const originalState = animation.playState;
          try {
            // Synchronous time sampling only: pause()/play() would override the CSS
            // play-state and invalidate the subsequent user-pause behavior under test.
            animation.currentTime = delay + duration * 2.05;
            const rest = getComputedStyle(element).getPropertyValue(definition.property);
            animation.currentTime = delay + duration * (2 + definition.peak);
            const active = getComputedStyle(element).getPropertyValue(definition.property);
            return { rest, active, originalState };
          } finally {
            animation.currentTime = originalTime;
          }
        }, part);
        expect(sample.originalState).toBe("running");
        expect(sample.active, `${part.animation} changes its real rendered ${part.property}`).not.toBe(sample.rest);
      }
      await expect
        .poll(() => atmosphere.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      for (const layer of ["light", "foliage"]) {
        await expect(atmosphere.locator(`.hub-atmosphere__${layer}`)).toBeVisible();
        await expect.poll(async () => (await hubCanvasSnapshot(page))[layer]?.paintedPixels ?? 0).toBeGreaterThan(0);
      }
      const moving = await hubCanvasSnapshot(page);
      const later = await hubCanvasSnapshot(page, 18);
      for (const layer of ["light", "foliage"]) expect(later[layer]?.hash).not.toBe(moving[layer]?.hash);

      await openMenu(page);
      await page.getByRole("button", { name: "Mettre les animations en pause", exact: true }).click();
      await closeMenu(page);
      await expect(hub).toHaveAttribute("data-paused", "true");
      await expect(atmosphere).toHaveAttribute("data-motion-ambient-paused", "true");
      for (const current of await currents.all()) await expect(current).toHaveCSS("animation-play-state", "paused");
      const frozen = await hubCanvasSnapshot(page, 2);
      for (const layer of ["light", "foliage"]) expect(frozen[layer]?.paintedPixels).toBeGreaterThan(0);
      for (const part of animatedHubParts)
        await expect(hub.locator(part.selector)).toHaveCSS("animation-play-state", "paused");
      const frozenIconTimes = await hubIconAnimationTimes(page);
      expect(frozenIconTimes.every((item) => item.state === "paused")).toBe(true);
      expect(await hubCanvasSnapshot(page, 18)).toEqual(frozen);
      expect(await hubIconAnimationTimes(page)).toEqual(frozenIconTimes);

      await openMenu(page);
      await page.getByRole("button", { name: "Reprendre les animations", exact: true }).click();
      await closeMenu(page);
      await expect(hub).toHaveAttribute("data-paused", "false");
      await expect(atmosphere).toHaveAttribute("data-motion-ambient-paused", "false");
      const resumed = await hubCanvasSnapshot(page, 12);
      const resumedIconTimes = await hubIconAnimationTimes(page);
      const resumedLater = await hubCanvasSnapshot(page, 18);
      for (const layer of ["light", "foliage"]) expect(resumedLater[layer]?.hash).not.toBe(resumed[layer]?.hash);
      const laterIconTimes = await hubIconAnimationTimes(page);
      for (const [index, icon] of laterIconTimes.entries()) {
        expect(icon.state).toBe("running");
        expect(icon.time).toBeGreaterThan(resumedIconTimes[index]?.time ?? Number.POSITIVE_INFINITY);
      }

      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(hub).toHaveAttribute("data-motion-level", "OFF");
      await expect(atmosphere).toHaveAttribute("data-motion-level", "OFF");
      for (const layer of ["light", "foliage"]) {
        await expect(atmosphere.locator(`.hub-atmosphere__${layer}`)).toBeHidden();
      }
      await expect(hub.locator(".hub-main-orb")).toHaveCSS("animation-name", "none");
      for (const current of await currents.all()) await expect(current).toHaveCSS("animation-name", "none");
      for (const part of animatedHubParts) {
        const target = hub.locator(part.selector);
        await expect(target).toHaveCSS("animation-name", "none");
        expect(await target.evaluate((element) => element.getAnimations().length)).toBe(0);
      }
      const reduced = await hubCanvasSnapshot(page, 2);
      expect(await hubCanvasSnapshot(page, 18)).toEqual(reduced);
      expect(effects).toEqual([]);
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(
          () => (window as unknown as { hubCaptureFixture: { requests: number } }).hubCaptureFixture.requests,
        ),
      ).toBe(0);
    });
  }
});
