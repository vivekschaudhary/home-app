---
id: FIX-2026-06-20b-rule-apply-1000-row-cap
type: fix
bet: WLT-22
story: WLT-22-3
status: in-review
severity: P1
reported_by: operator (dogfooding)
created: 2026-06-20
area_tags: [spending, categorization, data, scale]
---

> **Shipped:** PR #76 (squash `c24d211`), 2026-06-20 — paginated rule-apply reads + chunked upsert. Codex's gated >1000-row E2E ([e2e/transactions.spec.ts](e2e/transactions.spec.ts)) green. The systemic budget-read follow-up flagged below is now addressed in **[FIX-2026-06-20c](FIX-2026-06-20c-budget-read-1000-row-cap.md)** (`readSpendingForBudgets`, the drill, + the shared `readCategoryAssignments` resolver); recap + anomaly main reads remain a logged follow-up there.

# Fix: "remember the merchant" silently skips older rows on a >1000-transaction account (PostgREST 1000-row cap)

## Triage

- **Report:** recategorizing "Flc Dining → Education" with "remember" changed the 2026 rows but **not** the 2025 rows — identical merchant, no user overrides.
- **Severity:** **P1** — silent data-correctness bug; the feature appears to work (recent rows flip) but silently no-ops on older history, with no error. Hits every account with >1000 transactions.
- **Ground truth (operator SQL):** all FLC rows have **identical** `merchant = "Flc Dining"`, `merchant_entity_id = null`; 2026 rows `assigned_by = rule → Education`, 2025 rows **no assignment at all**. Total transactions on the account: **3839**.

## Root cause

`applyRulesToTransactions` reads the user's transactions to match them against the rules — with **no `.limit()` / no pagination**. PostgREST caps a response at **1000 rows**, so the read returns only ~1000 of the 3839 transactions. The backfill was newest-first, so the **2026 rows are inside the first 1000 (matched) and the 2025 rows fall outside it (never read → never matched)**. Re-trying can't help — they're never in the read window. Matching itself is fine (identical merchant), and the user-override layer is irrelevant (the 2025 rows had no assignment); the rows were simply never loaded.

This is why neither prior fix today helped: INC-2026-06-19 (fuzzy name) and FIX-2026-06-20 (override user choices) both operate on rows the matcher *sees* — but these rows were below the read cap.

## Fix

Read **all** matchable transactions, paginating past the 1000-row cap (`readAllPaged`, 1000-row `.range()` windows ordered by `dedup_key`), in both `applyRulesToTransactions` reads (transactions + the user-owned set). Also **chunk the upsert** (500/batch) so a high-frequency merchant over a long history can't blow a single request. No schema change.

## Verification

- Existing matcher unit suite unchanged + green (the matching logic was never the bug).
- Full gate: lint + typecheck + 255 tests + build.
- Codex (separate handoff): a gated real-path E2E that **seeds >1000 transactions** (incl. a same-merchant row beyond row 1000) → "remember" → the beyond-1000 row auto-categorizes through session→RLS→render; second-user isolation.

## ⚠️ Systemic follow-up (logged, NOT in this PR)

The same uncapped-read pattern exists in **other readers** and likely produces **wrong numbers on this 3839-transaction account today**:
- **`app/lib/budget.ts` `readSpendingForBudgets`** — reads ~400 days of transactions with no limit → capped at 1000 → **budget "spent this month / year-spread" totals undercount** for a heavy account. This is higher-impact than the rule bug (core product correctness) and should be its own fix/bet.
- **`packages/db/categories.ts` `readCategoryAssignments`** (the shared resolver) — uncapped; safe only while a user has <1000 saved assignments.
- **recap / anomaly** transaction reads — same audit needed.

Recommend a dedicated follow-on: a repo-wide audit of unbounded `transactions` / assignment reads + a shared paginated/bounded read helper (or push aggregation into SQL). Flagged for `/scan` + the architect.

## DRI Log

### Decisions
- [2026-06-20] [Engineer] **Paginate the rule-apply reads (no schema); flag the systemic uncapped-read issue separately** — rationale: the focused fix unblocks the reported P1 immediately and correctly (handles fuzzy matching, all history); the budget-read undercount is higher-impact but a distinct change deserving its own review — area: data/scale — alternatives: a stored normalized-merchant column + SQL `WHERE` filter (more efficient, but needs a migration + backfill — the proper follow-on the operator suggested) — reversibility: easy

### Risks
- [2026-06-20] [Engineer] **Budget totals are wrong NOW for >1000-txn accounts (the same cap)** — likelihood: high (confirmed-shape) — impact: high — mitigation: the systemic follow-up above; prioritize the budget read — area: correctness
- [2026-06-20] [Engineer] **Paged rule-apply reads all transactions per apply (3839 = 4 reads)** — likelihood: n/a — impact: low — mitigation: bounded + a deliberate action / periodic sync; the stored-key SQL filter is the efficiency follow-on — area: perf
