import { defineConfig, devices } from "@playwright/test";

/**
 * SmartSpend Phase 1 E2E.
 * Runs against a production build (`next start`) because the app is fully
 * client-side (local-first) and we want the flow exercised as deployed.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.SMARTSPEND_E2E_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "npm run start -- -p 3100 -H 0.0.0.0",
    cwd: __dirname,
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
