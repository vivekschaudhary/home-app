---
id: FIX-2026-06-20c-budget-read-1000-row-cap
type: fix
bet: WLT-22
story: WLT-22-2
status: in-review
severity: P1
reported_by: operator (dogfooding)
created: 2026-06-20
area_tags: [spending, budget, data, scale]
---

# Fix: budget totals undercount on a >1000-transaction account (PostgREST 1000-row cap)

## Triage

- **Report:** operator follow-up to [FIX-2026-06-20b](FIX-2026-06-20b-rule-apply-1000-row-cap.md) — "lets fix the budget read 1000 row cap." The same uncapped-read pattern that silently skipped the rule-apply also drives the budget view.
- **Severity:** **P1** — core product correctness. The budget "spent this month" + 12-month year-spread silently **undercount** for any account over ~1000 transactions in the trailing window, with no error. Confirmed-shape on the operator's **3839-transaction** account (`readSpendingForBudgets` reads `TRAILING_DAYS = 400` days — well over 1000 rows).
- **Affected:** WLT-22-2 budget reads — `readSpendingForBudgets` (the view total + year-spread) and `readCategoryTransactions` (the drill-down). Plus the shared resolver `readCategoryAssignments`, which every grouping surface reads.

## Root cause

PostgREST caps any `.select()` response at **1000 rows** unless the query pages with `.range()`. Three reads on the budget path were uncapped:

1. **`app/lib/budget.ts` `readSpendingForBudgets`** — reads ~400 days of transactions, no pagination → only the first 1000 load → every budget total (this month + the year-spread) undercounts on a heavy account.
2. **`app/lib/budget.ts` `readCategoryTransactions`** (drill) — one month, debits only; lower-volume, but a >1000-debit month would list a truncated total that **disagrees with the (now paged) budget row** — breaking the AC4 reconcile (drill total must equal the row EXACTLY).
3. **`packages/db/categories.ts` `readCategoryAssignments`** (the ONE shared resolver) — its `transaction_categories` read was uncapped. A user with >1000 saved recategorizations would get a **truncated assignment map**, so budget/recap/anomaly/drill all silently fall back to Plaid's category for the dropped rows.

## Fix

Extracted the `readAllPaged` helper (introduced for the rule-apply fix in #76) into a shared `packages/db/paged.ts` — exported from `@wealth/db/paged`, now the one paginate-past-1000 primitive — and applied it to all three reads:

- **`readSpendingForBudgets`** — paged, ordered by `dedup_key` (stable + unique per user → windows tile cleanly).
- **`readCategoryTransactions`** — paged, ordered `occurred_on desc, dedup_key asc` (the secondary key makes it a total order; `occurred_on` alone has ties). Wrapped in try/catch so a db error still returns `{ ok: false }` — preserving AC3 (a failure must NOT masquerade as "no transactions"); `readAllPaged` throws on error rather than returning `{ error }`.
- **`readCategoryAssignments`** — the `transaction_categories` read paged (`categories` stays a single read — bounded, a handful per user).

`@wealth/db`'s rule-apply call sites (`applyRulesToTransactions`) now import the shared helper and pass a `"apply-rules"` label; behaviour unchanged. No schema change.

## Verification

- Full gate: **lint + typecheck + 253 tests + build**, all green.
- The AC4 resolution guard (`category-resolution.guard.test.ts`) still passes — the readers still route through `effectiveCategory` + `readCategoryAssignments`.
- Logic check: `readAllPaged` loops 1000-row windows until a batch returns < 1000, so the full ~400-day set loads; budget totals now reflect all rows. The drill's total order guarantees no boundary skip/dup.
- Codex (separate handoff): the gated real-path E2E — seed a budgetable category with >1000 transactions in the trailing window (incl. spend beyond row 1000) → the budget row total + year-spread reflect ALL of it through session→RLS→render; drilling the category lists every row and the drill total equals the row.

## ⚠️ Remaining (logged, NOT in this PR)

The shared resolver is now cap-safe, but the **main transaction reads** in the other two grouping surfaces are still uncapped:
- **`app/lib/recap.ts`** `readRecentSpending` (line ~178) — `.gte("occurred_on", since)`, no pagination.
- **`packages/jobs/recap/anomaly-scan.ts`** (line ~43) — same, under the service role.

Same `readAllPaged` swap; carved out to keep this PR scoped to the budget read the operator named. Recommend a dedicated `/scan WLT-22` sweep for any remaining unbounded `transactions` reads (the architect's stored-normalized-key + SQL-aggregation path is the longer-term efficiency answer).

## DRI Log

### Decisions
- [2026-06-20] [Engineer] **Fix all three budget-path reads (view + drill + shared resolver) in one PR; extract `readAllPaged` to a shared `@wealth/db/paged`** — rationale: the view total, the drill total, and the resolver map must agree (the AC4 reconcile); fixing only the view would leave a >1000-debit month's drill disagreeing and a >1000-assignment resolver truncating — area: data/scale — alternatives: paginate only `readSpendingForBudgets` (rejected — leaves the reconcile + resolver gaps), push aggregation into a SQL view/RPC (the efficiency follow-on; needs design) — reversibility: easy
- [2026-06-20] [Engineer] **Carve recap + anomaly main reads out to a follow-up** — rationale: keep this PR to the budget read the operator named; the shared resolver they depend on IS fixed here — area: scope — alternatives: fix all readers at once (larger, harder review) — reversibility: easy

### Risks
- [2026-06-20] [Engineer] **Paged budget read loads all trailing-window rows per /budget render (3839 ≈ 4 reads)** — likelihood: n/a — impact: low — mitigation: a read-path on an explicit page load; the SQL-aggregation path is the efficiency follow-on — area: perf
- [2026-06-20] [Engineer] **recap / anomaly totals still undercount on >1000-txn accounts** — likelihood: high (confirmed-shape) — impact: medium — mitigation: the "remaining" follow-up above; same one-line swap — area: correctness
