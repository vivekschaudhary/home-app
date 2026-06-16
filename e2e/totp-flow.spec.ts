import { expect, test, type CDPSession } from "@playwright/test";
import { expectSignedInShell, gotoSecurityViaShell, passIntentToDashboard, signOutViaShell } from "./helpers";
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
    // enroll + remove + re-enroll + sign-in, and freshCode() may wait up to a
    // full ~30s TOTP window to avoid replaying a code — well past the 30s default.
    test.setTimeout(120_000);
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
    await passIntentToDashboard(page);

    // Go to Security (via the shell's account menu) → add authenticator app.
    await gotoSecurityViaShell(page);
    await page.getByRole("button", { name: "Add authenticator app" }).click();

    // Read the manual key (the QR's text equivalent) and verify with a real code.
    await expect(page.getByRole("heading", { name: "Add your authenticator app" })).toBeVisible();
    let secret = (await page.locator("code").first().innerText()).trim();
    let totp = totpFrom(secret);
    let lastCode = await freshCode(totp);
    await page.getByLabel("6-digit code").fill(lastCode);
    await page.getByRole("button", { name: "Verify and add" }).click();
    // Enrolled → the Remove action only renders for an enrolled factor (AC5).
    await expect(page.getByRole("button", { name: "Remove" })).toBeVisible({ timeout: 15_000 });

    // Remove the factor through the real unenroll route + confirm dialog (AC5),
    // then re-enroll a fresh secret for the sign-in part.
    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: "Add authenticator app" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Add authenticator app" }).click();
    await expect(page.getByRole("heading", { name: "Add your authenticator app" })).toBeVisible();
    secret = (await page.locator("code").first().innerText()).trim();
    totp = totpFrom(secret);
    lastCode = await freshCode(totp);
    await page.getByLabel("6-digit code").fill(lastCode);
    await page.getByRole("button", { name: "Verify and add" }).click();
    await expect(page.getByRole("button", { name: "Remove" })).toBeVisible({ timeout: 15_000 });

    // Sign out, then make the passkey unavailable so the fallback is required.
    await page.goto("/dashboard");
    await signOutViaShell(page);
    await client.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });

    // Sign in (password) → passkey challenge → use the authenticator instead.
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Use your authenticator app instead" }).click();

    await expect(page.getByRole("heading", { name: "Enter your authenticator code" })).toBeVisible();
    const signinCode = await freshCode(totp, lastCode);
    await page.getByLabel("6-digit code").fill(signinCode);
    await page.getByRole("button", { name: "Verify", exact: true }).click();

    await passIntentToDashboard(page);
    await expectSignedInShell(page);
  });
});
