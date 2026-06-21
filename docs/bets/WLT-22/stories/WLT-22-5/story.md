---
id: WLT-22-5
bet: WLT-22
type: story
status: ready
priority: P1
created: 2026-06-20
author: PM
design_link: docs/bets/WLT-22/stories/WLT-22-5/design.md
area_tags: [spending, budget, categorization, data, correctness]
dependencies:
  - WLT-22-2   # the saved-assignment model + the shared resolver this builds on
  - WLT-22-3   # "remember this merchant" rules — reused for recurring payments
---

# Transfers & payments don't count as spending

## Description

Today every budget/spending number is **inflated**: the spending computes count **every debit regardless of category**, so a credit-card purchase is counted once (on the card) and the **payment of that card from checking is counted again** as a `TRANSFER_OUT`/`LOAN_PAYMENTS` debit — same dollars, twice — plus internal transfers count as spending. On the operator's account that's ~37% inflation (≈ $99,980 of ≈ $266,937/yr). This story makes the numbers **honest**: a protected, auto-populated **"Transfers & Payments"** category that does **not** count as spending. It's correct on day one with zero user action (transfers + card payments are auto-assigned to it from Plaid's tags), it's **visible and undeletable** (the user can see what was set aside and trust the exclusion), and the user can move any transaction in or out — with the WLT-22-3 "remember this merchant" rules handling recurring payments so there's no ongoing hand-sorting. See [INC-2026-06-20 triage](../../incidents/INC-2026-06-20-spending-double-count/triage.md).

## Acceptance Criteria

- [ ] **AC1 — schema (migration):** `categories` gains `counts_as_spending boolean not null default true`; the `source` check is extended to allow `'system'`; the **delete RLS policy forbids deleting a `source='system'` category** (an authenticated `delete` on the protected category fails the policy). Migration is expand-only; existing rows default `counts_as_spending = true` (no behavior change for any non-transfer category).
- [ ] **AC2 — protected category seeded (idempotent):** on first budget load each user gets **exactly one** protected category **"Transfers & Payments"** (`source='system'`, `kind='discretionary'`, `counts_as_spending=false`). Re-loading never creates a duplicate; the category cannot be deleted by the user (AC1) and is not offered in the "add a category" / recategorize-destination pickers as a normal spend category but IS offered as the explicit "exclude" target.
- [ ] **AC3 — auto-assignment is a SIGNAL-driven default, never a verdict (default-correct, non-destructive):** transfers and credit-card payments are auto-assigned to the protected category by writing `transaction_categories(assigned_by='system')` for every matching transaction that has **no existing `'user'` assignment** — matched on the **normalized `kind ∈ {transfer, payment}`** (see AC8), NOT on raw Plaid strings in core. **`LOAN_PAYMENTS` other than CC-payment (mortgage/auto/student) classifies as `spend` and stays spending.** Runs on first load over history AND on sync for new rows. Paginated past the 1000-row cap. The auto-assignment is a provider *signal* setting a default — the human's override (AC5) is the final, persisted outcome ([[providers-signal-human-decides]]).
- [ ] **AC8 — normalized `kind` seam (region-pluggable):** transfer/payment classification lives at the **provider-adapter boundary**, not in `packages/core`. `NormalizedTransaction` gains a normalized `kind` (`spend | transfer | payment | income | fee`); the **Plaid adapter** (`packages/aggregation/plaid/map.ts`) maps Plaid's `personal_finance_category` (incl. the **detailed** key, available at ingest) → `kind` — the only place that knows `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` means "payment." Core/budget logic and the auto-assignment key off `kind`, never a provider taxonomy string. A future non-US adapter (TrueLayer/Tink/…) maps its own taxonomy → the same `kind`s with zero changes to budget logic. Existing rows backfill `kind` from the stored provider `category` via the same classifier.
- [ ] **AC4 — every spending surface excludes it (the reconcile):** `computeMonthlySpending`, `computeMonthlySeries` (year-spread), `computeRecommendedBudgets`, and `typicalMonthlyTotal` in `packages/core/budget.ts`, **plus** `app/lib/recap.ts` and `packages/jobs/recap/anomaly-scan.ts`, all drop categories where `counts_as_spending=false`. The resolution guard test is extended so every grouping reader is proven to honor the flag. Result on the operator's account: the budget monthly/annual total drops by the transfer/payment amount (the ~$100k/yr).
- [ ] **AC5 — user override wins + survives re-sync:** the user can move a transaction **out** of "Transfers & Payments" into a spending category (it counts again) and **into** it (it stops counting). A `'user'` assignment overrides the auto `'system'` one, wins over later auto-assignment, and survives a Plaid CDC re-sync (keyed on `dedup_key`). "Always categorize {merchant} this way" (WLT-22-3/4) works for recurring payments.
- [ ] **AC6 — visible, transparent surface:** the budget view shows "Transfers & Payments" as a **distinct, clearly-labelled non-spending group** — its total is shown but plainly marked excluded from spend, separated from the budgetable rows — so the user can see (and drill) what was set aside rather than it vanishing silently.
- [ ] **AC7 — gentle review nudge (non-blocking):** when transfers were auto-set-aside, a **dismissible** nudge tells the user how many and links to review/adjust. It never blocks the budget view; dismissing it leaves the (correct) exclusion in place.

## Standard Experience Checklist

- [x] **Navigation** — the review nudge is dismissible (AC7); the in/out move control opens a picker with Esc/click-away/cancel and the drill has a close/back, reusing the WLT-22-2 picker (AC5, AC6) — covered by AC5, AC6, AC7.
- [x] **States** — loading (budget view spinner, unchanged), empty (`n/a` for the protected group when the user has **no** transfers → the group + nudge simply don't render — AC6/AC7), auto-assigning/seeding (idempotent, silent — AC2/AC3), move saving (`aria-busy`)/success/error (AC5), nudge shown/dismissed (AC7) — covered by AC2, AC3, AC5, AC6, AC7.
- [x] **Feedback** — move success ("Moved to Transfers & Payments — excluded from spending" / "Moved to {category} — counts as spending again"); discriminated errors (network/validation/server) with retry on the move; auto-assignment is silent-but-reviewable via the nudge, never a destructive surprise (it never overwrites a user choice — AC3) — covered by AC5, AC7.
- [x] **Accessibility** — focus moves into the move-picker on open and returns to the trigger on close; keyboard nav (tab/Enter/Esc) on the picker + nudge; the non-spending group + the exclude toggle carry screen-reader labels ("excluded from spending") — covered by AC5, AC6 (detailed in design.md a11y section).
- [x] **Edge cases** — no transfers at all → no protected group, no nudge (AC6/AC7); a transfer the user already manually categorized as spending is **left alone** (AC3/AC5); the `LOAN_PAYMENTS` boundary (CC-payment excluded, mortgage/auto kept — AC3); offline/slow on the move action → standard discriminated error + retry (AC5); >1000 transfers paginated (AC3) — covered by AC3, AC5, AC6, AC7.
- [x] **Cross-surface consistency** — single web surface (no mobile/native): `n/a — web only`. The load-bearing consistency here is **across the three grouping readers** (budget · recap · anomaly), which AC4 + the resolution guard enforce — covered by AC4.

## Tech notes

Build on the WLT-22-2 saved-assignment model + shared resolver (`docs/bets/WLT-22/architecture.md`). The exclusion is an **additive flag on an existing axis** — it does not touch `transactions.category` (Plaid's) and reuses the `dedup_key`-keyed `transaction_categories` write path, so it survives CDC re-sync for free.

- **Migration `0014_category_spending_flag.sql`** (expand-only): `alter table categories add column counts_as_spending boolean not null default true`; extend the `source` check to `('seed','custom','system')`; replace `categories_delete_own` with `using (auth.uid() = user_id and source <> 'system')` so the protected category is undeletable at the DB boundary. (OPS-2 auto-applies on deploy.)
- **Predicate thread (mirror `readCategoryKinds`/`isEssential`):** add `readCategorySpendingFlags(userId) → Map<name, boolean>` in `app/lib/categories.ts`; thread a `countsAsSpending(name: string): boolean` (default `true` for unknown names) into all four `packages/core/budget.ts` computes and into recap + anomaly — the same shape WLT-22-2 used for `isEssential`. The pure compute keeps grouping by string; it just skips non-spending keys. Extend `category-resolution.guard.test.ts` to assert each reader references the flag.
- **`kind` seam (AC8 — region alignment).** Add `kind: 'spend'|'transfer'|'payment'|'income'|'fee'` to `NormalizedTransaction` (`packages/aggregation/core/types.ts`). The **Plaid adapter** (`packages/aggregation/plaid/map.ts`) computes it from `personal_finance_category` — and because the adapter runs at ingest it has the **detailed** key, so it distinguishes a CC-payment (`LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` → `payment`) from a mortgage (`LOAN_PAYMENTS_*` → `spend`) cleanly. Persist `kind` on `transactions` (in the `0014` migration) so it's available to reads + backfill; **backfill existing rows** by running the same pure classifier over the stored provider `category`. Keep the classifier a pure function the adapter owns — `packages/core` and `app/lib` branch on `kind`, never on a Plaid string. The principle: providers emit a signal, the adapter normalizes it, the human overrides it ([[providers-signal-human-decides]], [[external-tools-must-be-pluggable]]).
- **Seed + auto-assign** in the existing `ensureSeededCategories` path (`app/lib/categories.ts`) + the sync job: seed the one `source='system'` "Transfers & Payments" category; auto-assign every transaction with `kind ∈ {transfer, payment}` and **no `'user'` row** by writing `transaction_categories(assigned_by='system')`; **paginate** the read (`readAllPaged`, the FIX-2026-06-20c helper). Extend the `assigned_by` check to include `'system'`.
- **Precedence (signal → human-decides):** `'user'` > `'system'` (auto) — a user override always wins, is never clobbered by re-seeding or sync, and persists across CDC re-sync (keyed on `dedup_key`). Mirrors the `overrideUserAssignments` discipline from FIX-2026-06-20. The auto-assignment encodes the provider *signal*; the user's choice is the stored *truth*.
- **Out of scope (this slice):** changing recap/anomaly's *uncapped main reads* (the separate logged FIX-2026-06-20c follow-up) — the engineer MAY fold the one-line `readAllPaged` swap in while touching those files, but it is not an AC here. A user-defined arbitrary "exclude this custom category from spending" toggle beyond the protected bucket — defer unless trivial once the flag exists.

## PRs

_Auto-populated as PRs open._

## Tests

- **Engineer:** unit (`countsAsSpending` predicate: excluded drops from each compute; default-true for unknown), integration-style (budget total + year-spread + recap + anomaly all drop the transfer amount — the reconcile), component (the non-spending group renders + drills; move in/out POST + optimistic-safe refetch; nudge shown/dismissed; a11y focus), seed/auto-assign logic (idempotent seed; transfers assigned, CC-payment assigned, mortgage NOT assigned, existing `'user'` row untouched), the extended AC4 resolution guard.
- **Codex (separate handoff):** the RLS suite for the new column + protected-category semantics (owner can't delete `source='system'`; can't forge `counts_as_spending`); the gated real-path E2E — seed transfers + a card payment + a mortgage payment → budget total/year-spread/recap exclude the transfers+CC-payment but keep the mortgage → user moves one payment back to a spend category → it counts again and survives a re-inserted CDC revision → second-user isolation.

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-20] [PM] **Scope WLT-22-5 to the exclusion mechanism (protected auto-seeded "Transfers & Payments" category), UI on the budget surface only, compute exclusion on all three readers** — rationale: the smallest slice that makes the core number honest end-to-end without violating the AC4 cross-surface guardrail; the recap/anomaly UI is unaffected (they just stop counting) — area: scope — alternatives: budget-only compute (rejected — recap/anomaly would still double-count, surfaces disagree); a full user-defined per-category exclude UI (deferred — bigger, not needed to fix the bug)
- [2026-06-20] [PM] **`LOAN_PAYMENTS` (non-CC) defaults to count as spending** — rationale: mortgage/auto/student is real outflow, not a double-count; only the CC-payment leg is the duplicate — area: product — alternatives: exclude all loan payments (rejected without user opt-in; the user can still override per-transaction)
- [2026-06-20] [PM] **Auto-assign by default + "remember" rules for recurring, not manual assignment** — rationale: 100+ existing rows + every future payment make manual sorting recurring friction; default-correct with override honors [[user-first-intent-first]] + [[user-categories-are-source-of-truth]] — area: UX — alternatives: manual-assign bucket (rejected — friction), hidden per-row flag (rejected — less transparent than a visible protected category)
- [2026-06-20] [operator/Architect] **Build the normalized `kind` seam now (AC8) — classify transfer/payment at the provider-adapter boundary, never branch core on Plaid strings** — rationale: WLT-22-5 is the first feature to branch domain logic on provider taxonomy; Plaid is US-strong but fails other regions, so a non-US adapter (TrueLayer/Tink) must be able to drive the same exclusion by emitting `kind` — keeps us [[external-tools-must-be-pluggable]] and encodes [[providers-signal-human-decides]] (provider signal → human-overridable default) — area: architecture — alternatives: key off Plaid codes in core + refactor before international (rejected — compounds the coupling the bet would otherwise add); a full aggregator-abstraction bet now (deferred — the `kind` seam is the only part WLT-22-5 forces) — reversibility: easy (additive field + pure classifier)

### Risks
- [2026-06-20] [PM] **CC-payment vs mortgage (both `LOAN_PAYMENTS` at the primary level)** — RESOLVED by the AC8 `kind` seam: classification runs in the Plaid adapter at ingest where the **detailed** category is available, so the CC-payment leg is distinguished cleanly; the residual risk is only existing rows whose stored `category` is primary-only → backfill falls back to keeping `LOAN_PAYMENTS` as `spend` (mortgage-safe) and the user can still exclude a stray CC-payment manually — likelihood: low — impact: low — mitigation: kind-at-ingest going forward + user override on history — area: data
- [2026-06-20] [PM] **A transfer Plaid mis-tags slips through (counts as spending) or a real expense is mis-tagged as transfer (wrongly excluded)** — likelihood: low — impact: low — mitigation: the visible protected group + the review nudge + per-transaction override are the backstop; the seed is best-effort, not load-bearing — area: data
- [2026-06-20] [PM] **Surfaces disagree if the flag isn't threaded everywhere** — likelihood: medium — impact: high (the brief's #1 guardrail) — mitigation: the extended AC4 resolution guard fails the build if any grouping reader skips the flag — area: correctness

### Issues
- [2026-06-20] [PM] **recap + anomaly main transaction reads remain uncapped** (FIX-2026-06-20c follow-up) — severity: medium — owner: Engineer — status: open — area: scale (may be folded in opportunistically while wiring exclusion into those files)

---

_Story under bet: docs/bets/WLT-22/brief.md_
