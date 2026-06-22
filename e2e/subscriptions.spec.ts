import { type BrowserContext, type CDPSession, type Page, expect, test } from "@playwright/test";
import { Client } from "pg";
import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { applySubscriptionMerchantsForUser } from "@wealth/db/subscriptions";

// WLT-24-1 — Subscriptions, REAL-PATH. Drives the actual ledger mark flow and
// the live subscriptions surface under authenticated sessions so the read path is
// session → createServerSupabase → RLS → render, with CDC survival + second-user
// isolation proven against the running app rather than a mocked client.
const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

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
}

async function markSubscriptionFromLedger(page: Page, merchant: string, amount: string): Promise<void> {
  await page.getByRole("button", { name: new RegExp(`Change the category of ${merchant} \\(${amount}\\)`, "i") }).click();
  await page.getByRole("button", { name: "Mark as a subscription" }).click();
  await expect(page.getByText("Marked as a subscription")).toBeVisible({ timeout: 15_000 });
}

test.describe("subscriptions — mark from ledger + summarize + CDC survival + owner isolation (WLT-24-1)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("real session → one ledger mark flags the whole merchant, a new same-merchant charge auto-joins, CDC survives, and the owner stays isolated", async ({
    browser,
    page,
    context,
  }) => {
    const email = `e2e-subscriptions-u1+${Date.now()}@example.com`;
    const otherEmail = `e2e-subscriptions-u2+${Date.now()}@example.com`;
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
         values ($1, 'Subscriptions Checking', 'depository', 'USD', 2400, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         values
           ($1,$2,'plaid','e2e-sub-netflix-1','sub-hash-1',14.49,'debit','USD','StreamFlix','ent-streamflix','StreamFlix May','ENTERTAINMENT','spend',$3),
           ($1,$2,'plaid','e2e-sub-netflix-2','sub-hash-2',15.49,'debit','USD','StreamFlix','ent-streamflix','StreamFlix June','ENTERTAINMENT','spend',$4),
           ($1,$2,'plaid','e2e-sub-netflix-3','sub-hash-3',16.49,'debit','USD','StreamFlix','ent-streamflix','StreamFlix July','ENTERTAINMENT','spend',$5),
           ($1,$2,'plaid','e2e-sub-grocery','sub-hash-grocery',82.10,'debit','USD','Fresh Foods','ent-fresh-foods','Fresh Foods weekly run','GROCERIES','spend',$5)`,
        [userId, accountId, monthDay(2), monthDay(1), monthDay(0)],
      );

      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await markSubscriptionFromLedger(page, "StreamFlix", "\\$14\\.49");
      await expect(page.getByText("★ Subscription")).toHaveCount(3);

      const flags = await db.query(
        `select dedup_key
           from transaction_flags
          where user_id = $1 and flag_type = 'subscription'
          order by dedup_key`,
        [userId],
      );
      expect(flags.rows).toEqual([
        { dedup_key: "e2e-sub-netflix-1" },
        { dedup_key: "e2e-sub-netflix-2" },
        { dedup_key: "e2e-sub-netflix-3" },
      ]);

      await page.goto("/subscriptions");
      await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("$15.49 / month · $185.88 / year")).toBeVisible();
      await expect(page.getByText("StreamFlix")).toBeVisible();
      await expect(page.getByText("every month")).toBeVisible();
      await expect(page.getByText("Fresh Foods")).toHaveCount(0);

      const revisedTxn = await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         values
           ($1,$2,'plaid','e2e-sub-netflix-2','sub-hash-2-revised',15.49,'debit','USD','StreamFlix.com','ent-streamflix','StreamFlix June revised','ENTERTAINMENT','spend',$3)
         returning id`,
        [userId, accountId, monthDay(1)],
      );
      const priorTxn = await db.query(
        `select id
           from transactions
          where user_id = $1 and dedup_key = 'e2e-sub-netflix-2' and content_hash = 'sub-hash-2' and superseded_by is null`,
        [userId],
      );
      expect(priorTxn.rows).toHaveLength(1);
      await db.query("update transactions set superseded_by = $2 where id = $1", [
        priorTxn.rows[0].id as string,
        revisedTxn.rows[0].id as string,
      ]);

      await page.goto("/subscriptions");
      await expect(page.getByText("$15.49 / month · $185.88 / year")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("StreamFlix")).toBeVisible();
      await expect(page.getByText("every month")).toBeVisible();

      await page.goto("/transactions");
      await expect(page.getByText("StreamFlix.com")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("★ Subscription")).toHaveCount(3);

      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         values
           ($1,$2,'plaid','e2e-sub-netflix-4','sub-hash-4',18.49,'debit','USD','STREAMFLIX.COM #123','ent-streamflix','StreamFlix August','ENTERTAINMENT','spend',$3)`,
        [userId, accountId, monthDay(-1)],
      );
      await applySubscriptionMerchantsForUser(createServiceSupabase(), userId);

      const postSyncFlags = await db.query(
        `select dedup_key
           from transaction_flags
          where user_id = $1 and flag_type = 'subscription'
          order by dedup_key`,
        [userId],
      );
      expect(postSyncFlags.rows).toEqual([
        { dedup_key: "e2e-sub-netflix-1" },
        { dedup_key: "e2e-sub-netflix-2" },
        { dedup_key: "e2e-sub-netflix-3" },
        { dedup_key: "e2e-sub-netflix-4" },
      ]);

      await page.goto("/subscriptions");
      await expect(page.getByText("$15.99 / month · $191.88 / year")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("every month")).toBeVisible();

      await page.goto("/transactions");
      await expect(page.getByText("STREAMFLIX.COM #123")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("★ Subscription")).toHaveCount(4);

      otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await signUpWithPasskey(otherPage, otherContext, otherEmail, password);

      const otherUser = await db.query("select id from auth.users where email = $1", [otherEmail]);
      expect(otherUser.rows).toHaveLength(1);
      const otherUserId = otherUser.rows[0].id as string;
      const otherAcct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'Other Subscriptions Checking', 'depository', 'USD', 900, now()) returning id`,
        [otherUserId],
      );
      const otherAccountId = otherAcct.rows[0].id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         values
           ($1,$2,'plaid','e2e-sub-other','sub-other-hash',24.99,'debit','USD','Other Service','ent-other-service','Other Service June','ENTERTAINMENT','spend',$3)`,
        [otherUserId, otherAccountId, monthDay(0)],
      );
      await db.query(
        `insert into transaction_flags (user_id, dedup_key, flag_type, source)
         values ($1,'e2e-sub-other','subscription','user')`,
        [otherUserId],
      );

      await otherPage.goto("/subscriptions");
      await expect(otherPage.getByRole("heading", { name: "Subscriptions" })).toBeVisible({ timeout: 15_000 });
      await expect(otherPage.getByText("Other Service")).toBeVisible();
      await expect(otherPage.getByText("cadence pending")).toBeVisible();
      await expect(otherPage.getByText("StreamFlix")).toHaveCount(0);
      await expect(otherPage.getByText("$15.49 / month · $185.88 / year")).toHaveCount(0);
    } finally {
      await otherContext?.close();
      await db.end();
    }
  });

  test("real session → marking a many-charge merchant keeps the subscriptions panel populated after a server read", async ({
    page,
    context,
  }) => {
    const email = `e2e-subscriptions-overflow+${Date.now()}@example.com`;
    const password = "correct horse battery staple";
    const MANY_CHARGES = 180;

    await signUpWithPasskey(page, context, email, password);

    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id as string;

      const acct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'Overflow Subscriptions Checking', 'depository', 'USD', 7200, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         select
           $1,
           $2,
           'plaid',
           format('plaid:acct-overflow:%s:%s', lpad(n::text, 4, '0'), repeat('very-long-subscription-key-', 3)),
           format('overflow-hash-%s', lpad(n::text, 4, '0')),
           19.99,
           'debit',
           'USD',
           'MegaStream',
           'ent-megastream',
           format('MegaStream cycle %s', lpad(n::text, 4, '0')),
           'ENTERTAINMENT',
           'spend',
           ($3::date - (( $4 - n) * interval '30 days'))::date
         from generate_series(1, $4) as n`,
        [userId, accountId, monthDay(0), MANY_CHARGES],
      );

      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      await markSubscriptionFromLedger(page, "MegaStream", "\\$19\\.99");

      const flagCount = await db.query(
        `select count(*)::int as n
           from transaction_flags
          where user_id = $1 and flag_type = 'subscription'`,
        [userId],
      );
      expect(flagCount.rows).toEqual([{ n: MANY_CHARGES }]);

      await page.goto("/subscriptions");
      await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("MegaStream")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("$19.99 / month · $239.88 / year")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("No subscriptions marked yet")).toHaveCount(0);

      await page.reload();
      await expect(page.getByText("MegaStream")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("$19.99 / month · $239.88 / year")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("No subscriptions marked yet")).toHaveCount(0);
    } finally {
      await db.end();
    }
  });
});
