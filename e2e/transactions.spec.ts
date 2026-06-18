import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";

// WLT-23-1 — the Transactions ledger, REAL-PATH (the
// [real-path-integration-coverage] mandate; AC7 owner isolation). Drives the
// real /transactions RSC + API under authenticated sessions so the owner-scoped
// reads go session → createServerSupabase → RLS → rendered rows.
//
// The load-bearing edges here are:
//   • all-accounts render (the page reads transactions + financial_accounts)
//   • keyset pagination across a page boundary (no dropped/duplicated row)
//   • second-user isolation (no transaction/account-name leakage)
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

test.describe("transactions ledger — owner-scoped all-accounts read + keyset paging (WLT-23-1)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("real session → all-accounts rows render, load-more crosses the page boundary exactly once, second user is isolated", async ({
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

      // 51 rows → page 1 = 50, page 2 = 1. Distinct occurred_on values make the
      // order deterministic; alternating accounts proves the all-accounts read.
      const values: string[] = [];
      const params: Array<string | number> = [];
      let i = 1;
      for (let n = 1; n <= PAGE_SIZE + 1; n += 1) {
        const accountId = n % 2 === 0 ? checkingId : cardId;
        values.push(
          `($${i++},$${i++},'plaid',$${i++},$${i++},$${i++},'debit','USD',$${i++},$${i++},$${i++},false,$${i++})`,
        );
        params.push(
          userId,
          accountId,
          `e2e-transactions-${n}`,
          `txn-hash-${n}`,
          10 + n,
          `User One Merchant ${String(n).padStart(2, "0")}`,
          `User one description ${n}`,
          "FOOD_AND_DRINK",
          isoDay(-((PAGE_SIZE + 1) - n)),
        );
      }
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values ${values.join(",")}`,
        params,
      );

      // Real read path: /transactions RSC under the authenticated session.
      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Everything across your accounts, newest first.")).toBeVisible();
      await expect(page.getByText(`Showing ${PAGE_SIZE} transactions`)).toBeVisible();
      await expect(page.getByText("User One Merchant 51")).toBeVisible();
      await expect(page.getByText("User One Merchant 02")).toBeVisible();
      await expect(page.getByText("User One Merchant 01")).toHaveCount(0);
      // Across accounts: both owner account names render in the ledger.
      await expect(page.getByText("Ledger Checking")).toBeVisible();
      await expect(page.getByText("Travel Card")).toBeVisible();

      // AC7 page-boundary keyset guardrail: appending page 2 must surface the
      // one missing row exactly once, without dropping/duplicating the boundary row.
      await page.getByRole("button", { name: "Load more transactions" }).click();
      await expect(page.getByText(`Showing ${PAGE_SIZE + 1} transactions`)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("User One Merchant 01")).toBeVisible();
      await expect(page.getByText("User One Merchant 02")).toHaveCount(1);
      await expect(page.getByText("You're all caught up — that's everything.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Load more transactions" })).toHaveCount(0);

      // Second user: same surface, but only their own row/account name can render.
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
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, description, category, pending, occurred_on)
         values
           ($1,$2,'plaid','e2e-transactions-other','other-hash',88,'debit','USD','Other User Merchant','Other user description','INCOME',false,$3)`,
        [otherUserId, otherAccountId, isoDay(0)],
      );

      await otherPage.goto("/transactions");
      await expect(otherPage.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await expect(otherPage.getByText("Showing 1 transactions")).toBeVisible();
      await expect(otherPage.getByText("Other User Merchant")).toBeVisible();
      await expect(otherPage.getByText("Other User Checking")).toBeVisible();
      await expect(otherPage.getByText("User One Merchant 51")).toHaveCount(0);
      await expect(otherPage.getByText("User One Merchant 01")).toHaveCount(0);
      await expect(otherPage.getByText("Ledger Checking")).toHaveCount(0);
      await expect(otherPage.getByText("Travel Card")).toHaveCount(0);
    } finally {
      await otherContext?.close();
      await db.end();
    }
  });
});
