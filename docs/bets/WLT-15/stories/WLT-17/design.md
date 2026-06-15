---
bet: WLT-15
story: WLT-17
author: Designer
created: 2026-06-15
---

# Design: WLT-17 — "Where your money went" (spending vs. last week)

## Design intent

The recap's second "what changed" signal — the spending breakdown the user explicitly wanted ("where did the money go"). It answers, at a glance, *"how much did I spend this week, is that more or less than last week, and on what?"* — the same calm, plain, non-judgmental voice as the rest of the recap. It's a **display signal**, not a new action: it deepens the reason to return without competing with the one prompted action (the at-most-one-action guardrail holds). Real or absent — never a fabricated number.

## Surfaces & flow

A new **section inside the existing WLT-16 RecapCard** (not a new card) — the recap stays one cohesive "Since last time" surface. Order within the card:

```
[ Since last time ]
  • Up $420 since last week            ← movement (WLT-16)
  • Net worth $24,600
  ─────────────────────────────
  • Where your money went              ← NEW (WLT-17)
    Spent $1,240 this week · $180 less than last week
    Top: Groceries $420 · Dining $310 · Transport $190
  ─────────────────────────────
  • Toward your target  ███████░░ 68%  ← progress (WLT-16)
  [ Adjust your target → ]             ← the ONE action (unchanged)
```

Spending sits between movement and progress — the "what changed" cluster, then the "where you stand + your move." It appears only when the recap is visible (a running workflow exists) AND there's ≥1 week of spending to compare; otherwise it's quietly omitted or shows its honest cold-start line.

## States (every state ships)

| State | Trigger | What shows |
|---|---|---|
| **steady** | ≥1 debit this week and a prior week to compare | total spent this week + direction vs last week (in WORDS) + top 2–3 categories with amounts |
| **first-week / cold-start** | spending data exists for this week but no full prior week yet | this week's total only + an honest "we'll compare to last week once there's more history" — **no fabricated delta** |
| **no-spend** | no debits in the window | the section is **omitted** (don't show "$0 spent" as if it were an insight) |
| **loading** | recap resolving | covered by the recap card's existing skeleton (one card, one load) |

## Layout notes

- **Direction in WORDS, never color/arrow alone:** "$180 less than last week" / "$60 more than last week" / "about the same as last week" — a higher spend is plain fact, never a red alarm (an anxious user must not feel scolded for spending).
- **Top categories**: the 2–3 largest debit categories this week, each with its amount. Category labels come from the existing `transactions.category` (Plaid's primary category) — title-cased for display, never raw merchant strings (no PII).
- **No new CTA.** Spending is awareness; the single action remains the WLT-16 target action. (When a budget feature exists, a spending-spike could drive a "set a budget" action — a later slice; not now, to avoid a fabricated capability.)
- Numbers never the only signal — labels accompany; the section has an SR summary.

## Accessibility

- **Screen-reader summary** for the spending block: "Where your money went: spent {total} this week, {delta direction} than last week. Top categories: {cat} {amount}, …" — one labelled group.
- Direction conveyed in words (not color). WCAG AA contrast. No animation (reduced-motion safe — it's static text). No new interactive controls → no new focus/keyboard surface (the card's existing action is unchanged).

## Honest / reduced-design notes

- **Real or absent.** First-week shows this-week-only with an honest "no comparison yet" line; no-spend omits the section. Never a `$0` or a made-up delta.
- **Plain, not punitive.** Spending more than last week is stated neutrally — the product reflects, it doesn't judge.
- **Reconcile-on-load** (the #36 lesson): spending is read live each visit from the owner-scoped transactions; no stale props.

## DRI Log

### Decisions
- [2026-06-15] [Designer] **Spending is a section inside the existing RecapCard, not a new card** — rationale: keeps "Since last time" one cohesive surface; movement + spending are the "what changed" cluster — area: UX — reversibility: easy
- [2026-06-15] [Designer] **Display signal only — no spending-driven CTA this slice** — rationale: there's no budget feature to action into; a "set a budget" prompt would be a fabricated capability, and the at-most-one-action guardrail holds — area: UX/trust — reversibility: easy
- [2026-06-15] [Designer] **Direction in words, higher spend never alarmed** — rationale: the anxious persona must not feel scolded; consistent with the movement-line treatment — area: tone — reversibility: easy

### Risks
- [2026-06-15] [Designer] **Plaid category labels can be coarse/odd** (e.g. "GENERAL_MERCHANDISE") — likelihood: medium — impact: low — mitigation: title-case + humanize the primary category for display; it's directional, not accounting — area: data/UX

### Issues
- _none_
