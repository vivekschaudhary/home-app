import { expect, test } from "@playwright/test";

// Guard + smoke specs — run anywhere (no real Supabase needed); placeholder env
// is enough because these exercise routing, server-side redirects, and the
// non-revealing error path.

// WLT-20 AC3 (load-bearing): NO shell route may render without AAL2. Every
// route in the (app) group + the moved Accounts URL is asserted here, in normal
// CI — a regression that drops the gate (or middleware) fails the build.
const SHELL_ROUTES = [
  "/dashboard",
  "/accounts",
  "/settings/security",
  "/budget",
  "/goals",
  "/debt",
  "/investments",
  "/subscriptions",
];

for (const route of SHELL_ROUTES) {
  test(`unauthenticated ${route} redirects to /sign-in (shell AAL2 gate, AC3)`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in/);
  });
}

test("the old /settings/accounts URL redirects to /accounts (deep-link preserved, AC3)", async ({
  page,
}) => {
  // Unauthenticated, so the destination then bounces to /sign-in — the point is
  // the path rewrite survived the move (it does not 404).
  await page.goto("/settings/accounts");
  await expect(page).not.toHaveURL(/\/settings\/accounts/);
  await expect(page).toHaveURL(/\/sign-in/);
});

test("/sign-up renders the create-account step (AC1)", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("/unsupported shows the honest block, no fake continue (AC3)", async ({ page }) => {
  await page.goto("/unsupported");
  await expect(
    page.getByRole("heading", { name: "This browser doesn't support passkeys" }),
  ).toBeVisible();
  await expect(page.getByText("continue anyway", { exact: false })).toHaveCount(0);
});

test("invalid sign-in is non-revealing (AC6)", async ({ request }) => {
  const res = await request.post("/api/auth/sign-in", {
    data: { email: "nobody@example.com", password: "definitely-wrong-pass" },
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error).toBe("invalid_credentials");
});
