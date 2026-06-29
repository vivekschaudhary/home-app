// WLT-26-1 (fix bbee246) — CategorySpendChart, REAL-PATH E2E (the
// [per-surface-vertical-test] mandate). Drives /dashboard with
// DASHBOARD_INTELLIGENCE_ENABLED=true under a real authenticated session so
// readCategorySpendChart's owner-scoped reads go session →
// createServerSupabase → RLS → rendered chart. A mocked or unit-only test
// would pass while that binding is broken; only this real traversal catches it.
//
// The specific regression this guards: the 6-month avg reference line was gray
// (#9ca3af) — fix bbee246 changed it to green (#22c55e). The main test
// confirms the green line is in the real DOM after a full data-backed render.
//
// Gated: requires E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project.
// playwright.config.ts webServer must include DASHBOARD_INTELLIGENCE_ENABLED=true.
//
// Cleanup: seeded transactions + accounts cascade on global-teardown user purge
// (same pattern as anomaly-panel.spec.ts). No explicit delete needed in finally.

import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";

const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthDay(monthsAgo: number): string {
  const d = new Date();
  d.setUTCDate(15);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
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
  await page.getByRole("radio", { name: "See all my money in one place" }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Got it. We're putting your plan together." }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "I'll do that later" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test.describe("category spend chart — real auth→RLS→render + green avg line + empty states (WLT-26-1 fix)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  // Main scenario ([per-surface-vertical-test]): seed ≥2 months of debit
  // history + current-month spend → chart renders with green avg reference line,
  // sr-only table present, bar link navigates to the WLT-23 ledger with correct
  // category + month filters.
  //
  // Traverses the REAL vertical: browser auth (passkey) → real session →
  // RLS-gated Supabase read → buildCategorySpendChart compute →
  // CategorySpendChart render → green line (#22c55e) in DOM.
  test("≥2 months history + current-month spend → chart renders, avg line is green (#22c55e), bar navigates to ledger", async ({
    page,
    context,
  }) => {
    const email = `e2e-chart-main+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'E2E Chart Checking', 'depository', 'USD', 5000, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      const today = todayUtc();
      const curMonth = currentMonth();

      // Seed 1 prior-month debit + 1 current-month debit for FOOD_AND_DRINK so:
      //   - bars.length > 0  (current month has spend → chart renders)
      //   - monthsOfHistory = 2  (prior-1 + current → showAvgLine = true)
      //   - bar.average = 60  (median of prior months = prior-1 amount)
      //   → green avg reference line renders (#22c55e)
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency,
            description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-chart-prior-1','chart-p1',60,'debit','USD','prior coffee','Cafe Prior','FOOD_AND_DRINK',$3),
           ($1,$2,'plaid','e2e-chart-current-1','chart-c1',80,'debit','USD','current coffee','Cafe Now','FOOD_AND_DRINK',$4)`,
        [userId, accountId, monthDay(1), today],
      );

      // Real-path render: readCategorySpendChart reads through the RLS session.
      await page.reload();

      // Section wrapper: DashboardIntelligenceSection h2 (DASHBOARD_INTELLIGENCE_ENABLED=true required).
      await expect(page.getByRole("heading", { level: 2, name: "Spending this month" })).toBeVisible({
        timeout: 15_000,
      });

      // Chart title
      await expect(page.getByText("By category")).toBeVisible();

      // Average legend: monthsOfHistory=2 < 6 → partial copy "{n}-month avg ({n} months)".
      await expect(page.getByText("2-month avg (2 months)")).toBeVisible();

      // Fix verification — CSS half (bbee246): legend swatch border-green-500 (not gray).
      const swatch = page.locator("span.border-green-500");
      await expect(swatch.first()).toBeAttached();

      // Fix verification — SVG half (bbee246): avg line stroke #22c55e (not #9ca3af).
      const avgLine = page.locator('line[stroke="#22c55e"]');
      await expect(avgLine.first()).toBeAttached();

      // sr-only table (a11y surface) is present.
      const srTable = page.locator("table.sr-only");
      await expect(srTable).toBeAttached();

      // Bar link: sr-only <a> navigates to /transactions with category + month params.
      // bar.label = humanizeCategory('FOOD_AND_DRINK') = 'Food And Drink'.
      // bar.category = 'FOOD_AND_DRINK' (raw, used in href).
      const barLink = page.getByRole("link", {
        name: new RegExp(`View Food And Drink transactions for ${curMonth}`),
      });
      await expect(barLink).toBeAttached();
      await barLink.click();
      await expect(page).toHaveURL(
        new RegExp(`/transactions\\?.*category=FOOD_AND_DRINK.*month=${curMonth}`),
        { timeout: 10_000 },
      );
    } finally {
      await db.end();
    }
  });

  // Empty-state scenario 1: a fresh user with no transactions has 0 months of
  // history (monthsOfHistory < 2, bars.length = 0) → no-history empty state.
  test("<2 months of debit history → no-history empty state renders, chart absent", async ({
    page,
    context,
  }) => {
    const email = `e2e-chart-nohist+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);
    // No transactions seeded — fresh user, monthsOfHistory=0 < 2, bars.length=0.

    await page.reload();
    await expect(
      page.getByText("We'll show your spending trends as you build history."),
    ).toBeVisible({ timeout: 15_000 });
    // Chart body must NOT render (no bars to display).
    await expect(page.getByText("By category")).toHaveCount(0);
  });

  // Empty-state scenario 2: ≥2 months of prior-month debit history but zero
  // current-month spend (bars.length=0, monthsOfHistory≥2) → no-spend state.
  // This is the failure path: history exists but the current month is empty.
  test("≥2 months prior history, no current-month spend → no-spend empty state, chart absent", async ({
    page,
    context,
  }) => {
    const email = `e2e-chart-nospend+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'E2E No-Spend Checking', 'depository', 'USD', 3000, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      // Seed 2 prior-month debits only — nothing in the current month.
      // monthsOfHistory=2 (prior-2 + prior-1), bars.length=0 → no-spend state.
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency,
            description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-chart-nospend-1','ns1',40,'debit','USD','shop','Shop A','SHOPPING',$3),
           ($1,$2,'plaid','e2e-chart-nospend-2','ns2',45,'debit','USD','shop','Shop B','SHOPPING',$4)`,
        [userId, accountId, monthDay(2), monthDay(1)],
      );

      await page.reload();
      await expect(page.getByText("No spending this month.")).toBeVisible({ timeout: 15_000 });
      // Chart body must NOT render.
      await expect(page.getByText("By category")).toHaveCount(0);
    } finally {
      await db.end();
    }
  });
});
