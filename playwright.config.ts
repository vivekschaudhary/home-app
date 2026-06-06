import { defineConfig, devices } from "@playwright/test";

// E2E config. When E2E_BASE_URL is set (e.g. a Vercel preview), tests run
// against it; otherwise Playwright builds + boots the app locally. The full
// passkey happy-path spec is gated on E2E_PASSKEY=1 + a real Supabase project
// (see e2e/passkey-flow.spec.ts); the guard/smoke specs run anywhere.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: "http://localhost:3000",
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
