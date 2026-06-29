---
id: WLT-27-ARCH
bet: WLT-27
status: approved
created: 2026-06-28
authors: [Architect, Enterprise/Solution Architect]
area_tags: [accounts, transactions, csv-import, multi-currency, backend, frontend]
approved: 2026-06-29
source_run: create-bet-architecture--WLT-27--20260628T220955
---

# Technical Design: Manual Account Entry + CSV Import + Multi-Region Account Isolation

## Decision

Build all three sub-features entirely within the existing foundational stack — **no new service, data store, runtime, or framework**. The schema is already built for this: `financial_accounts.connection_id` is nullable (the designated "manual account" signal in `0003_aggregation.sql`), `provider_account_id` is nullable, the `transactions` table has a `currency` column, and the `ingestTransactions` pipeline is idempotent via `(user_id, dedup_key, content_hash)`. The work is **API surface + UI + three targeted fixes** to wire up the capability that the schema already anticipates.

- **Sub-feature A (Manual Account Entry):** A new `POST /api/accounts` route handler writes a `financial_accounts` row with `connection_id = null`, gated behind `MANUAL_ACCOUNTS_ENABLED`. USD-only account creation is safe to ship before the currency-awareness fix (existing pipeline ignores `currency` for USD-only users without error).
- **Sub-feature B (CSV Import):** A new `POST /api/accounts/[id]/import` route handler receives client-normalized rows and routes them through the **existing** `ingestTransactions` pipeline. CSV parsing happens in the browser via `papaparse` (a client-side utility, not a service — no foundational-stack impact). Two targeted fixes to `dedupKey` and `NormalizedTransaction` close the null-`providerAccountId` edge case for manual-source rows.
- **Sub-feature C (Multi-Region Account Isolation):** Add `currency: string` to `SpendingTxn` and propagate a `currency` scope parameter through every spending-aggregation read path (budget, recap, dashboard-spend, anomaly scan). Non-USD account creation is gated behind `MULTI_CURRENCY_ACCOUNTS_ENABLED` until the currency-awareness fix is verified in production. No exchange rate API, no cross-currency conversion, no unified totals — region isolation only.

## Context

### What the codebase already has

- **`financial_accounts` schema** (`0003_aggregation.sql`): `connection_id uuid references account_connections(id)` — nullable by design (the column comment reads _"null = manual/CSV"_). `provider_account_id text` — also nullable. `currency text not null default 'USD'`. **No migration needed for manual account creation itself.** The unique constraint `(connection_id, provider_account_id)` needs attention: for manual accounts both are null, so the constraint would allow only one manual account per user (PostgreSQL treats two nulls as distinct in a `UNIQUE` index, but this is worth confirming on the ephemeral PG — see DRI Issue 3).
- **`financial_accounts.kind` constraint**: `check (kind in ('depository','credit'))`. The brief's ManualAccountForm offers `checking / savings / credit / investment / other`. Checking and savings map to `depository`; credit maps to `credit`. **Investment** and **other** are new — **an expand-only migration is required** to admit them.
- **`transactions` schema** (`0003_aggregation.sql`): `currency text not null default 'USD'`. All existing rows are `'USD'`. An `.eq("currency", activeCurrency)` filter is a no-op for existing data and the targeted fix for future mixed-currency users.
- **`dedupKey`** (`packages/aggregation/core/dedup.ts`, line 18): uses `t.providerAccountId` in the content-hash path. `NormalizedTransaction.providerAccountId` is typed `string` (not nullable). For CSV/manual transactions where the provider account ID is absent, this produces `"csv:null:..."` — **not a stable key**. Two minimal fixes are needed: (1) widen the type to `string | null`, (2) normalize `null → 'manual'` in `dedupKey`.
- **`ingestTransactions`** (`packages/aggregation/core/ingest.ts`, line 55): `const acc = accMap.get(t.providerAccountId)`. This silently drops rows when `providerAccountId` is null. For CSV import, the caller must normalize the lookup key.
- **`SpendingTxn`** (`packages/core/recap.ts`, line 58–67): four fields — `direction`, `category`, `amount`, `occurredOn`. **No `currency` field.** Every spending-aggregation path — `buildBudgetRows`, `computeMonthlySeries`, `buildCategorySpendChart`, `detectAnomalies`, recap spending — takes `SpendingTxn[]` without currency awareness. A user who adds a EUR account today would have their EUR amounts mixed into USD spending totals, producing nonsense spending intelligence. **This is the confirmed regression the brief's DRI Issue 3 references.**
- **App-layer reads** (budget, dashboard-spend, anomaly scan): SELECT from `transactions` without a `currency` filter. The fix is an additive `.eq("currency", activeCurrency)` predicate on every `transactions` SELECT that feeds spending aggregation.
- **Anomaly scan** (`packages/jobs/recap/anomaly-scan.ts`): fans out over users with active `account_connections`. Users who only have manual accounts would be excluded from daily detection. **This is a gap introduced by WLT-27 that needs addressing in the scan's user-listing step.**

### Foundational-stack deviation check

`papaparse` is a **client-side CSV parsing utility** — it runs in the browser, adds no server-side runtime, no new service, no new data store, no new framework. The foundational Stack table's "Account aggregation" row already reads _"CSV import for coverage gaps"_ (ADR-002). **No deviation. `/setup-foundation-architecture` amendment is NOT required.**

## Approach

### Components affected

**Sub-feature C prerequisite — WLT-27-1:**

- **`packages/core/recap.ts`** (edit) — add `currency: string` to `SpendingTxn`. No change to the pure compute functions themselves; filtering happens at the app-layer read (single responsibility preserved).
- **`app/lib/budget.ts`** (edit) — `readSpendingForBudgets`: add `currency` to the Supabase SELECT; add `.eq("currency", activeCurrency)` filter (default `'USD'`); include `currency` in the mapped `SpendingTxn` result. The `activeCurrency` param flows from the budget page's currency context (default `'USD'` for all existing users).
- **`app/lib/dashboard-spend.ts`** (edit) — `readCategorySpendChart`: same pattern — add `currency` to SELECT and `.eq("currency", activeCurrency)` predicate.
- **`app/lib/recap.ts`** (edit) — the `readSpendingForRecap` transaction read: add `currency` to SELECT and `.eq("currency", activeCurrency)` filter.
- **`packages/jobs/recap/anomaly-scan.ts`** (edit) — two changes: (1) add `currency` to the transactions SELECT; (2) filter to `currency = 'USD'` by default in the scan query (safe: all existing rows are USD; prevents mixing when non-USD rows exist). (3) extend the user-listing step to also include users who have any `financial_accounts` row with `connection_id is null` (the manual-account-only user gap).
- **Regression suite (new tests)**: WLT-27-1's AC requires a regression suite that verifies existing USD-only behavior is unchanged — budget totals, recap spending figures, chart bars, anomaly detection — after the currency filter is added.

**Sub-feature A — WLT-27-2:**

- **`supabase/migrations/0020_financial_accounts_kind.sql`** (new) — expand the `kind` check constraint to admit `'investment'` and `'other'` (the two manual-only kinds not expressible in the current Plaid-sourced `('depository','credit')` set). Verify constraint name on ephemeral PG before migrating (per WLT-25 discipline; the default generated name is likely `financial_accounts_kind_check`). The mapping at the route handler boundary: `checking → depository`, `savings → depository`, `credit → credit`, `investment → investment`, `other → other`.
- **`app/api/accounts/route.ts`** (new) — `POST /api/accounts`:
  - AAL2-gated (`getAal2UserId()`).
  - Accepts `{ name: string; institutionName?: string; kind: 'checking'|'savings'|'credit'|'investment'|'other'; currency: string }`.
  - Guards: `MANUAL_ACCOUNTS_ENABLED` env flag required. If `MULTI_CURRENCY_ACCOUNTS_ENABLED` is off, reject `currency !== 'USD'`.
  - Maps the user-facing `kind` to the DB kind (see above), validates `currency` is a valid ISO 4217 code (a short allowlist, not a full 150-code lookup — the brief's scope is USD for MVP, non-USD gated).
  - Service-role write to `financial_accounts` with `connection_id = null`, `provider_account_id = null`.
  - Returns `{ account: { id, name, kind, currency } }`.
- **`app/(app)/accounts/ManualAccountForm.tsx`** (new) — controlled form component:
  - Fields: account name, institution name (optional), kind picker (checking / savings / credit / investment / other), currency picker (ISO 4217 dropdown, single-select; disabled and locked to USD when `MULTI_CURRENCY_ACCOUNTS_ENABLED` is off).
  - Calls `fetch('/api/accounts', { method: 'POST', ... })` — follows the `recordTransactionsFiltered` client-server pattern (cannot import `@wealth/db` directly from `"use client"` components, per the project's client-server boundary memory).
  - On success, revalidates the accounts list.
  - Gated behind `MANUAL_ACCOUNTS_ENABLED`.

**Sub-feature B — WLT-27-3 + WLT-27-4:**

- **`packages/aggregation/core/types.ts`** (edit) — widen `NormalizedTransaction.providerAccountId` from `string` to `string | null`. Plaid always provides a `providerAccountId`, so this is additive and backwards-compatible.
- **`packages/aggregation/core/dedup.ts`** (edit) — normalize null `providerAccountId` to `'manual'` in both key-construction paths:
  ```ts
  const accountSegment = t.providerAccountId ?? "manual";
  ```
  This makes CSV dedup keys stable across re-imports for the same manual account.
- **`packages/aggregation/core/ingest.ts`** (edit) — change the account lookup from `accMap.get(t.providerAccountId)` to `accMap.get(t.providerAccountId ?? 'manual')` so the CSV caller can pass `new Map([['manual', accountId]])` to route rows to the correct `financial_accounts.id`.
- **`app/api/accounts/[id]/import/route.ts`** (new) — `POST /api/accounts/[id]/import`:
  - AAL2-gated.
  - Verifies the `[id]` account belongs to the authenticated user (owner check) and has `connection_id = null` (guard: only manual accounts accept CSV import).
  - Accepts a JSON body `{ rows: NormalizedCsvRow[] }` where `NormalizedCsvRow = { occurredOn: string; description: string; amount: string; direction: 'debit'|'credit'; category?: string|null }` — the wizard has already column-mapped.
  - Maps each row to `NormalizedTransaction` with `source = 'csv'`, `providerTransactionId = null`, `providerAccountId = null`, `currency` from the account's stored `currency`, `kind = 'spend'` (default; CSV sources don't classify — per the existing `types.ts` comment).
  - Calls `ingestTransactions({ userId, page: { added: rows, modified: [], removed: [] }, accountIdByProviderAccountId: new Map([['manual', id]]) })`.
  - Returns `{ inserted, superseded, removed }`.
- **`app/(app)/accounts/CsvImportWizard.tsx`** (new) — multi-step UI component:
  - **Step 1: Upload** — file input accepting `.csv`; parses with `papaparse` (`Papa.parse(file, { header: true, ... })`) client-side; shows row count + detected headers.
  - **Step 2: Column mapping** — maps the source file's columns to `(date, description, amount, category)`. Also handles split debit/credit columns (e.g., Apple Card exports amount as a signed value; others use debit + credit columns). Includes the **Apple Card CSV preset** (auto-detected on header `Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD)` — WLT-27-6 validates the exact header before hardcoding).
  - **Step 3: Preview** — renders the first 10 mapped rows with resolved `direction` (sign-of-amount or debit/credit column), `occurredOn`, `description`, `amount`. User can go back to fix the mapping.
  - **Step 4: Confirm** — sends the full resolved rows to `POST /api/accounts/[id]/import`; shows the result (`N transactions imported, M already seen`).
  - The wizard uses `fetch(...)` for the final step (client-server boundary rule).

**Sub-feature C — WLT-27-5:**

- **`app/(app)/budget/page.tsx`**, **`app/(app)/dashboard/page.tsx`**, **`app/(app)/transactions/page.tsx`**, **`app/(app)/recap/`** (edit) — add a `CurrencyRegionSwitcher` component in the page header; visible only to users who have `financial_accounts` rows in more than one distinct `currency`. Gated behind `MULTI_CURRENCY_ACCOUNTS_ENABLED`.
- **`app/(app)/accounts/RegionSwitcher.tsx`** (new) — a dropdown/toggle that persists the active `currency` in a URL search param (`?currency=EUR`) or a session cookie; the param/cookie is read by the RSC data layer to pass `activeCurrency` to the app-lib reads (budget, recap, dashboard-spend).
- All spending reads pass `activeCurrency` to the `.eq("currency", activeCurrency)` predicate added in WLT-27-1. When `MULTI_CURRENCY_ACCOUNTS_ENABLED` is off, `activeCurrency` is always `'USD'` (no switcher, no change in behavior).

**End-to-End + Apple Card preset — WLT-27-6:**

- **`packages/aggregation/csv/apple-card.ts`** (new) — the Apple Card column-mapping preset definition: header detection pattern + field mapping. Written as a descriptor, consumed by `CsvImportWizard`.
- **End-to-end integration test** (new, authored by Codex) — uploads an Apple Card CSV fixture, runs the wizard flow to completion, verifies transactions land in `financial_accounts` under the correct account, confirms `dedupKey` stability on a second import of the same file (idempotent).

### Data model changes

Two expand-only migrations (no new tables, no RLS changes, no existing-row backfills):

**`supabase/migrations/0020_financial_accounts_kind.sql`** (new):

```sql
-- Widen financial_accounts.kind to admit manual-only account types.
-- Verify constraint name on ephemeral PG before applying (inline constraint
-- defaults to financial_accounts_kind_check — per WLT-25 discipline).
alter table financial_accounts drop constraint if exists financial_accounts_kind_check;
alter table financial_accounts
  add constraint financial_accounts_kind_check
  check (kind in ('depository','credit','investment','other'));
```

- **No data backfill needed** — no existing rows have `kind = 'investment'` or `'other'`.
- OPS-2 auto-applies on deploy.

The `unique(connection_id, provider_account_id)` constraint on `financial_accounts` treats `(null, null)` rows as distinct in PostgreSQL (NULLs are not equal in unique constraints) — so multiple manual accounts are allowed without a constraint violation. **Verify this behavior on the ephemeral PG** before proceeding (DRI Issue 4).

No migration for `transactions` — `currency` column already exists with `default 'USD'`.

### API / contract changes

- **`POST /api/accounts`** (new, additive) — creates a manual financial account. AAL2-gated, service-role write. Request: `{ name, institutionName?, kind, currency }`. Response: `{ account: { id, name, kind, currency } }`.
- **`POST /api/accounts/[id]/import`** (new, additive) — ingests CSV rows into an existing manual account. AAL2-gated, service-role write (via `ingestTransactions`). Request: `{ rows: NormalizedCsvRow[] }`. Response: `{ inserted, superseded, removed }`. Bound to a maximum row count (e.g. 10,000 rows per request) to prevent accidental OOM in the serverless function.
- **No existing API changes** — all existing routes, the `PATCH /api/anomaly/[id]`, the aggregation link routes, the budget routes, etc. are untouched. The `SpendingTxn` type change adds a `currency` field but the pure compute functions don't change their signatures (they receive a pre-filtered `SpendingTxn[]`).

### Dependencies

| Package           | Justification                                                                                                                                                                                                                                                                                         | Scope                      | Reversibility                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `papaparse` (npm) | Industry-standard CSV parser; zero native dependencies; runs client-side only (no server footprint); the wizard must parse before the column-mapping step, requiring a synchronous in-browser parse. No foundational-stack impact — it is a parsing utility, not a service, framework, or data store. | Browser/client bundle only | Easy — swap for `csv-parse` or a `TextDecoder`+split manual parser; the wizard's internal parse step is not exposed to the app layer |

## Enterprise/Solution Architect input

### Cross-system implications

- **No new service, third-party boundary, or data store.** All writes go through the existing service-role Supabase path (`ingestTransactions`). CSV parsing is client-side; the server only receives normalized rows (no raw CSV file ever reaches the server, which also prevents accidental large-payload OOM on the Vercel serverless function).
- **Inngest anomaly scan: user-listing gap.** The daily scan currently fans out over users with active `account_connections`. A user who only has manual accounts is excluded. Fixing the user-listing step (add `OR EXISTS (SELECT 1 FROM financial_accounts WHERE user_id = $uid AND connection_id IS NULL)`) is part of WLT-27-1 scope — but the scan logic itself does not change; it already operates on transactions rows regardless of source.
- **`ingestTransactions` is a shared service-role path.** The fix to handle `providerAccountId = null` must not regress the Plaid sync path. The fix is purely additive: `t.providerAccountId ?? 'manual'` in the Map lookup — Plaid always provides a non-null `providerAccountId`, so `?? 'manual'` never fires for Plaid rows.
- **Dedup key stability.** Existing CSV/manual-imported rows (if any) would have been ingested with `providerAccountId = null` serialized as the string `"null"` (since `null` coerced to a template literal is `"null"`). After the fix, new rows use `"manual"`. These are different key segments — meaning any previously imported rows would be re-inserted as new rows (the dedup key changes). **This is a known edge case; since the feature doesn't exist yet (no CSV rows in production), there is no migration risk. Log in DRI as a resolved non-issue.**

### Standards compliance

Conforms to all foundational standards:

- **Financial-table write posture**: `POST /api/accounts` and `POST /api/accounts/[id]/import` both use the service-role path (`ingestTransactions` already uses `createServiceSupabase()`); no authenticated-role write to financial tables.
- **AAL2 gating**: both new route handlers call `getAal2UserId()` (the established pattern, per every existing Route Handler in `app/api/aggregation/`).
- **Client-server boundary**: `CsvImportWizard` and `ManualAccountForm` use `fetch('/api/...')` not a server import — follows the `recordTransactionsFiltered` pattern.
- **RLS**: `financial_accounts` already has the owner-SELECT policy; the new rows are written by the service role and immediately visible to the user under their existing `financial_accounts_select_own` policy.
- **No PII in logs / summaries**: the CSV import route logs `{ inserted, superseded, removed }` counts only, never descriptions or amounts.
- **Expand-only migration**: `0020_financial_accounts_kind.sql` widens a check constraint — additive, no destructive alter, zero-downtime.
- **No foundational-stack deviation**: papaparse is a client-side utility; CSV import is anticipated in ADR-002 (the "Account aggregation" Stack row explicitly names it); no amendment required.

### Cost / capacity / vendor lock-in

- **Zero new variable cost.** No new aggregation API calls, no new managed service, no new vendor.
- **CSV row count bound**: the import route handler caps inbound JSON at 10,000 rows per request (corresponds to ~2 MB of normalized JSON — within Vercel's body size limit). Large CSV files should be split; this is a UX constraint to document in the wizard.
- **No new lock-in** beyond the existing Supabase/Vercel stack.
- **papaparse bundle impact**: ~4 kB gzipped (client-side only, code-split behind the wizard route); negligible.

## Alternatives considered

| Option                                                                                  | Pros                                                                                                                                                                  | Cons                                                                                                                                                                                                                                      | Why not chosen                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chosen** — client-side CSV parse (papaparse) + structured POST to the ingest pipeline | Browser does the heavy I/O; server receives only normalized rows; wizard can show a live preview before sending; serverless function never holds a raw file in memory | Adds a client-side dependency; column mapping complexity sits in the client                                                                                                                                                               | —                                                                                                                                                                                       |
| **Alt A — server-side CSV parse (multipart/form-data upload)**                          | Single network round-trip                                                                                                                                             | The raw CSV file (potentially MBs) streams through the Vercel serverless function — memory pressure + timeout risk; the wizard can't preview without a round-trip; server must understand all possible CSV formats                        | Rejected: violates the Vercel serverless memory/timeout posture for large files; the preview step requires client-side awareness of the parsed data before the user confirms            |
| **Alt B — OFX/QFX parser**                                                              | More structured format; fewer parsing ambiguities                                                                                                                     | Higher implementation cost; narrower institution coverage; fewer users export OFX today vs CSV                                                                                                                                            | Rejected per PM DRI (2026-06-28): CSV first; OFX deferred to post-MVP based on support ticket volume                                                                                    |
| **Alt C — Unified cross-currency conversion (exchange rate API)**                       | Single spending surface across all currencies                                                                                                                         | Requires an exchange rate API (new foundational-stack service + rate storage + "as of" UX); larger scope than A+B combined; user need not validated                                                                                       | Rejected per PM DRI (2026-06-28): region isolation first; conversion is Phase 2; the brief explicitly scopes this out                                                                   |
| **Alt D — Extend `SpendingTxn` and filter in the pure compute (not at the read layer)** | Filtering co-located with computation                                                                                                                                 | Pure compute functions (`buildBudgetRows`, `buildCategorySpendChart`, etc.) gain a new `currency` dimension they don't otherwise need; breaks the established pattern where reads pre-filter and pure functions receive pre-scoped inputs | Rejected: the established read+pure-compute split puts filtering at the read layer (the `effectiveCategory` + `countsAsSpending` pattern); currency filtering belongs at the same layer |

## Consequences

**Positive:**

- Closes the structural coverage gap for Apple Card, Cash App, Venmo, and Plaid-unsupported credit-union users without any new vendor dependency.
- The `dedupKey` null-providerAccountId fix and `currency` propagation are correctness fixes that apply to ALL future CSV/manual sources — not specific to this bet.
- CSV import reuses the entire idempotent ingest pipeline (`dedup_key` + `content_hash` unique constraint) — re-importing the same file is a no-op, not a double-count.
- The two feature flags (`MANUAL_ACCOUNTS_ENABLED`, `MULTI_CURRENCY_ACCOUNTS_ENABLED`) allow independent rollout: USD manual accounts can ship before the currency-awareness fix is fully verified in production.
- Region isolation (per-currency surfaces) is a lightweight, reversible first step that defers the rate-API infrastructure to a validated Phase 2.

**Negative:**

- Adding `currency` to `SpendingTxn` and filtering in every spending read adds a query predicate across four app-layer reads (budget, recap, dashboard-spend, anomaly scan). Each read must be updated consistently — a missed update would silently produce wrong totals for multi-currency users (mitigated: WLT-27-1's regression suite covers each path).
- The `CsvImportWizard` column-mapping step is unavoidably complex UX — every bank exports CSV differently. The Apple Card preset reduces friction for one bank; others accumulate from support tickets (DRI Risk 2 in the brief).
- The anomaly scan user-listing fix (including manual-account-only users) extends the scan fan-out — slight Inngest compute increase, but negligible given typical user counts at this stage.
- `papaparse` adds a client-side bundle dependency. Code-split behind the wizard route, so impact on initial load is zero.

**Reversibility: medium.** The schema changes (constraint widening) are additive and easily reversible if no `investment`/`other` rows exist. The `SpendingTxn.currency` addition is backwards-compatible (the pure compute functions are unchanged). The feature flags make the surface independently reversible. The `dedupKey` fix is a one-way change (but correct — the old behavior of `null` stringifying to `"null"` in the key was a bug, not a feature).

## Test strategy

- **Unit (`@wealth/core`, Engineer):** Regression suite for WLT-27-1: verify `buildBudgetRows`, `computeMonthlySeries`, `buildCategorySpendChart`, and `detectAnomalies` produce identical results for a USD-only `SpendingTxn[]` before and after the `currency` field is added. Unit tests for `dedupKey` with `providerAccountId = null` (must produce `'manual'` segment, not `'null'`); idempotent re-import (same rows → same `dedup_key` → `inserted = 0` on second call).
- **Integration / API (Engineer):**
  - `POST /api/accounts` — creates a manual account; currency guard (rejects non-USD when `MULTI_CURRENCY_ACCOUNTS_ENABLED = false`); kind mapping (checking → depository stored, investment → investment stored); returns 401 on AAL1 session.
  - `POST /api/accounts/[id]/import` — rejects accounts with `connection_id IS NOT NULL`; idempotent re-import (two calls with same rows → second call returns `{ inserted: 0 }`); `dedup_key` stability across re-imports.
  - Budget read: `readSpendingForBudgets` with a mix of USD and EUR rows in the DB — confirms only USD rows are summed when `activeCurrency = 'USD'`.
  - Anomaly scan: a user with `connection_id = null` accounts is included in the scan fan-out after the user-listing fix.
- **Component (frontend, Engineer):** `CsvImportWizard` — file parsing (happy path + malformed CSV graceful error); column-mapping step renders detected headers; Apple Card preset auto-fires on matching header row; preview shows top-10 rows; confirm step calls the route handler and renders the result count; `ManualAccountForm` — all kind options map to correct DB value; currency picker disabled when `MULTI_CURRENCY_ACCOUNTS_ENABLED = false`; success triggers accounts list revalidation.
- **E2E (Codex handoff):**
  - Apple Card CSV fixture: upload → auto-preset → preview → confirm → verify N rows in `transactions` for the correct `financial_accounts.id` → re-import same file → `inserted = 0` (idempotency).
  - Multi-currency isolation: a user with USD account + EUR manual account sees only USD amounts on the budget page with the default currency context; switching the region switcher to EUR shows only EUR amounts; no cross-currency mixing in totals.
  - Manual account only: a user with no `account_connections` gets anomaly scan coverage (the user-listing fix is live).
  - Second-user isolation: the CSV import route returns 403/404 for an account owned by another user.
- **RLS (Codex):** `financial_accounts` rows with `connection_id = null` are visible to the owning user and invisible to any other authenticated user (default-deny policy already in place — verify it covers the null-connection-id rows explicitly).

## Rollout

- **Feature flags:**
  - `MANUAL_ACCOUNTS_ENABLED` (env, default off) — gates `ManualAccountForm` rendering and `POST /api/accounts`. Can ship before WLT-27-1 for USD-only accounts (the existing USD-only pipeline is unaffected by null `connection_id`).
  - `MULTI_CURRENCY_ACCOUNTS_ENABLED` (env, default off) — gates non-USD account creation (on both the API and form) and the `RegionSwitcher` UI. Must not be enabled until WLT-27-1 is verified in production (the regression suite from WLT-27-1 is the verification gate).
- **Migration:** `0020_financial_accounts_kind.sql` — expand-only constraint widen; OPS-2 auto-applies on deploy; verify constraint name on ephemeral PG first.
- **Backwards compatibility:** Required and maintained. `SpendingTxn.currency` is a new field — any consumer that destructures `SpendingTxn` without `currency` will need updating; these are all in `app/lib/` (not shared externally). Existing users with USD-only accounts see zero behavior change after WLT-27-1 (the added `.eq("currency", "USD")` filter matches all their rows).
- **Staged rollout:**
  1. WLT-27-1: currency-awareness fix + regression suite + anomaly scan user-listing fix (dark, no flag needed — it's a bug fix that applies to existing users without behavioral change). Land first.
  2. WLT-27-2: `MANUAL_ACCOUNTS_ENABLED` on — USD manual accounts live; validate with internal accounts.
  3. WLT-27-3 + WLT-27-4: CSV import API + wizard — internal test with an Apple Card export.
  4. WLT-27-6: Apple Card preset validated against a real iOS export (DRI Issue 2) — land the preset.
  5. WLT-27-5: `MULTI_CURRENCY_ACCOUNTS_ENABLED` on — only after WLT-27-1 regression suite passes in production.

## Open questions for Engineer

- **`financial_accounts` unique constraint behavior on `(null, null)`:** PostgreSQL unique constraints treat two NULLs as distinct rows — meaning multiple manual accounts per user are allowed. **Verify this on the ephemeral PG** before WLT-27-2; do not assume without confirmation (DRI Issue 4).
- **Apple Card CSV header:** The preset is based on Apple support doc HT211489. Before hardcoding it in `packages/aggregation/csv/apple-card.ts`, **validate against an actual iOS export** (DRI Issue 2). If the headers differ from the docs, the preset auto-detection will silently not fire.
- **CSV row count limit:** The route handler caps at 10,000 rows/request. If a user's Apple Card history exceeds this (Apple exports full account history on first export), the wizard should split the file and show multiple-batch progress. Design the wizard split-handling before WLT-27-4 ships.
- **`ingestTransactions` `kind` for CSV rows:** All CSV-sourced rows default to `kind = 'spend'` (as documented in `types.ts`). If the mapped column includes an `amount` that is credit-direction (refund, reimbursement), the `direction` will be `'credit'` — but `kind` stays `'spend'`. This is correct for budget purposes (credits reduce net spend) but may flag oddly in anomaly detection. Escalate if the anomaly scan produces spurious `large_charge` alerts on large refund rows.
- **`activeCurrency` surface for the app layer:** How is `activeCurrency` passed from the region switcher to RSC data reads? Two options: (a) URL search param `?currency=EUR` read from `searchParams` in the RSC — simple, shareable URL; (b) a session cookie — doesn't pollute the URL. Lean toward (a) for shareability and consistency with the existing `?month=` and `?category=` ledger params. Escalate before WLT-27-5 rather than guessing.

## DRI Log

### Decisions

- **[2026-06-28] [Architect]** Client-side CSV parsing + structured POST (not server-side multipart) — preserves the serverless memory/timeout posture; enables live preview; consistent with the client-server boundary rule. Alt A (server-side parse) rejected. Area: architecture. Reversibility: easy.
- **[2026-06-28] [Architect]** Currency filter at the app-layer read (not in pure compute) — consistent with the `effectiveCategory` + `countsAsSpending` precedent; pure compute stays pure. Alt D (filter in pure compute) rejected. Area: architecture. Reversibility: easy.
- **[2026-06-28] [Architect]** Expand `financial_accounts.kind` check constraint to add `investment` and `other` — allows manual-only account types without a separate table; the "Phase 1 only" comment in `AccountKind` was scoped to the Plaid provider type, not the DB schema. Area: data. Reversibility: easy (constraint widening is additive; rows only exist once the flag is on).
- **[2026-06-28] [Architect]** `dedupKey` null normalization: `t.providerAccountId ?? 'manual'` — consistent string segment regardless of whether the provider ID is absent. The prior behavior (`null` coercing to `"null"` in template literals) was a latent bug; since the CSV import feature doesn't exist in production yet, there are no rows to migrate. Area: data correctness. Reversibility: n/a (bug fix; no rollback needed).
- **[2026-06-28] [Architect]** No foundational-stack deviation; no `/setup-foundation-architecture` amendment — `papaparse` is a client-side parsing utility; CSV import was already anticipated in ADR-002. Area: standards. Reversibility: n/a.
- **[2026-06-28] [Architect]** Confluence/Jira mirroring skipped — neither MCP is connected on this host. Area: tooling. Reversibility: easy.

### Risks

- **[2026-06-28] [Architect] Currency-awareness regression for existing USD-only users** — the `.eq("currency", "USD")` predicate is a no-op for existing data, but a missed update in any of the four spending-read paths would silently produce wrong totals. Likelihood: low (all paths are listed; the regression suite is the gate). Impact: high (silent wrong spend totals undermine user trust and WAWU). Mitigation: WLT-27-1's regression suite verifies each path explicitly; `MULTI_CURRENCY_ACCOUNTS_ENABLED` stays off until the suite passes. Area: data integrity.
- **[2026-06-28] [Architect] Apple Card CSV format drift** — if Apple changes the export header format, the auto-detection preset silently doesn't fire and the user falls back to manual column mapping. Likelihood: low (Apple CSV export has been stable). Impact: low (wizard still works; just no auto-mapping). Mitigation: DRI Issue 2 (validate before hardcoding); document the preset header in a comment so future drift is auditable. Area: operational.
- **[2026-06-28] [Architect] CSV row batch limit creates a poor UX for large history imports** — a user's 3-year Apple Card history may exceed 10,000 rows. Likelihood: medium (Apple exports full account history). Impact: low (user uploads in multiple batches; idempotency prevents double-counting). Mitigation: the wizard must show the limit and offer to split; idempotent ingest means re-importing overlapping rows is safe. Area: UX/operational.

### Issues

- **[2026-06-28] [Architect] Verify `financial_accounts.kind` constraint name on ephemeral PG before migration** — severity: low — owner: Engineer — status: open — area: data. The inline check constraint defaults to `financial_accounts_kind_check`; confirm before `DROP CONSTRAINT IF EXISTS`. Per the WLT-25 discipline.
- **[2026-06-28] [Architect] Apple Card CSV header must be validated against a real iOS export** — severity: low — owner: Engineer — status: open — area: implementation. Inherited from brief DRI Issue 2. Do not hardcode the preset in `packages/aggregation/csv/apple-card.ts` until confirmed against an actual export.
- **[2026-06-28] [Architect] Confirm PostgreSQL `unique(null, null)` behavior on `financial_accounts`** — severity: medium — owner: Engineer — status: open — area: data. The `unique(connection_id, provider_account_id)` constraint should permit multiple `(null, null)` rows (PostgreSQL treats two NULLs as distinct in a unique index). Verify on ephemeral PG before WLT-27-2 ships; if the constraint rejects the second manual account, add a partial unique index or remove the nulls-equal-nulls behavior.
- **[2026-06-28] [Architect] Inherited from brief: `dedupKey` null providerAccountId must be verified** — severity: medium — owner: Engineer — status: open — area: implementation. Tracked in WLT-27-3 AC; the fix is specified above.
- **[2026-06-28] [Architect] Inherited from brief: Plaid link-failure instrumentation not yet in place** — severity: medium — owner: Engineer — status: open — area: demand validation. Without Plaid link-error event tracking, we cannot measure the size of the coverage-gap cohort benefiting from WLT-27. Add as a parallel track to WLT-27-2.

---

_Status: proposed. Flip `status: proposed → status: approved` here and set the brief frontmatter `architecture_status: approved` when ready. Do not self-approve — this halts at the HITL gate._
