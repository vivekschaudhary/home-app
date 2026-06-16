import { type CDPSession, expect, test } from "@playwright/test";
import { Client } from "pg";

// WLT-9/#36 regression — the REAL session→RLS→render path for the accounts list.
// The prior suite seeded CONNECTIONLESS financial_accounts and asserted the
// DASHBOARD; it never created an account_connection nor visited /accounts,
// so `connectionsList` (the read that showed empty in prod, issue #36) was never
// exercised end-to-end with a real authenticated session. This is that test.
// Gated like the other real-stack specs.
const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

test.describe("accounts list renders connected accounts (#36 regression)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("a connected bank + its accounts RENDER on /accounts (not the empty state)", async ({
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

    const email = `e2e-accounts+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    // Sign up + passkey → real AAL2 session.
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });

    // Seed a REAL connection + its accounts for this user (the shape prod has:
    // an account_connection with financial_accounts linked by connection_id) —
    // what the WLT-9 Plaid pipeline writes, minus the interactive Plaid modal.
    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      const userId = u.rows[0].id;
      const conn = await db.query(
        `insert into account_connections (user_id, provider, provider_connection_id, vault_token_ref, institution_name)
         values ($1, 'plaid', $2, gen_random_uuid(), 'Test Credit Union') returning id`,
        [userId, `e2e-item-${Date.now()}`],
      );
      const connId = conn.rows[0].id;
      await db.query(
        `insert into financial_accounts (user_id, connection_id, provider_account_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1,$2,'acc-1','Everyday Checking','depository','USD', 4210.55, now()),
                ($1,$2,'acc-2','Rewards Card','credit','USD', 318.20, now())`,
        [userId, connId],
      );

      // The real read path: authenticated RSC → connectionsList → AccountsClient.
      await page.goto("/accounts");
      // It must RENDER the connection + accounts, NOT the empty state (#36).
      await expect(page.getByText("No accounts connected yet")).toHaveCount(0);
      await expect(page.getByText("Test Credit Union").first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Everyday Checking")).toBeVisible();
      await expect(page.getByRole("button", { name: "Add another account" })).toBeVisible();

      // And it survives a navigate-away-and-back (the exact prod repro for #36).
      await page.goto("/dashboard");
      await page.goto("/accounts");
      await expect(page.getByText("No accounts connected yet")).toHaveCount(0);
      await expect(page.getByText("Test Credit Union").first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await db.end();
    }
  });
});
