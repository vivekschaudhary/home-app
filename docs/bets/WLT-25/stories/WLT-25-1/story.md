---
id: WLT-25-1
bet: WLT-25
type: story
status: shipped
priority: P2
created: 2026-06-23
author: PM
design_link: docs/bets/WLT-25/stories/WLT-25-1/design.md
area_tags: [frontend, backend, data]
dependencies:
  - WLT-24     # the transaction_flags overlay + dismissed_at mechanics + the orthogonality guard pattern
  - WLT-23     # the ledger row popover (extraActions) + the filter plumbing (WLT-23-2)
---

# Flag a charge to follow up on — and see your open follow-ups

## Description

The first slice of the Follow-up bet: from the **Transactions ledger**, the user **flags a charge "Follow up"** (and marks it **"Done"** when handled) — reusing the in-row popover they already know — and a **"Follow-ups" filter** on the ledger shows their **open** flagged charges in one place. A follow-up is a **per-transaction** overlay (about *this* charge, not the merchant), keyed to the stable `dedup_key` so it **survives Plaid re-syncs**, and **orthogonal** to everything: flagging a charge never changes its category, budget, spend, or subscription state. "Done" is a **soft-delete** (`dismissed_at`) so a resolved follow-up is kept as history (the **Done view + re-open is the next slice, WLT-25-2**). See [WLT-25 architecture](../../architecture.md).

## Acceptance Criteria

- [ ] **AC1 — schema (migration `0017_transaction_flags_followup.sql`):** widen the `transaction_flags.flag_type` check constraint from `in ('subscription')` to `in ('subscription','followup')` — drop + re-add (`drop constraint if exists transaction_flags_flag_type_check` then add it widened). **Expand-only**, OPS-2 auto-applies; **verify the constraint name on an ephemeral Postgres** first (the WLT-22-5 discipline). No new table, no new column (`dismissed_at` exists), no change to `transactions`/`categories`/`budgets`.
- [ ] **AC2 — mark / resolve from the ledger (reuses the WLT-23 popover `extraActions`):** the row popover gains **"Follow up"** (and **"Done"** when already flagged) — `POST /api/transactions/followup {dedupKey}` upserts `transaction_flags(flag_type='followup', source='user', dismissed_at=null)`; `DELETE {dedupKey}` resolves by `update … set dismissed_at = now()` (soft-delete). **Per single `dedup_key` — no merchant fan-out.** AAL2-guarded, `runtime="nodejs"`, discriminated `{ok}|{ok:false,error}`. Emits `transaction_followup_flagged` / `transaction_followup_resolved` server-side once. The row reflects the new state on success (no optimistic revert).
- [ ] **AC3 — per-row indicator:** a ledger row with an **open** follow-up shows a small **"Follow up"** indicator (a tag/dot, like the subscription ★, visually distinct from it). The transactions read exposes an additive per-row **`isFollowup`** (an open-flagged-set read, mirroring `isSubscription`).
- [ ] **AC4 — see open follow-ups in one place:** a **"Follow-ups"** filter on the ledger shows the user's **open** flagged charges (`dismissed_at is null`), owner-scoped, **paginated (`readAllPaged`)** — composes with the existing WLT-23-2 account/category filters + search. Emits `followups_viewed` once per view (fire-and-forget). (Done/history + re-open is WLT-25-2.)
- [ ] **AC5 — orthogonality (the load-bearing invariant):** flagging/resolving a follow-up does **not** change the charge's category, budget contribution, spend/transfer classification, or subscription state — a charge can be a subscription AND flagged AND categorized at once. The follow-up read/write is a **separate path** that never flows through the category resolver. A new **`app/lib/followups.guard.test.ts`** asserts the follow-up files never reference the category/budget tokens (`effectiveCategory`, `readCategoryAssignments`, `counts_as_spending`, `countsAsSpending`).
- [ ] **AC6 — survives a Plaid CDC re-sync:** because the flag is keyed by the invariant `dedup_key`, a re-synced revision of a flagged transaction stays flagged — proven by the gated E2E.
- [ ] **AC7 — honest states:** loading; **empty** (no open follow-ups under the filter → a plain "nothing flagged — flag a charge from your transactions" message, never fake rows); mark/resolve **saving** (`aria-busy`) / success / discriminated error + retry; the row indicator + the filtered list reconcile on success.

## Standard Experience Checklist

- [x] **Navigation** — no new nav surface; the flag/resolve action lives in the WLT-23 row popover, and "see all" is a filter on the existing ledger — covered by AC2, AC4.
- [x] **States** — loading / empty (no open follow-ups) / saving / success / discriminated error+retry / the per-row indicator — covered by AC2, AC4, AC7.
- [x] **Feedback** — flag + resolve success toasts ("Flagged to follow up" / "Marked done"); discriminated errors (network/validation/server); the indicator + the Follow-ups count are the at-a-glance feedback — covered by AC2, AC7.
- [x] **Accessibility** — the flag/resolve control carries a screen-reader label ("Flag {merchant} to follow up" / "Mark {merchant} follow-up done"); focus stays managed in the reused popover (WLT-23 pattern); the indicator is text/labelled, not colour-only; the Follow-ups filter is a labelled control — covered by AC2, AC3, AC4 (detailed in design.md).
- [x] **Edge cases** — flagging a charge that's also a subscription leaves the subscription untouched (AC5); resolve removes it from the Open filter live (AC2/AC4); offline/slow on flag → discriminated error + retry (AC2/AC7); a flagged transaction re-synced by Plaid stays flagged (AC6); re-flagging a resolved charge re-opens it (clears `dismissed_at`, AC2) — covered by AC2, AC5, AC6.
- [x] **Cross-surface consistency** — single web surface: `n/a — web only`. The load-bearing consistency is the **orthogonality invariant** (the follow-up flag never alters the budget/category/subscription surfaces), enforced by AC5.

## Tech notes

Build on the WLT-25 architecture. Reuse, don't rebuild:
- **Migration `0017`** is a constraint widen — `drop constraint if exists transaction_flags_flag_type_check` + re-add `('subscription','followup')`. Verify the exact constraint name on an ephemeral Postgres before PR (it defaults to `transaction_flags_flag_type_check`).
- **DB layer** `packages/db/followups.ts` mirrors `packages/db/subscriptions.ts` but `flag_type='followup'` and **per single `dedup_key`** (no `merchantCharges` fan-out): `markFollowup` (upsert, clears `dismissed_at`), `resolveFollowup` (set `dismissed_at`), `readFollowupFlags` (open set, paginated). The mark/resolve mechanics are the shipped subscription dismissal pattern.
- **Route** `app/api/transactions/followup/route.ts` + **`app/lib/followups.ts`** mirror the WLT-24-1 mark route + lib (AAL2, discriminated, funnel emit once).
- **Ledger** reuse the `extraActions` popover slot (the subscription mark uses the same slot — pass a follow-up action alongside) + the WLT-23-2 filter plumbing for the "Follow-ups" filter; the read exposes `isFollowup` like `isSubscription`.
- **Funnel** 2–3 events in `packages/core/funnel.ts`.
- **Out of scope (this slice):** the **Done/history view + re-open** (WLT-25-2); notes / reminders / due-dates (the bet's out-of-scope); any merchant fan-out (follow-up is per-charge).

## PRs

_Auto-populated as PRs open._

## Tests

- **Engineer:** unit/db (mark → open flag; resolve → `dismissed_at` set + dropped from the open set; re-flag re-opens; `readFollowupFlags` returns only open; per-charge, no fan-out); component (flag/resolve from the ledger row → POST/DELETE + indicator state; the Follow-ups filter shows open rows + empty state; a11y focus); the **orthogonality guard** (`followups.guard.test.ts`); migration `0017` verified on an ephemeral Postgres.
- **Codex (separate handoff):** RLS for `flag_type='followup'` (owner CRUD + `dismissed_at` owner set/clear + cross-tenant deny — an extension of the generic `transaction_flags` suite) + the gated real-path E2E (flag a charge from the ledger → indicator + appears under the Follow-ups filter → resolve → drops from Open → survives a re-inserted CDC revision → second-user isolation).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-23] [PM] **Slice 1 = substrate + mark/resolve + indicator + the Open filter; Done/history + re-open is WLT-25-2** — rationale: ships the full capture→resolve loop cheaply (the Open filter reuses WLT-23-2), proving the second overlay works; the resolved-history surface is a clean fast-follow — area: scope — alternatives: bundle the Done view now (heavier), defer the filter (slice 1 then has no "see all") — reversibility: easy
- [2026-06-23] [PM/Architect] **Per-charge, not per-merchant** — rationale: a follow-up is about a specific transaction (a dispute, an unrecognized charge), unlike a subscription's recurring merchant series; mark/resolve operate on the single `dedup_key` — area: ux/data — alternatives: merchant fan-out (rejected — wrong unit) — reversibility: easy
- [2026-06-23] [PM] **"See all" = a ledger filter, not a new nav surface (this slice)** — rationale: cheapest, reuses the WLT-23-2 filter plumbing + keeps the flag in context with the rest of the ledger; a dedicated surface can come later if the filter proves too cramped — area: ux — alternatives: a dedicated Follow-ups nav surface (deferred) — reversibility: easy

### Risks
- [2026-06-23] [PM] **An orthogonality regression couples the flag to the budget/category/subscription path** — likelihood: low — impact: medium — mitigation: AC5 + the new `followups.guard.test.ts`; the follow-up read never uses the category resolver — area: correctness
- [2026-06-23] [PM] **Flag indicator clutters the dense ledger row (alongside the subscription ★)** — likelihood: low — impact: low — mitigation: a small, distinct, unobtrusive indicator, only on open-flagged rows — area: design

### Issues
- [2026-06-23] [Engineer] **Confirm the `flag_type` check constraint's exact name before the migration** — severity: low — owner: Engineer — status: open — area: data — verify on an ephemeral PG; use `drop constraint if exists` + re-add (the migration-verification discipline).

---

**SHIPPED, 2026-06-23 — PR #108** (squash `b45cdad`). The second transaction overlay, live: **migration 0017** (widen the `flag_type` check to `('subscription','followup')` — constraint name verified + `'followup'` insert/reject tested on an ephemeral Postgres), `packages/db/followups.ts` (per-charge `markFollowup`/`resolveFollowup`/`readFollowupFlags`, **soft-delete resolve** via `dismissed_at` — kept as history, re-flag re-opens), the AAL2 `/api/transactions/followup` route + lib + browser client + funnel events, and the ledger surface (a **"Follow up"/"Done"** action in the WLT-23 row popover — offered on credits too, vs subscriptions which are debit-only; a distinct **amber ⚑** indicator vs the subscription ★; a **"Follow-ups" filter (Open)** composing with the WLT-23-2 filters via the same bounded scan). Per-charge, orthogonal to category AND subscription (`followups.guard.test.ts`). **Codex review** raised two BLOCKERs — both its own handoff deliverables — resolved pre-merge: the `flag_type='followup'` RLS extension (owner CRUD + `dismissed_at` set/clear + cross-tenant deny) and the gated real-path E2E (flag → Open filter → resolve drops → CDC-survival → second-user isolation); each landed **uncommitted** and was committed with co-author (the recurring pattern). RLS re-verified on a real Postgres (CI recipe + 0017): **27/27** (+2 followup cases). Full gate: lint · typecheck · **330 unit tests** (+3 follow-up component tests + the guard) · build. **CLEAR tied to HEAD `ac137d1`.** _(Build note: the work had to be moved off a stray in-progress AAL2 branch onto a clean branch off main — left that branch/PR untouched.)_

**WLT-25 bet:** WLT-25-1 (flag/resolve + Open filter) shipped; the **Done/history view + re-open is WLT-25-2**.

_Story under bet: docs/bets/WLT-25/brief.md_
