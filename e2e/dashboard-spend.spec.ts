import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";

// WLT-26-1 — Category spend bar chart, REAL-PATH (the [per-surface-vertical-test]
// mandate). Exercises the actual /dashboard RSC under real authenticated sessions
// so readCategorySpendChart's owner-scoped reads go:
//   real AAL2 session → createServerSupabase → RLS → buildCategorySpendChart → CategorySpendChart
// The load-bearing edges here are:
//   • chart renders with correct bars + reference line when ≥ 2 months of data exist
//   • bar click navigates to /transactions?category=<cat>&month=<YYYY-MM> (WLT-26-1 AC3)
//   • empty-no-history (< 2 months) shows the correct message
//   • empty-no-spend (≥ 2 months history, no current-month debits) shows a distinct message
//   • second-user isolation: user B cannot see user A's chart data
//
// Gated: requires E2E_PASSKEY=1 + SUPABASE_DB_URL + a Supabase project with
// DASHBOARD_INTELLIGENCE_ENABLED=true set on the running server
// (playwright.config.ts sets it for the local webServer; for a remote E2E_BASE_URL
// the deploy must have the flag enabled).
//
// AC10: every test that inserts transactions hard-deletes via `delete from
// auth.users where email = ...` (cascade wipes all owned rows).
const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

// ── Date helpers ─────────────────────────────────────────────────────────────

/** ISO date for today (UTC). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 'YYYY-MM' for the current calendar month. */
function currentMonth(): string {
  return today().slice(0, 7);
}

/** 'YYYY-MM-DD' for the first day of the month N calendar months before today. */
function priorMonthFirstDay(n: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

// ── Passkey setup (shared) ───────────────────────────────────────────────────

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

async function signUpWithPasskey(page: Page, context: BrowserContext, email: string): Promise<void> {
  await addPasskeyAuthenticator(page, context);
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
  await page.getByRole("button", { name: "Create passkey" }).click();
  await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });
}

// ── DB seeding helpers ───────────────────────────────────────────────────────

async function seedConnection(
  db: Client,
  userId: string,
  tag: string,
): Promise<{ connId: string; accountId: string }> {
  const conn = await db.query(
    `insert into account_connections
       (user_id, provider, provider_connection_id, vault_token_ref, institution_name)
     values ($1, 'plaid', $2, gen_random_uuid(), 'E2E Bank') returning id`,
    [userId, `e2e-spend-conn-${tag}`],
  );
  const connId = conn.rows[0].id as string;

  const acct = await db.query(
    `insert into financial_accounts
       (user_id, connection_id, provider_account_id, name, kind, currency,
        balance_current, balance_updated_at)
     values ($1, $2, $3, 'E2E Checking', 'depository', 'USD', 1000, now()) returning id`,
    [userId, connId, `e2e-spend-acct-${tag}`],
  );
  return { connId, accountId: acct.rows[0].id as string };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("dashboard category spend chart — real auth→RLS→RSC vertical (WLT-26-1)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("chart renders bars + avg line when ≥ 2 months of data; bar link navigates to filtered ledger", async ({
    page,
    context,
  }) => {
    const tag = Date.now();
    const email = `e2e-spend-happy+${tag}@example.com`;

    await signUpWithPasskey(page, context, email);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      const userId = u.rows[0].id as string;
      const { accountId } = await seedConnection(db, userId, `happy-${tag}`);

      const curDay = today();
      const priorDay = priorMonthFirstDay(1);

      // Seed 2 months of FOOD_AND_DRINK debit — enough for average to appear.
      // Current month: $100; prior month: $80 → average = $80 (median of 1 value).
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount,
            direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid',$3,$4,100,'debit','USD','Grocer A','Groceries','FOOD_AND_DRINK',false,$5),
           ($1,$2,'plaid',$6,$7, 80,'debit','USD','Grocer B','Groceries prior','FOOD_AND_DRINK',false,$8)`,
        [
          userId, accountId,
          `e2e-spend-cur-${tag}`, `e2e-hash-cur-${tag}`, curDay,
          `e2e-spend-prior-${tag}`, `e2e-hash-prior-${tag}`, priorDay,
        ],
      );

      await page.goto("/dashboard");
      // The DashboardIntelligence section is rendered server-side once the flag is on.
      await expect(page.getByRole("heading", { level: 2, name: "Spending this month" })).toBeVisible({
        timeout: 15_000,
      });

      // The sr-only table is the load-bearing a11y surface (and the only queryable
      // text in the chart, since the SVG is aria-hidden). It must have a row for the
      // category with current-month and average amounts.
      const srTable = page.locator("table.sr-only, table");
      await expect(srTable).toBeVisible();

      // Bar link navigates to the filtered ledger (AC3 + AC4 bar-click contract).
      const cm = currentMonth();
      const barLink = page.getByRole("link", {
        name: new RegExp(`View Food And Drink transactions for ${cm}`),
      });
      await expect(barLink).toBeVisible();
      await barLink.click();

      // Land on the filtered ledger: URL must carry category + month params.
      await expect(page).toHaveURL(
        new RegExp(`/transactions.*category=FOOD_AND_DRINK.*month=${cm}`),
        { timeout: 10_000 },
      );

      // The current-month seeded transaction is visible in the filtered ledger.
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText("Grocer A")).toBeVisible();
      // The prior-month transaction must NOT appear (month filter is working).
      await expect(page.getByText("Grocer B")).toHaveCount(0);

      // Navigate back to the dashboard and confirm avg legend text.
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { level: 2, name: "Spending this month" })).toBeVisible({
        timeout: 15_000,
      });
      // With exactly 2 months of history the legend reads "2-month avg (2 months)".
      await expect(page.getByText("2-month avg (2 months)")).toBeVisible();
    } finally {
      // AC10: hard-delete cascades to all owned rows (transactions, accounts, connections).
      await db.query("delete from auth.users where email = $1", [email]);
      await db.end();
    }
  });

  test("empty-no-history: new user with no transactions sees the no-history message (AC6a)", async ({
    page,
    context,
  }) => {
    const tag = Date.now();
    const email = `e2e-spend-nohistory+${tag}@example.com`;

    await signUpWithPasskey(page, context, email);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      // No transactions seeded — user has zero history.
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { level: 2, name: "Spending this month" })).toBeVisible({
        timeout: 15_000,
      });
      // AC6a: < 2 months of history → "We'll show your spending trends as you build history."
      await expect(
        page.getByText("We'll show your spending trends as you build history."),
      ).toBeVisible();
      // No chart bars / sr-only table caption should appear.
      await expect(page.getByText("Category spending this month vs. recent average")).toHaveCount(0);
    } finally {
      await db.query("delete from auth.users where email = $1", [email]);
      await db.end();
    }
  });

  test("empty-no-spend: user with prior history but no current-month debits sees the no-spend message (AC6b)", async ({
    page,
    context,
  }) => {
    const tag = Date.now();
    const email = `e2e-spend-nospend+${tag}@example.com`;

    await signUpWithPasskey(page, context, email);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      const userId = u.rows[0].id as string;
      const { accountId } = await seedConnection(db, userId, `nospend-${tag}`);

      // Seed spending in 2 prior months only — nothing in the current month.
      // This gives monthsOfHistory = 2, but bars = [] (no current-month debits).
      const m1 = priorMonthFirstDay(1); // last month
      const m2 = priorMonthFirstDay(2); // month before last
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount,
            direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid',$3,$4,50,'debit','USD','Old Grocer','Old groceries 1','FOOD_AND_DRINK',false,$5),
           ($1,$2,'plaid',$6,$7,60,'debit','USD','Old Grocer','Old groceries 2','FOOD_AND_DRINK',false,$8)`,
        [
          userId, accountId,
          `e2e-spend-nospend1-${tag}`, `e2e-hash-nospend1-${tag}`, m1,
          `e2e-spend-nospend2-${tag}`, `e2e-hash-nospend2-${tag}`, m2,
        ],
      );

      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { level: 2, name: "Spending this month" })).toBeVisible({
        timeout: 15_000,
      });
      // AC6b: ≥ 2 months history but zero current-month spending.
      await expect(page.getByText("No spending this month.")).toBeVisible();
      // No chart bars or avg legend.
      await expect(page.getByText("Category spending this month vs. recent average")).toHaveCount(0);
    } finally {
      // AC10: hard-delete cascades to all owned rows.
      await db.query("delete from auth.users where email = $1", [email]);
      await db.end();
    }
  });

  test("cross-user isolation: user B cannot see user A's chart data (RLS)", async ({
    browser,
    page,
    context,
  }) => {
    const tag = Date.now();
    const emailA = `e2e-spend-userA+${tag}@example.com`;
    const emailB = `e2e-spend-userB+${tag}@example.com`;

    // ── User A: seed 2 months of chart-worthy data ────────────────────────
    await signUpWithPasskey(page, context, emailA);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const uA = await db.query("select id from auth.users where email = $1", [emailA]);
      const userIdA = uA.rows[0].id as string;
      const { accountId: accountIdA } = await seedConnection(db, userIdA, `isolation-A-${tag}`);

      const curDay = today();
      const priorDay = priorMonthFirstDay(1);
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount,
            direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid',$3,$4,200,'debit','USD','User A Store','User A current','FOOD_AND_DRINK',false,$5),
           ($1,$2,'plaid',$6,$7,150,'debit','USD','User A Store','User A prior','FOOD_AND_DRINK',false,$8)`,
        [
          userIdA, accountIdA,
          `e2e-spend-iso-cur-${tag}`, `e2e-hash-iso-cur-${tag}`, curDay,
          `e2e-spend-iso-prior-${tag}`, `e2e-hash-iso-prior-${tag}`, priorDay,
        ],
      );

      // ── User B: fresh session in a new browser context ────────────────────
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      await signUpWithPasskey(pageB, contextB, emailB);

      // User B navigates to /dashboard — should see the no-history empty state,
      // NOT User A's chart data.
      await pageB.goto("/dashboard");
      await expect(pageB.getByRole("heading", { level: 2, name: "Spending this month" })).toBeVisible({
        timeout: 15_000,
      });
      // User B has no transactions → no-history message, not User A's chart.
      await expect(
        pageB.getByText("We'll show your spending trends as you build history."),
      ).toBeVisible();
      // User A's seeded merchant must NOT appear in User B's view.
      await expect(pageB.getByText("User A Store")).toHaveCount(0);

      await contextB.close();
    } finally {
      // AC10: hard-delete both users (User B has no transactions, but clean up the auth row).
      await db.query("delete from auth.users where email = any($1)", [[emailA, emailB]]);
      await db.end();
    }
  });
});
