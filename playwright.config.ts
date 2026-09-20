import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// Synthetic credential only; never use a real account, profile or data directory.
process.env.IDA_E2E_PASSPHRASE ??= randomBytes(32).toString("base64url");
process.env.IDA_E2E_OUTPUT_DIR ??= mkdtempSync(join(tmpdir(), "ida-mcp-browser-results-"));
const origin = "http://127.0.0.1:8791";
const fixture = fileURLToPath(new URL("./e2e/fixture-server.ts", import.meta.url));
const loader = new URL("./node_modules/.pnpm/tsx@4.23.12/node_modules/tsx/dist/loader.mjs", import.meta.url).href;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "mcp.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: "list",
  outputDir: process.env.IDA_E2E_OUTPUT_DIR,
  use: {
    baseURL: origin,
    browserName: "chromium",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 960 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    reducedMotion: "reduce",
    permissions: [],
    serviceWorkers: "block",
    video: "off",
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--deny-permission-prompts",
        "--use-fake-device-for-media-stream",
        "--disable-background-networking",
        "--disable-component-update",
        "--no-default-browser-check",
      ],
    },
  },
  webServer: {
    command: `"${process.execPath}" --import "${loader}" "${fixture}"`,
    url: `${origin}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      IDA_E2E_PASSPHRASE: process.env.IDA_E2E_PASSPHRASE,
      IDA_LOCAL_DIALOGUE: "0",
      OLLAMA_NO_CLOUD: "1",
    },
  },
});
