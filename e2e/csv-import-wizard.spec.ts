// WLT-27-4 — CSV Import Wizard E2E suite.
//
// Per-surface vertical: real passkey AAL2 auth → requireAal2() gate in (app)
// layout → RSC renders CsvImportWizardHarness (prod render path) → client
// hydrates CsvImportWizard. The POST to /api/accounts/:id/import is intercepted
// via page.route() because the harness uses a synthetic account ID that doesn't
// exist in the DB; the real route handler shipped in WLT-27-3 (PR #128).
//
// Gate: E2E_PASSKEY=1 + SUPABASE_DB_URL (real Supabase project required).
// Cleanup: each test creates a fresh auth.users row, hard-deleted in afterEach.

import { type CDPSession, expect, test } from "@playwright/test";
import { Client } from "pg";

const RUN = process.env.E2E_PASSKEY === "1";
const DB_URL = process.env.SUPABASE_DB_URL;

// ── CSV fixtures ──────────────────────────────────────────────────────────────

const SIMPLE_CSV = [
  "Date,Description,Amount",
  "2026-01-01,Coffee,-4.50",
  "2026-01-02,Lunch,-12.00",
  "2026-01-03,Salary,2000.00",
  "2026-01-04,Gym,-50.00",
  "2026-01-05,Books,-30.00",
].join("\n");

// 15 rows — exercises the 10-row preview cap (AC-6).
const FIFTEEN_ROW_CSV = [
  "Date,Description,Amount",
  ...Array.from({ length: 15 }, (_, i) =>
    `2026-01-${String(i + 1).padStart(2, "0")},Merchant ${i + 1},${-(i + 1) * 5}.00`,
  ),
].join("\n");

// Apple Card export format — triggers preset auto-detection (AC-5).
const APPLE_CARD_CSV = [
  "Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount (USD)",
  "01/15/2026,01/16/2026,Coffee Shop,Starbucks,Food & Beverage,Purchase,-5.25",
  "01/16/2026,01/17/2026,Refund,Amazon,Shopping,Refund,15.00",
].join("\n");

// Header-only CSV (no data rows) — exercises the empty-file error (AC-14).
const EMPTY_CSV = "Date,Description,Amount\n";

const HARNESS_URL = "/csv-import-e2e?accountId=e2e-test-account&currency=USD";

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe("CSV Import Wizard — WLT-27-4", () => {
  test.skip(!RUN || !DB_URL, "Set E2E_PASSKEY=1 + SUPABASE_DB_URL + a real Supabase project to run.");

  let userEmail = "";

  test.beforeEach(async ({ page, context }) => {
    // Fresh email per test. Set before async work so afterEach can always clean up.
    userEmail = `e2e-csv-wizard+${Date.now()}@example.com`;
    const password = "correct horse battery staple";

    const cdp: CDPSession = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });

    // Real AAL2 sign-up flow — satisfies [per-surface-vertical-test].
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(userEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Secure your account with a passkey" })).toBeVisible();
    await page.getByRole("button", { name: "Create passkey" }).click();
    await expect(page).toHaveURL(/\/onboarding\/intent/, { timeout: 15_000 });

    // Navigate to the E2E test harness (AAL2-gated RSC page).
    await page.goto(HARNESS_URL);
    await expect(page.getByRole("heading", { name: "Upload your CSV" })).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async () => {
    // Hard-delete the ephemeral E2E user from auth.users (direct DB — bypasses RLS).
    // Orphaned rows would bloat the shared Supabase project and flake later runs.
    if (!userEmail) return;
    const db = new Client({ connectionString: DB_URL });
    await db.connect();
    try {
      await db.query("delete from auth.users where email = $1", [userEmail]);
    } finally {
      await db.end();
      userEmail = "";
    }
  });

  // ── Step 1: Upload ──────────────────────────────────────────────────────────

  test("step 1 renders heading, step indicator, and row-cap notice", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Upload your CSV" })).toBeVisible();
    await expect(page.getByText("Step 1 of 4")).toBeVisible();
    await expect(page.getByText("Maximum 10,000 rows per import.")).toBeVisible();
  });

  test("happy path: valid CSV shows row count and enables Next (AC-1 papaparse integration)", async ({
    page,
  }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });

    await expect(page.getByText("5 rows found")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("empty file: shows error banner and keeps Next disabled (AC-14)", async ({ page }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "empty.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(EMPTY_CSV),
    });

    await expect(page.getByText("No rows found in this file.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  test("Cancel from step 1 dismisses the wizard", async ({ page }) => {
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("wizard-outcome")).toHaveText("cancelled");
  });

  // ── Step 2: Column mapping ──────────────────────────────────────────────────

  test("step 2: Next blocked until date + description + amount all mapped (AC-4)", async ({
    page,
  }) => {
    // Advance to step 2.
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
    await expect(page.getByText("Step 2 of 4")).toBeVisible();

    // All unmapped → Next disabled.
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

    // Map date only → still disabled.
    await page.getByLabel("Date column").selectOption("Date");
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

    // Map description → still disabled (amount missing).
    await page.getByLabel("Description column").selectOption("Description");
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

    // Map amount → Next enabled.
    await page.getByLabel("Amount column").selectOption("Amount");
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("step 2: Apple Card preset auto-fires — banner shown and mappings pre-filled (AC-5)", async ({
    page,
  }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "apple-card.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(APPLE_CARD_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();

    // Preset detection banner must appear.
    await expect(page.getByText("Apple Card format detected — mappings pre-filled.")).toBeVisible();

    // Required columns pre-filled by the preset (date → "Transaction Date", amount → "Amount (USD)").
    await expect(page.getByLabel("Date column")).toHaveValue("Transaction Date");
    await expect(page.getByLabel("Amount column")).toHaveValue("Amount (USD)");

    // Next should be enabled immediately (all required fields pre-filled).
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("step 2: preset banner can be dismissed (AC-5)", async ({ page }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "apple-card.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(APPLE_CARD_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Apple Card format detected — mappings pre-filled.")).toBeVisible();

    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("Apple Card format detected — mappings pre-filled.")).not.toBeVisible();
  });

  test("step 2: Back returns to step 1", async ({ page }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Upload your CSV" })).toBeVisible();
  });

  // ── Step 3: Preview ─────────────────────────────────────────────────────────

  test("step 3: preview table shows at most 10 rows when file has 15 (AC-6)", async ({ page }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(FIFTEEN_ROW_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();

    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
    await expect(page.getByText("Step 3 of 4")).toBeVisible();

    // Rows 1–10 visible; row 11 not rendered.
    await expect(page.getByText("Merchant 10")).toBeVisible();
    await expect(page.getByText("Merchant 11")).not.toBeVisible();

    // Truncation notice.
    await expect(page.getByText("Showing first 10 of 15 rows.")).toBeVisible();
  });

  test("step 3: Back returns to step 2", async ({ page }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
  });

  // ── Step 4: Confirm ─────────────────────────────────────────────────────────

  // NOTE: /api/accounts/e2e-test-account/import is intercepted via page.route()
  // because the harness uses a synthetic account ID absent from the DB. The real
  // route handler (WLT-27-3, PR #128) enforces auth + manual-only ownership;
  // the real auth→AAL2→RSC vertical is exercised in beforeEach.

  test("step 4: Import button shows row count label (AC-7)", async ({ page }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByRole("heading", { name: "Confirm import" })).toBeVisible();
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    // Import button carries the row count (AC-7).
    await expect(page.getByRole("button", { name: "Import 5 transactions" })).toBeVisible();
  });

  test("step 4 happy path: import succeeds → summary banner → Done dismisses wizard (AC-8)", async ({
    page,
  }) => {
    // Mock the import route (WLT-27-5 ships the real handler).
    await page.route("**/api/accounts/e2e-test-account/import", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ inserted: 5, superseded: 0, removed: 0 }),
      });
    });

    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Import 5 transactions" }).click();

    await expect(page.getByText("5 transactions imported, 0 already seen.")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();

    // Done calls onDone → harness shows "done".
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("wizard-outcome")).toHaveText("done");
  });

  test("step 4: all-duplicate import shows deduplication message (AC-8)", async ({ page }) => {
    await page.route("**/api/accounts/e2e-test-account/import", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ inserted: 0, superseded: 5, removed: 0 }),
      });
    });

    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Import 5 transactions" }).click();

    await expect(
      page.getByText("All 5 rows were already imported — no duplicates added."),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("step 4 failure: network error shows discriminated error and retry button (AC-9)", async ({
    page,
  }) => {
    await page.route("**/api/accounts/e2e-test-account/import", (route) => {
      route.abort("failed");
    });

    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Import 5 transactions" }).click();

    await expect(page.getByText("Upload failed — please try again.")).toBeVisible({ timeout: 10_000 });
    // Retry button must appear (not the standard import label).
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    // Network error must NOT show the server-error copy (discriminated AC-9).
    await expect(page.getByText("Something went wrong on our end")).not.toBeVisible();
  });

  test("step 4 failure: server error shows server-error copy (AC-9)", async ({ page }) => {
    await page.route("**/api/accounts/e2e-test-account/import", (route) => {
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"internal"}' });
    });

    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Import 5 transactions" }).click();

    await expect(
      page.getByText("Something went wrong on our end — please try again."),
    ).toBeVisible({ timeout: 10_000 });
    // Server error must NOT show the network-error copy (discriminated AC-9).
    await expect(page.getByText("Upload failed — please try again.")).not.toBeVisible();
  });

  test("step 4: slow upload — 'Still uploading…' label appears after 2 s in-flight (AC-13)", async ({
    page,
  }) => {
    // Delay the mock response by 2.5 s so the 2-s slow-upload timer fires first.
    await page.route("**/api/accounts/e2e-test-account/import", async (route) => {
      await new Promise<void>((r) => setTimeout(r, 2500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ inserted: 5, superseded: 0, removed: 0 }),
      });
    });

    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Import 5 transactions" }).click();

    // "Still uploading…" must appear within the 2.5 s window (before response arrives).
    await expect(page.getByText("Still uploading…")).toBeVisible({ timeout: 3_000 });

    // After response, success summary replaces the slow-upload label.
    await expect(page.getByText("5 transactions imported, 0 already seen.")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Still uploading…")).not.toBeVisible();
  });

  test("step 4: Back returns to step 3", async ({ page }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Confirm import" })).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  });

  // ── Keyboard navigation ─────────────────────────────────────────────────────

  test("keyboard: Escape on step 1 triggers Cancel (AC-11)", async ({ page }) => {
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("wizard-outcome")).toHaveText("cancelled");
  });

  test("keyboard: Escape on step 2 navigates back to step 1 (AC-11)", async ({ page }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Upload your CSV" })).toBeVisible();
  });

  test("keyboard: Escape on step 3 navigates back to step 2 (AC-11)", async ({ page }) => {
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
  });

  // ── Accessibility ───────────────────────────────────────────────────────────

  test("accessibility: step heading receives focus on each step transition (AC-11)", async ({
    page,
  }) => {
    // Step 1 heading already visible from beforeEach navigation.
    const h2Text = async () =>
      page.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName === "H2" ? el.textContent?.trim() : null;
      });

    // After step 1 → 2 advance, focus should land on step 2 heading.
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Map columns" })).toBeVisible();
    // Brief poll — focus transfer is synchronous but async in Playwright's evaluation order.
    await expect.poll(() => h2Text(), { timeout: 2_000 }).toBe("Map columns");

    // Step 2 → 3.
    await page.getByLabel("Date column").selectOption("Date");
    await page.getByLabel("Description column").selectOption("Description");
    await page.getByLabel("Amount column").selectOption("Amount");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
    await expect.poll(() => h2Text(), { timeout: 2_000 }).toBe("Preview");
  });

  test("accessibility: step progress aria-label is present on each step (AC-12)", async ({
    page,
  }) => {
    // Step 1: aria-label on the status element.
    await expect(page.getByRole("status", { name: "Step 1 of 4" })).toBeVisible();

    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("status", { name: "Step 2 of 4" })).toBeVisible();
  });

  // ── Cross-surface: mobile viewport ─────────────────────────────────────────

  test("cross-surface: wizard renders and is operable at 375 px mobile width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Upload your CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    // File upload works at mobile width.
    await page.getByLabel("Select a CSV file").setInputFiles({
      name: "transactions.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SIMPLE_CSV),
    });
    await expect(page.getByText("5 rows found")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
