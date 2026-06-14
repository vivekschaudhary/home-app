// Warms `next dev`'s on-demand route compilation before the gated multi-step
// specs run. Without this, each new page/route compiles on first hit mid-flow
// (1–5s each), so per-assertion timeouts fail at random points run to run.

import { purgeE2EUsers } from "./purge-e2e-users";

const PAGES = ["/", "/sign-up", "/sign-in", "/unsupported", "/dashboard", "/settings/security"];
const API = [
  "/api/auth/sign-up",
  "/api/auth/sign-in",
  "/api/auth/sign-out",
  "/api/auth/webauthn/register/options",
  "/api/auth/webauthn/register/verify",
  "/api/auth/webauthn/authenticate/options",
  "/api/auth/webauthn/authenticate/verify",
  "/api/auth/totp/enroll/start",
  "/api/auth/totp/enroll/verify",
  "/api/auth/totp/challenge/verify",
  "/api/auth/totp/unenroll",
  "/api/auth/factors",
];

export default async function globalSetup() {
  // Start clean — clear any residue a prior run's teardown couldn't (crash / ^C).
  await purgeE2EUsers();

  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";

  // Wait for the dev server to be reachable.
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Compile every route once (unauth responses are fine — compilation is the point).
  await Promise.all([
    ...PAGES.map((p) => fetch(base + p).catch(() => {})),
    ...API.map((a) =>
      fetch(base + a, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }).catch(() => {}),
    ),
  ]);
}
