---
id: WLT-27-4-copy
story: WLT-27-4
status: draft
type: copy
created: 2026-06-28
author: UX Writer
---

# Copy: WLT-27-4 — CSV Import Wizard UI (Column Mapping + Preview)

## Voice and tone

Plain, confident, instructional where the user needs a hand. The person using this wizard has a CSV file from their bank and wants to get their transactions into the app. They are data-literate (they exported a CSV; they understand columns). Don't explain what a CSV is. Do explain what we need from them at each step, why a mapping matters, and what happened when it's done. Errors are specific: each one names the problem (parse failure, empty file, row limit, network, server) and gives the user their next move. "Importing" (not "uploading" or "syncing") — the user is importing transactions into their history.

Voice guidelines: `n/a — product.md has no dedicated voice/tone section; register follows plain, useful, quietly in-control standard established in WLT-24/25 copy`.

## Strings

### Wizard shell (persistent across all steps)

- **csv-wizard-trigger-cta:** `Import transactions`
- **csv-wizard-title:** `Import transactions`
- **csv-wizard-step-indicator:** `Step {N} of 4`
- **csv-wizard-next-cta:** `Next`
- **csv-wizard-back-cta:** `Back`
- **csv-wizard-cancel-cta:** `Cancel`
- **csv-wizard-done-cta:** `Done`

### Step 1 — Upload

- **csv-wizard-step1-heading:** `Upload a CSV file`
- **csv-wizard-row-cap-notice:** `Up to 10,000 rows per import. Split larger files and import each part.`
- **csv-wizard-parse-error** _(validation — malformed or non-CSV file):_ `We couldn't read that file. Make sure it's a valid CSV and try again.`
- **csv-wizard-empty-file** _(validation — 0 data rows):_ `No transactions found in this file. Select a different file to continue.`

### Step 2 — Column mapping

- **csv-wizard-step2-heading:** `Map your columns`
- **csv-wizard-preset-detected-banner:** `Apple Card format detected — columns pre-filled.`
- **csv-wizard-split-columns-toggle:** `My CSV uses separate debit and credit columns`
- **csv-wizard-not-mapped-option:** `— not mapped —`

### Step 3 — Preview

- **csv-wizard-step3-heading:** `Preview`
- **csv-wizard-preview-direction-warning:** `Direction couldn't be determined`

### Step 4 — Confirm + feedback

- **csv-wizard-step4-heading:** `Confirm import`
- **csv-wizard-import-cta:** `Import {N} transactions`
- **csv-wizard-importing-label** _(button in-flight label):_ `Importing…`
- **csv-wizard-slow-upload** _(> 2 s hint text):_ `Still importing — this can take a moment.`
- **csv-wizard-success** _(new rows added):_ `{N} transactions imported, {M} already in your history.`
- **csv-wizard-success-all-seen** _(all rows idempotent):_ `All {N} transactions are already in your history — nothing new was added.`
- **csv-wizard-done-cta:** `Done`

### Errors (step 4 — discriminated by failure type)

- **csv-wizard-error-row-limit** _(validation — > 10,000 rows):_ `This file has more than 10,000 rows. Split it into smaller parts and import each one.`
- **csv-wizard-error-network** _(network — fetch failed):_ `Import failed — check your connection and try again.`
- **csv-wizard-error-server** _(server — API error):_ `Our server couldn't complete the import — try again in a moment.`

## Terminology consistency

- **"Import" (verb)** — used consistently for the action throughout (trigger, title, step heading, CTA, success). Not "upload" (that's what the file input does internally) or "sync" (implies a live connection). The user is importing a file they already have.
- **"Transactions" (noun)** — the thing being imported. Consistent with the transaction ledger. Not "rows" (technical, internal model) or "records" (generic).
- **"Your history"** — how we describe previously-imported transactions. Preferred over "already seen" (internal/technical), "duplicates" (implies they did something wrong), or "existing data". "Already in your history" is honest and maps to the user's mental model of their transaction record.
- **"Columns" / "Map your columns"** — the step 2 framing. Preferred over "fields" (form-speak) or "categories" (conflicts with transaction categories). Users who exported a CSV understand columns.
- **"Pre-filled"** — what happens when a preset fires. Preferred over "auto-detected" (over-promises AI), "auto-mapped" (technical), or "filled in for you" (wordy). Factual: we detected the format and filled in the dropdowns.
- **"— not mapped —"** — the default dropdown option when no column is assigned. Matches the YNAB pattern and the designer's DRI Decision (neutral, explicit, not "Auto-detect").
- **"Debit / Credit"** — direction labels in the preview table. Not "negative/positive" or "out/in". Matches banking language the user already knows.

## Character limits

n/a — no explicit character limits specified in design spec (WLT-27-4-design). Success and error strings should be reviewed against the dialog width during implementation. The success string `{N} transactions imported, {M} already in your history.` may need to be tested with large numbers (e.g., 10,000 imported, 0 already in history) to confirm it fits.

## DRI Log

### Decisions

- [2026-06-28] [UX Writer] **"Already in your history" not "already seen" for idempotent rows** — `superseded` is the API model term; "already seen" is technical jargon; "already in your history" maps to what the user understands their transaction record to be. They've imported this file before — these transactions are already there. Area: copy/terminology. Reversibility: easy.
- [2026-06-28] [UX Writer] **"Import {N} transactions" CTA (not "Submit" or "Upload {N} rows")** — the CTA names the action and quantity at the moment of commitment. "Submit" gives no information. "Upload" misnames the action (the upload happened in step 1). Row count on the button sets user expectations and confirms what will happen. Area: copy/UX. Reversibility: easy.
- [2026-06-28] [UX Writer] **Three discriminated error keys for step 4 failures** — row-limit (validation), network (network connectivity), server (server-side error) each have distinct copy so the user knows whether to: split their file / check their connection / wait and retry. Design spec correctly defines three separate keys (`csv-wizard-error-row-limit`, `csv-wizard-error-network`, `csv-wizard-error-server`). No "something went wrong" generic. Area: copy/error-discrimination. Reversibility: easy.
- [2026-06-28] [UX Writer] **"Apple Card format detected — columns pre-filled." is factual, not a promise** — per WLT-27-6 DRI Decision: if Apple changes their CSV format, auto-detection silently fails and users fall back to manual mapping. The banner must not say "perfectly configured" or "ready to go" — it must say what we actually detected and did. "Columns pre-filled" is factual and dismissible. Area: copy/trust. Reversibility: easy.
- [2026-06-28] [UX Writer] **Confluence/Jira mirror skipped** — neither MCP is connected on this host. Area: tooling. Reversibility: high.

### Risks

- **[2026-06-28] [UX Writer] Success message with M=0 may read oddly** — `{N} transactions imported, 0 already in your history.` is grammatically correct but the second clause is noise. Engineering may want to conditionally omit `, {M} already in your history.` when M = 0. Flag for Engineer during implementation. No copy change needed; this is a rendering decision.

### Issues

- _none_
