---
id: WLT-21
type: feature
status: Approved
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-19]
parallel_with: []
architecture_required: auto
architecture_status: approved
created: 2026-06-16
author: PM
sources:
  - "user request (2026-06-16): in Budget & Spending, set a max budget per major category (rent, shopping-electronics/clothes/home, entertainment, travel, dining-out, dining-delivery, groceries, school, health, doctor visits, …) as hard numbers or percents; show a recommended number for a well-planned financial life based on the user's life preferences; show the actual for the most recent month + the spread across the year"
  - "elicited (2026-06-16): recommended-basis = your own history (no income captured); categories = the bank's real categories (Plaid primary); first slice = the table first, the year-spread chart next"
  - docs/bets/WLT-19/brief.md
  - docs/foundation/product.md
key_metric:
  name: a connected user sets at least one category budget and comes back to it (active budget engagement)
  baseline: 0 — no budget surface exists today; Budget & Spending is a "Coming soon" stub in the shell
  target: of users with ≥1 connected account, a meaningful share set ≥1 budget and return to /budget in a later session (a repeat-visit / WAWU-adjacent signal). "Wrong if" users set a budget once and never return, or never set one because the recommendation feels untrustworthy.
  source: budget funnel events (budget_viewed · budget_set · budget_returned) — the same event/audit posture as recap/anomaly
guardrails:
  - name: Honest numbers only
    threshold: recommended + actual are computed from the user's REAL transactions; cold-start shows "—/we need a month of history" — NEVER a fabricated recommendation or a "$0" implying no spend (the real-data principle)
  - name: Owner-isolation on the new writable table
    threshold: a user can only read/write their OWN budgets; the new owner-CRUD `budgets` table is proven isolated by an RLS / real-path test (the #36 discipline) before merge
  - name: Don't over-build
    threshold: v1 = the category table (recommended · recent-month actual · set-budget) ONLY; the year-spread chart, income/benchmarks, finer categories, and over-budget alerts are explicitly later
  - name: Stay on-stack
    threshold: no new charting/data-viz dependency in v1 (the chart is a separate story); reuse @wealth/ui + the existing page/lib/route patterns — no foundational-stack deviation
measurement_window_days: 14
check_in_cadence: weekly
area_tags: [frontend, spending, budgets, data]
estimate:
  duration_days: 2-3
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-16
---

# WLT-21 — Budget & Spending: set a budget per category; see recommended vs actual

## Problem

The product can already tell a user **where their money went** (the WLT-17 recap: spent-this-week, top categories) — but it's **passive**. There's no way to say _"this is my limit for dining,"_ no anchor for what a sensible limit even is, and no at-a-glance read of **how this month is tracking against that limit per category**. The "Budget & Spending" section — the second item in the shell nav — is a "Coming soon" stub. The product's strongest declared intents ("I think I'm overspending," "help me stick to a budget") have **no surface to act on**.

## User

The **Consumer persona (~80%)**, specifically the **"worried about overspending / wants to stick to a budget"** segment (the `control_spending` + `budget_adherence` intents). Their job-to-be-done: _"show me a sensible limit per category, show me how I'm actually doing this month, and let me set my own caps — without making me do the math or feel judged."_

## Why this matters

1. **It turns the recap from a mirror into a control surface.** "Where it went" becomes "here's your limit, here's where you are" — something the user **sets and returns to**, which is exactly the **WAWU / return** mechanic the engagement bet (WLT-15) is built to grow.
2. **It serves the product's top intents directly.** It realizes the reserved-but-unbuilt **`budget_guardrail` archetype** (`control_spending`, `budget_adherence`) at full-page scale, closing the gap between what users said they wanted and what they can do.
3. **It's the first real proof the shell pays off.** Budget & Spending is the first of the week's six section features to mount into WLT-19 — validating "flip the nav + drop a page, zero shell rework."

## Hypothesis (the bet)

If we give a returning user a clear **budget-vs-actual per category**, anchored to a **recommendation drawn from their own spending** (since we can't honestly benchmark to an income we don't have), and let them **set a cap (as $ or %)**, then they'll **engage with budgeting actively and come back to check it** — deepening retention and serving the overspending/adherence intents. **Wrong if:** users set a budget once and never return, or the own-history recommendation reads as rubber-stamping overspending (so it must recommend a modest, floored reduction on discretionary categories, with honest copy).

## Defensibility

Not a moat itself — a **habit + data input**. A budget the user sets and returns to (a) embeds the product in a weekly habit (habit moat, product.md) and (b) generates proprietary intent-vs-behavior data (their chosen caps vs. actual spend) that sharpens future recommendations. It compounds the WLT-15 engagement bet rather than standing alone.

**Moat impact (one line):** Converts passive spend-reporting into a set-and-return budgeting habit + proprietary cap-vs-actual signal.

## Scope

### In scope (the bet)

- **`/budget` live in the shell** — a per-category table: **Category · Recommended (from your history) · This month so far · Your budget (set as $ or %)** + a clear over/under-budget indicator (not color-only).
- **Set / edit / clear a budget per category**, persisted in a new owner-CRUD `budgets` table — entered as a **dollar cap or a percent** (percent default = % of your typical total monthly spend, since income is unknown; confirmed in design).
- **Recommended-from-history**: a per-category target from trailing monthly spend (≈ trailing median, modest trim + a floor on discretionary categories), with **honest cold-start** — no recommendation until there's ≥1 month of history.
- **Recent-month actuals per category** — extend WLT-17's spending computation from a weekly to a monthly window; `null`/unknown category shown as "Other," never dropped.
- **Mount into the shell** — flip `NAV_SECTIONS` `budget.status → live`; replace the `app/(app)/budget/page.tsx` stub. (`/budget` is already AAL2-gated by the shell + middleware.)
- **The year-spread view is the bet's second story (WLT-21-2)** — a 12-month per-category mini-view + the charting-approach decision; kept separate so it doesn't block v1 or force a dependency.

### Out of scope (explicit)

- **Income capture + benchmark recommendations** (50/30/20) — the declared next enhancement (would need an income step or inference).
- **Finer custom categories** (dining-out vs delivery; shopping electronics/clothes/home; doctor visits) — needs a merchant / Plaid-`detailed` mapping + a re-sync; deferred.
- **Over-budget alerts / notifications** — a possible later tie-in to the recap/anomaly engine, not this bet.
- Editing/recategorizing transactions; multi-currency budgets; shared/household budgets.

## Open questions for Architect

- **`budgets` table posture:** owner-CRUD (user-writable preference data) vs. the financial tables' service-role-write posture — confirm the boundary + the RLS policies (select/insert/update/delete all `user_id = auth.uid()`), and the unique-active constraint (`user_id, category`).
- **Percent semantics:** without income, a percent budget = % of the user's typical total monthly spend — confirm this reads clearly, or restrict v1 to dollar caps + show percent as derived.
- **Recommended formula:** trailing-window length (3 months? all available?), the central statistic (median vs. trimmed mean), and the discretionary trim + floor — enough to be useful, simple enough to be honest. Which categories count as "discretionary"?
- **Compute on-read vs. pre-rollup:** is an on-read monthly aggregation over `transactions` fast enough (mirrors the anomaly-scan read), or is a monthly rollup warranted (defer if on-read is fine)?

## Research findings

- **Spending-by-category math already exists + is honest.** `computeSpendingComparison()` + `humanizeCategory()` (`packages/core/recap.ts`) group debits by category and already return `null` rather than fabricate a "$0" — extend the window from weekly to monthly. `readRecentSpending()` (`app/lib/recap.ts`) is the owner-scoped read seam to follow.
- **Categories are Plaid primary strings** (`FOOD_AND_DRINK`, `GENERAL_MERCHANDISE`, `GROCERIES`, `TRAVEL`, `ENTERTAINMENT`, `RENT_AND_UTILITIES`, …) — coarser than the user's list. The finer split needs `personal_finance_category.detailed` (not stored) + a re-sync → the chosen v1 budgets against the real labels.
- **No income/household data anywhere** — confirmed; this is why "recommended" is own-history, not a benchmark.
- **The `budget_guardrail` archetype is reserved but unbuilt** (`packages/core/workflow.ts`) — this bet realizes it at page scale; the archetype's "set + track a budget" action aligns.
- **Every comparable PFM app** (Monarch, Copilot, YNAB) leads with exactly this budget-vs-actual-per-category table — the IA is industry-standard, de-risking the pattern.
- **The mounting contract is proven** (WLT-20): flip nav status + drop a page following the `accounts/{page,Client}` pattern; mutations via an AAL2-guarded `app/api/.../route.ts`.

## User pain input (from Support)

`Proxy: the operator's own dogfooding + the product's #1 declared intent ("I think I'm overspending") having no actionable surface. No external support ticket — this is a top-down feature build, the first of the week's section features.`

## Stories

_Decomposed under this bet via `/create-story WLT-21` (nested numbering, per the user):_
- **WLT-21-1** — the Budget & Spending table: `/budget` live in the shell, recommended-from-history + recent-month actual + set-your-budget ($ or %), the `budgets` table + owner-isolation test. **The slice that ships the surface.**
- **WLT-21-2** — the year-spread view (12-month per-category) + the charting-approach decision. Fast-follow.

## DRI Log

### Decisions

- [2026-06-16] [PM, elicited] **Recommended numbers come from the user's OWN spending history, not income benchmarks** — rationale: the app captures no income/household data, so a 50/30/20-style benchmark would be a fabricated anchor; an own-history target is honest from day one and ships now — area: product — alternatives: capture/declare income then benchmark (rejected v1 — adds a step + a benchmark table; named as the next enhancement), infer income from recurring deposits (rejected — fragile) — reversibility: medium
- [2026-06-16] [PM, elicited] **Budget against the bank's real categories (Plaid primary), not the user's finer wished-for list** — rationale: transactions store only the primary category; the finer split (dining-out vs delivery; electronics/clothes/home) needs a sub-category mapping + a re-sync — ship on accurate, available labels now, add granularity later — area: data/scope — alternatives: build the merchant/`detailed` mapping now (rejected v1 — more work, less reliable) — reversibility: medium
- [2026-06-16] [PM, elicited] **Slice it: the table first (WLT-21-1), the year-spread chart second (WLT-21-2)** — rationale: ships the budgeting surface this week without blocking on a charting-library choice or a foundational-stack deviation — area: scope — alternatives: the whole page in one story (rejected — larger + forces a charting decision up front) — reversibility: easy
- [2026-06-16] [PM] **Recommended must recommend a modest, floored reduction on discretionary categories (not just mirror past spend)** — rationale: an own-history target that equals what you already overspend rubber-stamps the problem the user came to solve — area: product — reversibility: easy
- [2026-06-16] [User] **Story numbering is nested under the bet — `WLT-<bet>-<n>` (WLT-21-1, WLT-21-2, …)** from WLT-21 forward; already-shipped stories (WLT-16…WLT-20) are NOT renumbered (would break PR/commit/doc refs) — area: process — reversibility: easy

### Risks

- [2026-06-16] [PM] **The new owner-writable `budgets` table leaks across users** — likelihood: low — impact: high (cross-tenant data) — mitigation: owner-CRUD RLS (`user_id = auth.uid()` on every verb) + a real-path isolation test (a second user cannot read/write the first's budgets) before merge — area: security
- [2026-06-16] [PM] **The own-history recommendation feels like it endorses overspending** — likelihood: medium — impact: medium — mitigation: discretionary trim + a floor + honest copy ("a realistic target based on what you actually spend") — area: product
- [2026-06-16] [PM] **Category coarseness disappoints** (user expected dining-out vs delivery) — likelihood: medium — impact: low-medium — mitigation: copy sets expectations; the finer list is a named follow-on; "Other" bucket is explicit, never silent — area: product
- [2026-06-16] [PM] **Percent-of-what is ambiguous without income** — likelihood: medium — impact: low — mitigation: define percent = % of typical total monthly spend in design; consider dollar-only for v1 — area: ux

### Issues

- [2026-06-16] [PM] **Recommended-formula specifics unresolved** — severity: low — owner: Architect — status: open — area: product — trailing-window length, median vs trimmed-mean, the discretionary set + floor; resolve in architecture/design.
- [2026-06-16] [PM] **Compute-on-read vs monthly rollup** — severity: low — owner: Architect — status: open — area: performance — start on-read (mirrors anomaly-scan); add a rollup only if needed.

_Approved by: Vivek on 2026-06-16_
