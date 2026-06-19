import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";

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
         values
           ($1,$2,'plaid','e2e-ledger-recat-1','txn-recat-1',25,'debit','USD','Rule Hardware','Ledger recat one','SHOPPING',false,$3),
           ($1,$2,'plaid','e2e-ledger-recat-2','txn-recat-2',40,'debit','USD','Rule Hardware','Ledger recat two','SHOPPING',false,$4),
           ($1,$2,'plaid','e2e-ledger-recat-3','txn-recat-3',15,'debit','USD','Rule Hardware','Ledger recat three','SHOPPING',false,$5)`,
        [userId, accountId, isoDay(0), isoDay(-1), isoDay(-2)],
      );

      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      const table = page.getByRole("table", { name: "Your transactions" });
      await expect(page.getByLabel("Filter by category")).toContainText("Shopping");
      await expect(page.getByLabel("Filter by category")).toContainText("Rent");
      await expect(page.getByLabel("Filter by category")).toContainText("Utilities");

      await page.getByLabel("Filter by category").selectOption("Shopping");
      await expect(page.getByText("Showing 3 transactions")).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: /Change the category of Rule Hardware \(\$25\.00\).*Shopping/i }).click();
      await page.getByRole("button", { name: /^Rent$/ }).click();
      await expect(page.getByText("Moved to Rent")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Showing 2 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$25\.00\).*Shopping/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$40\.00\).*Shopping/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$15\.00\).*Shopping/i })).toBeVisible();

      await page.getByLabel("Filter by category").selectOption("Rent");
      await expect(page.getByText("Showing 1 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$25\.00\).*Rent/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$40\.00\).*Utilities/i })).toHaveCount(0);

      await page.getByLabel("Filter by category").selectOption("Shopping");
      await expect(page.getByText("Showing 2 transactions")).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /Change the category of Rule Hardware \(\$40\.00\).*Shopping/i }).click();
      await page.getByLabel("Always categorize Rule Hardware this way").check();
      await page.getByRole("button", { name: /^Utilities$/ }).click();
      await expect(page.getByText("Now categorizing Rule Hardware as Utilities — updated 2 transactions")).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByText("No transactions match these filters.")).toBeVisible({ timeout: 15_000 });

      await page.getByLabel("Filter by category").selectOption("Utilities");
      await expect(page.getByText("Showing 2 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$40\.00\).*Utilities/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$15\.00\).*Utilities/i })).toBeVisible();

      await page.getByLabel("Filter by category").selectOption("Rent");
      await expect(page.getByText("Showing 1 transactions")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$25\.00\).*Rent/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Change the category of Rule Hardware \(\$40\.00\).*Utilities/i })).toHaveCount(0);

      const assignments = await db.query(
        `select dedup_key, assigned_by, category_id
           from transaction_categories
          where user_id = $1 and dedup_key like 'e2e-ledger-recat-%'
          order by dedup_key`,
        [userId],
      );
      expect(assignments.rows).toEqual([
        { dedup_key: "e2e-ledger-recat-1", assigned_by: "user", category_id: rentCategoryId },
        { dedup_key: "e2e-ledger-recat-2", assigned_by: "rule", category_id: utilitiesCategoryId },
        { dedup_key: "e2e-ledger-recat-3", assigned_by: "rule", category_id: utilitiesCategoryId },
      ]);

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
      await expect(page.getByText("Showing 2 transactions")).toBeVisible({ timeout: 15_000 });
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
});
