import { defineConfig, devices } from "@playwright/test";

// E2E config. When E2E_BASE_URL is set (e.g. a Vercel preview), tests run
// against it; otherwise Playwright builds + boots the app locally. The full
// passkey happy-path spec is gated on E2E_PASSKEY=1 + a real Supabase project
// (see e2e/passkey-flow.spec.ts); the guard/smoke specs run anywhere.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // Warm dev-server route compilation before tests (see e2e/global-setup.ts).
  globalSetup: "./e2e/global-setup.ts",
  // Purge gated-E2E user residue after the run so a shared DB doesn't accumulate it.
  globalTeardown: "./e2e/global-teardown.ts",
  // Output under node_modules/.cache so writes don't land in the project root,
  // where `next dev`'s file-watcher would trigger Fast Refresh and remount the
  // multi-step auth flow mid-test. `list` reporter avoids a playwright-report/ dir.
  outputDir: "node_modules/.cache/playwright-output",
  fullyParallel: false,
  // One worker: the gated passkey/TOTP specs share a single dev server, create
  // real Supabase users, and each drive a WebAuthn virtual authenticator —
  // running them across parallel workers makes the concurrent ceremonies hang.
  workers: 1,
  forbidOnly: !!process.env.CI,
  // The gated specs drive a real Supabase project + a WebAuthn virtual
  // authenticator (simulated ceremonies occasionally flake); allow a retry.
  retries: process.env.E2E_PASSKEY ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  // Dev server: NODE_ENV=development → cookies aren't secure-only (works over
  // http://localhost) and the WEBAUTHN_* prod fail-loud guards use dev defaults.
  // Production behaviour (https origin, secure cookies, RP-ID match) is covered
  // by the `check` job's build + manifest inspection, not here.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
        // WLT-16/17: the "since last time" recap ships dark behind RECAP_ENABLED.
        // Turn it on for the e2e server so the recap's real-path spec can exercise
        // its owner-scoped reads (net_worth_snapshots + transactions) through a
        // real session → createServerSupabase → RLS → rendered rows.
        env: { ...process.env, RECAP_ENABLED: "true" },
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
