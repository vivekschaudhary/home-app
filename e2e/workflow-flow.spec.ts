import { type CDPSession, expect, test } from "@playwright/test";
import { Client } from "pg";

// WLT-12 — the workflow engine end-to-end: sign up → declare a mapped intent
// (unified_view → networth_snapshot) → the plan-ready connect bridge (AC6, no
// fake figure) → [synced balances land] → REAL net-worth snapshot (AC4) → one
// tap "Set your target" → running (AC5: the WorkflowRun = the WAWU unit) →
// persists across reload. Gated like the passkey flow (real user + ceremony +
// a real Supabase project). The bank-link modal itself is WLT-9's surface —
// here the synced OUTCOME is seeded server-side (SUPABASE_DB_URL) so the spec
// exercises the ENGINE's full path deterministically.
const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

test.describe("workflow engine — intent → running workflow → first action (WLT-12)", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  test("declare → plan-ready bridge → snapshot on real balances → set target → running", async ({ page, context }) => {
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

    const email = `e2e-workflow+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    // Sign up + enroll passkey → the intent front door.
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });

    // Declare a MAPPED intent: unified_view → the networth_snapshot archetype.
    await page.getByRole("radio", { name: "See all my money in one place" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Got it. We're putting your plan together." })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "I'll do that later" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // AC6 — pending_data: the plan-ready connect bridge, and NEVER a fake figure (AC4).
    await expect(page.getByRole("heading", { name: "Your plan's ready" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Connect an account" })).toBeVisible();
    await expect(page.getByText("Net worth")).toHaveCount(0);

    // The synced outcome lands (server-side seed = what WLT-9's pipeline writes).
    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      const u = await db.query("select id from auth.users where email = $1", [email]);
      expect(u.rows).toHaveLength(1);
      const userId = u.rows[0].id;
      await db.query(
        `insert into financial_accounts (user_id, name, kind, currency, balance_current, balance_updated_at)
         values ($1, 'E2E Checking', 'depository', 'USD', 31400, now()),
                ($1, 'E2E Card',     'credit',     'USD',  7220, now())`,
        [userId],
      );

      // Personalize on next load: the REAL net-worth snapshot + the one action.
      await page.reload();
      await expect(page.getByRole("heading", { name: "Your money, right now" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("$24,180")).toBeVisible(); // 31,400 − 7,220 — real data
      await page.getByRole("button", { name: "Set your target" }).click();

      // One-tap suggested target → running (AC5: the WorkflowRun records).
      await expect(page.getByText(/A good first target:/)).toBeVisible();
      await page.getByRole("button", { name: "Use this target" }).click();
      const runningHeading = page.getByRole("heading", { name: "You're set" });
      await expect(runningHeading).toBeVisible({ timeout: 15_000 });
      await expect(runningHeading).toBeFocused(); // focus lands on the outcome (AC11)
      await expect(page.getByText(/Running — tracking toward/)).toBeVisible();

      // Persistence: the running state survives a reload (server-derived).
      await page.reload();
      await expect(page.getByText(/Running — tracking toward/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Set your target" })).toHaveCount(0);

      // The engine's writes are real: ONE immutable run + the goal handed off.
      const runs = await db.query(
        "select r.kind from workflow_runs r where r.user_id = $1",
        [userId],
      );
      expect(runs.rows).toEqual([{ kind: "target_set" }]);
      const goal = await db.query("select status from goals where user_id = $1", [userId]);
      expect(goal.rows).toEqual([{ status: "active" }]);
    } finally {
      await db.end();
    }
  });
});
