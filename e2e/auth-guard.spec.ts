import { expect, test } from "@playwright/test";

// Guard + smoke specs — run anywhere (no real Supabase needed); placeholder env
// is enough because these exercise routing, server-side redirects, and the
// non-revealing error path.

test("unauthenticated /dashboard redirects to /sign-in (server-side AAL2 guard, AC2)", async ({
  page,
}) => {
  await page.goto("/dashboard");
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
