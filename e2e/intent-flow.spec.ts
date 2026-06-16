import { type CDPSession, expect, test } from "@playwright/test";
import { signOutViaShell } from "./helpers";

// WLT-11 — intent-first front door. Sign up → land on the intent front door
// (intent-first, before connect) → declare an intent → "putting your plan
// together" placeholder. Gated like the passkey flow (real user + ceremony).
const RUN = process.env.E2E_PASSKEY === "1";

test.describe("intent-first front door (WLT-11)", () => {
  test.skip(!RUN, "Set E2E_PASSKEY=1 + a real Supabase project (email-confirmation off) to run.");

  test("sign up → intent front door → declare → placeholder", async ({ page, context }) => {
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

    const email = `e2e-intent+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    // Sign up + enroll passkey → routed to the intent front door (not dashboard).
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Create passkey" }).click();

    // Intent-first: the front door is the first screen after sign-in.
    await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "What would you like help with?" })).toBeVisible();

    // Declare an intent → placeholder (WLT-4 not built; no fake workflow).
    await page.getByRole("radio", { name: "I think I'm overspending" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Got it. We're putting your plan together." })).toBeVisible({
      timeout: 15_000,
    });

    // The bridge to connect is offered (intent-first, then friction).
    await expect(page.getByRole("button", { name: "Connect an account" })).toBeVisible();

    // AC7 — a returning user who already declared skips the front door. Go to the
    // dashboard, sign out, sign back in → the gate routes straight to /dashboard
    // (NOT /onboarding/intent), because hasDeclaredIntent is now true.
    await page.getByRole("button", { name: "I'll do that later" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await signOutViaShell(page);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Skips the intent front door — lands on the dashboard.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/onboarding\/intent/);
  });
});
