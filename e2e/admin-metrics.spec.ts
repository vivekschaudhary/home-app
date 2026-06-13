import { type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";

// WLT-13 — the /admin/metrics gate + no-PII, tested against the REAL route
// (AC5/AC6/AC11): a non-admin gets a 404 (the surface is unenumerable); the
// admin (the FIRST entry of ADMIN_EMAILS — the same env the dev server reads)
// gets a 200 with the three sections; the rendered HTML carries no emails/UUIDs
// (aggregates only). Gated like the other real-stack specs. Run:
//   ADMIN_EMAILS=e2e-admin@example.com E2E_PASSKEY=1 pnpm exec playwright test e2e/admin-metrics.spec.ts
const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;
const ADMIN_EMAIL = (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim().toLowerCase() || null;

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function signUpWithPasskey(page: Page, client: CDPSession, email: string, password: string) {
  await client.send("WebAuthn.enable");
  await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
  await page.getByRole("button", { name: "Create passkey" }).click();
  await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });
}

test.describe("admin metrics gate (WLT-13)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("a SIGNED-OUT visitor gets a 404 — NOT a redirect to /sign-in (AC5: unenumerable)", async ({ page }) => {
    const resp = await page.goto("/admin/metrics");
    expect(resp?.status()).toBe(404); // a redirect (302→/sign-in 200) would leak the route's existence
    expect(new URL(page.url()).pathname).toBe("/admin/metrics"); // did not bounce to /sign-in
    await expect(page.getByText("Metrics — internal")).toHaveCount(0);
  });

  test("a signed-in NON-admin gets a 404 — the surface is unenumerable (AC5)", async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    const email = `e2e-nonadmin+${Date.now()}@example.com`;
    expect(email).not.toBe(ADMIN_EMAIL); // sanity: definitely not allow-listed
    await signUpWithPasskey(page, cdp, email, "correct horse battery staple");

    const resp = await page.goto("/admin/metrics");
    expect(resp?.status()).toBe(404);
    await expect(page.getByText("Metrics — internal")).toHaveCount(0);
  });

  test("the allow-listed admin gets a 200 with aggregates only — no OTHER user's email/id in the HTML (AC5/AC6)", async ({
    page,
    context,
  }) => {
    test.skip(!ADMIN_EMAIL, "Set ADMIN_EMAILS (the dev server must see the same value).");
    const cdp = await context.newCDPSession(page);

    // Recreate the fixed admin user so the spec is re-runnable (cascades wipe
    // credentials/events from prior runs).
    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      await db.query("delete from auth.users where email = $1", [ADMIN_EMAIL]);

      await signUpWithPasskey(page, cdp, ADMIN_EMAIL as string, "correct horse battery staple");
      const resp = await page.goto("/admin/metrics");
      expect(resp?.status()).toBe(200);

      // The three sections render.
      await expect(page.getByRole("heading", { name: "TTFV — signup → first action" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "WAWU — weekly active wealth-building users" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Funnel — per-stage users + conversion" })).toBeVisible();

      // No-PII (AC6): the page may legitimately embed the VIEWER'S OWN session
      // hydration (their own email/ids — present on every authenticated page);
      // the metrics guardrail is that NO OTHER user's email or id appears.
      // Build the allow-set from the DB, then assert every match is the viewer's.
      const u = await db.query("select id from auth.users where email = $1", [ADMIN_EMAIL]);
      const own = new Set<string>([String(u.rows[0].id).toLowerCase()]);
      // Column names vary across Supabase versions — collect every UUID-shaped
      // value on the viewer's identity rows (they're all the viewer's own ids).
      const idents = await db.query("select * from auth.identities where user_id = $1", [u.rows[0].id]);
      for (const r of idents.rows) {
        for (const v of Object.values(r as Record<string, unknown>)) {
          if (typeof v === "string" && UUID_RE.test(v)) own.add(v.toLowerCase());
        }
      }

      const html = await page.content();
      const emails = html.match(new RegExp(EMAIL_RE, "gi")) ?? [];
      for (const e of emails) expect(e.toLowerCase()).toBe(ADMIN_EMAIL); // only the viewer's own
      const uuids = html.match(new RegExp(UUID_RE, "gi")) ?? [];
      for (const id of uuids) expect(own.has(id.toLowerCase())).toBe(true); // only the viewer's own ids
    } finally {
      await db.end();
    }
  });
});
