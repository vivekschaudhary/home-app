import { type CDPSession, expect, test } from "@playwright/test";
import { expectSignedInShell, gotoSecurityViaShell, passIntentToDashboard, signOutViaShell } from "./helpers";

// WLT-20 — the real-path E2E the story names (story.md "PRs": _Codex: ... renders
// for an AAL2 session; the mobile drawer + account menu happy path_). The
// unauthenticated redirect sweep + the manifest/middleware check live in CI
// (auth-guard.spec.ts); THIS proves the shell actually renders and is operable
// under a real AAL2 session — the half the gated lane owns.
//
// Gated like the other passkey specs: needs a real Supabase project
// (email-confirmation OFF) + E2E_PASSKEY=1, because it signs up a real user and
// runs the actual WebAuthn ceremony to reach AAL2. Skipped in normal CI.
const RUN = process.env.E2E_PASSKEY === "1";

test.describe("the app shell under a real AAL2 session (AC1, AC3, AC6, AC7)", () => {
  test.skip(!RUN, "Set E2E_PASSKEY=1 + a real Supabase project (email-confirmation off) to run.");

  test("renders for an AAL2 session; account menu → Security; mobile drawer; sign out", async ({
    page,
    context,
  }) => {
    // Virtual authenticator auto-completes the passkey ceremony → AAL2.
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

    const email = `e2e+shell-${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    // Sign up → enroll passkey → intent front door → dashboard (AAL2).
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await passIntentToDashboard(page);

    // AC1/AC3 — the shell rendered for the AAL2 session (Main nav + the Dashboard
    // page framed inside it), and every section is present in order (AC2).
    await expectSignedInShell(page);
    await expect(
      page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link")
        .filter({ hasText: /Dashboard|Budget & Spending|Goals|Debt payoff|Investments|Subscriptions|Accounts/ }),
    ).toHaveCount(7);

    // AC7 — account menu → Security navigation (desktop sidebar control).
    await gotoSecurityViaShell(page);
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await page.goto("/dashboard");

    // AC6 — the mobile drawer. Shrink to a phone so the sidebar collapses to the
    // hamburger (lg:hidden ↔ lg:block).
    await page.setViewportSize({ width: 390, height: 844 });
    const hamburger = page.getByRole("button", { name: "Open navigation menu" });
    await expect(hamburger).toBeVisible();

    // Open → a focus-trapped, aria-modal Dialog with the nav + a close control.
    await hamburger.click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("button", { name: "Close navigation menu" })).toBeVisible();

    // A nav tap navigates AND closes the drawer (onNavigate).
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Accounts" }).click();
    await expect(page).toHaveURL(/\/accounts/, { timeout: 15_000 });
    await expect(page.getByRole("dialog")).toBeHidden();

    // Reopen → Esc closes → focus returns to the hamburger (AC6).
    await hamburger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(hamburger).toBeFocused();

    // AC7 — Sign out, reached through the drawer's account menu on mobile.
    await hamburger.click();
    await signOutViaShell(page);
  });
});
