// WLT-26-2 — Anomaly Panel, REAL-PATH E2E (the [per-surface-vertical-test]
// mandate). Drives /dashboard with DASHBOARD_INTELLIGENCE_ENABLED=true under a
// real authenticated session, so readDashboardAnomalies' owner-scoped reads
// (anomalies + transactions) go session → createServerSupabase → RLS →
// rendered panel. A mocked or policy-only test would pass while that binding is
// broken; only this real traversal catches it.
//
// The anomaly scan is an off-request daily Inngest job — we bypass it by
// direct-inserting anomaly rows into the DB (service-role write; same pattern
// as recap.spec's anomaly seeding). The panel reads them back through the real
// session/RLS path: authenticate as a real user → RLS-enforced anomaly query →
// RSC render.
//
// Gated: requires E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project.
// playwright.config.ts webServer must include DASHBOARD_INTELLIGENCE_ENABLED=true.
//
// AC12: seeded anomaly rows are hard-deleted in the finally block; user rows
// are purged by global teardown (cascade).

import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";

const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
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

test.describe("anomaly panel — real auth→RLS→render + dismiss + investigate (WLT-26-2)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  // Main scenario: ≥2 months history → both anomaly kinds render → dismiss
  // persists → investigate navigates with correct filters → user B isolated.
  test("≥2 months history → new_merchant + category_spike render → dismiss persists → investigate navigates → second user isolated", async ({
    browser,
    page,
    context,
  }) => {
    const email = `e2e-anm-u1+${Date.now()}@example.com`;
    const otherEmail = `e2e-anm-u2+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    let otherContext: BrowserContext | null = null;
    // Collect seeded anomaly IDs for AC12 hard-delete in finally.
    const seededAnomIds: string[] = [];

    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'E2E Anomaly Checking', 'depository', 'USD', 10000, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      const today = todayUtc();
      const spikeMonth = currentMonth(); // YYYY-MM

      // Seed ≥ 2 months of debit history (MIN_HISTORY_MONTHS = 2):
      // prior-2 + prior-1 + current month each get a transaction.
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-anm-hist-1','anm-h1',50,'debit','USD','coffee','Old Cafe','FOOD_AND_DRINK',$3),
           ($1,$2,'plaid','e2e-anm-hist-2','anm-h2',60,'debit','USD','coffee','Old Cafe','FOOD_AND_DRINK',$4),
           ($1,$2,'plaid','e2e-anm-hist-3','anm-h3',55,'debit','USD','coffee','Old Cafe','FOOD_AND_DRINK',$5)`,
        [userId, accountId, monthDay(2), monthDay(1), today],
      );

      // Seed the debut-merchant transaction. The new_merchant anomaly's dedup_key
      // is 'new_merchant:' + txn.dedup_key, so readDashboardAnomalies can resolve
      // the merchant name back via live-transaction join.
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-anm-debut-tx-1','anm-debut1',89,'debit','USD','debut charge','Debut Merchant Co','SHOPPING',$3)`,
        [userId, accountId, today],
      );

      // Seed anomaly rows directly (bypass the daily scan).
      // new_merchant:  severity='info', summary carries amount+date only (PII invariant).
      // category_spike: severity='attention', summary carries humanized category + projection.
      const anmRes = await db.query(
        `insert into anomalies (user_id, account_id, kind, severity, summary, detected_on, dedup_key)
         values
           ($1,$2,'new_merchant','info',$3::jsonb,$4,'new_merchant:e2e-anm-debut-tx-1'),
           ($1,$2,'category_spike','attention',$5::jsonb,$4,'category_spike:food_and_drink:' || $6)
         returning id`,
        [
          userId,
          accountId,
          JSON.stringify({ amount: 89, date: today }),
          today,
          JSON.stringify({ category: "Food And Drink", amount: 110, baseline: 55, multiple: 2 }),
          spikeMonth,
        ],
      );
      for (const row of anmRes.rows as Array<{ id: string }>) {
        seededAnomIds.push(row.id);
      }

      // ── Real-path render: readDashboardAnomalies reads through the RLS session ──
      await page.reload();
      await expect(page.getByText("Flagged for review")).toBeVisible({ timeout: 15_000 });
      // category_spike (attention) is ordered before new_merchant (info) — both present.
      await expect(page.getByText(/Food And Drink is on pace to run 2× your usual amount/)).toBeVisible();
      await expect(page.getByText("New merchant: Debut Merchant Co")).toBeVisible();

      // AC6: open→surfaced transition fires ANOMALY_SURFACED once per anomaly.
      const surfaced = await db.query(
        "select count(*)::int as n from auth_funnel_events where user_id = $1 and event = 'anomaly_surfaced'",
        [userId],
      );
      expect(surfaced.rows[0].n).toBeGreaterThanOrEqual(2);

      // ── Dismiss new_merchant: one-tap optimistic removal then persist ──
      // aria-label = "Got it — don't flag this merchant again" (the sr-only dismiss label).
      await page.getByRole("button", { name: "Got it — don't flag this merchant again" }).click();
      // Optimistic: row disappears immediately on the client.
      await expect(page.getByText("New merchant: Debut Merchant Co")).toHaveCount(0);

      // Reload → dismissed row stays gone (real PATCH /api/anomaly/[id] persisted it).
      await page.reload();
      await expect(page.getByText("New merchant: Debut Merchant Co")).toHaveCount(0);

      // DB confirms status = dismissed.
      const nmStatus = await db.query(
        "select status from anomalies where dedup_key = 'new_merchant:e2e-anm-debut-tx-1' and user_id = $1",
        [userId],
      );
      expect(nmStatus.rows).toEqual([{ status: "dismissed" }]);

      // ANOMALY_DISMISSED funnel event fired by the PATCH route.
      const dismissedEvent = await db.query(
        "select count(*)::int as n from auth_funnel_events where user_id = $1 and event = 'anomaly_dismissed'",
        [userId],
      );
      expect(dismissedEvent.rows[0].n).toBeGreaterThanOrEqual(1);

      // ── category_spike still visible after new_merchant dismiss ──
      await expect(page.getByText(/Food And Drink is on pace to run 2× your usual amount/)).toBeVisible();

      // ── Investigate category_spike: navigates to ledger with correct filters ──
      // Only one "See transactions" button remains at this point.
      await page.getByRole("button", { name: "See transactions" }).click();
      await expect(page).toHaveURL(
        new RegExp(`/transactions\\?.*category=food_and_drink.*month=${spikeMonth}`),
        { timeout: 10_000 },
      );

      // ANOMALY_INVESTIGATED funnel event (fire-and-forget with keepalive; give it a beat).
      await page.waitForTimeout(500);
      const investigatedEvent = await db.query(
        "select count(*)::int as n from auth_funnel_events where user_id = $1 and event = 'anomaly_investigated'",
        [userId],
      );
      expect(investigatedEvent.rows[0].n).toBeGreaterThanOrEqual(1);

      // ── Navigate back to dashboard + dismiss category_spike ──
      await page.goto("/dashboard");
      await expect(page.getByText(/Food And Drink is on pace to run 2× your usual amount/)).toBeVisible({
        timeout: 15_000,
      });
      // aria-label = "Dismiss Food And Drink overspend alert for YYYY-MM"
      await page
        .getByRole("button", { name: new RegExp(`Dismiss Food And Drink overspend alert for ${spikeMonth}`) })
        .click();
      await expect(page.getByText(/Food And Drink is on pace to run 2× your usual amount/)).toHaveCount(0);

      // Reload → category_spike stays gone.
      await page.reload();
      await expect(page.getByText(/Food And Drink is on pace to run 2× your usual amount/)).toHaveCount(0);

      // Once all anomalies are dismissed, the "nothing unusual" empty state renders.
      await expect(page.getByText("Nothing unusual this month.")).toBeVisible();

      // DB: category_spike dismissed.
      const csStatus = await db.query(
        "select status from anomalies where dedup_key = $1 and user_id = $2",
        [`category_spike:food_and_drink:${spikeMonth}`, userId],
      );
      expect(csStatus.rows).toEqual([{ status: "dismissed" }]);

      // ── Second-user isolation: user B sees only their own anomalies ──
      otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await signUpWithPasskey(otherPage, otherContext, otherEmail, password);

      const ou = await db.query("select id from auth.users where email = $1", [otherEmail]);
      expect(ou.rows).toHaveLength(1);
      const otherUserId = ou.rows[0].id as string;

      const otherAcct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'E2E Other Checking', 'depository', 'USD', 5000, now()) returning id`,
        [otherUserId],
      );
      const otherAccountId = otherAcct.rows[0].id as string;

      // Seed user B's history (2 months).
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-anm-other-hist-1','anm-oh1',30,'debit','USD','snack','Other Cafe','FOOD_AND_DRINK',$3),
           ($1,$2,'plaid','e2e-anm-other-hist-2','anm-oh2',35,'debit','USD','snack','Other Cafe','FOOD_AND_DRINK',$4)`,
        [otherUserId, otherAccountId, monthDay(1), today],
      );

      // Seed user B's debut transaction + a distinct anomaly.
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-anm-other-debut','anm-od1',42,'debit','USD','other debut','User B Merchant','SHOPPING',$3)`,
        [otherUserId, otherAccountId, today],
      );
      const otherAnmRes = await db.query(
        `insert into anomalies (user_id, account_id, kind, severity, summary, detected_on, dedup_key)
         values ($1,$2,'new_merchant','info',$3::jsonb,$4,'new_merchant:e2e-anm-other-debut')
         returning id`,
        [otherUserId, otherAccountId, JSON.stringify({ amount: 42, date: today }), today],
      );
      for (const row of otherAnmRes.rows as Array<{ id: string }>) {
        seededAnomIds.push(row.id);
      }

      await otherPage.reload();
      await expect(otherPage.getByText("Flagged for review")).toBeVisible({ timeout: 15_000 });
      // User B sees their own anomaly.
      await expect(otherPage.getByText("New merchant: User B Merchant")).toBeVisible();
      // User B does NOT see user A's anomalies (cross-tenant isolation via RLS).
      await expect(otherPage.getByText("New merchant: Debut Merchant Co")).toHaveCount(0);
      await expect(otherPage.getByText(/Food And Drink is on pace to run 2×/)).toHaveCount(0);
    } finally {
      // AC12: hard-delete seeded anomaly rows; user records cascade on global teardown.
      if (seededAnomIds.length > 0) {
        await db.query("delete from anomalies where id = any($1)", [seededAnomIds]);
      }
      await otherContext?.close();
      await db.end();
    }
  });

  // Empty-state scenario: a user with < 2 months of debit history sees the
  // "We'll surface anomalies as you build history." copy, not the panel.
  test("<2 months of debit history → empty-no-history state renders, no panel heading", async ({
    page,
    context,
  }) => {
    const email = `e2e-anm-nohist+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      // Seed account + exactly one month of debits (< MIN_HISTORY_MONTHS=2).
      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'E2E No-Hist Checking', 'depository', 'USD', 3000, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-anm-nohist-tx1','noh1',25,'debit','USD','shop','Some Store','SHOPPING',$3)`,
        [userId, accountId, todayUtc()],
      );

      await page.reload();
      // monthsOfHistory = 1 < 2 → AnomalyPanel renders the no-history empty state.
      await expect(page.getByText("We'll surface anomalies as you build history.")).toBeVisible({
        timeout: 15_000,
      });
      // "Flagged for review" heading must NOT appear (no anomalies to surface).
      await expect(page.getByText("Flagged for review")).toHaveCount(0);
    } finally {
      await db.end();
    }
  });

  // Graceful degradation: a new_merchant anomaly whose debut transaction was
  // superseded (CDC) renders without the merchant name, not as an error.
  test("new_merchant with superseded debut transaction → renders unknown-merchant fallback", async ({
    page,
    context,
  }) => {
    const email = `e2e-anm-superseded+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    const seededAnomIds: string[] = [];
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'E2E Superseded Checking', 'depository', 'USD', 8000, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      const today = todayUtc();

      // 2 months of history.
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-anm-sup-hist-1','sup-h1',40,'debit','USD','x','Place A','FOOD_AND_DRINK',$3),
           ($1,$2,'plaid','e2e-anm-sup-hist-2','sup-h2',45,'debit','USD','x','Place A','FOOD_AND_DRINK',$4)`,
        [userId, accountId, monthDay(1), today],
      );

      // Seed the debut transaction, then supersede it. The anomaly's dedup_key
      // still points to 'e2e-anm-sup-debut-1' but readDashboardAnomalies can't
      // find a live transaction → merchantName = null → fallback copy renders.
      const origTx = await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-anm-sup-debut-1','sup-debut1',67,'debit','USD','x','Gone Merchant','SHOPPING',$3)
         returning id`,
        [userId, accountId, today],
      );
      const origTxId = origTx.rows[0].id as string;
      const replaceTx = await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-anm-sup-debut-1','sup-debut1-rev',67,'debit','USD','x revised','Gone Merchant Updated','SHOPPING',$3)
         returning id`,
        [userId, accountId, today],
      );
      await db.query("update transactions set superseded_by = $2 where id = $1", [
        origTxId,
        replaceTx.rows[0].id as string,
      ]);

      // Seed the new_merchant anomaly referencing the ORIGINAL dedup_key. The
      // original row is superseded → the join finds no live match → merchantName null.
      const anmRes = await db.query(
        `insert into anomalies (user_id, account_id, kind, severity, summary, detected_on, dedup_key)
         values ($1,$2,'new_merchant','info',$3::jsonb,$4,'new_merchant:e2e-anm-sup-debut-1')
         returning id`,
        [userId, accountId, JSON.stringify({ amount: 67, date: today }), today],
      );
      seededAnomIds.push(...(anmRes.rows as Array<{ id: string }>).map((r) => r.id));

      await page.reload();
      await expect(page.getByText("Flagged for review")).toBeVisible({ timeout: 15_000 });
      // null merchantName → anomalyKindNewMerchantUnknown fallback copy.
      await expect(page.getByText("New merchant — we couldn't identify it")).toBeVisible();
      // Must NOT crash or show raw error content.
      await expect(page.getByText("Error")).toHaveCount(0);
    } finally {
      if (seededAnomIds.length > 0) {
        await db.query("delete from anomalies where id = any($1)", [seededAnomIds]);
      }
      await db.end();
    }
  });
});
