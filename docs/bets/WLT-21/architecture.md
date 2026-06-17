---
id: WLT-21-ARCH
bet: WLT-21
status: approved
created: 2026-06-16
authors: [Architect, Enterprise/Solution Architect]
area_tags: [frontend, spending, budgets, data]
---

# Technical Design: Budget & Spending (set a budget per category; recommended vs actual)

## Decision

Ship **WLT-21-1** as: a new **owner-CRUD `budgets` table** (the `intents`/`goals` posture from `0004_intent.sql` — user-declared config, **not** the service-role-write financial posture of `transactions`); **recommended + this-month-actual computed on-read** from `transactions` via new sibling functions in **`packages/core/budget.ts`** (no rollup table, no new Inngest job); a **`/budget` page** that follows the proven Accounts read+mutate chain (RSC → `"use client"` island → client-lib fetch wrapper → API route guarded by `getAal2UserId()` → owner-RLS write); UI from `@wealth/ui` (`TextField` for the input + a semantic `<table>` built in-page, since no table primitive exists); **additive** funnel events. The feature **mounts** by flipping `NAV_SECTIONS` `budget.status → "live"` — **no env flag** (it's honest from first load via cold-start "—"). **No new dependency** — the charting library is entirely WLT-21-2's concern, so the foundational stack is untouched.

The three resolved open questions from the brief: **recommended = the user's own history** (median of trailing monthly totals, a modest discretionary trim — not income benchmarks, which we can't honestly compute); **percent budgets = % of the user's typical total monthly spend** (resolved to an effective dollar cap); **compute on-read**, not a pre-rollup.

## Context

- **The shell is ready (WLT-19/20).** `/budget` already exists as a stub (`app/(app)/budget/page.tsx` → `<ComingSoon section="budget" />`), is already **AAL2-gated** (the `(app)/layout.tsx` `requireAal2()` + `middleware.ts` `SHELL_PATHS`), and mounts by flipping one `NAV_SECTIONS` field. Zero shell rework.
- **The spending math exists + is honest.** `packages/core/recap.ts` has `computeSpendingComparison(txns, asOf)`, the `SpendingTxn`/`CategorySpend` types, `humanizeCategory()`, and the cold-start-returns-`null` discipline. `packages/core/anomaly.ts` has a `median()` helper + the per-category trailing-baseline pattern (group debits by category over a window, exclude a recent window). `app/lib/recap.ts` `readRecentSpending(userId)` is the owner-scoped read seam (`select direction, category, amount, occurred_on … where user_id = … and occurred_on >= cutoff`; RLS already hides `superseded_by`/`removed_at`).
- **Categories are Plaid PRIMARY strings** (`FOOD_AND_DRINK`, `RENT_AND_UTILITIES`, …), displayed via `humanizeCategory()`. No income/household data anywhere — the reason "recommended" is own-history.
- **The write-path convention is API routes** (not server actions): `getAal2UserId()` guard → validate → owner-RLS write → `{ok}`/`{error}` JSON (see `app/api/aggregation/connections/[id]/disconnect/route.ts`, `app/api/recap/action/route.ts`). Client wrappers are try/catch `{ok}|{error}` (`app/lib/aggregation-client.ts`).
- **Owner-CRUD precedent:** `intents`/`goals` (`0004_intent.sql`) are user-writable with 4 RLS policies; `transactions` (`0003_aggregation.sql`) is owner-SELECT + service-role-write. Budgets are config → the **intents posture**.

## Approach

### Components affected
- **New:** `supabase/migrations/0010_budgets.sql`; `packages/core/budget.ts` (+ `.test.ts`); `app/lib/budget.ts`; `app/lib/budget-client.ts`; `app/(app)/budget/BudgetClient.tsx` (+ `.test.tsx`); `e2e/budget.spec.ts`.
- **Edit:** `app/(app)/budget/page.tsx` (stub → real RSC); `app/(app)/nav.ts` (`budget.status → "live"`); `app/lib/copy.ts` (+`budget`/`budgetErrors`); `packages/core/funnel.ts` (+3 additive events); `supabase/tests/rls.test.ts` (+budgets suite); `.github/workflows/ci.yml` (apply `0010`).

**Compute (`packages/core/budget.ts`)** — pure, sibling to `recap.ts`/`anomaly.ts`, reusing `SpendingTxn`, `humanizeCategory()`, `median()`, `round2`, string-date math:
- `computeMonthlySpending(txns, asOf): Map<string, number>` — debits summed per category for the **current calendar month** (`asOf.slice(0,7)` → 1st…asOf). "This month so far."
- `computeRecommendedBudgets(txns, asOf): Map<string, number>` — per category, sum debits per **calendar month** across a **trailing ~6 months**, take the **median of those monthly totals** ("typical"); recommend `typical` for **essential** categories and `0.90 × typical` (modest 10% trim, the floor) for discretionary. **≥1 month of history required** → else no recommendation (honest "—"). Essentials cover BOTH taxonomies the mapper can emit (`personal_finance_category.primary` OR the legacy `category[0]` fallback — `map.ts`): `RENT_AND_UTILITIES, FOOD_AND_DRINK, GROCERIES, LOAN_PAYMENTS, MEDICAL, INSURANCE, TRANSPORTATION`. The "add a category" picker (`BUDGETABLE_CATEGORIES`) offers the spendable primaries + the documented `GROCERIES`/`INSURANCE`.
- `buildBudgetRows({ budgets, txns, asOf }): BudgetRow[]` — the view model: `{ category, label, recommended: number|null, actualThisMonth, budget: {amount}|{percent}|null, effectiveCap: number|null, status: "over"|"under"|"none" }`. Percent → `effectiveCap = percent% × (trailing-median total monthly spend)`; `status` compares actual to the cap. `null` category → "Other", never dropped.

**Page + write-path** (mirror `app/(app)/accounts/*`):
- `app/(app)/budget/page.tsx` — RSC: `requireAal2()` → `getBudgetView(userId)` → `<BudgetClient initialRows asOfMonth />`; `force-dynamic`; emit `BUDGET_VIEWED`.
- `app/lib/budget.ts` — `getBudgetView` (read `budgets` under RLS + `readSpendingForBudgets` = the `readRecentSpending` query widened to a trailing ~7-month window → `buildBudgetRows`); `saveBudgetForUser(userId, {category, limitAmount|limitPercent})` (validate exactly-one, upsert under RLS, emit `BUDGET_SET`); `clearBudgetForUser` (hard-delete — owner DELETE policy; soft-delete-via-RLS is impossible here, see data model — emit `BUDGET_CLEARED`).
- `app/api/budget/route.ts` — `runtime="nodejs"`; `GET` (reconcile-on-mount) + `POST` (save) + `DELETE`/clear; each `getAal2UserId()`→401, validate→400 `{error}`, return `{ok}`/`{rows}`.
- `app/lib/budget-client.ts` — `fetchBudget()`/`saveBudget()` try/catch `{ok}|{error}`.
- `app/(app)/budget/BudgetClient.tsx` — semantic `<table>`; inline edit with a **$/% segmented toggle** (`TextField type=number`); optimistic save + reconcile-on-mount (#36 discipline); `Banner`/`Toast`; over/under via a **labeled badge** (not color-only).

### Data model changes
`supabase/migrations/0010_budgets.sql` (additive / expand-only):
```
budgets (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,                 -- Plaid primary string (same key we humanize)
  limit_amount  numeric(20,4),            -- a dollar cap, OR…
  limit_percent numeric(5,2),             -- …a percent (exactly one set)
  period text not null default 'monthly' check (period in ('monthly')),
  created_at/updated_at, set_updated_at() trigger (from 0001),
  check ((limit_amount is not null) <> (limit_percent is not null))
)
unique (user_id, category)  -- one cap per category; clearing HARD-deletes
```
RLS (4 owner-CRUD policies, like `intents`): `select`/`insert`/`update`/`delete` own (`auth.uid()=user_id`). **No soft-delete:** a `deleted_at`-filtering SELECT policy makes an authenticated `update … set deleted_at` fail Postgres' UPDATE WITH-CHECK (the new row leaves the policy's visibility), so soft-delete-via-RLS is structurally impossible. Clearing a budget hard-deletes (the `delete` policy); a budget cap needs no audit trail. Save = upsert on `(user_id, category)`. **Recommended + actual are NOT stored** (computed from `transactions`).

### API / contract changes
- **HTTP (new):** `GET /api/budget` → `{rows: BudgetRow[]}`; `POST /api/budget` `{category, limitAmount?|limitPercent?}` → `{ok}`; `DELETE /api/budget?category=` → `{ok}`. All AAL2-guarded.
- **Funnel contract (additive):** `BUDGET_VIEWED:"budget_viewed"`, `BUDGET_SET:"budget_set"`, `BUDGET_CLEARED:"budget_cleared"` added to `packages/core/funnel.ts`. The contract is **additive-only** (no renames) — consistent with how WLT-16/18 added recap/anomaly events.

### Dependencies
**None added.** Reuses Supabase, `packages/core`, `@wealth/ui`, the existing page/route patterns. (Charting for the year-spread is WLT-21-2.)

## Enterprise/Solution Architect input

### Cross-system implications
- **New user-write posture.** `budgets` is the **first owner-CRUD financial-adjacent table the user writes directly**. RLS isolation is load-bearing → proven by the `rls.test.ts` budgets suite (owner CRUD incl. hard-delete clear; cross-tenant denied) + the gated real-path E2E. No new external service/runtime/data store.
- **Provider coupling (pluggability flag).** `category` keys on Plaid's primary taxonomy; a future aggregation-provider swap changes those strings. Mitigation: budgets key on the **same** category string we display + humanize; the normalized/finer-category mapping is the named follow-on seam (and the user-requested finer split). Logged as an Issue, not a blocker.

### Standards compliance
Owner-CRUD RLS matches the `intents`/`goals` standard; `set_updated_at()` trigger + `idx_*_user` match the migration convention; API-route mutation + AAL2 guard match the established write-path. Budgets hard-delete on clear (vs intents/goals' unused soft-delete) — a deliberate, documented divergence forced by the RLS UPDATE WITH-CHECK behavior. **No standards drift.**

### Cost / capacity / vendor lock-in
On-read compute adds one widened (~7-month) owner-scoped read per `/budget` load, served by `idx_transactions_user_occurred` — negligible. No vendor change. No lock-in beyond the already-accepted Plaid category coupling.

## Alternatives considered
1. **Pre-rollup table + daily job** (like `net_worth_snapshots`) — rejected for v1: on-read over the existing index is simple + always fresh; a rollup is premature optimization (logged as a deferrable perf Issue).
2. **Percent = % of the category's own typical spend** ("cut 20%" reduction model) vs. the chosen **% of total monthly spend** (allocation model, per the brief) — chose allocation; design confirms the copy makes the base unambiguous.
3. **Store budgets in `workflows.config` JSONB** (the reserved `budget_guardrail` archetype) — rejected: JSONB fits a single-category guardrail *action*, not a per-category table the user edits; a typed, RLS-testable table is the right model. The archetype can later **read** this table.

## Consequences

**Positive:** ships the budgeting surface on proven patterns; honest from first load (cold-start "—", never fabricated); no new dependency / no stack deviation; realizes the long-reserved `budget_guardrail` concept at page scale; the new compute functions are pure + table-test-friendly.

**Negative:** on-read compute repeats per page load (acceptable; indexed + cacheable later); category coarseness disappoints users wanting finer splits (named follow-on); the percent base needs unambiguous copy; the recommended heuristic (median + 10% trim) will want tuning against real usage.

**Reversibility:** easy — additive migration (new table), a self-contained page, and a `NAV_SECTIONS` flip that reverts by flipping back.

## Test strategy
- **Unit** (`packages/core/budget.test.ts`, table-driven like `recap.test.ts`): monthly-actual windowing; recommended = median-of-monthly-totals + essential/discretionary trim + floor; **cold-start → no recommendation**; percent→`effectiveCap` resolution; over/under status; `null`→"Other".
- **Component** (`BudgetClient.test.tsx`, jsdom): renders rows; $/% toggle; edit→save POSTs the right body (mock `fetch`); honest empty + "—"; reconcile-on-mount.
- **RLS** (`supabase/tests/rls.test.ts`, live PG in CI after `0010`): owner CRUD incl. **hard-delete clear**; **cross-tenant read/write/delete denied**; exactly-one-limit + per-category uniqueness.
- **Real-path E2E** (`e2e/budget.spec.ts`, `E2E_PASSKEY=1`-gated, Codex-owned): sign up → AAL2 → seed `transactions` via `SUPABASE_DB_URL` → `/budget` renders recommended + this-month actual → set a budget ($ then %) → reload → persists + over/under reads right (#36-class RSC→RLS→render).
- **Mechanical** (`[mechanical-output-verification]`): `0010` applies clean in CI; the 3 funnel events present.

## Rollout
Additive migration (expand-only, safe). **No env flag.** Mount = the `NAV_SECTIONS` status flip (reversible). Architect engages each WLT-21-1 PR for compliance; cross-model Codex owns the real-path E2E + security (RLS isolation) review.

## Open questions for Engineer
- Confirm the `transactions` read scope for `readSpendingForBudgets` (trailing 7 months gives ≥6 complete months for the median + the current partial month for "this month so far").
- Confirm the essential-category set against the actual Plaid primary values present in real data (adjust the allowlist if the strings differ).
- Percent copy: make "% of your typical monthly spending" unambiguous in `copy.md` (Design/UX Writer).

## DRI Log

### Decisions
- [2026-06-16] [Architect] **`budgets` is owner-CRUD (the intents/goals posture), not the financial service-role posture** — rationale: budgets are user-declared config, like goals; the user creates/edits them directly — area: data/security — alternatives: service-role-write (rejected — wrong model for user config), a generic preferences KV table (rejected — budgets are structured + need per-category uniqueness + RLS tests) — reversibility: medium
- [2026-06-16] [Architect] **Recommended = median of trailing monthly totals with a 10% discretionary trim (essentials untrimmed)** — rationale: honest own-history anchor (no income), reusing `anomaly.ts`'s median+window blueprint; the trim keeps it from rubber-stamping overspend without being aggressive — area: product/algorithm — alternatives: mean (rejected — outlier-sensitive), no trim (rejected — endorses overspend) — reversibility: easy
- [2026-06-16] [Architect] **Percent budgets resolve as % of the user's typical total monthly spend** (→ effective dollar cap) — rationale: the allocation mental model from the brief; without income this is the honest base — area: product — alternatives: % of the category's own spend (reduction model — noted for Design to weigh in copy) — reversibility: easy
- [2026-06-16] [Architect] **Compute recommended + actual on-read; no rollup table or job in v1** — rationale: the `idx_transactions_user_occurred` index makes the widened owner-scoped read cheap + always fresh; a rollup is premature — area: performance — reversibility: easy
- [2026-06-16] [Architect] **No env flag; mount via the `NAV_SECTIONS` status flip** — rationale: unlike recap (which needed a data warm-up window), budget is honest from first load via cold-start "—" — area: rollout — reversibility: easy

### Risks
- [2026-06-16] [Architect/EA] **Cross-tenant leak on the new user-writable `budgets` table** — likelihood: low — impact: high — mitigation: owner-CRUD RLS (verbatim from intents) + the `rls.test.ts` budgets suite (cross-tenant denied) + the gated real-path E2E, before merge — area: security
- [2026-06-16] [Architect] **Recommended heuristic feels wrong on real data** (too tight/loose, odd essentials) — likelihood: medium — impact: low-medium — mitigation: pure + table-tested so it's easy to tune; the essential set is a small, adjustable allowlist; observe via `budget_set` vs recommended — area: product
- [2026-06-16] [Architect] **Percent base ambiguity** — likelihood: medium — impact: low — mitigation: explicit copy ("% of your typical monthly spending"); consider $-only if testing shows confusion — area: ux

### Issues
- [2026-06-16] [EA] **Plaid-primary category coupling** — severity: low — owner: Architect — status: open — area: data — budgets key on the provider's category strings; the normalized/finer-category mapping (also the user's finer-split request) is the follow-on seam.
- [2026-06-16] [Architect] **On-read vs rollup** — severity: low — owner: Engineer — status: open — area: performance — revisit a monthly rollup only if the widened read shows up in p95.

_Approved by: Vivek on 2026-06-16 (via plan approval)_
