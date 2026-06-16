import { expect, test, type CDPSession } from "@playwright/test";
import { expectSignedInShell, passIntentToDashboard, signOutViaShell } from "./helpers";

// Full passkey MFA happy path with a WebAuthn virtual authenticator.
// Gated: needs a real Supabase project (email-confirmation OFF) + E2E_PASSKEY=1,
// because it creates a real user and runs the actual ceremonies. Skipped in CI.
const RUN = process.env.E2E_PASSKEY === "1";

test.describe("passkey MFA happy path (AC1, AC2)", () => {
  test.skip(!RUN, "Set E2E_PASSKEY=1 + a real Supabase project (email-confirmation off) to run.");

  test("sign up → enroll → dashboard; sign out; sign in → challenge → dashboard", async ({
    page,
    context,
  }) => {
    // Virtual authenticator auto-completes navigator.credentials.create/get.
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

    const email = `e2e+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    // Sign-up credentials → mandatory enroll step
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    // Enroll passkey → dashboard
    await expect(
      page.getByRole("heading", { name: "Secure your account with a passkey" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await passIntentToDashboard(page);
    await expectSignedInShell(page);

    // Sign out (now via the account menu in the shell)
    await signOutViaShell(page);

    // Sign in → auto passkey challenge → dashboard
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await passIntentToDashboard(page);
    await expectSignedInShell(page);
  });
});
