import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "typography-atelier.spec.ts",
  retries: 0,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm --dir apps/web exec vite --config vite.typography.config.ts --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174/typography-preview.html",
    reuseExistingServer: false,
    timeout: 45000,
  },
});
