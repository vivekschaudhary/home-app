---
id: WLT-17
bet: WLT-15
type: story
status: in-review
priority: P1
created: 2026-06-15
author: PM
design_link: docs/bets/WLT-15/stories/WLT-17/design.md
copy_link: docs/bets/WLT-15/stories/WLT-17/copy.md
area_tags: [frontend, backend, data]
dependencies:
  - WLT-16   # the recap surface this section slots into
  - WLT-9    # the transactions this reads (debits + category)
---

# WLT-17 — "Where your money went" (spending vs. last week)

## Description

The recap's **second "what changed" signal**: how much the user spent this week, whether that's more or less than last week, and on what. It's the spending breakdown the user explicitly asked for ("where did the money go") and the deferred `spending_snapshot` archetype, delivered as a **display section inside the existing WLT-16 RecapCard** — one cohesive "Since last time" surface. Pure read + computation over the existing `transactions` (no new tables, no new job, no new write path). It's a **display signal, not a new action**: the single prompted action stays the WLT-16 target action (the at-most-one-action guardrail holds; a spending-driven "set a budget" needs a budget feature that doesn't exist yet — a later slice). Real or absent — never a fabricated number. Anomalies remain out (Slice 2).

## Acceptance Criteria

- [ ] **AC1 — Real spending comparison.** Spending is computed from the user's actual `transactions` — **debits only** (`direction='debit'`), this-week (last 7 days) vs the prior week (8–14 days ago), grouped by `category`. 100% from real data; 0 fabricated figures. Pure + unit-tested in `packages/core`.
- [ ] **AC2 — The display.** When there's spend this week and a prior week to compare, the recap shows: **total spent this week**, the **week-over-week delta in words** ("{amount} more/less than last week" / "about the same"), and the **top 2–3 categories** with amounts (humanized labels, not raw codes or merchants).
- [ ] **AC3 — Honest cold-start / empty.** First-week (spend exists but no full prior week) shows this-week-only + the honest "no comparison yet" line — **never a fabricated delta**. No debits in the window → the section is **omitted** (no "$0 spent" pseudo-insight).
- [ ] **AC4 — Display only, no second action.** The spending section adds **no CTA** — the recap still surfaces **exactly one** prompted action (the WLT-16 target action). The at-most-one-action guardrail is preserved.
- [ ] **AC5 — Owner-scoped + reconcile-on-load.** Spending is read **live** each visit under the user's RLS session (`transactions` owner-SELECT) — no stale props, no service-role on this path. Lives inside the recap behind `RECAP_ENABLED`.
- [ ] **AC6 — No PII.** Only amounts + humanized category labels reach the UI; **merchant/description never** surface, and no new event/log carries them.

## Standard Experience Checklist

- [ ] **Navigation** — `n/a — a display section on the existing /dashboard recap; no new route or navigable surface, no new controls` (AC4).
- [ ] **States** — steady (AC2), first-week/cold-start + no-spend-omitted (AC3), loading (covered by the recap card's existing skeleton — one card, one load): **AC2, AC3** + design States table.
- [ ] **Feedback** — `n/a — display only; no user action of its own, so no error/success/confirm path beyond the recap's existing one` (AC4).
- [ ] **Accessibility** — SR summary for the spending block (`a11y.spend`); direction in words not color; static text (reduced-motion safe); no new interactive controls → no new focus/keyboard surface: design "Accessibility" + copy `a11y.spend`.
- [ ] **Edge cases** — first-week (no prior week, AC3), no debits (section omitted, AC3), partial/odd Plaid category labels (humanized, design risk), reads only the last 14 days: **AC1, AC3** + design "Honest notes".
- [ ] **Cross-surface consistency** — `n/a — web-only at Phase 1 (foundational Stack: deploy_targets [web])`.

## Tech notes

Build within the WLT-15 bet architecture — **no foundational-stack deviation** (a read + computation over existing `transactions`; the architecture's Alt-D: on-the-fly query, no materialized view).

- **Domain (`packages/core/recap.ts`, pure):** add `computeSpendingComparison(transactions, asOf) → SpendingComparison | null` — this-week vs prior-week debit sums + by-category rollup + top-N + direction; returns null when there's no spend (omit) and a `comparable:false` shape for first-week (this-week-only). Add a small `humanizeCategory(raw)` helper (title-case Plaid primary). Reuse the `Movement`-style word-direction pattern.
- **Read (`app/lib/recap.ts`):** add a `readRecentSpending(userId)` (owner-SELECT `transactions`: `direction, category, amount, occurred_on` for `occurred_on >= today-14`, non-superseded/non-removed via the existing policy) and fold `spending` into `getRecap`'s `RecapView` (so the one read assembles the whole recap).
- **Surface (`app/dashboard/RecapCard.tsx`):** a spending section between movement and progress; strings verbatim from `copy.md`; SR summary; the action block unchanged.
- **No new migration, job, route, funnel event, or metric.** `RECAP_ENABLED`-gated (inherits WLT-16).
- **Carry the lessons:** reconcile-on-load; amounts/enums only (no merchant/description in UI or logs); the read stays owner-scoped (no service role).

## PRs

_Auto-populated as PRs open._

## Tests

_Engineer: unit (`computeSpendingComparison`: week windows, debit-only filter, category rollup + top-N, first-week `comparable:false`, no-spend → null; `humanizeCategory`), component (RecapCard spending section: steady / first-week / omitted-when-no-spend). Codex: extend the recap E2E — seed two weeks of debits → recap shows the comparison + top categories (real-path)._

Tags:
- `regression: true|false`
- `e2e: true|false`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-15] [PM] **Second WLT-15 slice = spending vs. last week (display), independent of the snapshot infra** — rationale: the deferred `spending_snapshot` + the breakdown the user wanted; its own query over `transactions`, no shared infra with WLT-16 → small, shippable, additive — area: scope — alternatives: bundle with anomalies (rejected — anomalies are the bigger Slice 2); a spending-driven action (rejected — no budget feature to action into) — reversibility: easy
- [2026-06-15] [PM] **Display only — no spending CTA this slice** — rationale: an honest action needs a budget capability that doesn't exist yet; the at-most-one-action guardrail holds; a budget-driven action is a future slice — area: scope/trust — reversibility: easy
- [2026-06-15] [PM] **On-the-fly query, no materialized view** (architecture Alt-D) — rationale: small per-user volume + the existing `(user_id, occurred_on desc)` index; defer materialization until proven slow — area: data — reversibility: easy

### Risks
- [2026-06-15] [PM] **Spending framed as judgment** could scold an anxious user — likelihood: medium — impact: medium — mitigation: direction in words, higher spend stated plainly (never red/alarm), no "overspent" language — area: tone
- [2026-06-15] [PM] **Plaid category coarseness** (odd primary labels) — likelihood: medium — impact: low — mitigation: humanize for display; it's directional awareness, not accounting — area: data

### Issues
- [2026-06-15] [PM] **Category humanization is best-effort** — severity: low — owner: Engineer — status: open — area: data — title-case the Plaid primary; don't build a category taxonomy this slice.

---

_Story closed: <date>, brief link: docs/bets/WLT-15/brief.md_
