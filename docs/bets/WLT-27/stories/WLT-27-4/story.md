---
id: WLT-27-4
bet: WLT-27
type: story
status: ready
priority: P1
created: 2026-06-28
author: PM
design_link: n/a — step-by-step wizard layout specified in architecture.md; no Figma for MVP
area_tags: [transactions, csv-import, frontend]
dependencies:
  - WLT-27-3
---

# CSV Import Wizard UI (Column Mapping + Preview)

## Description

Users who have created a manual account (WLT-27-2) need a way to import their transaction history via CSV. This story delivers the `CsvImportWizard` — a four-step UI component that parses a CSV file client-side via `papaparse`, walks the user through mapping their file's columns to the required fields (date, description, amount, direction, category), shows a preview of the first 10 rows, and then submits the normalized rows to `POST /api/accounts/[id]/import` (WLT-27-3). The Apple Card CSV preset is wired in step 2 and auto-fires on header match, but the preset definition itself is validated and finalized in WLT-27-6. This story delivers the wizard skeleton, column-mapping step, preview step, and confirm step — with a placeholder preset hook that WLT-27-6 fills.

## Acceptance Criteria

- [ ] AC-1: `papaparse` is added to the project's client-side dependencies (`pnpm add papaparse`; `pnpm add -D @types/papaparse`). The package is code-split: it is only imported inside the wizard route, not in the root bundle.
- [ ] AC-2: `CsvImportWizard` (`app/(app)/accounts/CsvImportWizard.tsx`) is a `"use client"` component. It accepts `accountId: string` and `accountCurrency: string` as props and is rendered only for accounts with `connection_id = null`.
- [ ] AC-3: **Step 1 — Upload.** File input accepts `.csv` files only. On selection, `Papa.parse(file, { header: true, skipEmptyLines: true })` runs client-side; shows row count and detected column headers. Displays an error inline (not a toast) if parsing fails (malformed CSV, empty file, non-CSV file renamed with `.csv` extension). User cannot proceed to step 2 if the file has 0 rows or a parse error.
- [ ] AC-4: **Step 2 — Column mapping.** Renders a dropdown for each required field: `date`, `description`, `amount`, `direction`. `category` is optional. Each dropdown lists the detected column headers from step 1 as options, plus "— not mapped —". If a preset fires (header match for Apple Card), the dropdowns are pre-populated with the preset's mapping — user can override. A "split debit/credit columns" toggle appears if two separate columns exist for debit and credit amounts; when toggled, `direction` is inferred from which column has a value. User cannot proceed to step 3 unless `date`, `description`, and `amount` are mapped.
- [ ] AC-5: **Preset auto-detection.** On step 2 mount, if the parsed headers exactly match the Apple Card preset signature (defined in `packages/aggregation/csv/apple-card.ts` — placeholder module until WLT-27-6 validates the exact headers), the mapping dropdowns are pre-populated and a banner reads "Apple Card format detected — mappings pre-filled." User can dismiss the banner and modify mappings.
- [ ] AC-6: **Step 3 — Preview.** Renders a table showing the first 10 mapped rows with columns: date, description, amount, direction (debit/credit badge). Rows with a `direction` that cannot be resolved show a warning indicator. User can go back to step 2 to correct the mapping.
- [ ] AC-7: **Step 4 — Confirm.** "Import N transactions" button (where N is the total row count, not just the 10 previewed). Clicking the button sends all normalized rows to `POST /api/accounts/[id]/import` via `fetch`. While the request is in-flight, the button is disabled and shows a spinner or progress indicator (e.g., "Importing…").
- [ ] AC-8: On import success, the wizard shows a success summary: "N transactions imported, M already seen." If `inserted = 0` and `superseded = N`, the message reads "All N rows were already imported — no duplicates added." User is given a "Done" button that closes the wizard and revalidates the transaction list.
- [ ] AC-9: On import API error, the wizard shows a discriminated error message: row-limit exceeded → "This file has more than 10,000 rows. Please split it into smaller files and import each separately." Network error → "Upload failed — please try again." Server error → "Something went wrong on our end — please try again." The user can retry without re-selecting the file.
- [ ] AC-10: The wizard displays the row-count cap prominently in step 1 (e.g., "Maximum 10,000 rows per import. Large files can be split.") so users with multi-year Apple Card exports know before uploading.
- [ ] AC-11: The wizard is fully keyboard-navigable: Tab through all controls, Enter to advance steps, Escape or a visible "Cancel" / "Back" button to go back or dismiss. Focus is managed on step transitions (focus moves to the first interactive element of the new step).
- [ ] AC-12: All non-text controls in the wizard (file input, dropdowns, direction toggle, import button) have accessible labels (aria-label or associated `<label>`). The progress indicator (step 1 of 4) is announced to screen readers (role="status" or equivalent).
- [ ] AC-13: Slow-network handling: if the step 4 import request takes more than 2 seconds, a text label updates to "Still uploading…" (no full spinner replacement — just a text hint). No silent hang.
- [ ] AC-14: Empty-file edge case: if a CSV file is selected that parses to 0 data rows (header-only), the wizard shows "No rows found in this file" and keeps the user on step 1.
- [ ] AC-15: E2E test: upload a 5-row test CSV with headers matching the expected column format, complete all 4 steps, verify the confirm step shows "5 transactions imported", verify the transactions appear in the transaction list under the correct account, then **hard-delete the imported transactions and the test account** so no residual records remain.

## Standard Experience Checklist

- [ ] **Navigation** — covered by AC-11 (Back button on each step, Cancel / Escape to dismiss). Progress indicator (step N of 4) is visible at all times. Step 3 (preview) has an explicit Back button to return to column mapping. AC-8 (Done button to close after success).
- [ ] **States** — covered by: loading/in-flight (AC-7 spinner, AC-13 slow-network label), empty (AC-14 empty-file error), error (AC-3 parse error, AC-9 API errors), success (AC-8 summary), disabled (AC-7 button disabled in-flight). Step 1 parse error prevents step advance (AC-3). Step 2 missing required mapping prevents step advance (AC-4).
- [ ] **Feedback** — covered by: AC-3 (parse error inline), AC-5 (preset detected banner), AC-7 (in-flight button state), AC-8 (success summary with counts), AC-9 (discriminated error messages for row-limit, network, server errors), AC-10 (row-cap notice in step 1), AC-13 (slow-network text hint). Destructive: n/a — import is additive; idempotent re-import is called out in AC-8.
- [ ] **Accessibility** — covered by AC-11 (keyboard navigation, focus management on step transitions, Enter/Esc) and AC-12 (aria-labels for all non-text controls, screen-reader announcement of step progress).
- [ ] **Edge cases** — covered by AC-3 (malformed CSV / non-CSV file), AC-4 (partial column mapping blocked), AC-9 (row-limit exceeded, network error, server error), AC-13 (slow network), AC-14 (empty file).
- [ ] **Cross-surface consistency** — n/a — single web surface; no mobile or native target.

## Tech notes

Architecture ref: `docs/bets/WLT-27/architecture.md` — "Sub-feature B — WLT-27-4" section and "CsvImportWizard" detail.

Key files to create:
- `app/(app)/accounts/CsvImportWizard.tsx` — `"use client"` component; uses `fetch('/api/accounts/[accountId]/import', ...)` for step 4. Does NOT import `@wealth/db` or any server-only module.
- `packages/aggregation/csv/apple-card.ts` — placeholder preset module with a clearly marked `TODO: validate headers against real iOS export (WLT-27-6)` comment. The wizard imports this preset but WLT-27-6 is responsible for replacing the placeholder header list with the confirmed real headers.

`papaparse` usage: `Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => { ... } })`. The `header: true` option uses the first row as column names, returning `results.data` as an array of objects — this feeds directly into the column-mapping dropdowns.

Split debit/credit column handling: some banks (not Apple Card) export two numeric columns `Debit` and `Credit` instead of a signed `Amount`. The wizard must detect when both columns are selected and compute `direction = debit column has a value ? 'debit' : 'credit'` and `amount = max(debit, credit)`.

The Apple Card preset placeholder headers (to be confirmed in WLT-27-6): `Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD)`. Do not hardcode as final until WLT-27-6 validates against a real iOS export.

## PRs

_Auto-populated as PRs open._

## Tests

- Component (tagged `e2e: false`): `CsvImportWizard` — file parsing happy path (5 rows → step 2 shows 5 headers); malformed CSV → inline error on step 1; empty file → "No rows found" error; column-mapping required fields gate (cannot advance without date + description + amount); preview shows first 10 rows; Apple Card preset auto-fires on matching headers; confirm step calls route handler and renders `{ inserted, superseded }`; network error → discriminated error message; slow network (>2s) → "Still uploading…" text appears.
- E2E (tagged `e2e: true`): AC-15 — full 4-step flow + transaction verification + cleanup.

## Fixes (post-merge)

_None yet._

## DRI Log

### Decisions

- **[2026-06-28] [PM]** Client-side CSV parse (papaparse) before the route handler, not server-side multipart — the wizard needs to show a live preview before the user confirms; this requires the parsed data to be available in the browser before the import request fires. Server-side parse would require a round-trip just for the preview. Also eliminates large-file memory pressure on the Vercel serverless function. Area: architecture. Reversibility: easy.
- **[2026-06-28] [PM]** Apple Card preset wired as a placeholder in WLT-27-4, finalized in WLT-27-6 — the wizard architecture (step 2 preset hook) is delivered here; the exact headers cannot be hardcoded until WLT-27-6 validates them against a real iOS export. Separating the concerns keeps WLT-27-4 shippable without blocking on the Apple Card validation. Area: scope. Reversibility: easy.

### Risks

- **[2026-06-28] [PM]** Column-mapping UX is the hardest user-facing piece in WLT-27 — every bank exports CSV differently; the wizard must be general enough to handle variety while simple enough for non-technical users. The Apple Card preset reduces friction for one bank; others require manual mapping. Post-ship support load is expected (DRI Risk 2 in the brief). Area: UX/operational.

### Issues

_None beyond bet-level issues._

---

_Story closed: pending. Brief: docs/bets/WLT-27/brief.md_
