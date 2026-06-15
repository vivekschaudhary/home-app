import { createClient } from "@supabase/supabase-js";
import { expect, test, type CDPSession } from "@playwright/test";
import { passIntentToDashboard } from "./helpers";

const RUN =
  process.env.E2E_PASSKEY === "1" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

function createAdminSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.describe("forgot password recovery (WLT-14)", () => {
  test.skip(!RUN, "Set E2E_PASSKEY=1 + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run.");

  test("generate recovery link -> reset password -> sign in with new password + passkey", async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(120_000);

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

    const email = `e2e-reset+${Date.now()}@example.com`;
    const oldPassword = "correct horse battery staple";
    const newPassword = "correct horse battery staple again";

    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(oldPassword);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await passIntentToDashboard(page);
    await expect(page.getByText("You're signed in.")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    const admin = createAdminSupabase();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${baseURL ?? "http://localhost:3000"}/reset` },
    });
    expect(error).toBeNull();
    const actionLink = data?.properties?.action_link;
    expect(actionLink).toBeTruthy();

    await page.goto(actionLink!);
    await expect(page).toHaveURL(/\/reset/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();

    await page.getByLabel("New password").fill(newPassword);
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("heading", { name: "Your password's updated" })).toBeVisible();
    await expect(page.getByText(/still use your passkey/)).toBeVisible();

    await page.getByRole("link", { name: "Go to sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(oldPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText("That email and password combination doesn't match our records. Try again."),
    ).toBeVisible();

    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Confirm it's you" })).toBeVisible();

    await passIntentToDashboard(page);
    await expect(page.getByText("You're signed in.")).toBeVisible();
  });
});
