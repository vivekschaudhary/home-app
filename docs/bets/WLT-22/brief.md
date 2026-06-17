---
id: WLT-22
type: feature
status: Approved
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-21]
parallel_with: []
architecture_required: true
architecture_status: pending
created: 2026-06-16
author: PM
sources:
  - "user feedback (2026-06-16) on the shipped WLT-21 Budget & Spending: 'I don't know if the numbers are correct — I can't see the categorized numbers. Rent + Utilities are grouped, so unless I know what was considered rent I can't make a clear decision.'"
  - "elicited (2026-06-16): (1) drill into a category to see its line items; (2) recategorize — targets = Plaid's finer taxonomy as a template + custom categories the user adds; a change 'remembers the merchant' (a rule), applying to past + future."
  - "design discussion (2026-06-17): the user's OWN categories are the source of truth — Plaid is a cold-start seed, never the authority. Data model: keep the provider category column + a STORED per-transaction user override (keyed by the stable dedup_key, so it survives Plaid's CDC re-syncs) + a STORED merchant-rules mapping → the effective category is resolved at read through one shared path."
  - docs/bets/WLT-21/brief.md
  - docs/foundation/product.md
key_metric:
  name: users can VERIFY + TRUST their budget numbers — they drill in, correct what's wrong, and still set/keep a budget
  baseline: 0 — today the budget table shows only rolled-up coarse-category totals with no line-item visibility and no way to correct a miscategorization
  target: of users who open /budget, a meaningful share drill into ≥1 category (verify); of those who hit a mis-tag, a meaningful share correct it; and budget-set + return rates hold or rise vs the WLT-21 baseline (trust → use, not abandon)
  source: new funnel events (category_drilldown_viewed · transaction_recategorized · category_rule_created) alongside the existing budget_set / budget_spread_viewed
guardrails:
  - name: A correction never silently corrupts the rest
    threshold: recategorizing a transaction updates the budget AND the recap (WLT-17) AND anomalies (WLT-18) consistently — category is read through ONE resolution path; no surface shows a stale or contradictory category
  - name: Re-sync never clobbers the user's intent
    threshold: a Plaid re-sync must NOT overwrite a user's recategorization / rule — the override survives (an override layer, not a destructive write to transactions.category)
  - name: The user's category is the authority, not Plaid's
    threshold: a user's category (their per-transaction override or merchant rule) ALWAYS wins; Plaid's category is only the cold-start default for a transaction the user hasn't touched; every surface (budget/recap/anomaly) reads the user-resolved category through ONE path
  - name: Honest line items
    threshold: the drill-down shows the user's REAL transactions (date, merchant, amount) — their own data on their own screen; no fabricated/rounded stand-ins, and the rolled-up total equals the sum of the line items shown
  - name: Don't over-build
    threshold: NO ML auto-categorization, NO splitting one transaction across categories, NO bulk editor beyond merchant rules — this bet is transparency + manual correction, not a categorization product
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [frontend, spending, budgets, data]
estimate:
  duration_days: 4-6
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-16
---

# WLT-22 — Budget transparency + category correction

## Problem

WLT-21 shipped a clean Budget & Spending surface — but the **categories are Plaid's coarse "primary" groups**: `Rent & Utilities` lumps rent + utilities, `Food & Drink` lumps groceries + restaurants + delivery, `General Merchandise` is all shopping. And the table shows only the **rolled-up number** with **no way to see the line items behind it**. The first real user hit the wall immediately: _"I don't know if the numbers are correct — unless I know what was considered rent, I can't make a clear decision."_ A budget you can't verify is a budget you can't set — and can't trust. There's also no way to **fix a miscategorization** (Plaid routinely mis-tags), so a wrong number stays wrong.

## User

The **Consumer persona (~80%)**, now in the **"I'm actually trying to use this"** moment — they've opened Budget & Spending and want to act, but can't because they can't see inside a number or correct it. Job-to-be-done: _"show me exactly what's in this category, and let me fix it when it's wrong, so the number is mine and I can trust it."_

## Why this matters

1. **Trust is the moat (product.md moat row 5), and this is the trust gap made concrete.** An unverifiable, uncorrectable budget reads as "a nice-looking guess." Letting users see the line items + correct them converts the budget from a demo into something they own.
2. **It's the difference between "looks great" and "I use it weekly."** Verification + control is the precondition for the budget to drive the return habit (WAWU) the engagement bet (WLT-15) is built on.
3. **Category correction compounds across the product.** Category feeds the budget, the recap's "where it went" (WLT-17), and anomalies (WLT-18). A correction the user makes once improves all three — proprietary, user-curated categorization data that a generic aggregator doesn't have.

## Hypothesis (the bet)

If we make the user's **own categories the source of truth** — Plaid demoted from authority to a cold-start _suggestion_ — and let them **drill into a category to verify its real transactions** and **recategorize** (per-transaction overrides + "remember the merchant" rules, starting from Plaid's coarse defaults and refined into the user's own categories), then they'll **verify, correct, own, and trust** their budgets — instead of bouncing off an opaque, provider-defined number. **Wrong if:** drill-down alone is enough and recategorization goes unused (then we over-built), or corrections create confusing ripples across recap/anomaly that erode trust rather than build it.

## Scope

### In scope (the bet) — sliced

- **Drill-down (verify).** Tap a category (or its amount) → the **line items** that make up the number: date, merchant, amount, for the current month (and within the year-spread, the month tapped). The rolled-up total equals the sum shown. Uses data we already store — **no re-sync**. _This alone answers "is the number correct."_
- **User-owned categories (Plaid is a seed).** The user's **own** categories are the source of truth. Plaid's coarse category is only the **default for a transaction the user hasn't touched** (the cold-start on-ramp, so a new user isn't staring at a blank slate). Users can define their **own** categories (e.g. split "Rent & Utilities" into Rent + Utilities). The budget table + recommendations operate on the user-resolved category.
- **Recategorize (overrides + merchant rules).** Change a transaction's category; the change can **remember the merchant** (a rule) and apply to **past + future** transactions from that merchant. A per-transaction override handles one-offs/exceptions.
- **The two-layer data model (the spine).** Keep `transactions.category` as the **immutable provider** value (Plaid's). Store the user's intent separately: a **per-transaction override keyed by the stable `dedup_key`** (so it survives Plaid's CDC re-syncs) + a **`category_rules` merchant→category mapping**. The **effective category is resolved at read** — override → rule → provider-default — through **one shared resolver** that budget, recap, and anomalies all call (so no surface disagrees). Persisted where the user's decisions live; derived where it's displayed.
- **Plaid `detailed` is now OPTIONAL.** Because the user defines their own splits, the finer Plaid `detailed` sub-category is a _nice cold-start seed_ for better defaults — **not a requirement**. Storing `detailed` + a backfill can be deferred or dropped; the bet no longer hinges on the heavy re-sync.

### Out of scope (explicit)

- **ML / automatic categorization** — manual correction only this bet.
- **Splitting a single transaction across categories** (e.g. a $200 receipt that's half groceries, half household) — later if wanted.
- **A bulk transaction editor** beyond merchant rules; **per-transaction one-off** overrides if the rules model already covers the need (architect's call).
- Multi-currency; editing amounts/dates/merchant (we only change the _category_).

## Open questions for Architect

- **(Lead decision) Store-the-decisions, resolve-the-display.** Confirm the spine: provider `transactions.category` (kept) + a **stored per-transaction user override keyed by `dedup_key`** + a stored **`category_rules`** mapping → the **effective category resolved at read** by one shared helper that budget/recap/anomaly all call. **Materializing** the resolved value onto a row is an _optional cache later_, not the source of truth — confirm (the staleness/consistency risk is why decisions are stored but the resolution is computed).
- **The one shared resolver:** where it lives (`packages/core`?), its precedence (override → merchant rule → provider default), and that every category read routes through it (no surface reads `transactions.category` raw).
- **Custom-category model:** a user-defined category table (owner-scoped); seeding/defaults; how the WLT-21 recommendation + essentials logic extends to user categories.
- **Retroactive ripple:** a correction changes past months → budget + recap + year-spread/anomalies shift. Confirm intended + consistent (it is the point) and that nothing caches a stale category.
- **Migration:** existing WLT-21 budgets are keyed on coarse primaries — how they map once categories are user-resolved.
- **(Optional / deferrable) Plaid `detailed` seed:** if we want finer _default_ categories, store `detailed` + backfill — but this is now optional (users define their own splits), so weigh whether it's worth the re-sync at all.

## Research findings

- **The data for drill-down already exists.** `transactions` stores `merchant` + `description` + `category` + `amount` + `occurred_on` per row (`0003_aggregation.sql`); the budget reads are already owner-scoped. So the verification slice needs **no new data + no re-sync** — only a read + a UI. (The drill-down is the highest-trust screen showing the user's own merchant data — same posture as the Accounts page.)
- **User-owned categories sidestep the heavy dependency.** Plaid's finer `detailed` field isn't stored today (`map.ts` keeps only `primary`), so using _Plaid's_ finer taxonomy would need a re-sync/backfill — but since the user defines their **own** splits, that backfill is now **optional** (a nicer cold-start default, not a requirement). The bet's heaviest risk is removed by the ownership reframe.
- **Category is read in three places** — budget (`packages/core/budget.ts` + `app/lib/budget.ts`), recap spending (WLT-17 `computeSpendingComparison`), anomalies (WLT-18). A correction must resolve through one path or the surfaces disagree — the load-bearing architectural constraint.
- **Industry-standard.** Every serious PFM (Monarch, Copilot, YNAB) has transaction drill-down + recategorization with merchant rules — it's table stakes for a budget users trust, which de-risks the pattern.

## User pain input (from Support)

`Direct operator/dogfooding feedback (2026-06-16) on shipped WLT-21: the user could not verify the budget numbers ("what was considered rent?") and therefore could not set a budget — the exact friction this bet removes. The proxy for every future user who opens Budget & Spending and doesn't trust the number.`

## Stories

_Decomposed via `/create-story WLT-22` (nested numbering), suggested:_

- **WLT-22-1 — Drill into a category** → see its real transactions (verify the number). No re-sync; ships fast; delivers the immediate trust win.
- **WLT-22-2 — User-owned categories + correction** → user-defined categories + recategorize (per-transaction overrides + merchant rules), all resolved at read through the one shared category resolver across budget/recap/anomaly (the stored-decisions / resolve-at-read spine from architecture). Plaid stays the cold-start default; its `detailed` seed is optional.

## DRI Log

### Decisions

- [2026-06-16] [User] **Recategorization targets = Plaid's finer taxonomy as a template, extensible with custom categories** (not move-between-coarse-only, not fully-custom-from-scratch) — rationale: Plaid detailed gives Rent-vs-Utilities for free as a sensible default; custom lets the user tailor — area: product — alternatives: move-between-existing-only (rejected — doesn't split the groups, the user's core complaint), fully user-defined (rejected as the sole model — heavier, no sensible defaults) — reversibility: medium
- [2026-06-16] [User] **A recategorization remembers the merchant (a rule), applying to past + future** — rationale: a recurring mis-tag shouldn't need re-fixing every month; rules are the PFM-standard model — area: product — alternatives: one-off per transaction only (rejected — repetitive for recurring merchants) — reversibility: medium
- [2026-06-16] [PM] **Slice drill-down FIRST, separately from correction** — rationale: drill-down alone answers "is the number correct" (the user's actual blocker), needs no re-sync, and ships fast; correction is the heavier, architecture-gated follow-on — area: scope — reversibility: easy
- [2026-06-16] [PM] **Corrections are an override LAYER, never a destructive write to `transactions.category`** — rationale: Plaid re-syncs would otherwise clobber the user's intent; the override must survive (a guardrail) — area: architecture/data — reversibility: medium
- [2026-06-17] [User] **The user's OWN categories are the source of truth; Plaid is a cold-start seed, never the authority** — rationale: a provider taxonomy is a fine abstraction for ingestion but wrong as the authority for how an individual budgets; ownership is the trust+control move — area: product — alternatives: Plaid-as-authority (rejected — the original problem) — reversibility: medium
- [2026-06-17] [User + PM] **Data-model spine: provider category column (kept) + a STORED per-transaction override keyed by `dedup_key` + a STORED `category_rules` mapping → effective category RESOLVED AT READ via one shared helper** — rationale: store the user's _decisions_ (durable, changeable intent — keyed by the stable txn id so re-syncs/CDC never clobber them) but _derive_ the displayed value through one path (so budget/recap/anomaly can't disagree, and a rule change instantly corrects history); a materialized column is an optional cache, not the truth — area: architecture/data — alternatives: materialize the resolved value on `transactions` (rejected as source-of-truth — staleness + CDC clobber; fine as a later perf cache), a column on `transactions` (rejected — the row churns on re-sync) — reversibility: medium
- [2026-06-17] [PM] **Plaid `detailed` backfill demoted from required → optional** — rationale: with user-owned categories, users define their own splits, so the finer Plaid sub-category is only a nicer cold-start default, not load-bearing; drops the bet's heaviest/riskiest dependency — area: scope/data — reversibility: easy
- [2026-06-16] [PM] **`architecture_required: true`** — rationale: a new data model (rules/overrides + finer taxonomy + custom categories), a re-sync/backfill, and a cross-cutting one-resolution-path constraint all need a design pass before stories — area: process — reversibility: n/a

### Risks

- [2026-06-17] [PM] **The `detailed` backfill / re-sync** — likelihood: low — impact: low (now **optional** — see decision; user-owned categories don't require it) — mitigation: ship drill-down (no re-sync) first; treat `detailed` as an optional cold-start seed, scoped in architecture only if we want it — area: data
- [2026-06-16] [PM] **A correction ripples confusingly across recap/anomaly** (past numbers shift) — likelihood: medium — impact: medium — mitigation: one shared category-resolution path; intended + consistent; no cached category; communicate the change in-UI — area: ux/correctness
- [2026-06-16] [PM] **Rules-engine edge cases** (conflicting rules, a merchant the user wants to split, exceptions) — likelihood: medium — impact: low-medium — mitigation: start with a simple last-write-wins merchant→category rule + a per-transaction override escape hatch; defer conflict UX — area: product
- [2026-06-16] [PM] **Scope creep into a full categorization product** — likelihood: medium — impact: medium — mitigation: the "don't over-build" guardrail — no ML, no split-transaction, no bulk editor — area: scope

### Issues

- [2026-06-16] [PM] **Migration of existing coarse-category budgets to the finer set** — severity: medium — owner: Architect — status: open — area: data — resolve in architecture (map a coarse budget onto its detailed children, or keep both levels?).
- [2026-06-16] [PM] **Recommendation/essentials logic on custom + finer categories** — severity: low — owner: Architect — status: open — area: product — the WLT-21 essential allowlist + median logic must extend to the finer/custom set.

_Approved by: Vivek on 2026-06-17_
