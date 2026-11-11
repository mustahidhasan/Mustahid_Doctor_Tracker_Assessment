import { defineConfig } from "@playwright/test";

/**
 * Runs against an already running frontend (`./run.sh` or a production build). Required env:
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD   – an existing admin account
 * Optional: E2E_BASE_URL (default http://localhost:3000).
 * Uses the installed Google Chrome (no browser download). Tests create only clearly labelled,
 * disposable "[E2E <run id>]" records and delete them, so they never touch seed or manual data.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
});
