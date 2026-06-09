import { type Page, expect } from "@playwright/test";

// Post-auth now lands on the intent-first front door (WLT-11). Auth flows that
// only need to reach the dashboard click "explore" to pass through (the front
// door is encouraged, not forced — user-first; /dashboard stays un-gated).
export async function passIntentToDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });
  await page.getByRole("button", { name: "I'm not sure yet — just let me look around" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}
