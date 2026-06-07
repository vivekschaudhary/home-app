import { expect, test, type CDPSession } from "@playwright/test";
import * as OTPAuth from "otpauth";

// Authenticator-app (TOTP) backup factor (WLT-7): enroll a TOTP factor, then
// sign in with it when the passkey is unavailable. Gated like the passkey E2E —
// needs a real Supabase project + E2E_PASSKEY=1 (creates a real user, real MFA).
const RUN = process.env.E2E_PASSKEY === "1";

function totpFrom(secret: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 });
}

/** A code different from `avoid` (GoTrue rejects replay within a window). */
async function freshCode(totp: OTPAuth.TOTP, avoid?: string): Promise<string> {
  let code = totp.generate();
  const start = Date.now();
  while (code === avoid && Date.now() - start < 35_000) {
    await new Promise((r) => setTimeout(r, 1000));
    code = totp.generate();
  }
  return code;
}

test.describe("authenticator-app (TOTP) backup (AC1, AC3)", () => {
  test.skip(!RUN, "Set E2E_PASSKEY=1 + a real Supabase project (email-confirmation off) to run.");

  test("enroll TOTP on Security; sign out; sign in via authenticator fallback → dashboard", async ({
    page,
    context,
  }) => {
    const client: CDPSession = await context.newCDPSession(page);
    await client.send("WebAuthn.enable");
    const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    const email = `e2e-totp+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    // Sign up + enroll passkey → dashboard (AAL2).
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // Go to Security → add authenticator app.
    await page.getByRole("link", { name: "Security" }).click();
    await expect(page).toHaveURL(/\/settings\/security/);
    await page.getByRole("button", { name: "Add authenticator app" }).click();

    // Read the manual key (the QR's text equivalent) and verify with a real code.
    await expect(page.getByRole("heading", { name: "Add your authenticator app" })).toBeVisible();
    const secret = (await page.locator("code").first().innerText()).trim();
    const totp = totpFrom(secret);
    const enrollCode = await freshCode(totp);
    await page.getByLabel("6-digit code").fill(enrollCode);
    await page.getByRole("button", { name: "Verify and add" }).click();
    // Enrolled → the Remove action only renders for an enrolled factor (AC5).
    await expect(page.getByRole("button", { name: "Remove" })).toBeVisible({ timeout: 15_000 });

    // Sign out, then make the passkey unavailable so the fallback is required.
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
    await client.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });

    // Sign in (password) → passkey challenge → use the authenticator instead.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Use your authenticator app instead" }).click();

    await expect(page.getByRole("heading", { name: "Enter your authenticator code" })).toBeVisible();
    const signinCode = await freshCode(totp, enrollCode);
    await page.getByLabel("6-digit code").fill(signinCode);
    await page.getByRole("button", { name: "Verify", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText("You're signed in.")).toBeVisible();
  });
});
