---
id: WLT-27-6
bet: WLT-27
type: story
status: ready
priority: P1
created: 2026-06-28
author: PM
design_link: n/a — no new UI surface; this story finalizes the Apple Card preset and delivers the end-to-end integration test suite
area_tags: [transactions, csv-import, backend, testing]
dependencies:
  - WLT-27-4
---

# Apple Card CSV Preset + End-to-End Integration Test

## Description

The CSV wizard (WLT-27-4) ships with a placeholder Apple Card preset because the exact column headers must be validated against a real iOS export before they are hardcoded — the Apple support documentation (HT211489) may not perfectly match the actual file. This story validates the Apple Card CSV format against a real iOS export, finalizes the preset in `packages/aggregation/csv/apple-card.ts`, and delivers the full end-to-end test suite: an upload-to-verify E2E covering the complete import flow, idempotency, multi-currency isolation, manual-account-only anomaly scan inclusion, and cross-user RLS isolation. This story is the integration and quality gate for the entire WLT-27 bet before any feature flag is turned on in production.

## Acceptance Criteria

**Apple Card preset finalization:**
- [ ] AC-1: An actual Apple Card CSV export from iOS is obtained and its column headers are documented in a comment at the top of `packages/aggregation/csv/apple-card.ts`. If the headers differ from the Apple support doc (HT211489), the diff is noted and the preset uses the confirmed headers.
- [ ] AC-2: `packages/aggregation/csv/apple-card.ts` exports a `APPLE_CARD_PRESET` descriptor with: `id: 'apple-card'`, `name: 'Apple Card'`, `headerSignature: string[]` (the exact confirmed headers from AC-1), and `columnMap: { date, description, amount, direction }` mapping confirmed column names to wizard fields. Amount column handling: Apple Card exports a signed `Amount (USD)` column — negative values are debits, positive are credits. The preset's `columnMap` documents this sign convention.
- [ ] AC-3: The wizard's preset auto-detection in WLT-27-4 (step 2) fires correctly for the confirmed Apple Card header signature from AC-2. Unit test: `detectPreset(confirmedHeaders)` returns `'apple-card'`; `detectPreset(unknownHeaders)` returns `null`.
- [ ] AC-4: A CSV fixture file representing a realistic Apple Card export is committed to `packages/aggregation/csv/fixtures/apple-card-sample.csv` with at least 10 rows (synthetic data — no real PII). This fixture is used by both the unit preset test and the E2E test.

**End-to-end integration tests:**
- [ ] AC-5: E2E — Apple Card full flow: upload `apple-card-sample.csv` to the CSV wizard for a test manual USD account, confirm the Apple Card preset auto-fires (dropdown pre-populated), advance through all 4 steps, confirm import, verify all fixture rows appear in `transactions` under the correct `financial_accounts.id` with correct `direction` (negative Amount → `debit`, positive Amount → `credit`). Then re-import the same fixture and verify `inserted = 0` (idempotency). **Hard-delete all imported transaction rows and the test account** after the test.
- [ ] AC-6: E2E — Multi-currency isolation: create a test user with a USD manual account and a EUR manual account, import a 3-row USD batch and a 3-row EUR batch. Navigate to the budget page with `?currency=USD`: verify only 3 USD rows are summed. Switch to `?currency=EUR`: verify only 3 EUR rows are summed. No cross-currency mixing. **Hard-delete all test transactions and accounts** after the test.
- [ ] AC-7: E2E — Manual-account-only anomaly scan: create a test user with only a manual account (no `account_connections` row). Import 3 transactions. Trigger the anomaly scan (or verify the user-listing query includes this user). Verify the user appears in the scan's fan-out. **Hard-delete all test data** after the test.
- [ ] AC-8: E2E — Second-user isolation: User A creates a manual account with ID `accountA`. User B attempts `POST /api/accounts/accountA/import`. Verify the response is `403` or `404` (account not found for user B). **No test data residue** after the test.
- [ ] AC-9: RLS — `financial_accounts` rows with `connection_id = null` are visible to the owning user (SELECT returns the row) and invisible to any other authenticated user (SELECT returns empty). Verify against the `financial_accounts_select_own` RLS policy explicitly — not just by inference. Tagged `regression: true`.
- [ ] AC-10: RLS — `transactions` rows imported via CSV are visible to the owning user and invisible to any other authenticated user. Tagged `regression: true`.
- [ ] AC-11: All E2E tests in this story are tagged `e2e: true` and `regression: false` (they are new integration tests, not regressions of existing behavior). The Apple Card preset unit test (AC-3) is tagged `e2e: false`, `regression: false`.
- [ ] AC-12: All E2E tests in this story **unconditionally clean up test data** (hard-delete created `transactions` rows and `financial_accounts` rows) in an `afterEach` or `afterAll` block, regardless of whether the test passed or failed. No orphaned test data in shared or prod-like environments.

## Standard Experience Checklist

- [ ] **Navigation** — n/a — this story delivers a preset definition, a fixture, and a test suite. There is no new UI surface. AC-5 exercises the existing wizard navigation (WLT-27-4).
- [ ] **States** — n/a — no new UI states introduced. The test suite exercises existing wizard states (confirmed in WLT-27-4 ACs).
- [ ] **Feedback** — n/a — no new user-facing feedback surface. AC-3 (preset auto-detection) is a wizard behavior already covered by WLT-27-4 ACs; this story validates it end-to-end.
- [ ] **Accessibility** — n/a — no new UI surface.
- [ ] **Edge cases** — covered by AC-5 (idempotent re-import), AC-6 (cross-currency isolation), AC-7 (manual-account-only anomaly scan), AC-8 (cross-user guard), AC-9/AC-10 (RLS). Apple Card format drift (if Apple changes the headers): documented via AC-1's comment; future drift is auditable against the confirmed-header comment.
- [ ] **Cross-surface consistency** — n/a — single web surface; no mobile or native target.

## Tech notes

Architecture ref: `docs/bets/WLT-27/architecture.md` — "End-to-End + Apple Card preset — WLT-27-6" section.

Key files to create/finalize:
- `packages/aggregation/csv/apple-card.ts` — replace the placeholder from WLT-27-4 with the confirmed `APPLE_CARD_PRESET` descriptor. Top-of-file comment must include the confirmed headers and the date of validation (format: `// Validated against iOS export YYYY-MM-DD. Headers: [...]`).
- `packages/aggregation/csv/fixtures/apple-card-sample.csv` — synthetic fixture. Rows must include: at least one negative-amount (debit) row, at least one positive-amount (credit/refund) row, a row with a non-ASCII merchant name (tests encoding robustness), and a row with a category value.
- E2E test files: follow the existing E2E test location convention (`e2e/` top-level directory). One file per major scenario (apple-card-flow, multi-currency-isolation, anomaly-scan-inclusion, cross-user-rls).

**Apple Card CSV sign convention:** Apple exports a single `Amount (USD)` column where purchases are negative (e.g., `-12.99`) and refunds/credits are positive (e.g., `15.00`). The preset's `columnMap` must map this to `direction`: `amount < 0 → debit`, `amount > 0 → credit`, `amount` stored as `Math.abs(parsed amount)`. Confirm this sign convention against the real export in AC-1.

**Fixture PII:** the fixture must use synthetic merchant names (e.g., "Sample Coffee Shop", "Test Grocery Store") and dates in the past. No real Apple Card export data, no real account numbers.

**Anomaly scan trigger in AC-7:** the easiest approach is to call the Inngest dev-server endpoint that triggers the anomaly scan job, then query the `anomaly_flags` table for the test user's rows. Coordinate with the existing E2E pattern for Inngest jobs if one exists in this project.

## PRs

_Auto-populated as PRs open._

## Tests

All tests in this story are themselves the deliverable (the story IS a test story). The Apple Card preset unit test (AC-3) is co-located with `packages/aggregation/csv/apple-card.ts`. E2E tests (AC-5 through AC-10) live in `e2e/`.

Tags:
- AC-3 preset unit test: `regression: false`, `e2e: false`
- AC-9, AC-10 RLS tests: `regression: true`, `e2e: true`
- AC-5, AC-6, AC-7, AC-8: `regression: false`, `e2e: true`

## Fixes (post-merge)

_None yet._

## DRI Log

### Decisions

- **[2026-06-28] [PM]** Apple Card preset finalized in WLT-27-6, not WLT-27-4 — the wizard architecture (preset hook) is delivered in WLT-27-4; the confirmed headers can only be finalized after a real iOS export is obtained. Separating the concerns keeps WLT-27-4 shippable without blocking on hardware/account access. Area: scope. Reversibility: easy.
- **[2026-06-28] [PM]** Synthetic fixture committed to the repo (not fetched at test time) — deterministic test behavior; no dependency on external file availability; reviewable as part of the PR. Real Apple Card exports must never be committed (PII). Area: testing. Reversibility: easy.
- **[2026-06-28] [PM]** WLT-27-6 is the quality gate for the entire bet — all E2E scenarios (multi-currency isolation, anomaly scan inclusion, RLS, idempotency) are validated here before any feature flag is enabled in production. The staged rollout in the architecture (`MANUAL_ACCOUNTS_ENABLED` on → CSV wizard internal test → Apple Card preset validated → `MULTI_CURRENCY_ACCOUNTS_ENABLED` on) depends on this story's ACs passing. Area: release. Reversibility: n/a.

### Risks

- **[2026-06-28] [PM]** Apple Card CSV format drift — if Apple changes the export format, the preset auto-detection silently fails and users fall back to manual column mapping (the wizard still works). Likelihood: low (format has been stable). Impact: low (degraded UX, not broken). Mitigation: AC-1 documents the confirmed headers with a date; future drift is auditable. Area: operational.
- **[2026-06-28] [PM]** Obtaining a real iOS Apple Card export may require a physical device with an Apple Card account — this is an operational dependency outside the codebase. If unavailable, AC-1 must be flagged as blocked and the preset hardcoded from the Apple support docs with a prominent `UNVALIDATED` comment; WLT-27-6 cannot be marked `shipped` until a real export confirms or corrects the mapping. Area: implementation.

### Issues

- **[2026-06-28] [PM]** Apple Card CSV header must be validated against a real iOS export (inherited from brief DRI Issue and architecture DRI Issue) — severity: low — owner: Engineer — status: open. This story closes the issue: AC-1 is the gate.

---

_Story closed: pending. Brief: docs/bets/WLT-27/brief.md_
