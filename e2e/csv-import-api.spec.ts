// WLT-27-3 AC-14 — E2E integration test for the CSV import API.
// regression: false  e2e: true
//
// Imports a 5-row CSV batch into a manually seeded account, verifies all 5
// rows appear in `transactions`, re-imports the same batch to confirm idempotency
// (inserted = 0 on the second call), then hard-deletes all test rows for cleanup.
//
// Guard: requires E2E_PASSKEY=1 and a real Supabase project (SUPABASE_DB_URL).

import { type CDPSession, expect, test } from "@playwright/test";
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

test.describe("WLT-27-3 AC-14: CSV import API — 5-row batch + idempotency", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL to run.");

  let db: Client;
  let userId: string;
  let accountId: string;
  const email = `e2e-wlt27-3-ac14+${Date.now()}@example.com`;

  test.beforeAll(async ({ browser }) => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();

    // Sign up + passkey → real AAL2 session.
    const context = await browser.newContext();
    const page = await context.newPage();
    const cdp: CDPSession = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
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
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });

    // Resolve the user id from the DB.
    const uRes = await db.query("select id from auth.users where email = $1", [email]);
    userId = uRes.rows[0].id;

    // Seed a manual account (connection_id IS NULL).
    const acctRes = await db.query(
      `insert into financial_accounts (user_id, connection_id, provider_account_id, name, kind, currency)
       values ($1, null, null, 'Test CSV Account', 'depository', 'USD') returning id`,
      [userId],
    );
    accountId = acctRes.rows[0].id;

    await context.close();
  });

  test.afterAll(async () => {
    // Hard-delete all test rows — clean slate for subsequent runs.
    if (userId) {
      await db.query("delete from transactions where user_id = $1", [userId]);
      await db.query("delete from financial_accounts where user_id = $1", [userId]);
      await db.query("delete from auth.users where id = $1", [userId]);
    }
    await db.end();
  });

  test("imports 5 CSV rows, verifies they land in transactions, then re-import returns inserted=0", async ({ page, context }) => {
    // Re-authenticate as the test user so the request carries a real AAL2 session.
    const cdp: CDPSession = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    // Sign in as the test user.
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct horse battery staple");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.getByRole("button", { name: /use passkey/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });

    // First import — expect all 5 rows inserted.
    const firstRes = await page.request.post(`/api/accounts/${accountId}/import`, {
      data: { rows: CSV_ROWS },
    });
    expect(firstRes.status()).toBe(200);
    const first = (await firstRes.json()) as { inserted: number; superseded: number; removed: number };
    expect(first.inserted).toBe(5);
    expect(first.removed).toBe(0);

    // Verify the 5 rows are in `transactions` under the correct account.
    const txnRes = await db.query(
      "select count(*) as n from transactions where user_id = $1 and account_id = $2 and removed_at is null",
      [userId, accountId],
    );
    expect(Number(txnRes.rows[0].n)).toBe(5);

    // Second import (idempotency) — same rows, expect inserted=0 (AC-11, AC-12).
    const secondRes = await page.request.post(`/api/accounts/${accountId}/import`, {
      data: { rows: CSV_ROWS },
    });
    expect(secondRes.status()).toBe(200);
    const second = (await secondRes.json()) as { inserted: number };
    expect(second.inserted).toBe(0);

    // Verify row count is still exactly 5 (no double-count).
    const txnRes2 = await db.query(
      "select count(*) as n from transactions where user_id = $1 and account_id = $2 and removed_at is null",
      [userId, accountId],
    );
    expect(Number(txnRes2.rows[0].n)).toBe(5);
  });
});
