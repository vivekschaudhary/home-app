import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";

// WLT-27-5 — RegionSwitcher, REAL-PATH (the [real-path-integration-coverage]
// mandate; [per-surface-vertical-test]). Drives /transactions, /dashboard,
// /budget RSCs under real authenticated sessions so currency-scoped spending
// reads go session → createServerSupabase → RLS → rendered rows.
//
// Load-bearing edges:
//   • multi-currency user sees the switcher; single-currency does not (AC-1, AC-9)
//   • default (USD) ledger shows only USD transactions + USD accounts (AC-7)
//   • switching to EUR scopes transactions + account-filter to EUR (AC-7)
//   • URL param ?currency= is set on switch; other params are preserved (AC-11)
//   • switcher renders on /dashboard + /budget with correct options (AC-1)
//   • invalid/malformed currency code in URL defaults to USD, no crash (AC-12)
//
// Gated: E2E_PASSKEY=1 + SUPABASE_DB_URL. MULTI_CURRENCY_ACCOUNTS_ENABLED is
// set to true in playwright.config.ts's webServer env so the dev server has it on.

const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL as string;

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function addPasskeyAuthenticator(page: Page, context: BrowserContext): Promise<void> {
  const client: CDPSession = await context.newCDPSession(page);
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
}

async function signUpWithPasskey(page: Page, context: BrowserContext, email: string, password: string): Promise<void> {
  await addPasskeyAuthenticator(page, context);
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
  await page.getByRole("button", { name: "Create passkey" }).click();
  await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });
}

test.describe("region switcher — per-currency spending surfaces (WLT-27-5)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("multi-currency user: switcher visible on all spending surfaces, transactions scoped by currency, account filter scoped, URL param set, other params preserved (AC-1, AC-7, AC-10, AC-11)", async ({
    page,
    context,
  }) => {
    const email = `e2e-region-switcher-u1+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      // Seed two accounts in different currencies so readDistinctCurrencies returns
      // ["EUR","USD"] and the switcher renders (currencies.length = 2).
      const accts = await db.query(
        `insert into financial_accounts
           (user_id, name, kind, currency, balance_current, balance_updated_at)
         values
           ($1,'USD Checking','depository','USD',5000,now()),
           ($1,'EUR Savings','depository','EUR',3000,now())
         returning id, name`,
        [userId],
      );
      const usdAccountId = accts.rows.find((r: { id: string; name: string }) => r.name === "USD Checking")!.id as string;
      const eurAccountId = accts.rows.find((r: { id: string; name: string }) => r.name === "EUR Savings")!.id as string;

      // Seed two USD transactions and two EUR transactions so we can verify
      // that switching currency scopes both the rows and the account-filter dropdown.
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-rs-usd-1','rs-usd-1',100,'debit','USD','USD Grocer','USD purchase 1','GROCERIES',false,$3),
           ($1,$2,'plaid','e2e-rs-usd-2','rs-usd-2',200,'debit','USD','USD Market','USD purchase 2','GROCERIES',false,$4),
           ($1,$5,'plaid','e2e-rs-eur-1','rs-eur-1',50,'debit','EUR','EUR Boulangerie','EUR purchase 1','FOOD_AND_DRINK',false,$3),
           ($1,$5,'plaid','e2e-rs-eur-2','rs-eur-2',75,'debit','EUR','EUR Marche','EUR purchase 2','FOOD_AND_DRINK',false,$4)`,
        [userId, usdAccountId, isoDay(-1), isoDay(0), eurAccountId],
      );

      // ── AC-1, AC-10: switcher visible on /transactions with accessible label ──
      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      const switcher = page.getByLabel("Switch currency view");
      await expect(switcher).toBeVisible();

      // ── AC-7: USD is the default → only USD transactions + only USD accounts ─
      const table = page.getByRole("table", { name: "Your transactions" });
      await expect(table.getByText("USD Grocer")).toBeVisible();
      await expect(table.getByText("USD Market")).toBeVisible();
      await expect(table.getByText("EUR Boulangerie")).toHaveCount(0);
      await expect(table.getByText("EUR Marche")).toHaveCount(0);
      // Account-filter dropdown scoped to USD accounts only.
      await expect(page.getByLabel("Filter by account")).toContainText("USD Checking");
      await expect(page.getByLabel("Filter by account")).not.toContainText("EUR Savings");

      // ── AC-11: switching to EUR updates the URL param ────────────────────────
      await switcher.selectOption("EUR");
      await expect(page).toHaveURL(/[?&]currency=EUR/, { timeout: 10_000 });

      // ── AC-7: EUR view → only EUR transactions + only EUR accounts ───────────
      await expect(table.getByText("EUR Boulangerie")).toBeVisible({ timeout: 10_000 });
      await expect(table.getByText("EUR Marche")).toBeVisible();
      await expect(table.getByText("USD Grocer")).toHaveCount(0);
      await expect(table.getByText("USD Market")).toHaveCount(0);
      await expect(page.getByLabel("Filter by account")).toContainText("EUR Savings");
      await expect(page.getByLabel("Filter by account")).not.toContainText("USD Checking");

      // Switching back to USD restores the USD scope.
      await switcher.selectOption("USD");
      await expect(table.getByText("USD Grocer")).toBeVisible({ timeout: 10_000 });
      await expect(table.getByText("EUR Boulangerie")).toHaveCount(0);

      // ── AC-11 param preservation: a pre-existing ?foo= survives the switch ───
      // Uses a custom unknown param so there's no dependency on app filter logic;
      // handleChange reads all searchParams and sets only currency, leaving the rest.
      await page.goto("/transactions?foo=keepme");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await page.getByLabel("Switch currency view").selectOption("EUR");
      await expect(page).toHaveURL(/[?&]currency=EUR/, { timeout: 10_000 });
      await expect(page).toHaveURL(/[?&]foo=keepme/);

      // ── AC-1: switcher also visible on /dashboard + /budget ─────────────────
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Switch currency view")).toBeVisible();

      await page.goto("/budget");
      await expect(page.getByRole("heading", { name: "Budget & Spending" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Switch currency view")).toBeVisible();
    } finally {
      await db.end();
    }
  });

  test("single-currency user: switcher not rendered on any spending surface (AC-1, AC-9)", async ({
    page,
    context,
  }) => {
    const email = `e2e-region-switcher-u2+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      // Single USD account → readDistinctCurrencies returns ["USD"] (length 1),
      // so RegionSwitcherInner's early return fires: `if (currencies.length <= 1) return null`.
      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1,'Single USD Checking','depository','USD',2000,now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-rs-single-usd','rs-single-usd',42,'debit','USD','SingleCo','USD only purchase','SHOPPING',false,$3)`,
        [userId, accountId, isoDay(0)],
      );

      // /transactions: no switcher — component returns null for single-currency users.
      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Switch currency view")).toHaveCount(0);
      // Transaction is still visible — no behavior change for single-currency users.
      await expect(page.getByRole("table", { name: "Your transactions" }).getByText("SingleCo")).toBeVisible();

      // /dashboard: no switcher.
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Switch currency view")).toHaveCount(0);

      // /budget: no switcher.
      await page.goto("/budget");
      await expect(page.getByRole("heading", { name: "Budget & Spending" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Switch currency view")).toHaveCount(0);
    } finally {
      await db.end();
    }
  });

  test("invalid or malformed currency param defaults to USD, page loads without crash (AC-12)", async ({
    page,
    context,
  }) => {
    const email = `e2e-region-switcher-u3+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      // Multi-currency accounts so the switcher renders, letting us confirm
      // which currency the RSC resolved to (the active <option> reflects it).
      const accts = await db.query(
        `insert into financial_accounts
           (user_id, name, kind, currency, balance_current, balance_updated_at)
         values
           ($1,'Invalid Test USD','depository','USD',1000,now()),
           ($1,'Invalid Test EUR','depository','EUR',1000,now())
         returning id, name`,
        [userId],
      );
      const usdAccountId = accts.rows.find((r: { id: string; name: string }) => r.name === "Invalid Test USD")!.id as string;
      const eurAccountId = accts.rows.find((r: { id: string; name: string }) => r.name === "Invalid Test EUR")!.id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-rs-inv-usd','rs-inv-usd',10,'debit','USD','USD Merchant','USD tx','SHOPPING',false,$3),
           ($1,$4,'plaid','e2e-rs-inv-eur','rs-inv-eur',20,'debit','EUR','EUR Merchant','EUR tx','SHOPPING',false,$3)`,
        [userId, usdAccountId, isoDay(0), eurAccountId],
      );

      // parseCurrency("NOTREAL") → fails /^[A-Z]{3}$/ (5 chars) → defaults "USD".
      await page.goto("/transactions?currency=NOTREAL");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      const switcher = page.getByLabel("Switch currency view");
      await expect(switcher).toBeVisible();
      // The RSC resolved activeCurrency = "USD", so the ledger shows USD rows.
      const table = page.getByRole("table", { name: "Your transactions" });
      await expect(table.getByText("USD Merchant")).toBeVisible();
      await expect(table.getByText("EUR Merchant")).toHaveCount(0);

      // parseCurrency("eur") → fails /^[A-Z]{3}$/ (lowercase) → defaults "USD".
      await page.goto("/transactions?currency=eur");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await expect(table.getByText("USD Merchant")).toBeVisible({ timeout: 10_000 });
      await expect(table.getByText("EUR Merchant")).toHaveCount(0);

      // parseCurrency(undefined) → raw is falsy → defaults "USD". No crash on bare URL.
      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await expect(table.getByText("USD Merchant")).toBeVisible({ timeout: 10_000 });
    } finally {
      await db.end();
    }
  });
});
