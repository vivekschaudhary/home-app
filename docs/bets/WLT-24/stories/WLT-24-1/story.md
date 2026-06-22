---
id: WLT-24-1
bet: WLT-24
type: story
status: shipped
priority: P2
created: 2026-06-21
author: PM
design_link: docs/bets/WLT-24/stories/WLT-24-1/design.md
area_tags: [frontend, backend, data, spending]
dependencies:
  - WLT-23   # the ledger row + its reused picker/popover (the mark entry point)
  - WLT-22   # normalizeMerchant + the dedup_key-keyed saved-overlay pattern
---

# See your subscriptions — mark a recurring charge, see the monthly weight

## Description

The manual-first first slice of the Subscriptions bet. From the **Transactions ledger** (WLT-23), the user **marks a recurring charge as a subscription** (and can unmark it) — reusing the in-row popover they already know. A new top-level **Subscriptions** surface (replacing the "Coming soon" stub) then shows their marked subscriptions grouped by merchant, each with its **typical amount + inferred cadence**, and a **headline monthly + annualized total** — making the quiet weight of recurring spend visible at last. The mark is the user's own, keyed to the stable `dedup_key` so it **survives Plaid re-syncs**, and it's an **overlay orthogonal to category** — marking a subscription never changes the transaction's category, budget, or spend/transfer classification. Auto-detection is deferred to the next story (the `SubscriptionDetector` seam). See [WLT-24 architecture](../../architecture.md).

## Acceptance Criteria

- [ ] **AC1 — schema (migration `0015_transaction_flags.sql`):** a new owner-CRUD `transaction_flags` table — `(id, user_id, dedup_key, flag_type, source, created_at, updated_at)`, `flag_type check in ('subscription')` (admits `followup` later), `source not null default 'user' check in ('user','auto')`, `unique (user_id, dedup_key, flag_type)`, index `(user_id, flag_type)`, 4 owner RLS policies on `auth.uid() = user_id`, **hard-delete** on unmark, **no composite FK**. Expand-only; OPS-2 auto-applies. No change to `transactions`/`categories`/`budgets`.
- [ ] **AC2 — mark / unmark from the ledger (reuses the WLT-23 popover):** a ledger row's existing in-row popover gains a **"Mark as subscription"** action (and **"Unmark"** when already marked) — `POST /api/subscriptions/mark {dedupKey}` upserts `transaction_flags(flag_type='subscription', source='user')`; unmark hard-deletes it. AAL2-guarded, `runtime="nodejs"`, discriminated `{ok}|{ok:false,error}`. Emits `subscription_marked` server-side once. The row reflects the marked state on success (no optimistic revert).
- [ ] **AC3 — the Subscriptions view (replaces the stub):** `app/(app)/subscriptions/page.tsx` lists the user's marked subscriptions grouped by **`normalizeMerchant`**, each row showing merchant · typical amount · inferred cadence · monthly-equivalent, with a **headline "$X / month · $Y / year"**. Owner-scoped read, **paginated** (`readAllPaged` — the guardrail). Emits `subscriptions_viewed` once per view (fire-and-forget). The **nav** item flips from `coming_soon` to live.
- [ ] **AC4 — cadence + total compute (pure, `@wealth/core/subscriptions.ts`):** `summarizeSubscriptions(markedTxns) → { subscriptions, monthlyTotal, annualTotal }` — group by normalized merchant; **typical amount = median**; **cadence inferred from the median day-interval** at ≥2 occurrences (monthly ≈ 26–35d, weekly ≈ 5–9d, annual ≈ 350–380d, else `irregular`); **1 occurrence ⇒ `pending`**. The headline `monthlyTotal` sums the monthly-equivalents of subscriptions with an **inferred** cadence; `pending`/`irregular` are **listed but excluded from the normalized headline** (so the number stays honest). `annualTotal = monthlyTotal × 12`.
- [ ] **AC5 — orthogonality (the load-bearing invariant):** marking/unmarking a subscription does **not** change the transaction's category, its budget contribution, or its WLT-22-5 `counts_as_spending`. The Subscriptions read is a **separate surface** — it does not flow through the category resolver, and the budget/recap/anomaly readers are untouched (a subscription is still real spend, still counted there).
- [ ] **AC6 — survives a Plaid CDC re-sync:** because the flag is keyed by the invariant `dedup_key`, a re-synced revision of a marked transaction stays marked (the WLT-22 survival property) — proven by the gated E2E.
- [ ] **AC7 — honest states:** loading; **empty** (no marks → a plain "mark a recurring charge from your transactions" nudge linking to the ledger, never fake rows); mark **saving** (`aria-busy`) / success / discriminated error + retry; a **cadence-pending** row labelled honestly. The headline total renders only real, inferred figures.

## Standard Experience Checklist

- [x] **Navigation** — Subscriptions is a top-level nav surface (the placeholder flips live, AC3); the mark/unmark action lives in the WLT-23 row popover with its existing dismiss/cancel; the empty state links back to the ledger — covered by AC2, AC3, AC7.
- [x] **States** — loading / empty (no marks) / marking-saving / success / discriminated error+retry / the cadence-pending row — covered by AC2, AC7.
- [x] **Feedback** — mark + unmark success toasts ("Marked as a subscription" / "Removed from subscriptions"); discriminated errors (network/validation/server); the headline total is the at-a-glance feedback — covered by AC2, AC7.
- [x] **Accessibility** — the mark control carries a screen-reader label ("Mark {merchant} as a subscription" / "Remove {merchant} from subscriptions"); focus stays managed in the reused popover (WLT-23 pattern); the Subscriptions list + totals have a table/list semantics + an accessible total label — covered by AC2, AC3 (detailed in design.md).
- [x] **Edge cases** — a single-occurrence subscription (cadence `pending`, excluded from the normalized headline — AC4/AC7); unmark removes it from the view live (AC2); offline/slow on mark → discriminated error + retry (AC2/AC7); an `irregular`-cadence charge listed but not normalized (AC4); a marked transaction re-synced by Plaid stays marked (AC6) — covered by AC4, AC6, AC7.
- [x] **Cross-surface consistency** — single web surface: `n/a — web only`. The load-bearing consistency is the **orthogonality invariant** (the subscription flag never alters the budget/category/spend surfaces), enforced by AC5.

## Tech notes

Build on the WLT-24 architecture. Reuse, don't rebuild:
- **Migration `0015`** mirrors `0011_categories.sql`'s owner-CRUD/RLS/hard-delete shape (no composite FK — `transaction_flags` is self-contained). Verify on an ephemeral Postgres before PR (the WLT-22-5 discipline).
- **Mark entry point:** the WLT-23 `TransactionsClient` row already exposes `dedupKey` and renders a popover (the reused `CategoryPicker` path) — add the mark/unmark action there; do NOT build a new control. A transaction's current marked-state comes from the same flagged-read (or a lightweight per-page flagged-set).
- **Reads/writes:** a shared `transaction_flags` reader in `@wealth/db` (works under RLS + service client, like `readCategoryAssignments`); `readSubscriptions(client, userId)` paginates the flagged txns then hands them to the pure `summarizeSubscriptions`. Mark/unmark writers + the AAL2 routes mirror the WLT-22-2 recategorize route.
- **Pure compute** in `@wealth/core/subscriptions.ts` (+ 2 funnel events in `funnel.ts`); the cadence bands + median logic are unit-tested at the boundaries.
- **Out of scope (this story):** auto-detection (the `SubscriptionDetector` impl — next story); the `followup` flag (separate bet); cancel/reminder/price-alert features; the budget-drill mark entry point (ledger row only this slice).

## PRs

_Auto-populated as PRs open._

## Tests

- **Engineer:** unit (`summarizeSubscriptions` — grouping, median amount, cadence bands incl. boundaries, pending/irregular excluded from the headline, monthly/annual normalization); component (mark/unmark from the ledger row → POST/DELETE + state; the Subscriptions view renders list + totals + empty + cadence-pending; a11y focus); the orthogonality guard (marking does not touch the category/budget path); seed/migration logic.
- **Codex (separate handoff):** the RLS suite for `transaction_flags` (owner CRUD, cross-tenant deny, hard-delete, no forged cross-tenant flag) + the gated real-path E2E (mark a recurring merchant from the ledger → it appears in Subscriptions with the right cadence/total → survives a re-inserted CDC revision → second-user isolation).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-21] [PM] **Slice 1 = substrate + mark-from-ledger + the view; detection is the next story** — rationale: ships the user-controllable surface + the shared `transaction_flags` substrate cheaply and proves demand before the detector; matches the brief's manual-first decision — area: scope — alternatives: bundle detection (rejected — heavier, defeats manual-first) — reversibility: easy
- [2026-06-21] [PM] **Ledger row is the only mark entry point this slice** — rationale: it's the natural "I recognize this recurring merchant" moment and reuses the WLT-23 popover with zero new control; the budget-drill entry point can fast-follow — area: ux — alternatives: also the budget drill (deferred) — reversibility: easy
- [2026-06-21] [Engineer→Codex BLOCKER] **The mark action lives INSIDE the reused WLT-23 row popover, via a generic `extraActions` slot on the shared `CategoryPicker`** — rationale: the engineer first shipped a standalone star toggle (to avoid coupling the shared picker), but Codex blocked it as a deviation from AC2/architecture (it dropped the popover's keyboard/focus/dismiss); the generic slot satisfies AC2 AND keeps the picker subscription-agnostic (budget passes none) — area: ux — alternatives: standalone toggle (rejected by review), subscription-specific picker props (rejected — couples the shared component) — reversibility: easy
- [2026-06-21] [PM] **`pending`/`irregular` excluded from the normalized headline total** — rationale: a single charge or an erratic one would distort the monthly figure; listing them honestly while keeping the headline to confidently-inferred cadences keeps the number trustworthy — area: product/compute — alternatives: include at face value (rejected — misleading) — reversibility: easy

### Risks
- [2026-06-21] [PM] **Manual marking burden suppresses adoption** (the bet's central risk) — likelihood: medium — impact: medium — mitigation: keep the mark a single tap in the existing popover; the bet metric makes manual-vs-detect falsifiable → prioritize the detection story if adoption is low — area: product
- [2026-06-21] [PM] **An orthogonality regression double-counts or mis-routes the flag through the budget/category path** — likelihood: low — impact: medium — mitigation: AC5 + the orthogonality guard test; the subscription summary never uses the category resolver — area: correctness
- [2026-06-21] [PM] **Cadence inference wrong on sparse history** — likelihood: medium — impact: low — mitigation: ≥2-occurrence rule + tolerant bands + the honest `pending` label + headline exclusion — area: data

### Issues
- [2026-06-21] [PM] **Detection precedence (don't re-flag an unmarked txn) is a next-story concern** — severity: low — owner: Engineer (detection story) — status: open — area: architecture — slice 1's `source` column reserves it; no handling needed while only `'user'` writes exist.

---

**SHIPPED, 2026-06-21 — PR #89** (squash `6f58636`). The `transaction_flags` overlay + the pure cadence/total compute + mark-from-the-ledger (in the reused popover) + the Subscriptions view (nav flipped live). Migration 0015 verified end-to-end on an ephemeral Postgres. Codex review CLEAN after two BLOCKERs were resolved pre-merge: (1) the mark action moved into the reused row popover via a generic `extraActions` slot (it had shipped as a standalone toggle); (2) Codex's `transaction_flags` RLS suite + gated real-path E2E landed (their handoff, committed to the branch). The RLS suite (owner CRUD · hard-delete · cross-tenant deny · forged-insert WITH CHECK) passes in CI's live-PG job + was re-verified locally against a real Postgres (24 RLS tests); the gated E2E (mark 3 charges → `$15.49/mo · $185.88/yr` → CDC-revision survival → second-user isolation) run locally. Full gate green: lint · typecheck · 287 tests · build. **CLEAR tied to HEAD `6f58636`.**

**Next slice:** the detection fast-follow — the `SubscriptionDetector` impl (Plaid recurring behind a swappable adapter, or a custom detector — the deferred elicitation), auto-setting `source='auto'` flags as a signal the user overrides.

_Story under bet: docs/bets/WLT-24/brief.md_
