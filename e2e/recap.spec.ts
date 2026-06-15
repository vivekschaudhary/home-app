import { type CDPSession, expect, test } from "@playwright/test";
import { Client } from "pg";

// WLT-16 / WLT-17 — the "since last time" recap, REAL-PATH (the
// [real-path-integration-coverage] mandate; the #36 class). Drives the actual
// /dashboard RSC under a real authenticated session, so getRecap's OWNER-SCOPED
// reads — net_worth_snapshots (movement) AND transactions (spending,
// app/lib/recap.ts readRecentSpending) — go session → createServerSupabase →
// RLS → rendered rows. A policy-only or mocked-client test would pass while that
// binding is broken (exactly #36); only this real traversal catches it.
//
// Gated like workflow-flow: a real Supabase project + the passkey ceremony. The
// recap is behind RECAP_ENABLED, which playwright.config sets for the e2e server.
// Synced OUTCOMES (balances, snapshots, transactions) are seeded server-side via
// SUPABASE_DB_URL — deterministic — but READ back through the real app path.
const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

test.describe("since-last-time recap — movement + target progress + spending (WLT-16/17)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("running workflow + real snapshots + real transactions → recap renders all three signals", async ({
    page,
    context,
  }) => {
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

    const email = `e2e-recap+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    // Sign up + passkey → intent front door → declare a mapped intent → dashboard.
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });
    await page.getByRole("radio", { name: "See all my money in one place" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Got it. We're putting your plan together." })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "I'll do that later" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      // Seed the synced outcome (what WLT-9's pipeline writes): real balances.
      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'E2E Checking', 'depository', 'USD', 31400, now()),
                ($1, 'E2E Card',     'credit',     'USD',  7220, now())
         returning id, kind`,
        [userId],
      );
      const checkingId = acct.rows.find((r) => r.kind === "depository").id as string;

      // Personalize → set the target (the running workflow the recap needs).
      await page.reload();
      await expect(page.getByRole("heading", { name: "Your money, right now" })).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Set your target" }).click();
      await page.getByRole("button", { name: "Use this target" }).click();
      await expect(page.getByText(/Running — tracking toward/)).toBeVisible({ timeout: 15_000 });

      // Seed the recap's read inputs (service-role writes; read back via RLS):
      //  • two net-worth snapshots → movement = up $420 (24,180 vs 23,760)
      await db.query(
        `insert into net_worth_snapshots (user_id, captured_on, net_worth, assets, debts)
         values ($1, $2, 23760, 30980, 7220), ($1, $3, 24180, 31400, 7220)`,
        [userId, isoDay(-1), isoDay(0)],
      );
      //  • transactions: this-week debit (Groceries $420) + prior-week debit ($300)
      //    → "Spent $420 this week · $120 more than last week", top Groceries.
      await db.query(
        `insert into transactions (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, category, occurred_on)
         values ($1,$2,'plaid','e2e-tx-1','h1', 420,'debit','USD','x','GROCERIES',$3),
                ($1,$2,'plaid','e2e-tx-2','h2', 300,'debit','USD','x','GROCERIES',$4)`,
        [userId, checkingId, isoDay(-3), isoDay(-10)],
      );

      // Reload → the recap reads ALL of the above through the real session path.
      await page.reload();
      await expect(page.getByRole("heading", { name: "Since last time" })).toBeVisible({ timeout: 15_000 });
      // movement (from net_worth_snapshots, owner-SELECT)
      await expect(page.getByText("Up $420 since last week")).toBeVisible();
      // progress toward target (live net worth vs the target just set)
      await expect(page.getByText(/% there/)).toBeVisible();
      // spending (the WLT-17 owner-scoped transactions read — the BLOCKER's path)
      await expect(page.getByText("Where your money went")).toBeVisible();
      await expect(page.getByText("Spent $420 this week")).toBeVisible();
      await expect(page.getByText(/\$120 more than last week/)).toBeVisible();
      await expect(page.getByText(/Groceries \$420/)).toBeVisible();

      // ── WLT-18: anomaly surface + Dismiss + Review, real-path ──
      const wf = await db.query("select id from workflows where user_id = $1", [userId]);
      const workflowId = wf.rows[0].id as string;

      // Seed an anomaly (service-role write); it reads back through the real session.
      await db.query(
        `insert into anomalies (user_id, account_id, kind, severity, summary, detected_on, dedup_key)
         values ($1,$2,'large_charge','attention',$3::jsonb,$4,'large_charge:e2e-1')`,
        [userId, checkingId, JSON.stringify({ amount: 480, category: "Groceries", date: isoDay(-1) }), isoDay(-1)],
      );
      await page.reload();
      // The "Worth a look" callout outranks the target action (suppressed).
      await expect(page.getByText("Worth a look")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/larger-than-usual charge: \$480 in Groceries/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Aim higher?" })).toHaveCount(0);

      // Dismiss → quiet status change (no run). Callout gone after reload (real persist).
      await page.getByRole("button", { name: "Dismiss" }).click();
      await expect(page.getByText("Worth a look")).toHaveCount(0);
      await page.reload();
      await expect(page.getByText("Worth a look")).toHaveCount(0);
      const dismissed = await db.query("select status from anomalies where dedup_key = 'large_charge:e2e-1'");
      expect(dismissed.rows).toEqual([{ status: "dismissed" }]);

      // Seed a second anomaly → Review it = the WAWU action (status acted + a run).
      await db.query(
        `insert into anomalies (user_id, account_id, kind, severity, summary, detected_on, dedup_key)
         values ($1,$2,'low_balance','attention',$3::jsonb,$4,'low_balance:e2e-2')`,
        [userId, checkingId, JSON.stringify({ amount: 40 }), isoDay(0)],
      );
      await page.reload();
      await expect(page.getByText(/account is running low: \$40/)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Review it" }).click();
      await expect(page.getByText("Thanks — noted.")).toBeVisible({ timeout: 15_000 });

      const acted = await db.query("select status from anomalies where dedup_key = 'low_balance:e2e-2'");
      expect(acted.rows).toEqual([{ status: "acted" }]);
      const reviewRun = await db.query(
        "select kind from workflow_runs where workflow_id = $1 and kind = 'recap_review_anomaly'",
        [workflowId],
      );
      expect(reviewRun.rows).toEqual([{ kind: "recap_review_anomaly" }]);
    } finally {
      await db.end();
    }
  });
});
