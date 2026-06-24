import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";
import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { applyAllRulesForUser } from "@wealth/db/categories";

// WLT-23-1 — the Transactions ledger, REAL-PATH (the
// [real-path-integration-coverage] mandate; AC7 owner isolation). Drives the
// real /transactions RSC + API under authenticated sessions so the owner-scoped
// reads go session → createServerSupabase → RLS → rendered rows.
//
// The load-bearing edges here are:
//   • all-accounts render (the page reads transactions + financial_accounts)
//   • account + resolved-category filters reconcile through the real read path
//   • keyset pagination across a FILTERED page boundary (no dropped/duplicated row)
//   • second-user isolation (no account/category-option or row leakage)
const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;
const PAGE_SIZE = 50; // mirrors app/lib/transactions.ts
const RULE_TXN_TOTAL = 1001; // one row must exist beyond the first 1000 PostgREST-read cap

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

test.describe("transactions ledger — owner-scoped reads + filters + keyset paging (WLT-23-1 / WLT-23-2)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("real session → account + moved-category filters reconcile, filtered load-more crosses the page boundary exactly once, second user is isolated", async ({
    browser,
    page,
    context,
  }) => {
    const email = `e2e-transactions-u1+${Date.now()}@example.com`;
    const otherEmail = `e2e-transactions-u2+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    let otherContext: BrowserContext | null = null;
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      const conn = await db.query(
        `insert into account_connections (user_id, provider, provider_connection_id, vault_token_ref, institution_name)
         values ($1, 'plaid', $2, gen_random_uuid(), 'Transactions Test CU') returning id`,
        [userId, `e2e-transactions-item-${Date.now()}`],
      );
      const connectionId = conn.rows[0].id as string;
      const accts = await db.query(
        `insert into financial_accounts
           (user_id, connection_id, provider_account_id, name, kind, currency, balance_current, balance_updated_at)
         values
           ($1,$2,'acct-checking','Ledger Checking','depository','USD',4200,now()),
           ($1,$2,'acct-card','Travel Card','credit','USD',315,now())
         returning id, name`,
        [userId, connectionId],
      );
      const checkingId = accts.rows.find((r) => r.name === "Ledger Checking")?.id as string;
      const cardId = accts.rows.find((r) => r.name === "Travel Card")?.id as string;

      const rentCategory = await db.query(
        `insert into categories (user_id, name, kind, source)
         values ($1, 'Rent', 'essential', 'custom')
         returning id`,
        [userId],
      );
      const rentCategoryId = rentCategory.rows[0].id as string;

      // One newest checking row proves the all-accounts read. The card then gets
      // 102 rows; odd-numbered rows are MOVED to Rent via transaction_categories,
      // so the resolved-category filter has 51 matches: page 1 = 50, page 2 = 1.
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-transactions-checking','txn-checking',2500,'credit','USD','Checking Deposit','Paycheck deposit','INCOME',false,$3)`,
        [userId, checkingId, isoDay(0)],
      );
      const values: string[] = [];
      const params: Array<string | number> = [];
      let i = 1;
      for (let n = 1; n <= PAGE_SIZE * 2 + 2; n += 1) {
        values.push(
          `($${i++},$${i++},'plaid',$${i++},$${i++},$${i++},'debit','USD',$${i++},$${i++},$${i++},false,$${i++})`,
        );
        params.push(
          userId,
          cardId,
          `e2e-transactions-${n}`,
          `txn-hash-${n}`,
          10 + n,
          `User One Merchant ${String(n).padStart(3, "0")}`,
          `User one description ${n}`,
          "FOOD_AND_DRINK",
          isoDay(-((PAGE_SIZE * 2 + 2) - n)),
        );
      }
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values ${values.join(",")}`,
        params,
      );
      const movedValues: string[] = [];
      const movedParams: Array<string | number> = [];
      let j = 1;
      for (let n = 1; n <= PAGE_SIZE * 2 + 2; n += 2) {
        movedValues.push(`($${j++},$${j++},$${j++},'user')`);
        movedParams.push(userId, `e2e-transactions-${n}`, rentCategoryId);
      }
      await db.query(
        `insert into transaction_categories (user_id, dedup_key, category_id, assigned_by)
         values ${movedValues.join(",")}`,
        movedParams,
      );

      // Real read path: /transactions RSC under the authenticated session.
      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Everything across your accounts, newest first.")).toBeVisible();
      const table = page.getByRole("table", { name: "Your transactions" });
      await expect(page.getByText(`Showing ${PAGE_SIZE} transactions`)).toBeVisible();
      await expect(table.getByText("Checking Deposit")).toBeVisible();
      await expect(table.getByText("User One Merchant 102")).toBeVisible();
      await expect(table.getByText("User One Merchant 054")).toBeVisible();
      await expect(table.getByText("User One Merchant 053")).toHaveCount(0);
      // Across accounts: both owner account names render in the ledger, and the
      // owner's filter options stay owner-scoped.
      await expect(table.getByText("Ledger Checking")).toBeVisible();
      await expect(table.getByText("Travel Card")).toBeVisible();
      await expect(page.getByLabel("Filter by account")).toContainText("Ledger Checking");
      await expect(page.getByLabel("Filter by account")).toContainText("Travel Card");
      await expect(page.getByLabel("Filter by category")).toContainText("Rent");

      // Account filter → only the selected account's rows survive the real read.
      await page.getByLabel("Filter by account").selectOption(cardId);
      await expect(table.getByText("Checking Deposit")).toHaveCount(0);
      await expect(table.getByText("Ledger Checking")).toHaveCount(0);
      await expect(table.getByText("Travel Card")).toBeVisible();

      // Compose with the MOVED category: the resolved-category filter must surface
      // the reassigned rows and hide the unchanged FOOD_AND_DRINK rows.
      await page.getByLabel("Filter by category").selectOption("Rent");
      await expect(page.getByText(`Showing ${PAGE_SIZE} transactions`)).toBeVisible({ timeout: 15_000 });
      await expect(table.getByText("User One Merchant 101")).toBeVisible();
      await expect(table.getByText("User One Merchant 003")).toBeVisible();
      await expect(table.getByText("User One Merchant 001")).toHaveCount(0);
      await expect(table.getByText("User One Merchant 102")).toHaveCount(0);

      // Filtered page-boundary guardrail: page 2 must surface the one missing row
      // exactly once, without dropping/duplicating the boundary row.
      await page.getByRole("button", { name: "Load more transactions" }).click();
      await expect(page.getByText(`Showing ${PAGE_SIZE + 1} transactions`)).toBeVisible({ timeout: 15_000 });
      await expect(table.getByText("User One Merchant 001")).toBeVisible();
      await expect(table.getByText("User One Merchant 003")).toHaveCount(1);
      await expect(page.getByText("You're all caught up — that's everything.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Load more transactions" })).toHaveCount(0);

      // Second user: same surface, but only their own filter options + filtered row
      // can render.
      otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await signUpWithPasskey(otherPage, otherContext, otherEmail, password);

      const otherUser = await db.query("select id from auth.users where email = $1", [otherEmail]);
      expect(otherUser.rows).toHaveLength(1);
      const otherUserId = otherUser.rows[0].id as string;
      const otherConn = await db.query(
        `insert into account_connections (user_id, provider, provider_connection_id, vault_token_ref, institution_name)
         values ($1, 'plaid', $2, gen_random_uuid(), 'Other User Bank') returning id`,
        [otherUserId, `e2e-transactions-item-other-${Date.now()}`],
      );
      const otherConnectionId = otherConn.rows[0].id as string;
      const otherAcct = await db.query(
        `insert into financial_accounts
           (user_id, connection_id, provider_account_id, name, kind, currency, balance_current, balance_updated_at)
         values
           ($1,$2,'acct-other','Other User Checking','depository','USD',900,now())
         returning id`,
        [otherUserId, otherConnectionId],
      );
      const otherAccountId = otherAcct.rows[0].id as string;
      const otherCategory = await db.query(
        `insert into categories (user_id, name, kind, source)
         values ($1, 'Travel', 'discretionary', 'custom')
         returning id`,
        [otherUserId],
      );
      const otherCategoryId = otherCategory.rows[0].id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-transactions-other','other-hash',88,'debit','USD','Other User Merchant','Other user description','SHOPPING',false,$3)`,
        [otherUserId, otherAccountId, isoDay(1)],
      );
      await db.query(
        `insert into transaction_categories (user_id, dedup_key, category_id, assigned_by)
         values ($1,'e2e-transactions-other',$2,'user')`,
        [otherUserId, otherCategoryId],
      );

      await otherPage.goto("/transactions");
      await expect(otherPage.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      const otherTable = otherPage.getByRole("table", { name: "Your transactions" });
      await expect(otherPage.getByText("Showing 1 transactions")).toBeVisible();
      await expect(otherTable.getByText("Other User Merchant")).toBeVisible();
      await expect(otherTable.getByText("Other User Checking")).toBeVisible();
      await expect(otherPage.getByLabel("Filter by account")).toContainText("Other User Checking");
      await expect(otherPage.getByLabel("Filter by account")).not.toContainText("Ledger Checking");
      await expect(otherPage.getByLabel("Filter by account")).not.toContainText("Travel Card");
      await expect(otherPage.getByLabel("Filter by category")).toContainText("Travel");
      await expect(otherPage.getByLabel("Filter by category")).not.toContainText("Rent");

      await otherPage.getByLabel("Filter by account").selectOption(otherAccountId);
      await otherPage.getByLabel("Filter by category").selectOption("Travel");
      await expect(otherPage.getByText("Showing 1 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(otherTable.getByText("Other User Merchant")).toBeVisible();
      await expect(otherTable.getByText("User One Merchant 101")).toHaveCount(0);
      await expect(otherTable.getByText("User One Merchant 001")).toHaveCount(0);
      await expect(otherTable.getByText("Ledger Checking")).toHaveCount(0);
      await expect(otherTable.getByText("Travel Card")).toHaveCount(0);
    } finally {
      await otherContext?.close();
      await db.end();
    }
  });

  test("real session → ledger recategorize updates through RLS render, drops from the active filter, merchant rules move matching rows, second user stays isolated", async ({
    browser,
    page,
    context,
  }) => {
    const email = `e2e-transactions-recat-u1+${Date.now()}@example.com`;
    const otherEmail = `e2e-transactions-recat-u2+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    let otherContext: BrowserContext | null = null;
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'Recat Checking', 'depository', 'USD', 2600, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      const rentCategory = await db.query(
        `insert into categories (user_id, name, kind, source)
         values ($1, 'Rent', 'essential', 'custom')
         returning id`,
        [userId],
      );
      const rentCategoryId = rentCategory.rows[0].id as string;
      const utilitiesCategory = await db.query(
        `insert into categories (user_id, name, kind, source)
         values ($1, 'Utilities', 'essential', 'custom')
         returning id`,
        [userId],
      );
      const utilitiesCategoryId = utilitiesCategory.rows[0].id as string;

      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         select
           $1,
           $2,
           'plaid',
           format('e2e-ledger-recat-%s', n),
           format('txn-recat-%s', n),
           n,
           'debit',
           'USD',
           'Rule Hardware',
           format('Ledger recat %s', n),
           'SHOPPING',
           false,
           ($4::date - ($3 - n))::date
         from generate_series(1, $3) as n`,
        [userId, accountId, RULE_TXN_TOTAL, isoDay(0)],
      );

      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      const table = page.getByRole("table", { name: "Your transactions" });
      await expect(page.getByLabel("Filter by category")).toContainText("Shopping");
      await expect(page.getByLabel("Filter by category")).toContainText("Rent");
      await expect(page.getByLabel("Filter by category")).toContainText("Utilities");

      await page.getByLabel("Filter by category").selectOption("Shopping");
      const newestShopping = page.getByRole("button", {
        name: /Change the category of Rule Hardware \(\$1,001\.00\).*Shopping/i,
      });
      const secondNewestShopping = page.getByRole("button", {
        name: /Change the category of Rule Hardware \(\$1,000\.00\).*Shopping/i,
      });
      const oldestUtilities = page.getByRole("button", {
        name: /Change the category of Rule Hardware \(\$1\.00\).*Utilities/i,
      });
      const oldestRent = page.getByRole("button", {
        name: /Change the category of Rule Hardware \(\$1\.00\).*Rent/i,
      });
      await expect(page.getByText(`Showing ${PAGE_SIZE} transactions`)).toBeVisible({ timeout: 15_000 });

      await newestShopping.click();
      await page.getByRole("button", { name: /^Rent$/ }).click();
      await expect(page.getByText("Moved to Rent")).toBeVisible({ timeout: 15_000 });
      await expect(newestShopping).toHaveCount(0);
      await expect(secondNewestShopping).toBeVisible();

      await page.getByLabel("Filter by category").selectOption("Rent");
      await expect(page.getByText("Showing 1 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$1,001\.00\).*Rent/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$1,000\.00\).*Utilities/i })).toHaveCount(0);

      await page.getByLabel("Filter by category").selectOption("Shopping");
      await expect(page.getByText(`Showing ${PAGE_SIZE} transactions`)).toBeVisible({ timeout: 15_000 });
      await secondNewestShopping.click();
      await page.getByLabel("Always categorize Rule Hardware this way").check();
      await page.getByRole("button", { name: /^Utilities$/ }).click();
      await expect(page.getByText("Now categorizing Rule Hardware as Utilities — updated 1001 transactions")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("No transactions match these filters.")).toBeVisible({ timeout: 15_000 });

      await page.getByLabel("Filter by category").selectOption("Utilities");
      await expect(page.getByText(`Showing ${PAGE_SIZE} transactions`)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$1,001\.00\).*Utilities/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$1,000\.00\).*Utilities/i })).toBeVisible();
      for (let i = 0; i < 25; i += 1) {
        if ((await oldestUtilities.count()) > 0) break;
        await page.getByRole("button", { name: "Load more transactions" }).click();
      }
      await expect(page.getByText("Showing 1001 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(oldestUtilities).toBeVisible();
      await expect(page.getByText("You're all caught up — that's everything.")).toBeVisible();

      const rememberedAssignments = await db.query(
        `select count(*)::int as count
           from transaction_categories
          where user_id = $1
            and assigned_by = 'rule'
            and category_id = $2
            and dedup_key like 'e2e-ledger-recat-%'`,
        [userId, utilitiesCategoryId],
      );
      expect(rememberedAssignments.rows).toEqual([{ count: RULE_TXN_TOTAL }]);
      const oldestAssignment = await db.query(
        `select assigned_by, category_id
           from transaction_categories
          where user_id = $1 and dedup_key = 'e2e-ledger-recat-1'`,
        [userId],
      );
      expect(oldestAssignment.rows).toEqual([{ assigned_by: "rule", category_id: utilitiesCategoryId }]);

      await oldestUtilities.click();
      await page.getByRole("button", { name: /^Rent$/ }).click();
      await expect(page.getByText("Moved to Rent")).toBeVisible({ timeout: 15_000 });
      await expect(oldestUtilities).toHaveCount(0);

      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-ledger-recat-new','txn-recat-new',77,'debit','USD','Rule Hardware','Ledger recat new','SHOPPING',false,$3)`,
        [userId, accountId, isoDay(1)],
      );
      await applyAllRulesForUser(createServiceSupabase(), userId);

      const postSyncAssignments = await db.query(
        `select dedup_key, assigned_by, category_id
           from transaction_categories
          where user_id = $1
            and dedup_key in ('e2e-ledger-recat-1', 'e2e-ledger-recat-new')
          order by dedup_key`,
        [userId],
      );
      expect(postSyncAssignments.rows).toEqual([
        { dedup_key: "e2e-ledger-recat-1", assigned_by: "user", category_id: rentCategoryId },
        { dedup_key: "e2e-ledger-recat-new", assigned_by: "rule", category_id: utilitiesCategoryId },
      ]);

      await page.getByLabel("Filter by category").selectOption("Rent");
      await expect(page.getByText("Showing 1 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(oldestRent).toBeVisible();
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$1,000\.00\).*Utilities/i })).toHaveCount(0);

      await page.getByLabel("Filter by category").selectOption("Utilities");
      await expect(page.getByText(`Showing ${PAGE_SIZE} transactions`)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$77\.00\).*Utilities/i })).toBeVisible();
      await expect(oldestRent).toHaveCount(0);

      otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await signUpWithPasskey(otherPage, otherContext, otherEmail, password);

      const otherUser = await db.query("select id from auth.users where email = $1", [otherEmail]);
      expect(otherUser.rows).toHaveLength(1);
      const otherUserId = otherUser.rows[0].id as string;
      const otherAcct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'Other Recat Checking', 'depository', 'USD', 1800, now()) returning id`,
        [otherUserId],
      );
      const otherAccountId = otherAcct.rows[0].id as string;
      const travelCategory = await db.query(
        `insert into categories (user_id, name, kind, source)
         values ($1, 'Travel', 'discretionary', 'custom')
         returning id`,
        [otherUserId],
      );
      const travelCategoryId = travelCategory.rows[0].id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-ledger-recat-other','txn-recat-other',88,'debit','USD','Rule Hardware','Other user recat','SHOPPING',false,$3)`,
        [otherUserId, otherAccountId, isoDay(1)],
      );

      await otherPage.goto("/transactions");
      await expect(otherPage.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      const otherTable = otherPage.getByRole("table", { name: "Your transactions" });
      await expect(otherPage.getByText("Showing 1 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(otherTable.getByText("Rule Hardware")).toBeVisible();
      await expect(otherTable.getByText("Recat Checking")).toHaveCount(0);
      await expect(otherTable.getByText("Other Recat Checking")).toBeVisible();
      await expect(otherPage.getByLabel("Filter by category")).toContainText("Travel");
      await expect(otherPage.getByLabel("Filter by category")).not.toContainText("Rent");
      await expect(otherPage.getByLabel("Filter by category")).not.toContainText("Utilities");

      await otherPage.getByRole("button", { name: /Change the category of Rule Hardware \(\$88\.00\).*Shopping/i }).click();
      await expect(otherPage.getByRole("button", { name: /^Rent$/ })).toHaveCount(0);
      await expect(otherPage.getByRole("button", { name: /^Utilities$/ })).toHaveCount(0);
      await otherPage.getByRole("button", { name: /^Travel$/ }).click();
      await expect(otherPage.getByText("Moved to Travel")).toBeVisible({ timeout: 15_000 });

      const otherAssignments = await db.query(
        "select dedup_key, assigned_by, category_id from transaction_categories where user_id = $1 and dedup_key = 'e2e-ledger-recat-other'",
        [otherUserId],
      );
      expect(otherAssignments.rows).toEqual([
        { dedup_key: "e2e-ledger-recat-other", assigned_by: "user", category_id: travelCategoryId },
      ]);

      await page.goto("/transactions");
      await expect(page.getByLabel("Filter by category")).not.toContainText("Travel");
      await page.getByLabel("Filter by category").selectOption("Utilities");
      await expect(page.getByText(`Showing ${PAGE_SIZE} transactions`)).toBeVisible({ timeout: 15_000 });
      await expect(table.getByText("Other Recat Checking")).toHaveCount(0);
      await expect(table.getByText("$88.00")).toHaveCount(0);
      await page.getByLabel("Filter by category").selectOption("Rent");
      await expect(page.getByText("Showing 1 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(table.getByText("Other user recat")).toHaveCount(0);
    } finally {
      await otherContext?.close();
      await db.end();
    }
  });

  test("real session → follow up flags a charge, Done shows resolved rows, re-open returns one to Open, a flagged CDC revision stays flagged, and a second user stays isolated", async ({
    browser,
    page,
    context,
  }) => {
    const email = `e2e-transactions-followup-u1+${Date.now()}@example.com`;
    const otherEmail = `e2e-transactions-followup-u2+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    let otherContext: BrowserContext | null = null;
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'Followup Checking', 'depository', 'USD', 1800, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-followup-resolve','followup-resolve-hash',24.10,'debit','USD','Needs Review','Needs Review original','SHOPPING',false,$3),
           ($1,$2,'plaid','e2e-followup-cdc','followup-cdc-hash',88.25,'debit','USD','Pending Refund','Pending Refund original','SHOPPING',false,$4),
           ($1,$2,'plaid','e2e-followup-plain','followup-plain-hash',12.00,'debit','USD','Ordinary Charge','Ordinary Charge original','FOOD_AND_DRINK',false,$5)`,
        [userId, accountId, isoDay(-2), isoDay(-1), isoDay(0)],
      );

      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /Change the category of Needs Review \(\$24\.10\).*Shopping/i }).click();
      await page.getByRole("menuitem", { name: "Flag Needs Review to follow up" }).click();
      await expect(page.getByText("Flagged to follow up")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Flagged to follow up")).toHaveCount(1);

      const resolveFlags = await db.query(
        `select dedup_key, flag_type, source, dismissed_at is null as open
           from transaction_flags
          where user_id = $1 and dedup_key = 'e2e-followup-resolve'`,
        [userId],
      );
      expect(resolveFlags.rows).toEqual([
        { dedup_key: "e2e-followup-resolve", flag_type: "followup", source: "user", open: true },
      ]);

      await page.getByRole("button", { name: "Show only charges flagged to follow up" }).click();
      await expect(page.getByText("Needs Review")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Ordinary Charge")).toHaveCount(0);

      await page.getByRole("button", { name: /Change the category of Needs Review \(\$24\.10\).*Shopping/i }).click();
      await page.getByRole("menuitem", { name: "Mark Needs Review follow-up done" }).click();
      await expect(page.getByText("Marked done")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Nothing to follow up on")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Spot a charge you need to deal with")).toBeVisible();

      const resolvedFlag = await db.query(
        `select dismissed_at is not null as dismissed
           from transaction_flags
          where user_id = $1 and dedup_key = 'e2e-followup-resolve'`,
        [userId],
      );
      expect(resolvedFlag.rows).toEqual([{ dismissed: true }]);

      await page.getByRole("button", { name: "Done" }).click();
      await expect(page.getByText("Needs Review")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Done")).toBeVisible();
      await expect(page.getByText("Ordinary Charge")).toHaveCount(0);

      await page.getByRole("button", { name: /Change the category of Needs Review \(\$24\.10\).*Shopping/i }).click();
      await page.getByRole("menuitem", { name: "Re-open Needs Review follow-up" }).click();
      await expect(page.getByText("Re-opened")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Nothing resolved yet")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Follow-ups you mark done will show here")).toBeVisible();

      const reopenedFlag = await db.query(
        `select dismissed_at is null as open
           from transaction_flags
          where user_id = $1 and dedup_key = 'e2e-followup-resolve'`,
        [userId],
      );
      expect(reopenedFlag.rows).toEqual([{ open: true }]);

      await page.getByRole("button", { name: "Open" }).click();
      await expect(page.getByText("Needs Review")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Flagged to follow up")).toHaveCount(1);

      await page.getByRole("button", { name: "Show only charges flagged to follow up" }).click();
      await expect(page.getByText("Ordinary Charge")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /Change the category of Pending Refund \(\$88\.25\).*Shopping/i }).click();
      await page.getByRole("menuitem", { name: "Flag Pending Refund to follow up" }).click();
      await expect(page.getByText("Flagged to follow up")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Flagged to follow up")).toHaveCount(1);

      await page.getByRole("button", { name: "Show only charges flagged to follow up" }).click();
      await expect(page.getByText("Pending Refund")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Needs Review")).toHaveCount(0);

      const revisedTxn = await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-followup-cdc','followup-cdc-hash-revised',88.25,'debit','USD','Pending Refund Revised','Pending Refund revised','SHOPPING',false,$3)
         returning id`,
        [userId, accountId, isoDay(1)],
      );
      const priorTxn = await db.query(
        `select id
           from transactions
          where user_id = $1 and dedup_key = 'e2e-followup-cdc' and content_hash = 'followup-cdc-hash' and superseded_by is null`,
        [userId],
      );
      expect(priorTxn.rows).toHaveLength(1);
      await db.query("update transactions set superseded_by = $2 where id = $1", [
        priorTxn.rows[0].id as string,
        revisedTxn.rows[0].id as string,
      ]);

      await page.reload();
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Show only charges flagged to follow up" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByText("Pending Refund Revised")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Flagged to follow up")).toHaveCount(1);
      await expect(page.getByText("Pending Refund")).toHaveCount(0);

      const cdcFlags = await db.query(
        `select dedup_key, dismissed_at is null as open
           from transaction_flags
          where user_id = $1 and dedup_key = 'e2e-followup-cdc'`,
        [userId],
      );
      expect(cdcFlags.rows).toEqual([{ dedup_key: "e2e-followup-cdc", open: true }]);

      otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await signUpWithPasskey(otherPage, otherContext, otherEmail, password);

      const otherUser = await db.query("select id from auth.users where email = $1", [otherEmail]);
      expect(otherUser.rows).toHaveLength(1);
      const otherUserId = otherUser.rows[0].id as string;
      const otherAcct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'Other Followup Checking', 'depository', 'USD', 990, now()) returning id`,
        [otherUserId],
      );
      const otherAccountId = otherAcct.rows[0].id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-followup-other','followup-other-hash',19.50,'debit','USD','Other Followup','Other followup original','SHOPPING',false,$3)`,
        [otherUserId, otherAccountId, isoDay(0)],
      );
      await db.query(
        `insert into transaction_flags (user_id, dedup_key, flag_type, source)
         values ($1,'e2e-followup-other','followup','user')`,
        [otherUserId],
      );

      await otherPage.goto("/transactions");
      await expect(otherPage.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await otherPage.getByRole("button", { name: "Show only charges flagged to follow up" }).click();
      await expect(otherPage.getByText("Other Followup")).toBeVisible({ timeout: 15_000 });
      await expect(otherPage.getByText("Pending Refund Revised")).toHaveCount(0);
      await expect(otherPage.getByText("Needs Review")).toHaveCount(0);
      await expect(otherPage.getByLabel("Flagged to follow up")).toHaveCount(1);

      await page.goto("/transactions");
      await page.getByRole("button", { name: "Show only charges flagged to follow up" }).click();
      await expect(page.getByText("Pending Refund Revised")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Other Followup")).toHaveCount(0);
    } finally {
      await otherContext?.close();
      await db.end();
    }
  });
});
