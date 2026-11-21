import { defineConfig, devices } from "@playwright/test";

/**
 * Browser flows run against a production build on port 3100.
 * First run: `npx playwright install chromium` (CI: add `--with-deps`).
 * To use an installed Chrome or Edge instead, set PW_CHANNEL to "chrome" or "msedge".
 */
const channel = process.env.PW_CHANNEL || undefined;
const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, channel } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
