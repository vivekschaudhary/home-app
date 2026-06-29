---
id: WLT-27-ARCH
bet: WLT-27
status: approved
created: 2026-06-28
authors: [Architect, Enterprise/Solution Architect]
area_tags: [accounts, transactions, csv-import, multi-currency, data, backend, frontend]
---

# Technical Design: Manual Account Entry + CSV Import + Multi-Region Account Isolation

## Decision

Build the three sub-features in sequence using **only the existing foundational stack** — no new service, data store, runtime, or framework — and treat the **currency-awareness fix as a hard prerequisite** that must land before any non-USD account can be created.

- **Sub-feature A (Manual Account Entry):** The `financial_accounts.connection_id` column is already nullable, designed for manual accounts. Build a `POST /api/accounts` Route Handler (service-role write, matching the financial-table posture) and a `ManualAccountForm` UI. No migration needed.
- **Sub-feature B (CSV Transaction Import):** The `transactions.source = 'csv'` path and the `dedupKey(...)` synthesized-hash fallback already exist in `packages/aggregation/core/dedup.ts` and `ingest.ts`. Build a `POST /api/accounts/[id]/import` Route Handler that accepts parsed rows from a `CsvImportWizard` UI (column-mapping step → preview → confirm), normalizes them to `NormalizedTransaction`, and runs them through `ingestTransactions` (service-role write, idempotent dedup). CSV parsing in the browser uses **`papaparse`** (a minor npm library, not a foundational-stack concern). No migration needed.
- **Sub-feature C (Multi-Region Account Isolation):** Add `currency: string` to the shared `SpendingTxn` interface and propagate a `currency` scope parameter through all spending-aggregation paths (budget, recap, anomaly scan, category chart, transaction ledger). Without this fix, a non-USD manual account would cause nonsense spending totals (JPY summed with USD as raw numbers — the researcher's DRI Issue 3). Once this fix is verified, a currency-region switcher on each spending surface lets users with multi-currency accounts toggle between regions (no exchange rate API; no cross-currency conversion). Unified cross-currency conversion is **explicitly deferred to Phase 2** (out of WLT-27 scope).

Everything is **within the foundational stack** (Postgres + RLS + Route Handlers + the existing `@wealth/aggregation` ingest pipeline + React/Tailwind frontend + existing Inngest anomaly scan). **No new tool, service, data store, runtime, or major dependency.**

## Context

- **The schema is already fully ready for both sub-features A and B.** Per the researcher (codebase-confirmed): `financial_accounts.connection_id` is nullable (documented as `null = manual/CSV` in `0003_aggregation.sql`); `financial_accounts.currency` (ISO 4217, default `'USD'`) exists; `transactions.currency` (ISO 4217) exists; `transactions.source` accepts `'csv'`; `transactions.provider_transaction_id` is nullable. The unique constraint `(connection_id, provider_account_id)` permits multiple NULL-NULL rows (PostgreSQL treats NULLs as distinct in unique constraints) — multiple manual accounts per user are safe. **No migration is required for A or B.**
- **The ingest pipeline already handles CSV.** `packages/aggregation/core/dedup.ts:dedupKey` already synthesizes a stable hash from `occurredOn|amount|description` when `providerTransactionId` is null. `packages/aggregation/core/ingest.ts:ingestTransactions` runs service-role upserts with `on conflict(user_id, dedup_key, content_hash) do nothing` — making re-import idempotent by design. The comment in `ingest.ts` explicitly states: "Plaid sync and (future) CSV both land here." The pipeline convergence point is already built.
- **The `SpendingTxn` interface does not carry `currency` — this is the blocker for sub-feature C.** `packages/core/recap.ts:SpendingTxn` has `direction`, `category`, `amount`, `occurredOn` — no `currency`. Every downstream spending consumer (`computeMonthlySeries` in `budget.ts`, the recap spend computation, `buildCategorySpendChart` in `dashboard-spend.ts`, the anomaly scan's per-category spike detection) therefore aggregates amounts across ALL currencies. This is harmless for today's USD-only users; it produces nonsense the moment a EUR manual account exists.
- **Manual accounts must be gated behind `MULTI_CURRENCY_ACCOUNTS_ENABLED` for non-USD currencies** until the currency-awareness fix is verified. USD-only manual accounts are safe to ship earlier under `MANUAL_ACCOUNTS_ENABLED`.
- **The `dedupKey` for manual account transactions uses `providerAccountId` in the key composition.** For manual accounts, `providerAccountId` is null. The Engineer must confirm the dedup computation in `dedupKey` handles a `null` `providerAccountId` gracefully (it currently uses `t.providerAccountId` as the second segment — should normalize to `'manual'` for null to keep keys stable).
- **Foundational-stack deviation gate: PASS — no deviation.** `papaparse` is a minor npm library (not a framework, service, or data store); it does not touch the foundational Stack table. No charting library, no new managed service, no exchange rate API (deferred). No `/setup-foundation-architecture` amendment required.
- **No new foundational entity.** Manual accounts map to the existing `financial_accounts` entity (`connection_id = null`). The architecture.md Foundational Data Model states `AccountConnection — An authorized aggregation link…` and `FinancialAccount — A real financial account surfaced via a connection (checking, card, investment)` — manual accounts extend `FinancialAccount` naturally; the entity schema is already designed for this.

## Approach

### Components affected

**Currency-awareness fix (prerequisite for sub-feature C; must land before non-USD manual accounts are enabled):**

- **`packages/core/recap.ts`** (edit) — add `currency: string` to `SpendingTxn`. Every read that populates this type must include `currency` from the `transactions` table SELECT. Consumers that aggregate across all transactions must receive a `currency` scope and filter before summing.
- **`packages/core/budget.ts`** (edit) — `computeMonthlySeries`, `computeRecommendedBudgets`, `computeMonthlySpending`, and all other spending functions accept an optional `currency?: string` parameter; when provided, they skip `SpendingTxn` rows with a different currency before aggregating. Default omitted = `'USD'` for backwards compatibility with existing single-currency users.
- **`packages/core/dashboard-spend.ts`** (edit) — `buildCategorySpendChart` gains `currency?: string`; applies the same filter-before-aggregate pattern.
- **`packages/core/anomaly.ts`** (edit) — `categorySpikes(...)` and `newMerchants(...)` gain `currency?: string`; filter `AnomalyTxn` rows to the specified currency. The anomaly scan fans out per-user, so the caller (anomaly-scan.ts) must determine a per-user currency set and call the detector once per currency region (or pick the user's primary currency).
- **`packages/jobs/recap/anomaly-scan.ts`** (edit) — after loading the user's transactions, group by `currency` and run `detectAnomalies` per region. For users with a single currency (the majority today), this is a no-op behavioural change.
- **`app/lib/transactions.ts`** (edit) — `readTransactionsPage(userId, opts)` gains `currency?: string` opt that adds `transactions.currency = $currency` to the query filter. Additive + backwards-compatible.
- **`app/lib/dashboard-spend.ts`** (edit) — `readCategorySpendChart(userId, opts?)` gains `currency?: string`; passes it to the bounded `readAllPaged` transactions read and to `buildCategorySpendChart`.
- **All read functions that SELECT spending transactions** (recap.ts, dashboard-spend.ts, budget pages) — add `currency` to the SELECT column list so `SpendingTxn` carries the field.

**Sub-feature A: Manual Account Entry:**

- **`app/api/accounts/route.ts`** (new) — `GET`: list the user's accounts (both connected and manual), owner-scoped, sorted by kind then name; returns `{ id, name, kind, currency, balance_current, is_manual: connection_id === null, institution_name }`. `POST`: create a manual account; body = `{ name: string, kind: 'depository' | 'credit', currency: string }`; validates ISO 4217 currency code against an allowlist; service-role insert to `financial_accounts` with `connection_id = null, provider_account_id = null`; returns the created row. AAL2 guard on both.
- **`app/api/accounts/[id]/route.ts`** (new) — `DELETE`: soft-delete a manual account (`deleted_at = now()`); service-role update; guards: (a) account must belong to the requesting user, (b) `connection_id` must be null (cannot delete Plaid-connected accounts via this route — those go through the aggregation disconnect flow). AAL2 guard.
- **`packages/db/accounts.ts`** (new) — `createManualAccount(svc, userId, { name, kind, currency })`, `listAccounts(svc, userId)`, `softDeleteManualAccount(svc, userId, accountId)` — service-role wrappers; the financial-table posture mandates these go through the service role, not a user-scoped client.
- **`app/(app)/accounts/page.tsx`** (new) — Accounts management surface: lists all accounts (Plaid-connected + manual), groups by currency region when multi-currency accounts exist, provides "Add manual account" and per-account CSV import entry points.
- **`app/(app)/accounts/ManualAccountForm.tsx`** (new) — Modal/dialog: `name` (free text), `kind` (depository/credit select), `currency` (ISO 4217 select, default USD). "Add Account" → `POST /api/accounts` → optimistic UI update.

**Sub-feature B: CSV Transaction Import:**

- **`app/api/accounts/[id]/import/route.ts`** (new) — `POST` multipart: receives `{ rows: NormalizedCsvRow[], accountId }` JSON body (pre-parsed client-side by `papaparse` + the column-mapping step); validates the account belongs to the requesting user (owner-scoped check); normalizes rows to `NormalizedTransaction[]` with `source: 'csv'`, `currency` from the account's `financial_accounts.currency`; calls `ingestTransactions` with the service role. Returns `{ inserted, duplicates, errors }`. Body size limit: Next.js default 4MB (sufficient for a year's worth of monthly CSV exports). AAL2 guard.
- **`packages/core/csv-import.ts`** (new, pure) — `normalizeCsvRows(rows: RawCsvRow[], mapping: ColumnMapping, accountCurrency: string) → NormalizedTransaction[]`: parses dates (handles MM/DD/YYYY and YYYY-MM-DD), amounts (handles positive=debit vs signed), direction inference (from sign or a type column), description. Returns `NormalizedTransaction` rows with `source: 'csv'`, `providerTransactionId: null`, `providerAccountId: null`, `currency: accountCurrency`. Pure — no side effects; unit-testable. Also exports `detectDateFormat`, `detectAmountSign` (heuristic auto-detect before the mapping step).
- **`app/(app)/accounts/CsvImportWizard.tsx`** (new) — Multi-step wizard: (1) file upload + `papaparse` client parse → preview the first 5 rows; (2) column-mapping UI (map CSV columns to `date / amount / description / optional: merchant / optional: category`); (3) auto-detect confirmation (show detected date format + amount sign, allow override); (4) preview 10 normalized rows; (5) confirm + call `POST /api/accounts/[id]/import`; (6) result screen (`N transactions imported, M duplicates skipped`). The wizard runs entirely client-side for steps 1–4; only step 5 calls the server.
- **`packages/aggregation/core/dedup.ts`** (edit) — In `dedupKey`: when `t.providerAccountId` is null, use the literal string `'manual'` as the second segment (instead of `null` or `undefined`, which would produce `'csv:null:...'` — unstable across JS runtimes). This ensures re-imports of the same CSV produce identical dedup keys.

**Multi-region isolation UI (sub-feature C surface, enabled after currency-awareness fix):**

- **`app/(app)/accounts/page.tsx`** (already planned above) — groups accounts by currency; shows a per-region summary.
- **`app/(app)/transactions/page.tsx`** (edit) — reads `searchParams.currency`; passes to `readTransactionsPage` (already extended). When a user has multi-currency accounts, renders a currency-region tab bar.
- **`app/(app)/budget/page.tsx`** + **`app/(app)/dashboard/page.tsx`** (edit) — read `searchParams.currency`; pass to respective spending reads. The currency selector appears only when multiple currency regions exist.
- **`app/lib/accounts.ts`** (new) — `readUserCurrencies(userId) → string[]`: returns distinct currencies across the user's active accounts; used to decide whether to show the currency region switcher.

### Data model changes

**None required.** The schema is fully ready:

- `financial_accounts.connection_id` nullable (manual accounts) ✓
- `financial_accounts.currency` ISO 4217 ✓
- `transactions.currency` ISO 4217 ✓
- `transactions.source` accepts `'csv'` (no check constraint — free text as designed) ✓
- Dedup unique constraint handles null `provider_transaction_id` ✓

No migration. No new table. No new column.

### API / contract changes

- **`POST /api/accounts`** — new; AAL2; body `{ name, kind, currency }`; creates manual account. Not a breaking change (additive).
- **`GET /api/accounts`** — new; AAL2; lists all accounts (connected + manual). Additive.
- **`DELETE /api/accounts/[id]`** — new; AAL2; soft-deletes manual accounts only. Additive.
- **`POST /api/accounts/[id]/import`** — new; AAL2; JSON body `{ rows, mapping }`; returns `{ inserted, duplicates, errors }`. Additive.
- **`GET /api/transactions`** — additive: gains optional `currency` query param (filter by currency). Backwards-compatible (omitted = existing behaviour).
- All other spending endpoints that gain `currency` — additive opts, backwards-compatible.

### Dependencies

- **`papaparse`** — CSV parsing (browser-side only). MIT license, zero dependencies, 5M+ weekly downloads; the most established CSV parser in the JS ecosystem. Used only in `CsvImportWizard.tsx` (client component); never runs server-side (parsing happens in the browser before the Route Handler call). Not a foundational-stack tool — this is an implementation library. No deviation gate triggered.
- **No other new dependencies.** Reuses `packages/aggregation` (`ingestTransactions`, `dedupKey`, `NormalizedTransaction`), `packages/db` (`createServiceSupabase`, `readAllPaged`), `packages/core` (`SpendingTxn`, `computeMonthlySeries`, `buildCategorySpendChart`), Supabase Postgres + RLS + AAL2, and the existing React/Tailwind frontend.

## Enterprise/Solution Architect input

### Cross-system implications

- **No new service, third-party integration, or system boundary.** Manual account creation and CSV import operate entirely within the existing Supabase Postgres (service-role writes) + Next.js Route Handler (request path) boundary. The existing `ingestTransactions` function is the convergence point — CSV rows flow through the same ingest pipeline as Plaid-synced rows.
- **The anomaly scan (Inngest, off-request) is affected.** Adding `currency` grouping to the daily scan means it must be currency-aware. This is a pure code change to `anomaly-scan.ts` with no new Inngest function or schedule. For users with only USD accounts (everyone today), the grouped output is a single-currency run — no behavioural change.
- **The currency-awareness fix is cross-cutting.** It touches `SpendingTxn` (the shared spending type used by budget, recap, dashboard-spend, anomaly) and all their callers. This is the correct architectural scope — these paths share a type contract, and the fix must be applied consistently. An incomplete fix (e.g., fixing budget but not anomaly) would leave the codebase in a partially-correct state that could surprise the next developer.
- **Performance guardrail.** The existing `idx_transactions_user_occurred` index on `(user_id, occurred_on desc)` where `superseded_by is null and removed_at is null` will serve currency-filtered spending reads via a partial scan. At early scale (< 10k users, mostly USD), the additional currency filter predicate has negligible cost. If EXPLAIN ANALYZE shows degradation at higher scale, an index on `(user_id, currency, occurred_on desc)` is the documented escalation path — not needed at launch.

### Standards compliance

Conforms fully to the foundation:

- Financial-table write posture: `financial_accounts` and `transactions` writes go through the service role (no user-direct write policies) — maintained.
- Default-deny RLS: new Route Handlers validate ownership before any write; the `financial_accounts_select_own` policy restricts reads to `auth.uid() = user_id and deleted_at is null`.
- AAL2 on all financial-data Route Handlers.
- `readAllPaged` cap discipline: the accounts list and CSV import both respect the `@wealth/db/paged` guardrail.
- PII posture: `SpendingTxn` carries amounts/enums only (adding `currency` to it does not introduce PII); the CSV import does NOT store the raw CSV file — only the normalized transactions land in Postgres.
- Expand-only schema policy: no migration is needed, but if one were needed it would follow expand-contract (additive-first).
- OPS-2 auto-migrate on deploy: n/a (no migration).

**No drift flagged.** No deviation from any foundational standard.

### Cost / capacity / vendor lock-in

- **Zero new variable cost.** No third-party API call per import. `papaparse` is a client-side library — no server cost. CSV rows are ingested through the existing `ingestTransactions` path (service-role Postgres write) — same cost as a Plaid-synced row.
- **No new lock-in.** No charting library, no exchange rate vendor, no new managed service.
- **Storage note:** manual accounts and CSV transactions store in the same `financial_accounts` and `transactions` Postgres tables — no new storage bucket needed. For very high-volume users (years of monthly Apple Card exports), transactions are bounded by the existing ingest path's idempotency — re-importing is safe and cheap.

## Alternatives considered

| Option                                                                                                      | Pros                                                                                                       | Cons                                                                                                                                                                                                                                                                                    | Why not chosen                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chosen — extend the existing ingest pipeline; `papaparse` browser-side; currency scope on `SpendingTxn`** | Reuses `dedupKey` + `ingestTransactions`; idempotent; pure column-mapping in core; no new table or service | `papaparse` is a new npm dep; currency fix is cross-cutting                                                                                                                                                                                                                             | —                                                                                                                                                                                                                 |
| **Alt A — server-side CSV parsing (upload raw file, parse on Route Handler)**                               | File parsing in one place                                                                                  | Vercel function body limit (4MB default); streaming is non-trivial; multipart handling adds complexity; no benefit over client-side parse given small file sizes                                                                                                                        | Rejected — higher complexity, lower reliability for large files; client-side parse + structured JSON POST is standard and simpler                                                                                 |
| **Alt B — Supabase Storage for raw CSV staging (upload → async job → parse)**                               | Handles large files; can retry on failure                                                                  | New Inngest function required; adds latency (async job vs synchronous response); storage cost; the file sizes (monthly Apple Card CSV = ~10KB) don't justify it                                                                                                                         | Deferred — correct architecture for very large files; revisit if users import multi-year history and the 4MB body limit becomes a constraint                                                                      |
| **Alt C — build currency conversion (unified cross-currency view, exchange rate API) in WLT-27**            | Single unified net worth / spending view                                                                   | Requires exchange rate API integration (a new third-party service → foundational-stack deviation gate); historical rate storage; "as of" date UX complexity; validates demand before building                                                                                           | Rejected — unnecessary deviation for a feature whose demand is unverified; region isolation (no conversion) covers the core pain first (researcher Recommendation 2). Revisit as WLT-27 Phase 2 or a separate bet |
| **Alt D — new `manual_accounts` table (separate from `financial_accounts`)**                                | Isolation; different lifecycle                                                                             | `financial_accounts.connection_id` is explicitly documented as nullable for manual/CSV; a separate table would duplicate the entity and split the query surface across two tables (break the ledger join); the foundational data model entity is `FinancialAccount`, not `PlaidAccount` | Rejected — contradicts the foundational entity model; the schema was designed for this                                                                                                                            |
| **Alt E — fixed CSV column parser (no mapping step)**                                                       | Simpler implementation                                                                                     | Fails for most real CSVs — bank CSV formats are irreconcilably diverse (Apple Card: positive=debit; BofA: positive=credit (inverted); EU banks: DD/MM/YYYY, comma decimal separators — see research Finding 5). A fixed parser will produce silent wrong-direction or wrong-amount data | Rejected — produces silent data corruption; column mapping is required per the research evidence                                                                                                                  |

## Consequences

**Positive:**

- Closes the structural coverage gap for Apple Pay, Venmo, Cash App, and credit-union users (Finding 1 + 2) — a silent "money is missing from your picture" problem for a meaningful user segment.
- Reuses the existing `ingestTransactions` ingest pipeline, `dedupKey` hash, and idempotent upsert — CSV import gets dedup and CDC-safety for free.
- The currency-awareness fix is a codebase correctness improvement independent of WLT-27 scope — it protects the spending math for any future multi-currency path (even if WLT-27 were to be cancelled, the fix has positive value).
- No new table, no new migration, no new managed service — low blast radius.
- `papaparse` is browser-only and trivially replaceable — no lock-in.

**Negative:**

- The currency-awareness fix is cross-cutting (`SpendingTxn` → budget, recap, anomaly scan, dashboard-spend, ledger filter) — it touches many files and carries regression risk for existing USD-only spending features. Extensive test coverage is required before landing it (see Test strategy).
- The `CsvImportWizard` column-mapping UX is inherently fiddly — every bank has a different CSV shape, and users who upload a mismatched file or incorrectly map columns will import wrong-direction transactions. A preview step (planned) mitigates this but does not eliminate it.
- CSV transactions have no merchant-entity resolution (no `normalizeMerchant`, no `merchant_entity_id`) — they will not appear in the merchant-grouped anomaly detection (`newMerchants`) unless a merchant column is mapped. This is an honest limitation, not a regression.
- Client-side CSV parsing (`papaparse`) means large files could cause browser memory pressure. Mitigated by a file-size cap (UI validation, e.g., 10MB) with a clear error message.
- Deferred unified currency conversion means users with multi-currency accounts cannot see a single consolidated net worth or spending total — they must switch between regions. This is honest about the Phase 1 scope but may feel incomplete.

**Reversibility:** **easy** — all changes are additive (new API routes, new UI components, optional params on existing functions); the currency-awareness fix only adds a filter parameter (omitted = existing behaviour); `papaparse` is a single npm dep remove; no migration means no schema rollback risk. If region isolation proves insufficient, adding unified currency conversion is an additive evolution (Alt C remains viable).

## Test strategy

- **Pure (`@wealth/core`, Engineer):**
  - `csv-import.ts`: `normalizeCsvRows` — covers Apple Card format (positive=debit), BofA inverted (positive=credit), signed-amount, MM/DD/YYYY vs YYYY-MM-DD, locale-decimal (comma); duplicate rows produce identical dedup keys; `null` providerAccountId uses `'manual'` segment.
  - `budget.ts`: `computeMonthlySeries` with `currency` filter — USD rows sum correctly; EUR rows excluded when `currency='USD'`; single-currency user (no `currency` arg) produces identical output to before the change (regression guard).
  - `dashboard-spend.ts`: `buildCategorySpendChart` with `currency` scope — same regression guard.
  - `anomaly.ts`: `categorySpikes` and `newMerchants` with `currency` — multi-currency txn set produces per-currency correct results; USD-only input unchanged.
- **Integration / API (Engineer):**
  - `POST /api/accounts`: creates a manual account (connection_id null); rejects unknown currency codes; rejects non-AAL2 session.
  - `DELETE /api/accounts/[id]`: soft-deletes a manual account; 403 on a Plaid-connected account; 403 on a different user's account.
  - `POST /api/accounts/[id]/import`: ingests rows idempotently (re-POST of same CSV → same inserted count, 0 new rows); normalizes amounts correctly; rejects oversized body (> 4MB); 403 on another user's account.
  - `GET /api/transactions?currency=EUR`: returns only EUR transactions for the requesting user.
  - Currency regression: existing `?category=&month=` ledger filter composes correctly with `?currency=USD`.
- **Component (frontend, Engineer):**
  - `ManualAccountForm`: renders and submits; validates currency input; shows optimistic account in list.
  - `CsvImportWizard`: column-mapping step correctly identifies mapped columns; preview renders; confirm calls the import route; error state on bad file.
  - Currency region switcher: renders only when `readUserCurrencies` returns > 1 entry; clicking USD vs EUR tab updates the spending surfaces.
- **Codex (separate handoff):** RLS cross-tenant isolation for the new `POST /api/accounts` and `POST /api/accounts/[id]/import` routes (a second user cannot read or import into another user's account); soft-deleted accounts do not appear in the list; a re-imported CSV does not duplicate transactions in the ledger; a manual EUR account does not contaminate the USD spending surfaces.
- **Regression guard (load-bearing):** the existing budget, recap, and anomaly-scan tests must all pass without change after the `SpendingTxn.currency` addition and the default `currency = 'USD'` scope — confirms the fix is backward-compatible for existing single-currency users.

## Rollout

- **Feature flags:** Two flags:
  - `MANUAL_ACCOUNTS_ENABLED` (default off) — enables the accounts page, `ManualAccountForm`, and `POST /api/accounts`. Safe to flip for USD-only manual accounts **before** the currency-awareness fix is fully verified (a USD manual account adds no cross-currency risk).
  - `MULTI_CURRENCY_ACCOUNTS_ENABLED` (default off) — enables the non-USD currency selector in `ManualAccountForm`, the CSV import path for non-USD accounts, and the currency-region switcher on spending surfaces. Must **not** flip until the currency-awareness fix is verified (regression suite + EXPLAIN ANALYZE on the currency-filtered spending reads).
- **Migration:** None.
- **Backwards compatibility:** Required + held — all API additions are additive; `currency` param on spending functions defaults to `'USD'` (existing behaviour); no existing route or component changes its contract.
- **Staged rollout:**
  1. Land the `SpendingTxn.currency` fix + all spending-aggregation currency scopes (dark — no user-visible change; USD default preserves existing behaviour). Full regression suite must pass. EXPLAIN ANALYZE on the currency-filtered spending reads.
  2. Flip `MANUAL_ACCOUNTS_ENABLED` — accounts page + USD manual account creation + `CsvImportWizard` (USD accounts only). Operator dogfood.
  3. Flip `MULTI_CURRENCY_ACCOUNTS_ENABLED` — unlock non-USD currencies in `ManualAccountForm` + currency-region switcher. Validate EUR/GBP account + spending isolation end-to-end before opening to users.

## Open questions for Engineer

- **`dedupKey` null providerAccountId:** the current `dedupKey` in `packages/aggregation/core/dedup.ts` uses `t.providerAccountId` as the second segment. For manual accounts, this is `null`. Confirm whether the current runtime serializes this as `"null"` or `undefined` (producing `"csv:undefined:…"`). **Escalate to Architect if neither is stable** — the fix is to explicitly use `'manual'` when `providerAccountId` is null (proposed in Approach; confirm exact implementation before landing).
- **Anomaly scan per-currency fan-out:** when a user has both USD and EUR accounts, should the daily scan run `detectAnomalies` once per currency region and emit separate anomalies per region? Or should it pick the user's "primary currency" (most accounts)? **Lean: run per-currency, emit per region** — but escalate rather than guessing, since this affects `dedup_key` encoding for the `category_spike` (currently `category_spike:{category}:{month}` — it should become `category_spike:{currency}:{category}:{month}` to avoid a EUR spike suppressing a USD spike). This is an Engineer-visible consequence of the currency-awareness fix.
- **CSV row direction inference:** when the user's CSV has a single amount column (positive only) and no explicit type column, the wizard should **default to treating all rows as debits** (the common case for expense-tracking apps). For a dedicated income-tracking import, the user can provide a direction column. Document this default in the mapping step UI so users with mixed-direction single-amount-column CSVs understand they need to map the direction column if present.
- **`financial_accounts` balances for manual accounts:** `balance_current` and `balance_available` are nullable — manual accounts will have null balances unless the user enters them. The `ManualAccountForm` may optionally accept a `balance` input (not strictly required for WLT-27 scope, but useful for net worth display). Confirm with product whether to include it in the form. **Lean: include as optional, no validation.** Escalate if product wants it required.
- **ISO 4217 currency allowlist:** the `POST /api/accounts` Route Handler should validate the submitted currency code. A reasonable MVP allowlist: the ~30 most common currencies (USD, EUR, GBP, CAD, AUD, JPY, CHF, CNY, HKD, SGD, INR, MXN, BRL, KRW, SEK, NOK, DKK, NZD, ZAR, AED, THB, MYR, IDR, PHP, PLN, CZK, HUF, ILS, TRY, SAR). Escalate if a broader list is wanted.

## DRI Log

### Decisions

- [2026-06-28] [Architect] **Currency-awareness fix (`SpendingTxn.currency`) is a hard prerequisite for non-USD manual accounts** — rationale: without the fix, a EUR manual account causes the spending arithmetic to sum USD and EUR amounts as raw numbers (e.g., $3,000 + €2,500 = $5,500), producing silent wrong spending totals, wrong budget recommendations, and wrong anomaly detection — a data-integrity failure, not just a display artifact. The fix must land and be regression-verified before `MULTI_CURRENCY_ACCOUNTS_ENABLED` flips. Area: data integrity / correctness. Alternatives: gate non-USD at the account-kind level (partially mitigates but doesn't fix the scan); accept wrong totals in Phase 1 (rejected — silent data corruption). Reversibility: easy (the fix is additive).

- [2026-06-28] [Architect] **Reuse `ingestTransactions` + `dedupKey` for CSV import; no new ingest path** — rationale: `packages/aggregation/core/ingest.ts` already states "Plaid sync and (future) CSV both land here"; the dedup hash already synthesizes a stable key when `providerTransactionId` is null; the service-role upsert is the correct write path for financial tables. Building a parallel CSV-specific ingest would duplicate the idempotency logic and contradict the explicit design intent. Area: architecture / data. Alternatives: custom CSV ingest endpoint that writes directly to Postgres (rejected — bypasses dedup + CDC safety). Reversibility: easy (same convergence point).

- [2026-06-28] [Architect] **CSV parsing is client-side (`papaparse`); Route Handler receives structured JSON, not raw CSV bytes** — rationale: keeps the Route Handler simple (no multipart streaming, no server-side CSV parsing complexity); limits server payload to the rows the user has mapped (no unnecessary raw-file transfer); `papaparse` is the canonical browser CSV parser (MIT, zero deps, 5M+ weekly downloads); browser parsing enables the column-mapping preview before any server call. Area: frontend / API. Alternatives: server-side parsing on the Route Handler (rejected — higher complexity, Vercel body-limit risk for large files, no benefit given small monthly CSVs); Supabase Storage + async Inngest job (deferred — correct for multi-year imports, not for MVP monthly export files). Reversibility: easy (change is isolated to `CsvImportWizard.tsx` + the route body shape).

- [2026-06-28] [Architect] **Region isolation (per-currency views, no conversion) for WLT-27; unified cross-currency conversion deferred to Phase 2** — rationale: research Finding 4 explicitly separates the two approaches; region isolation covers the core user pain (expat with a USD + EUR account wants to see each separately) without requiring an exchange rate API (a new foundational-stack service, a deviation-gate fire); unified conversion has unverified demand and non-trivial "as of" UX complexity. Area: product / architecture. Alternatives: build unified conversion now (rejected — deviation-gate fire; unverified demand; blocks launch on infrastructure not needed for MVP). Reversibility: easy (unified conversion is an additive evolution over region isolation).

- [2026-06-28] [Architect] **No migration needed; no new table** — rationale: the schema is confirmed ready (`connection_id` nullable, `currency` on both tables, `source='csv'` handled, dedup covers null `providerTransactionId`). Area: data. Reversibility: n/a.

- [2026-06-28] [Enterprise Architect] **No foundational-stack deviation; no `/setup-foundation-architecture` amendment** — rationale: `papaparse` is a minor npm library (not in the Stack table scope); no exchange rate API (deferred); no charting library; no new data store or service. Area: architecture / standards. Reversibility: n/a.

### Risks

- [2026-06-28] [Architect] **Currency-awareness fix regressions (spending totals, budget, anomaly)** — likelihood: medium — impact: high (existing USD-only users see wrong totals if the `currency` default scope is applied incorrectly) — mitigation: regression suite must explicitly assert that USD-only user spending paths produce identical output before and after the fix; the `currency` param defaults to `'USD'` (not to filtering by the first account's currency, which could change behaviour for existing users); engineer should run the test suite on a branch with only the `SpendingTxn` change before adding the UI or import routes. Area: correctness / regression.

- [2026-06-28] [Architect] **CSV column-mapping import produces wrong-direction transactions (a credit imported as a debit)** — likelihood: medium (bank CSV formats are diverse; direction inference is error-prone) — impact: high (silent corruption of spending history) — mitigation: the column-mapping step must include an explicit direction column option; the preview step shows 10 normalized rows with direction visible before confirming; the import result shows counts, enabling the user to re-import after fixing the mapping; `ingestTransactions` dedup means a re-import is safe. Area: data integrity.

- [2026-06-28] [Architect] **`dedupKey` instability for null `providerAccountId`** — likelihood: low (confirmed as a code smell; runtime serialization of `null` in a template string produces `"null"` in JS, not `undefined`) — impact: medium (a re-import of the same CSV with a different JS runtime version could change the serialized form and produce duplicate rows) — mitigation: explicitly normalize `null` providerAccountId to the string `'manual'` before passing to `dedupKey`; unit-test this path. Area: data integrity.

- [2026-06-28] [Architect] **User imports a multi-year history CSV; browser RAM pressure** — likelihood: low at MVP (most users import monthly files) — impact: low (browser tab crash, no data loss) — mitigation: validate file size client-side before `papaparse` parses (cap at 10MB); show a clear error with instructions to split the file by year. Area: resilience / UX.

- [2026-06-28] [Architect] **Multi-currency anomaly scan `dedup_key` collision if not currency-scoped** — likelihood: high (if `category_spike` dedup_key does not include currency, a USD dining spike and a EUR dining spike share the same key; dismissing one dismisses the other across regions) — impact: medium (incorrect suppress behavior) — mitigation: `category_spike` and other per-category anomaly dedup_keys must include the currency segment (`category_spike:{currency}:{category}:{YYYY-MM}`). Flagged as an Open question for Engineer above. Area: correctness.

### Issues

- [2026-06-28] [Architect] **`dedupKey` null `providerAccountId` serialization must be fixed before CSV import ships** — severity: high — owner: Engineer — status: open — area: data integrity — action: confirm behavior in the current `dedupKey` function and fix to use `'manual'` literal for null; add a unit test.

- [2026-06-28] [Architect] **First-party demand signal is missing (carried from researcher DRI)** — severity: medium — owner: PM/Engineer — status: open — area: demand validation — action: instrument Plaid link-error events + a "Did we fail to connect your account?" fallback UI pointing to CSV import before WLT-27 ships; use these events to quantify the coverage-gap cohort over the first 4 weeks.

- [2026-06-28] [Architect] **Apple Card CSV format should be validated against a real live export before the parser is built** — severity: low — owner: Engineer — status: open — area: implementation — action: obtain a real Apple Card CSV (Apple Settings → Apple Card → Transactions → Export) and validate the format against research Finding 5 (positive=debit, MM/DD/YYYY, Category column). The Apple support doc format description may lag the actual export.

- [2026-06-28] [Architect] **`MULTI_CURRENCY_ACCOUNTS_ENABLED` flag must not flip until EXPLAIN ANALYZE on currency-filtered spending reads confirms p95 < 200ms** — severity: medium — owner: Engineer — status: open — area: performance — action: run EXPLAIN ANALYZE on `readTransactionsPage` with `currency = 'EUR'` on a user with 1k+ transactions and confirm the existing `idx_transactions_user_occurred` index satisfies the query or add a `(user_id, currency, occurred_on desc)` partial index before flipping.

---

_Status: proposed. Flip `status: proposed → status: approved` here and set the brief frontmatter `architecture_status: approved` when ready. Do not self-approve — this halts at the HITL gate._
