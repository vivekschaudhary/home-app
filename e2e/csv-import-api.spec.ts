// WLT-27-3 AC-14 — E2E integration test for the CSV import API.
// regression: false  e2e: true
//
// Covers:
//   • Happy path: 5-row import → all 5 land in `transactions` under the correct account.
//   • Idempotency: re-import identical rows → inserted=0, row count unchanged.
//   • Failure paths (no auth, validation errors, unknown account).
//
// Data-mutating tests clean up in afterAll (hard-delete per `[per-surface-vertical-test]`).
// The no-auth test creates no data and needs no guard.
//
// Guard (gated suite): E2E_PASSKEY=1 + SUPABASE_DB_URL.

import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";

const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

const CSV_ROWS = [
  { occurredOn: "2026-06-01", description: "Coffee Shop", amount: "4.50", direction: "debit" },
  { occurredOn: "2026-06-02", description: "Grocery Store", amount: "62.35", direction: "debit" },
  { occurredOn: "2026-06-03", description: "Paycheck", amount: "2500.00", direction: "credit" },
  { occurredOn: "2026-06-04", description: "Electric Bill", amount: "128.90", direction: "debit" },
  { occurredOn: "2026-06-05", description: "ATM Withdrawal", amount: "60.00", direction: "debit" },
] as const;

/** WebAuthn virtual authenticator options (same across all tests). */
const WEBAUTHN_OPTIONS = {
  protocol: "ctap2" as const,
  transport: "internal" as const,
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
};

/** Sign in as an existing passkey user and wait for a post-auth URL. */
async function signInWithPasskey(
  page: Page,
  context: BrowserContext,
  email: string,
  password: string,
): Promise<void> {
  const cdp: CDPSession = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: WEBAUTHN_OPTIONS });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("button", { name: /use passkey/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
}

// ─── No-auth failure path — no guard needed, just the dev server ─────────────
//
// The AAL2 gate is the first check in the route handler; testing its E2E rejection
// requires no Supabase project and no passkey setup.

test.describe("WLT-27-3 failure path — unauthenticated (AC-4)", () => {
  test("POST without any session returns 401 unauthorized", async ({ page }) => {
    const res = await page.request.post(
      "/api/accounts/00000000-0000-0000-0000-000000000000/import",
      {
        data: {
          rows: [{ occurredOn: "2026-06-01", description: "Test", amount: "1.00", direction: "debit" }],
        },
      },
    );
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized");
  });
});

// ─── Gated tests — E2E_PASSKEY=1 + SUPABASE_DB_URL ──────────────────────────

test.describe("WLT-27-3 AC-14: CSV import API — happy path, idempotency, and failure paths", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL to run.");

  let db: Client;
  let userId: string;
  let accountId: string;
  const email = `e2e-wlt27-3-ac14+${Date.now()}@example.com`;
  const password = "correct horse battery staple";

  test.beforeAll(async ({ browser }) => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();

    // Sign up + enroll passkey → real AAL2 session.
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp: CDPSession = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", { options: WEBAUTHN_OPTIONS });

    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });

    // Resolve the user id from the DB.
    const uRes = await db.query("select id from auth.users where email = $1", [email]);
    userId = uRes.rows[0].id;

    // Seed a manual account (connection_id IS NULL) — the target for CSV import.
    const acctRes = await db.query(
      `insert into financial_accounts (user_id, connection_id, provider_account_id, name, kind, currency)
       values ($1, null, null, 'Test CSV Account', 'depository', 'USD') returning id`,
      [userId],
    );
    accountId = acctRes.rows[0].id;

    await context.close();
  });

  test.afterAll(async () => {
    // Hard-delete all test rows — no residual records in the shared DB.
    if (userId) {
      await db.query("delete from transactions where user_id = $1", [userId]);
      await db.query("delete from financial_accounts where user_id = $1", [userId]);
      await db.query("delete from auth.users where id = $1", [userId]);
    }
    await db.end();
  });

  // ── Happy path: import + idempotency (AC-14, AC-11, AC-12) ────────────────
  //
  // Real auth → AAL2 gate → service-role write → RLS-restricted read verification.
  // This is the per-surface vertical test: authenticate as a real user → the AAL2
  // gate (getAal2UserId) → service-role transaction insert → DB assertion via the
  // direct connection (no mocked auth or service-role shortcut on the read side).

  test("imports 5 CSV rows, verifies they land in transactions, then re-import returns inserted=0", async ({
    page,
    context,
  }) => {
    await signInWithPasskey(page, context, email, password);

    // First import — expect all 5 rows inserted (AC-14).
    const firstRes = await page.request.post(`/api/accounts/${accountId}/import`, {
      data: { rows: CSV_ROWS },
    });
    expect(firstRes.status()).toBe(200);
    const first = (await firstRes.json()) as { inserted: number; superseded: number; removed: number };
    expect(first.inserted).toBe(5);
    expect(first.removed).toBe(0);

    // Verify the 5 rows are in `transactions` under the correct account (AC-14).
    const txnRes = await db.query(
      "select count(*) as n from transactions where user_id = $1 and account_id = $2 and removed_at is null",
      [userId, accountId],
    );
    expect(Number(txnRes.rows[0].n)).toBe(5);

    // Verify source field (AC-8): all rows must carry source = 'csv'.
    const srcRes = await db.query(
      "select count(*) as n from transactions where user_id = $1 and account_id = $2 and source = 'csv'",
      [userId, accountId],
    );
    expect(Number(srcRes.rows[0].n)).toBe(5);

    // Verify no 'null' substring in any dedup_key (AC-12).
    const dedupRes = await db.query(
      "select dedup_key from transactions where user_id = $1 and account_id = $2",
      [userId, accountId],
    );
    for (const row of dedupRes.rows as Array<{ dedup_key: string }>) {
      // AC-12: no 'null' substring anywhere in the key.
      expect(row.dedup_key).not.toContain("null");
      // BLOCKER fix: key is csv:<accountUUID>:<hash>, not csv:manual:<hash>.
      // The account UUID is the dedup namespace so two accounts can import the
      // same row content without colliding on (user_id, dedup_key, content_hash).
      expect(row.dedup_key).toMatch(/^csv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/);
    }

    // Second import (idempotency, AC-11, AC-12) — same rows, expect inserted=0.
    const secondRes = await page.request.post(`/api/accounts/${accountId}/import`, {
      data: { rows: CSV_ROWS },
    });
    expect(secondRes.status()).toBe(200);
    const second = (await secondRes.json()) as { inserted: number };
    expect(second.inserted).toBe(0);

    // Row count must still be exactly 5 — no double-count.
    const txnRes2 = await db.query(
      "select count(*) as n from transactions where user_id = $1 and account_id = $2 and removed_at is null",
      [userId, accountId],
    );
    expect(Number(txnRes2.rows[0].n)).toBe(5);
  });

  // ── Failure paths ─────────────────────────────────────────────────────────

  test("zero-amount row returns 400 validation error — BLOCKER fix (AC-7, isValidCsvRow)", async ({
    page,
    context,
  }) => {
    await signInWithPasskey(page, context, email, password);

    const res = await page.request.post(`/api/accounts/${accountId}/import`, {
      data: {
        rows: [{ occurredOn: "2026-06-10", description: "Zero Row", amount: "0", direction: "debit" }],
      },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation");
  });

  test("row with empty description returns 400 validation error (AC-7)", async ({
    page,
    context,
  }) => {
    await signInWithPasskey(page, context, email, password);

    const res = await page.request.post(`/api/accounts/${accountId}/import`, {
      data: {
        rows: [{ occurredOn: "2026-06-10", description: "", amount: "5.00", direction: "debit" }],
      },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation");
  });

  test("non-UUID account ID returns 404 before any DB lookup (AC-5)", async ({
    page,
    context,
  }) => {
    await signInWithPasskey(page, context, email, password);

    const res = await page.request.post("/api/accounts/not-a-real-uuid/import", {
      data: { rows: CSV_ROWS },
    });
    expect(res.status()).toBe(404);
  });

  test("non-existent account UUID returns 404 (AC-5)", async ({ page, context }) => {
    await signInWithPasskey(page, context, email, password);

    // A well-formed UUID that belongs to no account.
    const res = await page.request.post(
      "/api/accounts/00000000-0000-0000-0000-000000000001/import",
      { data: { rows: CSV_ROWS } },
    );
    expect(res.status()).toBe(404);
  });
});
