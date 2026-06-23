---
id: WLT-25
type: feature
status: approved
priority: P2
parent: WLT-24 # the sibling transaction-overlay; shares the transaction_flags substrate
portfolio_stub: false
depends_on: [WLT-24] # the transaction_flags overlay table + the orthogonality discipline
parallel_with: []
architecture_required: true
architecture_status: approved
created: 2026-06-23
author: PM
sources:
  - operator dogfooding (the WLT-23 ledger) — the planned second overlay (memory transaction-overlays-followup-subscriptions)
key_metric:
  name: Follow-up loop completions (flags resolved, not just created)
  baseline: 0 # new capability
  target: operator flags >=5 transactions AND resolves >=3 within the window (used + acted on, not write-only)
  source: funnel events (transaction_followup_flagged / transaction_followup_resolved)
guardrails:
  - name: Orthogonality invariant (no cross-axis leak)
    threshold: marking/resolving a follow-up changes NO category / budget / spend / subscription state (guard test green)
  - name: Ledger read performance
    threshold: the flagged-filter/list read stays paginated (readAllPaged) — no IN()-overflow, no ledger latency regression
  - name: Survives Plaid CDC re-sync
    threshold: a follow-up flag persists across a transaction revision (dedup_key-keyed), proven by the gated E2E
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [frontend, backend, data]
estimate:
  duration_weeks: 1
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-23
---

# Follow up on a transaction — flag a charge to deal with later

## Problem

Looking at the ledger, the user repeatedly hits charges they can't resolve in the moment — one they don't recognize, a possible duplicate, something to dispute or return, a "remember to cancel this," a "ask my partner about this." Today there's nowhere to **park that intent against the specific charge**: they either act immediately (often they can't) or they lose it in the scroll. The transaction is the unit of the question, but the ledger has no way to say "come back to this one."

## User

The operator dogfooding the shipped app (and, generalizing, any user reviewing their transactions) — the same person who marks subscriptions and corrects categories. The job-to-be-done: **"I'm reviewing my activity and I need to set this charge aside to deal with later, without losing track of it."**

## Why this matters

This is the **deliberately-planned second half of the transaction-overlay pair** (the first was Subscriptions, WLT-24). Both were designed to ride **one shared substrate** — the `transaction_flags` table — precisely so the second overlay is nearly free: the table, the owner-CRUD RLS, the `dedup_key` survival property, the ledger-row mark affordance, and the orthogonality discipline are all already built and shipped. Shipping follow-up now **amortizes that substrate investment** and completes the "see · find · correct · _track_" loop on the ledger (WLT-22 correct, WLT-23 see/find, WLT-24 subscriptions, WLT-25 follow-up). It also re-proves the substrate generalizes (a second `flag_type` on the same table, orthogonal to the first) — de-risking any future overlay.

## Hypothesis (the bet)

If we let the user **flag any transaction "follow up" from the ledger row (and mark it done)**, plus **see all their flagged transactions in one place**, then a reviewing user will **capture and close out the charges they need to act on** — measured by **follow-up flags created AND resolved** reaching the target within 30 days (the loop closing, not flags marked and forgotten).

## Defensibility (optional)

Modest but real: a second overlay on the shared substrate **increases workflow embedding** — the ledger becomes the user's working surface for _acting on_ their money, not just viewing it, which raises switching cost incrementally. It also generates proprietary signal (which charges users flag) that could later inform smarter surfacing. Not a primary moat play.

**Moat impact (one line):** Incremental — deepens ledger-as-workspace embedding; not a standalone moat.

## Scope

### In scope

- **Schema:** one expand-only migration widening `transaction_flags.flag_type` from `in ('subscription')` to `in ('subscription','followup')` (the column was built to admit this; OPS-2 auto-applies). No change to `transactions`/`categories`/`budgets`.
- **Mark / resolve** a follow-up from the **WLT-23 ledger row popover** (reuse the generic `extraActions` slot): "Follow up" → upsert `transaction_flags(flag_type='followup', source='user')` keyed by `dedup_key`; "Done" → resolve. AAL2-guarded route + a funnel event, mirroring WLT-24-1.
- **A per-row indicator** on the ledger (like the subscription ★) showing a charge is flagged.
- **See flagged transactions in one place** — a **filter on the existing ledger** ("Follow-ups") and/or a small dedicated list (the exact surface is a story decision), owner-scoped, paginated (`readAllPaged`).
- **Orthogonality preserved** — a follow-up never touches a charge's category, budget, spend, or subscription state; a charge can be all of these at once. The WLT-24 orthogonality guard is extended to cover the follow-up path.
- Survives Plaid CDC re-sync (dedup_key-keyed), proven by a gated E2E.

### Out of scope

- **Auto-detection / AI suggestions** of what to follow up on (manual-only — a flag is a flag).
- **Notifications / reminders / due-dates** on a follow-up (a later fast-follow if demand shows).
- **Notes / free-text** attached to a flag (same — fast-follow if demand shows).
- Anything beyond mark / resolve / view (no bulk ops, no sharing, no export).

## Open questions for Researcher

- **"Resolve/done" semantics — the load-bearing design call (for `/create-bet-architecture`):** hard-delete the flag (manual-only, no detector to fend off — a clean delete is simplest) **vs.** soft-delete via the existing `dismissed_at` column (keeps a "resolved" history and an "open" vs "done" distinction the user could filter). Lean **hard-delete** unless a "resolved history" / "done filter" is wanted. Resolve at architecture.
- **The view:** a ledger filter ("Follow-ups") vs. a dedicated nav surface vs. both — story-level decision; lean filter-on-the-ledger (cheapest, reuses WLT-23-2).

## Research findings

_PM/Researcher note:_ the substrate is shipped and proven across WLT-24's four slices — `transaction_flags` (owner-CRUD RLS, `dedup_key`-keyed, `unique(user_id, dedup_key, flag_type)`, `source`, `dismissed_at`), the ledger-row `extraActions` popover slot, the `readAllPaged` owner read (the FIX-2026-06-22 IN()-overflow lesson), and the AAL2-route + funnel-event patterns. The only net-new primitives are the widened `flag_type` constraint and the `'followup'` literal (referenced nowhere in code/docs today). Risk is low and almost entirely in re-using shipped patterns correctly + holding the orthogonality invariant.

## User pain input (from Support)

_Operator-as-first-user:_ surfaced directly while dogfooding the ledger — charges that need a second look with nowhere to park the intent.

## Stories

_Decomposed one at a time via `/create-story WLT-25` after approval._

## DRI Log

### Decisions

- [2026-06-23] [PM/operator] **Reuse the `transaction_flags` substrate (new `flag_type='followup'`), not a new table** — rationale: the table was explicitly designed for this second overlay; a new `flag_type` + the widened check constraint reuses the shipped RLS / survival / surface / orthogonality patterns wholesale — area: data/architecture — alternatives: a dedicated follow-ups table (rejected — duplicates the substrate), a column on `transactions` (rejected — not orthogonal, pollutes the provider-owned table) — reversibility: easy
- [2026-06-23] [PM] **Manual-only, mark/resolve/view — no detection, notes, reminders, or due-dates this bet** — rationale: a flag is the smallest useful unit; prove the capture→resolve loop is used before adding weight; notes/due-dates are clean fast-follows on the same row — area: scope — alternatives: ship notes+reminders now (rejected — over-build before demand) — reversibility: easy
- [2026-06-23] [PM] **architecture_required: true** — rationale: a schema change (widened constraint) + a new overlay axis + the resolve-semantics decision + the orthogonality invariant warrant an architecture pass, even though it's small and pattern-heavy — area: process — reversibility: n/a

### Risks

- [2026-06-23] [PM] **Write-only adoption** — the user flags charges but never resolves them, so the flag becomes clutter — likelihood: medium — impact: low — mitigation: the metric requires _resolutions_, not just creations; the view makes open flags visible to act on; keep the gesture one tap — area: product
- [2026-06-23] [PM] **An orthogonality regression couples the flag to category/budget/subscription** — likelihood: low — impact: medium — mitigation: extend the WLT-24 orthogonality guard to the follow-up path; the read never crosses axes — area: correctness
- [2026-06-23] [PM] **Scope creep toward notes/reminders/due-dates** — likelihood: medium — impact: low — mitigation: explicitly out of scope; revisit as a fast-follow only if the loop-completion metric shows demand — area: scope

### Issues

- [2026-06-23] [PM] **Resolve-semantics (hard-delete vs `dismissed_at` soft-delete) unresolved** — severity: low — owner: Architect (`/create-bet-architecture`) — status: open — area: data — the one real design call; lean hard-delete unless a resolved-history/done-filter is wanted.

---

_Approved by: operator on 2026-06-23._
