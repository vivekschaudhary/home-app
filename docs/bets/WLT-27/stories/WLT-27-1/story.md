---
id: WLT-27-1
bet: WLT-27
type: story
status: ready
priority: P1
created: 2026-06-28
author: PM
design_link: n/a — no UI surface
area_tags: [transactions, multi-currency, backend, spending-intelligence]
dependencies: []
---

# Currency-Awareness Fix (SpendingTxn.currency)

## Description

Today every spending-aggregation path — budget totals, category-spend chart, recap spending, and anomaly detection — queries the `transactions` table without a `currency` filter. When a user later adds a EUR or JPY manual account, those amounts would be silently mixed into USD spending totals, producing nonsense figures. This story adds `currency: string` to the `SpendingTxn` interface, adds a `.eq("currency", activeCurrency)` filter to every app-layer read that feeds spending aggregation, extends the Inngest anomaly-scan user-listing step to include manual-account-only users (who have no `account_connections` row), and ships a regression suite proving that existing USD-only behavior is unchanged. No user-visible change lands for existing users; this is a correctness fix that unblocks WLT-27-2 through WLT-27-5.

## Acceptance Criteria

- [ ] AC-1: `SpendingTxn` in `packages/core/recap.ts` gains a `currency: string` field; the type compiles cleanly with no changes to the pure compute functions (`buildBudgetRows`, `computeMonthlySeries`, `buildCategorySpendChart`, `detectAnomalies`).
- [ ] AC-2: `readSpendingForBudgets` in `app/lib/budget.ts` selects `currency` and applies `.eq("currency", activeCurrency)` (default `'USD'`); the caller passes `activeCurrency` from the budget page's currency context.
- [ ] AC-3: `readCategorySpendChart` in `app/lib/dashboard-spend.ts` selects `currency` and applies `.eq("currency", activeCurrency)` (default `'USD'`).
- [ ] AC-4: The recap spending read in `app/lib/recap.ts` selects `currency` and applies `.eq("currency", activeCurrency)` (default `'USD'`).
- [ ] AC-5: `anomaly-scan.ts` in `packages/jobs/recap/anomaly-scan.ts` (a) adds `currency` to its transactions SELECT and filters to `currency = 'USD'` by default; (b) extends the user-listing step to include users who have ≥1 `financial_accounts` row with `connection_id IS NULL` (manual-account-only users that have no `account_connections`).
- [ ] AC-6: Unit regression suite: given a `SpendingTxn[]` where all records have `currency = 'USD'`, `buildBudgetRows`, `computeMonthlySeries`, `buildCategorySpendChart`, and `detectAnomalies` each produce bit-for-bit identical output before and after the `currency` field is added. Suite marked `regression: true`.
- [ ] AC-7: Integration test: `readSpendingForBudgets` with a DB containing a mix of USD and EUR transaction rows returns only the USD rows when `activeCurrency = 'USD'`; returns only EUR rows when `activeCurrency = 'EUR'`. No cross-currency leakage.
- [ ] AC-8: Integration test: a user with only `financial_accounts` rows where `connection_id IS NULL` (no Plaid connection) appears in the anomaly-scan fan-out after the user-listing fix.
- [ ] AC-9: All four spending-read paths (budget, dashboard-spend, recap, anomaly scan) are updated; no path is left without the `currency` filter. PR author confirms this in the PR description by listing each file changed.
- [ ] AC-10: `MULTI_CURRENCY_ACCOUNTS_ENABLED` flag is absent / off — `activeCurrency` defaults to `'USD'` everywhere; the added filter is a no-op for all existing users. No behavior change observable by users with USD-only accounts.

## Standard Experience Checklist

- [ ] **Navigation** — n/a — no navigable UI surface; this story is a backend correctness fix with no user-facing navigation changes.
- [ ] **States** — n/a — no UI states; spending reads already have loading/error handling in their callers; this story adds a filter predicate only.
- [ ] **Feedback** — n/a — no user-facing feedback surface; the fix is transparent to users.
- [ ] **Accessibility** — n/a — no UI surface.
- [ ] **Edge cases** — covered by AC-7 (mixed-currency DB rows), AC-8 (manual-account-only user in anomaly scan), AC-10 (existing USD-only users see no behavior change). The off-by-one risk (a missed path) is mitigated by AC-9's per-file checklist in the PR.
- [ ] **Cross-surface consistency** — n/a — single web surface; no mobile or native target.

## Tech notes

Architecture ref: `docs/bets/WLT-27/architecture.md` — "Sub-feature C prerequisite — WLT-27-1" section.

Key files to touch:
- `packages/core/recap.ts` line ~58–67 — `SpendingTxn` interface: add `currency: string`.
- `app/lib/budget.ts` — `readSpendingForBudgets`: add `currency` to SELECT, add `.eq("currency", activeCurrency)`, include `currency` in the mapped result.
- `app/lib/dashboard-spend.ts` — `readCategorySpendChart`: same pattern.
- `app/lib/recap.ts` — recap spending read: same pattern.
- `packages/jobs/recap/anomaly-scan.ts` — two changes: (1) `currency` in SELECT + `.eq("currency", "USD")` default; (2) user-listing step extended to `OR EXISTS (SELECT 1 FROM financial_accounts WHERE user_id = $uid AND connection_id IS NULL)`.

The `activeCurrency` parameter is always `'USD'` until `MULTI_CURRENCY_ACCOUNTS_ENABLED` is on (WLT-27-5). Passing it explicitly through the call stack now allows WLT-27-5 to wire the region switcher without touching these reads again.

Pure compute functions (`buildBudgetRows`, `computeMonthlySeries`, `buildCategorySpendChart`, `detectAnomalies`) receive a pre-filtered `SpendingTxn[]` — they do not change signatures. The filtering happens entirely at the app-layer read, consistent with the `effectiveCategory` + `countsAsSpending` precedent.

No migration needed: `transactions.currency` column already exists (`default 'USD'`); all existing rows are `'USD'`.

## PRs

_Auto-populated as PRs open._

## Tests

Unit regression suite (tagged `regression: true`, `e2e: false`) lives alongside `packages/core/recap.ts`. Integration tests (tagged `regression: true`, `e2e: false`) live in `packages/aggregation/` or `app/lib/__tests__/`. No E2E test in this story — no persistent data is created by the fix itself (it is a read-path filter + type addition).

## Fixes (post-merge)

_None yet._

## DRI Log

### Decisions

- **[2026-06-28] [PM]** Currency filter placed at the app-layer read (not inside pure compute functions) — consistent with the established `effectiveCategory` / `countsAsSpending` pattern where reads pre-filter and pure functions receive pre-scoped inputs. Keeps pure functions pure and testable without DB. Alt rejected: filter inside compute functions (would add a new dimension to pure functions that don't otherwise need it). Area: architecture. Reversibility: easy.
- **[2026-06-28] [PM]** Anomaly-scan user-listing extended in WLT-27-1 scope (not deferred to WLT-27-2) — if a user creates a manual account (WLT-27-2) before this fix lands, they would be silently excluded from anomaly detection. Closing the gap in the prerequisite story eliminates any window of incorrect behavior. Area: scope. Reversibility: easy.

### Risks

- **[2026-06-28] [PM]** A missed spending-read path would silently produce wrong totals for multi-currency users after WLT-27-5 enables non-USD accounts — likelihood: low (all four paths are explicitly enumerated in AC-9); impact: high (silent wrong spend totals undermine user trust). Mitigation: AC-9 requires the PR author to list every changed file; regression suite in AC-6 covers all four compute functions.
- **[2026-06-29] [PM]** Query plan/perf risk for the new `.eq("currency", activeCurrency)` predicate — deferred from WLT-27-1 arbitration. No EXPLAIN ANALYZE evidence available against an all-USD corpus (the predicate is a no-op for existing users and produces no signal). Obligation: before WLT-27-5 merge (when non-USD rows will be present), run EXPLAIN ANALYZE against a representative multi-currency corpus and verify the query remains under the 50ms target. If not, add a composite index (e.g., `(user_id, currency, occurred_on)`) at that point. Area: performance. Reversibility: easy.

### Issues

_None beyond what is tracked in the bet architecture DRI log._

---

_Story closed: pending. Brief: docs/bets/WLT-27/brief.md_
