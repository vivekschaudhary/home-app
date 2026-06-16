import { type Page, expect } from "@playwright/test";

// Post-auth now lands on the intent-first front door (WLT-11). Auth flows that
// only need to reach the dashboard click "explore" to pass through (the front
// door is encouraged, not forced — user-first; /dashboard stays un-gated).
export async function passIntentToDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });
  await page.getByRole("button", { name: "I'm not sure yet — just let me look around" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

// WLT-20: the dashboard no longer prints "You're signed in." — the signal that
// an AAL2 session reached the authed app is the SHELL itself (the "Main" nav +
// the Dashboard heading the (app) layout wraps every page in).
export async function expectSignedInShell(page: Page): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
}

// WLT-20: Sign out + Security moved into the account menu (Headless UI Menu) at
// the foot of the sidebar/drawer. On the desktop viewport the sidebar control is
// the visible one (the drawer's copy is in a closed Dialog → not in the DOM).
export async function openAccountMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Your account" }).click();
}

export async function signOutViaShell(page: Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
}

export async function gotoSecurityViaShell(page: Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Security" }).click();
  await expect(page).toHaveURL(/\/settings\/security/, { timeout: 15_000 });
}
