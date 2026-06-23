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

  test("real session → auto-detected subscriptions are tagged, a dismissal is durable, a re-mark flips to user, variable charges stay undetected, and a second user stays isolated", async ({
    browser,
    page,
    context,
  }) => {
    const email = `e2e-subscriptions-detect-u1+${Date.now()}@example.com`;
    const otherEmail = `e2e-subscriptions-detect-u2+${Date.now()}@example.com`;
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
         values ($1, 'Detector Subscriptions Checking', 'depository', 'USD', 4800, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         values
           ($1,$2,'plaid','e2e-detectflix-1','detectflix-hash-1',15.99,'debit','USD','DetectFlix','ent-detectflix','DetectFlix Jan','ENTERTAINMENT','spend',$3),
           ($1,$2,'plaid','e2e-detectflix-2','detectflix-hash-2',15.99,'debit','USD','DetectFlix','ent-detectflix','DetectFlix Feb','ENTERTAINMENT','spend',$4),
           ($1,$2,'plaid','e2e-detectflix-3','detectflix-hash-3',15.99,'debit','USD','DetectFlix','ent-detectflix','DetectFlix Mar','ENTERTAINMENT','spend',$5),
           ($1,$2,'plaid','e2e-detectflix-4','detectflix-hash-4',15.99,'debit','USD','DetectFlix','ent-detectflix','DetectFlix Apr','ENTERTAINMENT','spend',$6),
           ($1,$2,'plaid','e2e-tunebox-1','tunebox-hash-1',10.99,'debit','USD','TuneBox','ent-tunebox','TuneBox Jan','ENTERTAINMENT','spend',$3),
           ($1,$2,'plaid','e2e-tunebox-2','tunebox-hash-2',10.99,'debit','USD','TuneBox','ent-tunebox','TuneBox Feb','ENTERTAINMENT','spend',$4),
           ($1,$2,'plaid','e2e-tunebox-3','tunebox-hash-3',10.99,'debit','USD','TuneBox','ent-tunebox','TuneBox Mar','ENTERTAINMENT','spend',$5),
           ($1,$2,'plaid','e2e-tunebox-4','tunebox-hash-4',10.99,'debit','USD','TuneBox','ent-tunebox','TuneBox Apr','ENTERTAINMENT','spend',$6),
           ($1,$2,'plaid','e2e-wildcard-1','wildcard-hash-1',12.00,'debit','USD','WildCard Cafe','ent-wildcard','WildCard Jan','DINING','spend',$3),
           ($1,$2,'plaid','e2e-wildcard-2','wildcard-hash-2',28.00,'debit','USD','WildCard Cafe','ent-wildcard','WildCard Feb','DINING','spend',$4),
           ($1,$2,'plaid','e2e-wildcard-3','wildcard-hash-3',16.00,'debit','USD','WildCard Cafe','ent-wildcard','WildCard Mar','DINING','spend',$5),
           ($1,$2,'plaid','e2e-wildcard-4','wildcard-hash-4',32.00,'debit','USD','WildCard Cafe','ent-wildcard','WildCard Apr','DINING','spend',$6)`,
        [userId, accountId, monthDay(3), monthDay(2), monthDay(1), monthDay(0)],
      );

      await page.goto("/subscriptions");
      await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("DetectFlix")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("TuneBox")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("WildCard Cafe")).toHaveCount(0);
      await expect(page.getByText("We found 2 recurring charges — review them below.")).toBeVisible();
      await expect(page.getByText("detected")).toHaveCount(2);

      const initialFlags = await db.query(
        `select source, count(*)::int as n
           from transaction_flags
          where user_id = $1 and flag_type = 'subscription' and dismissed_at is null
          group by source
          order by source`,
        [userId],
      );
      expect(initialFlags.rows).toEqual([
        { source: "auto", n: 8 },
      ]);

      const detectflixRow = page.locator("tr", { hasText: "DetectFlix" });
      await detectflixRow.getByRole("button", { name: "Remove from subscriptions" }).click();
      await expect(page.getByText("Removed from subscriptions")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("DetectFlix")).toHaveCount(0);
      await expect(page.getByText("TuneBox")).toBeVisible();
      await expect(page.getByText("We found 1 recurring charge — review it below.")).toBeVisible();
      await expect(page.getByText("detected")).toHaveCount(1);

      const dismissedDetectflix = await db.query(
        `select count(*)::int as active,
                count(*) filter (where dismissed_at is not null)::int as dismissed
           from transaction_flags
          where user_id = $1 and dedup_key like 'e2e-detectflix-%'`,
        [userId],
      );
      expect(dismissedDetectflix.rows).toEqual([{ active: 4, dismissed: 4 }]);

      await page.reload();
      await expect(page.getByText("DetectFlix")).toHaveCount(0);
      await expect(page.getByText("TuneBox")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("We found 1 recurring charge — review it below.")).toBeVisible();
      await expect(page.getByText("detected")).toHaveCount(1);

      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      const tuneBoxPicker = page.getByRole("button", { name: /Change the category of TuneBox \(\$10\.99\)/i }).first();
      await tuneBoxPicker.click();
      await page.getByRole("button", { name: "Remove from subscriptions" }).click();
      await expect(page.getByText("Removed from subscriptions")).toBeVisible({ timeout: 15_000 });
      await tuneBoxPicker.click();
      await page.getByRole("button", { name: "Mark as a subscription" }).click();
      await expect(page.getByText("Marked as a subscription")).toBeVisible({ timeout: 15_000 });

      const tuneBoxSources = await db.query(
        `select distinct source, count(*)::int as n
           from transaction_flags
          where user_id = $1 and dedup_key like 'e2e-tunebox-%' and dismissed_at is null
          group by source
          order by source`,
        [userId],
      );
      expect(tuneBoxSources.rows).toEqual([{ source: "user", n: 4 }]);

      await page.goto("/subscriptions");
      await expect(page.getByText("TuneBox")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("DetectFlix")).toHaveCount(0);
      await expect(page.getByText("WildCard Cafe")).toHaveCount(0);
      await expect(page.getByText("detected")).toHaveCount(0);
      await expect(page.getByText("We found 1 recurring charge — review it below.")).toHaveCount(0);

      await page.reload();
      await expect(page.getByText("TuneBox")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("DetectFlix")).toHaveCount(0);
      await expect(page.getByText("detected")).toHaveCount(0);

      otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await signUpWithPasskey(otherPage, otherContext, otherEmail, password);

      const otherUser = await db.query("select id from auth.users where email = $1", [otherEmail]);
      expect(otherUser.rows).toHaveLength(1);
      const otherUserId = otherUser.rows[0].id as string;
      const otherAcct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'Other Detector Checking', 'depository', 'USD', 1500, now()) returning id`,
        [otherUserId],
      );
      const otherAccountId = otherAcct.rows[0].id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         values
           ($1,$2,'plaid','e2e-otherpod-1','otherpod-hash-1',8.99,'debit','USD','OtherPod','ent-otherpod','OtherPod Jan','ENTERTAINMENT','spend',$3),
           ($1,$2,'plaid','e2e-otherpod-2','otherpod-hash-2',8.99,'debit','USD','OtherPod','ent-otherpod','OtherPod Feb','ENTERTAINMENT','spend',$4),
           ($1,$2,'plaid','e2e-otherpod-3','otherpod-hash-3',8.99,'debit','USD','OtherPod','ent-otherpod','OtherPod Mar','ENTERTAINMENT','spend',$5),
           ($1,$2,'plaid','e2e-otherpod-4','otherpod-hash-4',8.99,'debit','USD','OtherPod','ent-otherpod','OtherPod Apr','ENTERTAINMENT','spend',$6)`,
        [otherUserId, otherAccountId, monthDay(3), monthDay(2), monthDay(1), monthDay(0)],
      );

      await otherPage.goto("/subscriptions");
      await expect(otherPage.getByRole("heading", { name: "Subscriptions" })).toBeVisible({ timeout: 15_000 });
      await expect(otherPage.getByText("OtherPod")).toBeVisible({ timeout: 15_000 });
      await expect(otherPage.getByText("We found 1 recurring charge — review it below.")).toBeVisible();
      await expect(otherPage.getByText("detected")).toHaveCount(1);
      await expect(otherPage.getByText("TuneBox")).toHaveCount(0);
      await expect(otherPage.getByText("DetectFlix")).toHaveCount(0);
      await expect(otherPage.getByText("WildCard Cafe")).toHaveCount(0);
    } finally {
      await otherContext?.close();
      await db.end();
    }
  });

  test("real session → a two-price vendor becomes two detected rows, one dismissed row stays gone, a user re-mark revives the merchant, and a second user stays isolated", async ({
    browser,
    page,
    context,
  }) => {
    const email = `e2e-subscriptions-clusters-u1+${Date.now()}@example.com`;
    const otherEmail = `e2e-subscriptions-clusters-u2+${Date.now()}@example.com`;
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
         values ($1, 'Cluster Subscriptions Checking', 'depository', 'USD', 5200, now()) returning id`,
        [userId],
      );
      const accountId = acct.rows[0].id as string;

      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         values
           ($1,$2,'plaid','e2e-clusterplay-low-1','clusterplay-low-hash-1',13.99,'debit','USD','ClusterPlay','ent-clusterplay','ClusterPlay Basic Jan','ENTERTAINMENT','spend',$3),
           ($1,$2,'plaid','e2e-clusterplay-low-2','clusterplay-low-hash-2',13.99,'debit','USD','ClusterPlay','ent-clusterplay','ClusterPlay Basic Feb','ENTERTAINMENT','spend',$4),
           ($1,$2,'plaid','e2e-clusterplay-low-3','clusterplay-low-hash-3',13.99,'debit','USD','ClusterPlay','ent-clusterplay','ClusterPlay Basic Mar','ENTERTAINMENT','spend',$5),
           ($1,$2,'plaid','e2e-clusterplay-low-4','clusterplay-low-hash-4',13.99,'debit','USD','ClusterPlay','ent-clusterplay','ClusterPlay Basic Apr','ENTERTAINMENT','spend',$6),
           ($1,$2,'plaid','e2e-clusterplay-high-1','clusterplay-high-hash-1',45.00,'debit','USD','ClusterPlay','ent-clusterplay','ClusterPlay Premium Jan','ENTERTAINMENT','spend',$3),
           ($1,$2,'plaid','e2e-clusterplay-high-2','clusterplay-high-hash-2',45.00,'debit','USD','ClusterPlay','ent-clusterplay','ClusterPlay Premium Feb','ENTERTAINMENT','spend',$4),
           ($1,$2,'plaid','e2e-clusterplay-high-3','clusterplay-high-hash-3',45.00,'debit','USD','ClusterPlay','ent-clusterplay','ClusterPlay Premium Mar','ENTERTAINMENT','spend',$5),
           ($1,$2,'plaid','e2e-clusterplay-high-4','clusterplay-high-hash-4',45.00,'debit','USD','ClusterPlay','ent-clusterplay','ClusterPlay Premium Apr','ENTERTAINMENT','spend',$6)`,
        [userId, accountId, monthDay(3), monthDay(2), monthDay(1), monthDay(0)],
      );

      await page.goto("/subscriptions");
      await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("ClusterPlay")).toHaveCount(2);
      await expect(page.getByText("$58.99 / month · $707.88 / year")).toBeVisible();
      await expect(page.getByText("$13.99")).toBeVisible();
      await expect(page.getByText("$45.00")).toBeVisible();
      await expect(page.getByText("We found 2 recurring charges — review them below.")).toBeVisible();
      await expect(page.getByText("detected")).toHaveCount(2);

      const initialRows = await db.query(
        `select source, count(*)::int as n
           from transaction_flags
          where user_id = $1 and flag_type = 'subscription' and dismissed_at is null
          group by source
          order by source`,
        [userId],
      );
      expect(initialRows.rows).toEqual([{ source: "auto", n: 8 }]);

      const lowPriceRow = page.getByRole("row", {
        name: /ClusterPlay, \$13\.99, billed every month, detected automatically/i,
      });
      await lowPriceRow.getByRole("button", { name: "Remove from subscriptions" }).click();
      await expect(page.getByText("Removed from subscriptions")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("ClusterPlay")).toHaveCount(1);
      await expect(page.getByText("$45.00 / month · $540.00 / year")).toBeVisible();
      await expect(page.getByText("$13.99")).toHaveCount(0);
      await expect(page.getByText("$45.00")).toBeVisible();
      await expect(page.getByText("We found 1 recurring charge — review it below.")).toBeVisible();
      await expect(page.getByText("detected")).toHaveCount(1);

      const dismissedLowSeries = await db.query(
        `select
           count(*) filter (where dismissed_at is null)::int as active,
           count(*) filter (where dismissed_at is not null)::int as dismissed
         from transaction_flags
        where user_id = $1 and dedup_key like 'e2e-clusterplay-low-%'`,
        [userId],
      );
      expect(dismissedLowSeries.rows).toEqual([{ active: 0, dismissed: 4 }]);

      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         values
           ($1,$2,'plaid','e2e-clusterplay-low-5','clusterplay-low-hash-5',13.99,'debit','USD','ClusterPlay','ent-clusterplay','ClusterPlay Basic May','ENTERTAINMENT','spend',$3)`,
        [userId, accountId, monthDay(-1)],
      );

      await page.reload();
      await expect(page.getByText("ClusterPlay")).toHaveCount(1);
      await expect(page.getByText("$45.00 / month · $540.00 / year")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("$13.99")).toHaveCount(0);
      await expect(page.getByText("We found 1 recurring charge — review it below.")).toBeVisible();
      await expect(page.getByText("detected")).toHaveCount(1);

      const postReloadLowSeries = await db.query(
        `select
           count(*) filter (where dismissed_at is null)::int as active,
           count(*) filter (where dismissed_at is not null)::int as dismissed
         from transaction_flags
        where user_id = $1 and dedup_key like 'e2e-clusterplay-low-%'`,
        [userId],
      );
      expect(postReloadLowSeries.rows).toEqual([{ active: 0, dismissed: 4 }]);

      await page.goto("/transactions");
      await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
      const clusterPlayPicker = page.getByRole("button", { name: /Change the category of ClusterPlay \(\$13\.99\)/i }).first();
      await clusterPlayPicker.click();
      await page.getByRole("button", { name: "Mark as a subscription" }).click();
      await expect(page.getByText("Marked as a subscription")).toBeVisible({ timeout: 15_000 });

      const userOwnedMerchant = await db.query(
        `select source, count(*)::int as n
           from transaction_flags
          where user_id = $1
            and flag_type = 'subscription'
            and dismissed_at is null
            and dedup_key like 'e2e-clusterplay-%'
          group by source
          order by source`,
        [userId],
      );
      expect(userOwnedMerchant.rows).toEqual([{ source: "user", n: 9 }]);

      await page.goto("/subscriptions");
      await expect(page.getByText("ClusterPlay")).toHaveCount(2);
      await expect(page.getByText("$58.99 / month · $707.88 / year")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("$13.99")).toBeVisible();
      await expect(page.getByText("$45.00")).toBeVisible();
      await expect(page.getByText("detected")).toHaveCount(0);
      await expect(page.getByText("We found 1 recurring charge — review it below.")).toHaveCount(0);
      await expect(page.getByText("We found 2 recurring charges — review them below.")).toHaveCount(0);

      otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await signUpWithPasskey(otherPage, otherContext, otherEmail, password);

      const otherUser = await db.query("select id from auth.users where email = $1", [otherEmail]);
      expect(otherUser.rows).toHaveLength(1);
      const otherUserId = otherUser.rows[0].id as string;
      const otherAcct = await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'Other Cluster Checking', 'depository', 'USD', 2600, now()) returning id`,
        [otherUserId],
      );
      const otherAccountId = otherAcct.rows[0].id as string;
      await db.query(
        `insert into transactions
           (user_id, account_id, source, dedup_key, content_hash, amount, direction, currency, merchant, merchant_entity_id, description, category, kind, occurred_on)
         values
           ($1,$2,'plaid','e2e-othercluster-low-1','othercluster-low-hash-1',13.99,'debit','USD','ClusterPlay','ent-clusterplay-other','Other ClusterPlay Basic Jan','ENTERTAINMENT','spend',$3),
           ($1,$2,'plaid','e2e-othercluster-low-2','othercluster-low-hash-2',13.99,'debit','USD','ClusterPlay','ent-clusterplay-other','Other ClusterPlay Basic Feb','ENTERTAINMENT','spend',$4),
           ($1,$2,'plaid','e2e-othercluster-low-3','othercluster-low-hash-3',13.99,'debit','USD','ClusterPlay','ent-clusterplay-other','Other ClusterPlay Basic Mar','ENTERTAINMENT','spend',$5),
           ($1,$2,'plaid','e2e-othercluster-low-4','othercluster-low-hash-4',13.99,'debit','USD','ClusterPlay','ent-clusterplay-other','Other ClusterPlay Basic Apr','ENTERTAINMENT','spend',$6),
           ($1,$2,'plaid','e2e-othercluster-high-1','othercluster-high-hash-1',45.00,'debit','USD','ClusterPlay','ent-clusterplay-other','Other ClusterPlay Premium Jan','ENTERTAINMENT','spend',$3),
           ($1,$2,'plaid','e2e-othercluster-high-2','othercluster-high-hash-2',45.00,'debit','USD','ClusterPlay','ent-clusterplay-other','Other ClusterPlay Premium Feb','ENTERTAINMENT','spend',$4),
           ($1,$2,'plaid','e2e-othercluster-high-3','othercluster-high-hash-3',45.00,'debit','USD','ClusterPlay','ent-clusterplay-other','Other ClusterPlay Premium Mar','ENTERTAINMENT','spend',$5),
           ($1,$2,'plaid','e2e-othercluster-high-4','othercluster-high-hash-4',45.00,'debit','USD','ClusterPlay','ent-clusterplay-other','Other ClusterPlay Premium Apr','ENTERTAINMENT','spend',$6)`,
        [otherUserId, otherAccountId, monthDay(3), monthDay(2), monthDay(1), monthDay(0)],
      );

      await otherPage.goto("/subscriptions");
      await expect(otherPage.getByRole("heading", { name: "Subscriptions" })).toBeVisible({ timeout: 15_000 });
      await expect(otherPage.getByText("ClusterPlay")).toHaveCount(2);
      await expect(otherPage.getByText("$58.99 / month · $707.88 / year")).toBeVisible();
      await expect(otherPage.getByText("$13.99")).toBeVisible();
      await expect(otherPage.getByText("$45.00")).toBeVisible();
      await expect(otherPage.getByText("We found 2 recurring charges — review them below.")).toBeVisible();
      await expect(otherPage.getByText("detected")).toHaveCount(2);
    } finally {
      await otherContext?.close();
      await db.end();
    }
  });
});
