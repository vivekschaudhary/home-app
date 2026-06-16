import { type CDPSession, expect, test } from "@playwright/test";
import { Client } from "pg";

// WLT-21-1 — Budget & Spending, REAL-PATH (the [real-path-integration-coverage]
// mandate; the #36 class + the owner-isolation AC12). Drives the actual /budget
// RSC under a real authenticated session, so getBudgetView's OWNER-SCOPED reads
// (transactions for recommended/actual; budgets for the saved caps) go
// session → createServerSupabase → RLS → rendered rows, and a save round-trips
// session → route → RLS → persisted → re-read. A policy-only or mocked-client
// test would pass while that binding is broken (exactly #36).
//
// Gated like the other passkey specs: a real Supabase project + the ceremony.
// Synced OUTCOMES (transactions) are seeded server-side via SUPABASE_DB_URL —
// deterministic — but READ BACK through the real app path.
const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

// A date in the calendar month `monthsAgo` before now, on the 15th (avoids
// month-length overflow + stays strictly in the past for prior months).
function monthDay(monthsAgo: number): string {
  const d = new Date();
  d.setUTCDate(15);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
}
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

test.describe("budget & spending — recommended/actual render + set + persist (WLT-21-1)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("real session → recommended from history + this-month actual → set a budget → persists on reload", async ({
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

    const email = `e2e-budget+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    // Sign up + passkey → AAL2 session.
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      // Seed a synced account + transactions (service-role write; read back via RLS).
      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'E2E Checking', 'depository', 'USD', 5000, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      // FOOD_AND_DRINK (essential → untrimmed): prior months 400 + 600 → median 500
      // = the recommendation; this month so far 520 (the actual).
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-b-1','h1',400,'debit','USD','x','FOOD_AND_DRINK',$3),
           ($1,$2,'plaid','e2e-b-2','h2',600,'debit','USD','x','FOOD_AND_DRINK',$4),
           ($1,$2,'plaid','e2e-b-3','h3',520,'debit','USD','x','FOOD_AND_DRINK',$5)`,
        [userId, accountId, monthDay(2), monthDay(1), todayUtc()],
      );

      // The real read path: authenticated RSC → getBudgetView → RLS → rendered rows.
      await page.goto("/budget");
      await expect(page.getByRole("heading", { name: "Budget & Spending" })).toBeVisible({ timeout: 15_000 });
      // recommended (own-history median, untrimmed essential) + this-month actual
      await expect(page.getByText("$500.00").first()).toBeVisible();
      await expect(page.getByText("$520.00")).toBeVisible();

      // Set a $500 budget → over by $20 (520 > 500). The editor prefills the
      // recommendation, so Save commits 500.
      await page.getByRole("button", { name: "Set budget" }).click();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Budget saved.")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/\$20\.00 over/)).toBeVisible();

      // Reload → the budget PERSISTED (real route → RLS write → re-read).
      await page.goto("/budget");
      await expect(page.getByText(/\$20\.00 over/)).toBeVisible({ timeout: 15_000 });
    } finally {
      await db.end();
    }
  });
});
