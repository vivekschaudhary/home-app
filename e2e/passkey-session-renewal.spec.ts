import { expect, test, type BrowserContext, type CDPSession, type Page } from "@playwright/test";
import { expectSignedInShell, passIntentToDashboard } from "./helpers";

// Real-path AAL2 renewal proof for PR #104/#107 on commit 1ead679:
//   • ACTIVE session: browsing past the original TTL boundary stays signed in
//     because middleware renews the marker on navigation.
//   • IDLE session: no navigation past the TTL boundary re-challenges on the next hit.
//   • SECOND-USER isolation: one browser context's active renewal does not keep a
//     different user's idle session alive.
//
// This lane is intentionally gated harder than the normal passkey happy-path. It
// needs a real Supabase project AND a COMPRESSED AAL2 TTL, otherwise "wait past the
// boundary" means waiting an hour. Local dev can set AAL2_TTL_SECONDS directly; a
// preview deploy can expose the same server-side value to the test via
// E2E_AAL2_TTL_SECONDS.
const PASSKEY_RUN = process.env.E2E_PASSKEY === "1";
const COMPRESSED_TTL_SECONDS = Number(
  process.env.E2E_AAL2_TTL_SECONDS ?? process.env.AAL2_TTL_SECONDS ?? "",
);
const TTL_IS_COMPRESSED =
  Number.isSafeInteger(COMPRESSED_TTL_SECONDS) &&
  COMPRESSED_TTL_SECONDS > 0 &&
  COMPRESSED_TTL_SECONDS < 3600;

const PASSWORD = "correct horse battery staple";

async function attachVirtualAuthenticator(context: BrowserContext, page: Page): Promise<void> {
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

async function signUpToAal2(page: Page, email: string): Promise<void> {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
  await page.getByRole("button", { name: "Create passkey" }).click();
  await passIntentToDashboard(page);
  await expectSignedInShell(page);
}

async function waitPastBoundary(seconds: number): Promise<void> {
  await test.step(`wait ${seconds}s for the compressed AAL2 clock`, async () => {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  });
}

test.describe("passkey AAL2 renewal (gated real-path)", () => {
  test.skip(
    !PASSKEY_RUN || !TTL_IS_COMPRESSED,
    "Set E2E_PASSKEY=1 + AAL2_TTL_SECONDS=<compressed-seconds> (or E2E_AAL2_TTL_SECONDS for preview timing) to run.",
  );

  test("active browsing survives the original TTL boundary; idle re-challenges", async ({
    page,
    context,
  }) => {
    test.slow();

    await attachVirtualAuthenticator(context, page);

    const ttl = COMPRESSED_TTL_SECONDS;
    const halfLife = Math.floor(ttl / 2);
    const email = `e2e-renew-active-${Date.now()}@example.com`;

    await signUpToAal2(page, email);

    // Cross the half-life so the NEXT navigation is in the middleware renewal
    // window, then browse to another authed page. The old defect could not
    // persist that renewal on a read-only path.
    await waitPastBoundary(Math.max(halfLife + 1, 2));
    await page.goto("/settings/security");
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible({ timeout: 15_000 });

    // Now cross the ORIGINAL TTL boundary from first mint. If the middleware
    // renewal did not persist, this navigation would bounce to /sign-in.
    await waitPastBoundary(Math.max(halfLife + 1, 2));
    await page.goto("/dashboard");
    await expectSignedInShell(page);

    // A fresh session that sits idle past the same compressed boundary MUST
    // re-challenge on the next request.
    const idlePage = await context.newPage();
    await attachVirtualAuthenticator(context, idlePage);
    await signUpToAal2(idlePage, `e2e-renew-idle-${Date.now()}@example.com`);
    await waitPastBoundary(ttl + 2);
    await idlePage.goto("/dashboard");
    await expect(idlePage).toHaveURL(/\/sign-in/, { timeout: 15_000 });
  });

  test("second-user isolation: one active session renewing does not keep another idle session alive", async ({
    browser,
  }) => {
    test.slow();

    const ttl = COMPRESSED_TTL_SECONDS;
    const halfLife = Math.floor(ttl / 2);

    const activeContext = await browser.newContext();
    const idleContext = await browser.newContext();
    const activePage = await activeContext.newPage();
    const idlePage = await idleContext.newPage();

    try {
      await attachVirtualAuthenticator(activeContext, activePage);
      await attachVirtualAuthenticator(idleContext, idlePage);

      await signUpToAal2(activePage, `e2e-renew-user1-${Date.now()}@example.com`);
      await signUpToAal2(idlePage, `e2e-renew-user2-${Date.now()}@example.com`);

      // User 1 stays active and renews via middleware on a real authed nav.
      await waitPastBoundary(Math.max(halfLife + 1, 2));
      await activePage.goto("/settings/security");
      await expect(activePage.getByRole("heading", { name: "Security" })).toBeVisible({ timeout: 15_000 });

      // Let the original mint boundary pass for BOTH users. Only user 1 should
      // still have a live AAL2 marker because user 2 never navigated.
      await waitPastBoundary(Math.max(halfLife + 1, 2));
      await activePage.goto("/dashboard");
      await expectSignedInShell(activePage);

      await idlePage.goto("/dashboard");
      await expect(idlePage).toHaveURL(/\/sign-in/, { timeout: 15_000 });
    } finally {
      await activeContext.close();
      await idleContext.close();
    }
  });
});
