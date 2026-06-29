---
id: WLT-27-4-design
story: WLT-27-4
status: draft
type: design-spec
created: 2026-06-28
author: Designer
---

# Design Spec — CSV Import Wizard UI (Column Mapping + Preview)

## Summary

`CsvImportWizard` is a 4-step modal wizard that guides a user from file selection to confirmed import. It appears on the account detail view for any account with `connection_id = null`. Steps: 1-Upload → 2-Column Mapping → 3-Preview → 4-Confirm. `papaparse` runs client-side; no CSV file ever reaches the server. Preset auto-detection fires in step 2 for Apple Card exports. The wizard sends normalized rows to `POST /api/accounts/[id]/import` (WLT-27-3) on step 4.

## Flows

### Flow A — Full happy path (Apple Card)

```
Account detail (manual account)
  → user clicks [copy: csv-wizard-trigger-cta]  ← on the AccountCard or account detail view
  → CsvImportWizard dialog opens (focus → file input)
  → STEP 1: user selects an Apple Card .csv file
     → papaparse parses client-side
     → row count + detected headers displayed
     → [copy: csv-wizard-row-cap-notice] visible
  → user clicks [copy: csv-wizard-next-cta]
  → STEP 2: Apple Card headers detected → dropdowns pre-populated
     → [copy: csv-wizard-preset-detected-banner] shown
     → user dismisses banner or leaves it; reviews mapping
  → user clicks [copy: csv-wizard-next-cta]
  → STEP 3: first 10 mapped rows shown in preview table
  → user clicks [copy: csv-wizard-next-cta]
  → STEP 4: [copy: csv-wizard-import-cta] button visible (N = total row count)
  → user clicks import
     → button disabled + [copy: csv-wizard-importing-label]
     → if > 2 s: text updates to [copy: csv-wizard-slow-upload]
  → success: [copy: csv-wizard-success] shown
  → user clicks [copy: csv-wizard-done-cta]
     → wizard closes + transaction list revalidates
```

### Flow B — Unknown bank (manual column mapping)

```
STEP 1: user uploads unknown-format .csv
  → headers detected, no preset fires
STEP 2: all dropdowns start at "— not mapped —"
  → user maps date, description, amount (required) + direction, category (optional)
  → advance enabled once required fields are mapped
STEP 3 → STEP 4 → same as Flow A
```

### Flow C — Split debit/credit columns

```
STEP 2: user's CSV has separate "Debit" and "Credit" columns
  → [copy: csv-wizard-split-columns-toggle] toggle appears
  → user enables toggle
  → direction field is inferred (debit column has value → debit; credit column → credit)
  → amount = max(debit, credit)
```

### Flow D — Parse error (malformed / empty file)

```
STEP 1: user selects a non-CSV file or malformed file
  → papaparse returns error
  → [copy: csv-wizard-parse-error] shown inline (not a toast)
  → Next button disabled; user stays on step 1
```

### Flow E — Empty file (0 data rows)

```
STEP 1: user selects a CSV with headers only, no data rows
  → [copy: csv-wizard-empty-file] shown inline
  → Next button disabled
```

### Flow F — Row limit exceeded on import (step 4)

```
STEP 4: import request → API returns ROW_LIMIT_EXCEEDED
  → [copy: csv-wizard-error-row-limit] shown
  → user can retry or cancel
```

### Flow G — Idempotent re-import

```
STEP 4: all rows already seen
  → API returns { inserted: 0, superseded: N, removed: 0 }
  → [copy: csv-wizard-success-all-seen] shown
  → user clicks [copy: csv-wizard-done-cta] → wizard closes
```

### Flow H — Cancel / back

```
Any step
  → user clicks [copy: csv-wizard-back-cta] → returns to previous step
     (file and parsed data preserved; column mapping preserved between steps 2↔3)
  → user clicks [copy: csv-wizard-cancel-cta] OR presses Escape → dialog closes
     → no data is submitted; no confirmation needed (import is additive, not destructive)
```

## Screens & States

### Wizard shell (persistent across all steps)

| Element | Behavior |
|---------|----------|
| Dialog container | `role="dialog"` `aria-modal="true"` `aria-labelledby={title-id}` |
| Step indicator | [copy: csv-wizard-step-indicator] e.g., "Step 1 of 4"; `role="status"` |
| Title | [copy: csv-wizard-title] |
| Back button | Hidden on step 1; visible on steps 2–4 |
| Cancel button | Visible on all steps |

### Step 1 — Upload

| State | Key elements |
|-------|-------------|
| Default | File input (`accept=".csv"`); row-cap notice visible; Next disabled |
| Parsing | Brief moment; papaparse is synchronous for most files |
| Success | Row count displayed; column headers list shown; Next enabled |
| Parse error | `<Banner variant="error">` inline with [copy: csv-wizard-parse-error]; Next disabled |
| Empty file | `<Banner variant="error">` inline with [copy: csv-wizard-empty-file]; Next disabled |

### Step 2 — Column mapping

| State | Key elements |
|-------|-------------|
| Default (no preset) | Dropdown per field: date, description, amount, direction, category; all start "— not mapped —"; Next disabled until date + description + amount mapped |
| Preset detected | `<Banner>` with [copy: csv-wizard-preset-detected-banner] + dismiss ×; dropdowns pre-populated; Next enabled |
| Split columns | Toggle visible; when on, direction auto-inferred; direction dropdown hidden |
| Mapping incomplete | Next button disabled; no inline error needed (button is the visual gate) |

### Step 3 — Preview

| State | Key elements |
|-------|-------------|
| Default | Table: date, description, amount, direction badge (debit/credit); first 10 rows |
| Unresolvable direction row | Warning icon in direction cell; [copy: csv-wizard-preview-direction-warning] tooltip or inline note |
| Back to step 2 | Back button enabled; mapping state preserved |

### Step 4 — Confirm

| State | Key elements |
|-------|-------------|
| Default | [copy: csv-wizard-import-cta] (N = total row count); import button enabled |
| In-flight (< 2 s) | Button disabled; button label = [copy: csv-wizard-importing-label] |
| In-flight (> 2 s) | Additional text below button: [copy: csv-wizard-slow-upload]; `aria-live="polite"` |
| Success (new rows) | [copy: csv-wizard-success] with N and M counts; [copy: csv-wizard-done-cta] button |
| Success (all seen) | [copy: csv-wizard-success-all-seen]; [copy: csv-wizard-done-cta] button |
| Error — row limit | `<Banner variant="error">` [copy: csv-wizard-error-row-limit]; import button re-enabled |
| Error — network | `<Banner variant="error">` [copy: csv-wizard-error-network]; import button re-enabled |
| Error — server | `<Banner variant="error">` [copy: csv-wizard-error-server]; import button re-enabled |

## Interactions

### Step navigation

- **Advance (Next):** enabled only when the step's required conditions are met (see states above). Clicking fires step transition: new step mounts, focus moves to first interactive element of new step.
- **Back:** returns to previous step. File, parsed data, and column-mapping state are preserved in component state (no re-parse needed when going Step 3 → Step 2).
- **Cancel / Escape:** closes dialog without submitting. No confirmation dialog (import is additive and no data has been sent yet).
- **Step-transition focus management:** on each step transition, `useEffect` calls `firstInteractiveRef.current?.focus()`. Step 1 → file input; Step 2 → first mapping dropdown; Step 3 → Back button; Step 4 → Import button.

### Step 1 — File input

- `<input type="file" accept=".csv">` with associated `<label>`.
- On change: `Papa.parse(file, { header: true, skipEmptyLines: true, complete: handler })` fires synchronously.
- If `results.errors.length > 0` or `results.data.length === 0`: show error state.
- Detected headers displayed as a read-only chip list or sentence (e.g., "Detected columns: Transaction Date, Amount (USD), …").

### Step 2 — Column mapping dropdowns

Each required field (date, description, amount) and optional fields (direction, category) has a `<select>`. Options: `[{ value: '', label: '— not mapped —' }, ...detectedHeaders]`. The direction field has an additional option "Infer from sign" (for single signed-amount columns like Apple Card).

**Split debit/credit toggle:** `<input type="checkbox">` with label [copy: csv-wizard-split-columns-toggle]. When enabled: direction dropdown hides; two additional dropdowns appear for "Debit column" and "Credit column".

**Preset banner dismiss:** ×/close button on the `<Banner>` removes it from state. Does not reset the mapping.

### Step 3 — Preview table

10-row read-only table:
- Columns: Date | Description | Amount | Direction
- Direction cell: `<span class="...">Debit</span>` or `<span class="...">Credit</span>` as badges using existing Tailwind color tokens.
- Unresolvable direction: warning icon + `[copy: csv-wizard-preview-direction-warning]` as `title` attribute or adjacent text.
- Table is `role="table"` with `<caption>` describing it as a preview.

### Step 4 — Confirm and submit

- Import button: `onClick` fires `fetch('/api/accounts/[accountId]/import', { method: 'POST', body: JSON.stringify({ rows: normalizedRows }) })`.
- While in-flight: button has `disabled` + `aria-busy="true"`; label changes to [copy: csv-wizard-importing-label].
- After 2 s without response: `setTimeout` fires and sets slow-upload text; no new request is made; the original request is still pending.
- On response: success state or error state as described above.
- "Done" button on success: closes wizard and triggers `router.refresh()` or equivalent revalidation of the transaction list.

### Keyboard navigation

| Context | Keyboard behavior |
|---------|-----------------|
| Anywhere in wizard | `Escape` → closes dialog |
| Step N → Next | `Enter` on focused Next button advances step |
| File input | `Space`/`Enter` opens file picker (native behavior) |
| Dropdowns | `Arrow` keys navigate options (native `<select>` behavior) |
| Toggle (checkbox) | `Space` toggles; `Tab` moves to next control |
| Import button | `Enter`/`Space` submits |

## Copy Needs (flag for UX Writer)

| Key | Context |
|-----|---------|
| `[copy: csv-wizard-trigger-cta]` | Button on account detail to open the wizard; e.g., "Import transactions from CSV" |
| `[copy: csv-wizard-title]` | Dialog title; e.g., "Import transactions" |
| `[copy: csv-wizard-step-indicator]` | Progress text; pattern "Step {N} of 4" |
| `[copy: csv-wizard-next-cta]` | Step advance button; e.g., "Next" |
| `[copy: csv-wizard-back-cta]` | Step back button; e.g., "Back" |
| `[copy: csv-wizard-cancel-cta]` | Cancel button; e.g., "Cancel" |
| `[copy: csv-wizard-step1-heading]` | Step 1 heading; e.g., "Upload a CSV file" |
| `[copy: csv-wizard-row-cap-notice]` | Notice in step 1; e.g., "Maximum 10,000 rows per import. Large files can be split." |
| `[copy: csv-wizard-parse-error]` | Step 1 error: malformed file; e.g., "We couldn't read this file. Check it's a valid CSV." |
| `[copy: csv-wizard-empty-file]` | Step 1 error: 0 data rows; e.g., "No rows found in this file." |
| `[copy: csv-wizard-step2-heading]` | Step 2 heading; e.g., "Map your columns" |
| `[copy: csv-wizard-preset-detected-banner]` | Step 2 banner; e.g., "Apple Card format detected — mappings pre-filled." |
| `[copy: csv-wizard-split-columns-toggle]` | Toggle label; e.g., "Use separate debit/credit columns" |
| `[copy: csv-wizard-step3-heading]` | Step 3 heading; e.g., "Preview" |
| `[copy: csv-wizard-preview-direction-warning]` | Warning on unresolvable direction row; e.g., "Direction could not be determined" |
| `[copy: csv-wizard-step4-heading]` | Step 4 heading; e.g., "Confirm import" |
| `[copy: csv-wizard-import-cta]` | Import button with interpolated count; e.g., "Import {N} transactions" |
| `[copy: csv-wizard-importing-label]` | In-flight button text; e.g., "Importing…" |
| `[copy: csv-wizard-slow-upload]` | >2 s hint text; e.g., "Still uploading…" |
| `[copy: csv-wizard-success]` | Success message with counts; e.g., "{N} transactions imported, {M} already seen." |
| `[copy: csv-wizard-success-all-seen]` | All-idempotent success; e.g., "All {N} rows were already imported — no duplicates added." |
| `[copy: csv-wizard-done-cta]` | Post-success close button; e.g., "Done" |
| `[copy: csv-wizard-error-row-limit]` | Row limit exceeded; e.g., "This file has more than 10,000 rows. Please split it and import each part separately." |
| `[copy: csv-wizard-error-network]` | Network error; e.g., "Upload failed — please try again." |
| `[copy: csv-wizard-error-server]` | Server error; e.g., "Something went wrong on our end — please try again." |
| `[copy: csv-wizard-not-mapped-option]` | Default dropdown option; e.g., "— not mapped —" |

## Accessibility

- **Dialog shell:** `role="dialog"` `aria-modal="true"` `aria-labelledby={wizard-title-id}` — same pattern as `ConsentDialog`
- **Step progress indicator:** `role="status"` so screen readers announce step changes without interrupting; e.g., "Step 2 of 4"
- **File input:** `<label htmlFor="csv-file-input">` associated label; `accept=".csv"` for filter hint
- **Column mapping dropdowns:** each has a `<label htmlFor>` matching the `<select id>` (required); `aria-required="true"` on required fields (date, description, amount)
- **Split debit/credit toggle:** `<label>` wraps `<input type="checkbox">` or use `htmlFor` pattern
- **Preview table:** `<table>` with `<caption>` "Preview of first 10 rows"; `<th scope="col">` on each heading cell
- **Import button loading:** `aria-busy="true"` when in-flight; `aria-label` explicitly states "Importing transactions" if label shortens to spinner only
- **Slow-upload text:** `aria-live="polite"` on the container so screen readers announce "Still uploading…" without forcing a focus move
- **Error banners:** `role="alert"` on `<Banner variant="error">` for immediate announcement; focus should move to the banner on step 4 errors (scroll + focus)
- **Focus management on step transitions:** `useEffect` after step index changes calls `firstInteractiveRef.current?.focus()`; focus order per step listed in Interactions section
- **Escape key:** `document.addEventListener('keydown', ...)` on dialog mount; same ConsentDialog pattern
- **Reduced motion:** step transitions must respect `prefers-reduced-motion`; use instant step swap (no CSS slide animation) when the media query is true

## Standard Experience Checklist

- **Navigation:** Back on every step (2–4); Cancel/Escape on all steps; Done after success; progress indicator always visible (AC-11)
- **States:** upload default/parsing/success/parse-error/empty-file (AC-3, AC-14); mapping default/preset/incomplete (AC-4, AC-5); preview (AC-6); confirm default/loading/slow-network/success/success-all-seen/error×3 (AC-7, AC-8, AC-9, AC-13)
- **Feedback:** row-cap notice in step 1 (AC-10); preset banner (AC-5); in-flight button state (AC-7); slow-network text (AC-13); success counts (AC-8); discriminated error messages (AC-9)
- **Accessibility:** keyboard navigation and focus management (AC-11); ARIA labels on all non-text controls (AC-12); step progress announced to screen readers (AC-12)
- **Edge cases:** parse error/non-CSV (AC-3); empty file (AC-14); incomplete mapping blocked (AC-4); row-limit exceeded (AC-9); network error (AC-9); all-idempotent re-import (AC-8)
- **Cross-surface consistency:** n/a — single web surface

## Figma

No Figma file created — wizard follows established dialog pattern. Logged as DRI Decision below.

## DRI Decisions

- **[2026-06-28] [Designer] Wizard renders as a full-screen modal dialog, not a page or slide-over** — the 4-step wizard needs enough vertical space for the column-mapping table (5 dropdowns) and the 10-row preview table. A compact popover would be too cramped. A separate page would lose the account context and require navigation back. A slide-over panel is a reasonable alternative but adds animation cost and is not established in this codebase (no existing slide-over component in `@wealth/ui`). The `ConsentDialog` full-screen modal is the established pattern; the wizard follows it. Area: UX/components. Reversibility: easy (can migrate to slide-over if the UI library gains one).
- **[2026-06-28] [Designer] Direction badge uses existing Tailwind color tokens, not new color definitions** — debit is a negative cash flow (spending); the existing dashboard uses red/orange for spending. Credit is a positive flow. Design tokens: `text-red-600 bg-red-50` for debit, `text-green-600 bg-green-50` for credit. These match the existing chart/anomaly color convention. No new design tokens introduced. Area: design system. Reversibility: easy.
- **[2026-06-28] [Designer] "Not mapped" default in dropdowns, not "Auto-detect"** — auto-detect would imply the wizard is trying to guess the mapping, raising expectations for an AI-like experience that doesn't exist. "— not mapped —" is neutral, explicit, and matches the YNAB column-mapping pattern. Area: UX copy/interaction. Reversibility: easy.
- **[2026-06-28] [Designer] Figma skip — wizard dialog follows established ConsentDialog pattern** — no net-new component or layout pattern is introduced that requires a Figma frame. The table, dropdown, and banner components are all available in `@wealth/ui`. Engineering can build from this spec. Area: tooling. Reversibility: n/a.

## AC Coverage for PM

| This spec covers | Story AC |
|-----------------|----------|
| papaparse code-split (architecture note, not a design AC) | AC-1 |
| Wizard renders only for connection_id=null accounts; accepts accountId + accountCurrency props | AC-2 |
| Step 1: file input, parse, row count, headers, parse error, empty file, Next blocked | AC-3 |
| Step 2: dropdowns for required/optional fields, split toggle, preset auto-fire, advance blocked | AC-4 |
| Step 2: preset banner with Apple Card detection and dismiss | AC-5 |
| Step 3: 10-row preview table, direction badges, back to step 2 | AC-6 |
| Step 4: import button with row count, in-flight disabled state | AC-7 |
| Step 4: success message with N and M counts; all-seen variant; Done button + revalidation | AC-8 |
| Step 4: discriminated error messages × 3 (row-limit, network, server); retry without re-select | AC-9 |
| Step 1: row-cap notice prominent | AC-10 |
| Keyboard navigation, Enter/Esc, back/cancel, focus management on step transitions | AC-11 |
| ARIA labels on all non-text controls; step progress role="status" | AC-12 |
| Slow-network "Still uploading…" text after 2 s | AC-13 |
| Empty file inline error; stay on step 1 | AC-14 |

**PM: confirm AC-15 (E2E test) includes a hard-delete cleanup assertion for imported transactions and the test account.**
