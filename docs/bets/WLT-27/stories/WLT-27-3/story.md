---
id: WLT-27-3
bet: WLT-27
type: story
status: in_review
priority: P1
created: 2026-06-28
author: PM
design_link: n/a — no UI surface; this story is the API and pipeline layer only
area_tags: [transactions, csv-import, backend]
dependencies:
  - WLT-27-2
---

# CSV Import API (Ingest Pipeline Extension)

## Description

Users with manual accounts (created in WLT-27-2) have no way to populate them with historical transactions. This story wires the existing idempotent `ingestTransactions` pipeline to accept CSV-sourced rows via a new `POST /api/accounts/[id]/import` route handler, and makes two targeted fixes to the pipeline itself: (1) widening `NormalizedTransaction.providerAccountId` from `string` to `string | null`, and (2) normalizing `null` to `'manual'` in `dedupKey` and the `ingestTransactions` account-lookup step. Together these fixes ensure that CSV import produces stable dedup keys across re-imports and does not silently drop rows when `providerAccountId` is absent. The wizard UI that calls this route is delivered in WLT-27-4.

## Acceptance Criteria

- [x] AC-1: `NormalizedTransaction.providerAccountId` in `packages/aggregation/core/types.ts` is widened from `string` to `string | null`. All existing Plaid callers (which always provide a non-null value) compile without changes.
- [x] AC-2: `dedupKey` in `packages/aggregation/core/dedup.ts` normalizes `null` `providerAccountId` to `'manual'`: `const accountSegment = t.providerAccountId ?? 'manual'`. Unit test: `dedupKey({ ...row, providerAccountId: null })` produces a key containing `'manual'`, not `'null'`.
- [x] AC-3: `ingestTransactions` in `packages/aggregation/core/ingest.ts` changes the account lookup from `accMap.get(t.providerAccountId)` to `accMap.get(t.providerAccountId ?? 'manual')`. The Plaid sync path is unaffected (Plaid always provides a non-null `providerAccountId`, so `?? 'manual'` never fires for Plaid rows).
- [x] AC-4: `POST /api/accounts/[id]/import` route handler (`app/api/accounts/[id]/import/route.ts`) is AAL2-gated via `getAal2UserId()`. Returns `401` for AAL1 or unauthenticated requests.
- [x] AC-5: Route handler verifies the `[id]` account exists and belongs to the authenticated user. Returns `404` if the account does not exist or belongs to another user.
- [x] AC-6: Route handler verifies the `[id]` account has `connection_id = null` (only manual accounts accept CSV import). Returns `400` with `{ error: 'ACCOUNT_NOT_MANUAL' }` for a Plaid-connected account.
- [x] AC-7: Route handler accepts a JSON body `{ rows: NormalizedCsvRow[] }` where `NormalizedCsvRow = { occurredOn: string; description: string; amount: string; direction: 'debit'|'credit'; category?: string|null }`. Rejects a body with more than 10,000 rows with `400` and `{ error: 'ROW_LIMIT_EXCEEDED', limit: 10000 }`.
- [x] AC-8: Route handler maps each `NormalizedCsvRow` to a `NormalizedTransaction` with `source = 'csv'`, `providerTransactionId = null`, `providerAccountId = null`, `currency` from the account's stored `currency` field, and `kind = 'spend'`.
- [x] AC-9: Route handler calls `ingestTransactions({ userId, page: { added: rows, modified: [], removed: [] }, accountIdByProviderAccountId: new Map([['manual', id]]) })` using the service-role client (not the authenticated-role client).
- [x] AC-10: Route handler returns `{ inserted: N, superseded: M, removed: 0 }` matching the counts from `ingestTransactions`.
- [x] AC-11: Idempotency test: calling the route twice with identical rows returns `{ inserted: 0 }` on the second call (dedup via `dedup_key` + `content_hash` unique constraint — no double-count).
- [x] AC-12: `dedupKey` stability test: importing the same CSV file twice produces the same `dedup_key` values both times, regardless of import order. No `"null"` substring appears in any `dedup_key` for CSV-sourced rows.
- [x] AC-13: Regression test: existing Plaid `ingestTransactions` call with a non-null `providerAccountId` produces identical `dedup_key` output before and after the `?? 'manual'` change (the fix is a no-op for Plaid rows). Tagged `regression: true`.
- [x] AC-14: E2E test imports a 5-row CSV batch into a manual account, verifies all 5 rows appear in `transactions` under the correct `financial_accounts.id`, re-imports the same batch, confirms `inserted = 0` on the second call, then **hard-deletes the 5 transaction rows and the test manual account** so no residual records remain.

## Standard Experience Checklist

- [x] **Navigation** — n/a — no UI surface; this story is an API and pipeline layer.
- [x] **States** — n/a — no UI states. API error and success states covered by AC-4 through AC-10 (discriminated HTTP status codes and error bodies).
- [x] **Feedback** — n/a — no user-facing feedback; the wizard UI (WLT-27-4) owns displaying the `{ inserted, superseded, removed }` result to the user.
- [x] **Accessibility** — n/a — no UI surface.
- [x] **Edge cases** — covered by AC-7 (row-limit rejection), AC-6 (non-manual account guard), AC-5 (cross-user guard), AC-11 (idempotent re-import), AC-13 (Plaid path unaffected). Malformed row (missing `occurredOn`): route returns `400` with field-level detail — tested in `app/api/accounts/[id]/import/route.test.ts` (row validation suite). Zero-amount rows (BLOCKER fix): `isValidCsvRow` requires `parseFloat(amount) > 0`.
- [x] **Cross-surface consistency** — n/a — API-only story with no multi-surface concerns.

## Tech notes

Architecture ref: `docs/bets/WLT-27/architecture.md` — "Sub-feature B — WLT-27-3" section.

Key files created/edited:
- `packages/aggregation/core/types.ts` — widen `providerAccountId` to `string | null`.
- `packages/aggregation/core/dedup.ts` — null normalization (accountSegment = providerAccountId ?? 'manual').
- `packages/aggregation/core/ingest.ts` — account-lookup fix (?? 'manual').
- `app/api/accounts/[id]/import/route.ts` (new) — `POST` handler. Uses `createServiceSupabase()` for the `ingestTransactions` call.
- `packages/aggregation/csv/normalize.ts` (new) — `ColumnMapping` + `resolveDirection` extracted for testability (BLOCKER fix).
- `packages/aggregation/csv/apple-card.ts` (new) — `CsvPreset` type + APPLE_CARD_PRESET placeholder (WLT-27-6 validates).

## PRs

_PR #128 opened at commit 1b5da78 (feat/WLT-27-3-work)._

## Tests

- Unit: `dedupKey(null providerAccountId)` → `'manual'` segment (AC-2); idempotent re-import (AC-11); `dedupKey` stability (AC-12); Plaid regression (AC-13). Tagged `regression: true` for the Plaid regression test.
- Integration: `POST /api/accounts/[id]/import` — AAL2 gate, owner check, non-manual guard, row-limit rejection, zero-amount guard, correct `{ inserted, superseded, removed }` counts (23 tests).
- `packages/aggregation/csv/normalize.test.ts` — 10 regression tests for `resolveDirection` blank/zero/non-numeric split column combinations (BLOCKER fix).
- E2E (tagged `e2e: true`): AC-14 — full import + idempotency + cleanup (`e2e/csv-import-api.spec.ts`).

## Fixes (post-merge)

_None yet._

## DRI Log

### Decisions

- **[2026-06-28] [PM]** `providerAccountId` widened to `string | null` (not a separate `csvProviderAccountId` field) — the `NormalizedTransaction` type is shared; adding a separate field for the CSV case would fragment the type. Widening is backwards-compatible since Plaid always provides a non-null value. Area: types. Reversibility: easy.
- **[2026-06-28] [PM]** 10,000-row cap per request — corresponds to ~2 MB of normalized JSON, within Vercel's body size limit; large Apple Card history files can be split by the wizard (idempotent ingest means re-importing overlapping rows is safe). Area: operational. Reversibility: easy (cap is a route-level guard, easy to adjust).
- **[2026-06-29] [Engineer]** `isValidCsvRow` requires `parseFloat(amount) > 0` (BLOCKER fix) — split debit/credit CSVs produce `{ amount: "0", error: true }` rows for blank/zero/"0.00" inactive columns; these rows must never reach the DB. Two-layer defense: route rejects zero-amount rows server-side; wizard (WLT-27-4) filters `directionError` rows client-side before POST. `resolveDirection` + `ColumnMapping` extracted to `packages/aggregation/csv/normalize.ts` for unit testability. Area: correctness. Reversibility: easy.

### Risks

- **[2026-06-28] [PM]** `?? 'manual'` fix must not fire for Plaid rows — confirmed safe because Plaid always provides a non-null `providerAccountId`; AC-13 regression test enforces this. If a future provider has a null `providerAccountId`, the dedup key would unexpectedly merge all their rows under `'manual'` — escalate at that time. Area: correctness.

### Issues

- **[2026-06-28] [PM]** `dedupKey` null-providerAccountId must be verified (inherited from brief DRI Issue) — severity: medium — owner: Engineer — status: resolved (AC-2 in this story). Closes the brief issue.

- **[2026-06-29] [Engineer]** Contract-shift sweep (`[cross-artifact-sweep-on-contract-shift]`) — `NormalizedTransaction.providerAccountId` widened from `string` to `string | null`. Swept: `packages/aggregation/plaid/map.ts` (provides `a.account_id`, `t.account_id` — always non-null string), `packages/jobs/aggregation/sync.ts` (reads `a.providerAccountId` — always non-null from Plaid). No consumer broken; widening is additive. Typecheck clean confirms. Status: resolved.

---

_Story closed: pending. Brief: docs/bets/WLT-27/brief.md_
