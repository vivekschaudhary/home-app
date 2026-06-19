import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";
import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { applyAllRulesForUser } from "@wealth/db/categories";

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

test.describe("budget & spending — recommended/actual render + set + persist (WLT-21-1)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("real session → recommended from history + this-month actual → set a budget → persists on reload", async ({
    browser,
    page,
    context,
  }) => {
    const email = `e2e-budget-u1+${Date.now()}@example.com`;
    const otherEmail = `e2e-budget-u2+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    // Sign up + passkey → AAL2 session.
    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    let otherContext: BrowserContext | null = null;
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
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-b-1','h1',400,'debit','USD','x','Past Grocer A','FOOD_AND_DRINK',$3),
           ($1,$2,'plaid','e2e-b-2','h2',600,'debit','USD','x','Past Grocer B','FOOD_AND_DRINK',$4),
           ($1,$2,'plaid','e2e-b-3','h3',520,'debit','USD','x','User One Market','FOOD_AND_DRINK',$5)`,
        [userId, accountId, monthDay(2), monthDay(1), todayUtc()],
      );
      // WLT-22-3 merchant-rule fixture: three same-merchant SHOPPING rows (one
      // prior month, two current month). "Remember" should backfill ALL three;
      // a later one-off user override must still win on the chosen row.
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-r-1','rh1',90,'debit','USD','x','Corner Hardware','SHOPPING',$3),
           ($1,$2,'plaid','e2e-r-2','rh2',130,'debit','USD','x','Corner Hardware','SHOPPING',$4),
           ($1,$2,'plaid','e2e-r-3','rh3',40,'debit','USD','x','Corner Hardware','SHOPPING',$4)`,
        [userId, accountId, monthDay(1), todayUtc()],
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

      // Reload → the dollar budget PERSISTED (real route → RLS write → re-read).
      await page.goto("/budget");
      await expect(page.getByText(/\$20\.00 over/)).toBeVisible({ timeout: 15_000 });

      // Switch the SAME row to a PERCENT budget: 50% of the typical monthly spend
      // (median of trailing totals 400 + 600 = $500) → a $250 cap → over by $270.
      await page.getByRole("button", { name: "Edit" }).click();
      await page.getByRole("button", { name: "%" }).click();
      const pct = page.getByLabel("Monthly budget for Food And Drink");
      await pct.fill("50");
      // the inline resolved cap (effective-cap path)
      await expect(page.getByText(/50% of your typical monthly spending ≈ \$250\.00\/mo/)).toBeVisible();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Budget saved.")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/\$270\.00 over/)).toBeVisible(); // 520 vs the $250 cap

      // Reload → the PERCENT-backed state persists through session → route → RLS → re-read.
      await page.goto("/budget");
      await expect(page.getByText("50%")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/\$270\.00 over/)).toBeVisible();

      // WLT-21-2: expand the category's year spread → the 12-month panel renders
      // from the REAL series (it only appears when the owner-scoped read produced
      // ≥1 month of spend — the RSC→RLS→render path).
      await page.getByRole("button", { name: /Show the last 12 months/ }).first().click();
      await expect(page.getByText("Monthly Food And Drink spend — last 12 months")).toBeVisible();
      // the visible "Most: $X" label proves the panel drew the REAL series (max of 400/600/520)
      await expect(page.getByText("Most: $600.00")).toBeVisible();

      // WLT-22-1: drill into the category → its real line items for this month,
      // through the real session → RLS → render path. The seeded current-month
      // debit is $520; the drill Total reconciles to the row number.
      await page.getByRole("button", { name: /Show the transactions in Food And Drink this month/ }).click();
      await expect(page.getByText("What's in Food And Drink this month")).toBeVisible();
      await expect(page.getByText("Total")).toBeVisible();
      // $520.00 shows as the row amount, the line item, and the Total — all reconciling
      await expect(page.getByText("$520.00").first()).toBeVisible();
      await expect(page.getByText("User One Market")).toBeVisible();

      // WLT-22-2: create a custom category inline ("Rent") and move the current-
      // month transaction into it through the real UI path. The source drill drops
      // to empty; reload proves the budget row + destination drill reconcile.
      await page.getByRole("button", { name: /Change the category of User One Market/ }).click();
      await expect(page.getByText("+ New category")).toBeVisible();
      await expect(page.getByText("What's in Food And Drink this month")).toBeVisible();
      await expect(page.getByText("User One Market")).toBeVisible();
      await page.getByText("+ New category").click();
      await expect(page.getByLabel("Category name")).toBeVisible();
      await expect(page.getByText("What's in Food And Drink this month")).toBeVisible();
      await expect(page.getByText("User One Market")).toBeVisible();
      await page.getByLabel("Category name").fill("Rent");
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText("Moved to Rent")).toBeVisible();
      await expect(page.getByText("No transactions in Food And Drink this month.")).toBeVisible();

      await page.goto("/budget");
      await expect(page.getByText("Rent")).toBeVisible();
      await expect(page.getByRole("button", { name: /Show the transactions in Rent this month/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Show the transactions in Food And Drink this month/ })).toHaveCount(0);
      await page.getByRole("button", { name: /Show the transactions in Rent this month/ }).click();
      await expect(page.getByText("What's in Rent this month")).toBeVisible();
      await expect(page.getByText("User One Market")).toBeVisible();
      await expect(page.getByText("$520.00").first()).toBeVisible();

      // AC2 guardrail: a Plaid CDC revision writes a NEW transaction row with the
      // SAME dedup_key. The saved assignment must survive because it hangs off the
      // stable dedup_key, not the revision row id. Supersede the old row, reload,
      // and verify the UPDATED txn still resolves to Rent in the real UI path.
      const currentTxn = await db.query(
        "select id from transactions where user_id = $1 and dedup_key = 'e2e-b-3' and superseded_by is null",
        [userId],
      );
      expect(currentTxn.rows).toHaveLength(1);
      const oldTxnId = currentTxn.rows[0].id as string;
      const revisedTxn = await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-b-3','h3-revised',520,'debit','USD','x','User One Market Updated','FOOD_AND_DRINK',$3)
         returning id`,
        [userId, accountId, todayUtc()],
      );
      const revisedTxnId = revisedTxn.rows[0].id as string;
      await db.query("update transactions set superseded_by = $2 where id = $1", [oldTxnId, revisedTxnId]);

      await page.goto("/budget");
      await page.getByRole("button", { name: /Show the transactions in Rent this month/ }).click();
      await expect(page.getByText("User One Market Updated")).toBeVisible();
      await expect(page.getByText("User One Market")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Show the transactions in Food And Drink this month/ })).toHaveCount(0);

      // WLT-22-3: remember a SAME-MERCHANT SHOPPING batch as Rent. The counted
      // success names the breadth; budget/drill reconcile through the real read
      // path, and the DB proves the PRIOR-MONTH match was backfilled too.
      await page.getByRole("button", { name: /Show the transactions in Shopping this month/ }).click();
      await expect(page.getByText("What's in Shopping this month")).toBeVisible();
      await expect(page.getByText("Corner Hardware")).toBeVisible();
      await expect(page.getByText("$170.00")).toBeVisible();
      await page.getByRole("button", { name: /Change the category of Corner Hardware/ }).first().click();
      await page.getByLabel("Always categorize Corner Hardware this way").check();
      await page.getByRole("button", { name: /^Rent$/ }).click();
      await expect(page.getByText("Now categorizing Corner Hardware as Rent — updated 3 transactions")).toBeVisible();
      await expect(page.getByText("No transactions in Shopping this month.")).toBeVisible();

      const rentCategory = await db.query("select id from categories where user_id = $1 and name = 'Rent'", [userId]);
      expect(rentCategory.rows).toHaveLength(1);
      const rentCategoryId = rentCategory.rows[0].id as string;
      const remembered = await db.query(
        `select dedup_key, assigned_by, category_id
           from transaction_categories
          where user_id = $1 and dedup_key in ('e2e-r-1','e2e-r-2','e2e-r-3')
          order by dedup_key`,
        [userId],
      );
      expect(remembered.rows).toHaveLength(3);
      expect(remembered.rows).toEqual([
        { dedup_key: "e2e-r-1", assigned_by: "rule", category_id: rentCategoryId },
        { dedup_key: "e2e-r-2", assigned_by: "rule", category_id: rentCategoryId },
        { dedup_key: "e2e-r-3", assigned_by: "rule", category_id: rentCategoryId },
      ]);

      await page.goto("/budget");
      await expect(page.getByRole("button", { name: /Show the transactions in Shopping this month/ })).toHaveCount(0);
      await page.getByRole("button", { name: /Show the transactions in Rent this month/ }).click();
      await expect(page.getByText("What's in Rent this month")).toBeVisible();
      await expect(page.getByText("User One Market Updated")).toBeVisible();
      await expect(page.getByText("Corner Hardware")).toBeVisible();
      await expect(page.getByText("$690.00")).toBeVisible(); // 520 + 130 + 40

      // AC3: the user's explicit one-off override beats the merchant rule on
      // this transaction, even after the rule exists.
      await page.getByRole("button", { name: /Change the category of Corner Hardware/ }).last().click();
      await page.getByText("+ New category").click();
      await page.getByLabel("Category name").fill("Utilities");
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText("Moved to Utilities")).toBeVisible();

      await page.goto("/budget");
      await page.getByRole("button", { name: /Show the transactions in Rent this month/ }).click();
      await expect(page.getByText("User One Market Updated")).toBeVisible();
      await expect(page.getByText("$650.00")).toBeVisible(); // 520 + 130
      await page.getByRole("button", { name: /Show the transactions in Utilities this month/ }).click();
      await expect(page.getByText("What's in Utilities this month")).toBeVisible();
      await expect(page.getByText("Corner Hardware")).toBeVisible();
      await expect(page.getByText("$40.00").first()).toBeVisible();

      // AC2 future half: insert a NEW same-merchant transaction, run the exact
      // shared sync helper, then confirm the real UI shows it arriving under
      // Rent while the one-off Utilities override stays put.
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-r-4','rh4',70,'debit','USD','x','Corner Hardware','SHOPPING',$3)`,
        [userId, accountId, todayUtc()],
      );
      await applyAllRulesForUser(createServiceSupabase(), userId);

      const postSync = await db.query(
        "select assigned_by, category_id from transaction_categories where user_id = $1 and dedup_key = 'e2e-r-4'",
        [userId],
      );
      expect(postSync.rows).toEqual([{ assigned_by: "rule", category_id: rentCategoryId }]);
      const userOverride = await db.query(
        "select assigned_by from transaction_categories where user_id = $1 and dedup_key = 'e2e-r-3'",
        [userId],
      );
      expect(userOverride.rows).toEqual([{ assigned_by: "user" }]);

      await page.goto("/budget");
      await page.getByRole("button", { name: /Show the transactions in Rent this month/ }).click();
      await expect(page.getByText("$720.00")).toBeVisible(); // 520 + 130 + 70
      await expect(page.getByText("$70.00").first()).toBeVisible();
      await page.getByRole("button", { name: /Show the transactions in Utilities this month/ }).click();
      await expect(page.getByText("$40.00").first()).toBeVisible();

      // AC6 negative case: a SECOND authed user with the SAME merchant cannot
      // read the first user's rule/assignments, and their own remember action
      // cannot affect the first user's resolved rows.
      otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await signUpWithPasskey(otherPage, otherContext, otherEmail, password);

      const otherUser = await db.query("select id from auth.users where email = $1", [otherEmail]);
      expect(otherUser.rows).toHaveLength(1);
      const otherUserId = otherUser.rows[0].id as string;
      const otherAcct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'Other E2E Checking', 'depository', 'USD', 2500, now()) returning id`,
        [otherUserId],
      );
      const otherAccountId = otherAcct.rows[0].id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, description, merchant, category, occurred_on)
         values
           ($1,$2,'plaid','e2e-b-4','h4',111.11,'debit','USD','x','Corner Hardware','SHOPPING',$3)`,
        [otherUserId, otherAccountId, todayUtc()],
      );

      await otherPage.goto("/budget");
      await expect(otherPage.getByRole("heading", { name: "Budget & Spending" })).toBeVisible({ timeout: 15_000 });
      await expect(otherPage.getByText("$111.11")).toBeVisible();
      await otherPage.getByRole("button", { name: /Show the transactions in Shopping this month/ }).click();
      await expect(otherPage.getByText("What's in Shopping this month")).toBeVisible();
      await expect(otherPage.getByText("Corner Hardware")).toBeVisible();
      await expect(otherPage.getByText("$111.11").first()).toBeVisible();
      await expect(otherPage.getByText("User One Market Updated")).toHaveCount(0);
      await expect(otherPage.getByText("$720.00")).toHaveCount(0);
      // The first user's custom "Rent"/"Utilities" categories + remembered rule
      // do NOT leak into user 2's picker, even for the SAME merchant.
      await otherPage.getByRole("button", { name: /Change the category of Corner Hardware/ }).click();
      await expect(otherPage.getByText(/^Rent$/)).toHaveCount(0);
      await expect(otherPage.getByText(/^Utilities$/)).toHaveCount(0);
      await otherPage.getByText("+ New category").click();
      await otherPage.getByLabel("Category name").fill("Travel");
      await otherPage.getByRole("button", { name: "Create" }).click();
      await expect(otherPage.getByText("Moved to Travel")).toBeVisible();

      await otherPage.getByRole("button", { name: /Change the category of Corner Hardware/ }).click();
      await otherPage.getByLabel("Always categorize Corner Hardware this way").check();
      await otherPage.getByRole("button", { name: /^Travel$/ }).click();
      await expect(otherPage.getByText("Now categorizing Corner Hardware as Travel — updated 1 transaction")).toBeVisible();
      await expect(otherPage.getByText("No transactions in Shopping this month.")).toBeVisible();

      // User 2's same-merchant rule is isolated: reloading user 1 still shows
      // the merchant under Rent, not Travel, and never leaks user 2's row.
      await page.goto("/budget");
      await page.getByRole("button", { name: /Show the transactions in Rent this month/ }).click();
      await expect(page.getByText("Corner Hardware")).toBeVisible();
      await expect(page.getByText("$720.00")).toBeVisible();
      await expect(page.getByText("Travel")).toHaveCount(0);
      await expect(page.getByText("$111.11")).toHaveCount(0);
      await page.getByRole("button", { name: /Show the transactions in Utilities this month/ }).click();
      await expect(page.getByText("$40.00").first()).toBeVisible();
    } finally {
      await otherContext?.close();
      await db.end();
    }
  });
});
