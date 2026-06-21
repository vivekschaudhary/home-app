---
id: WLT-24
type: feature
status: approved
priority: P2
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-22, WLT-23]
parallel_with: []
architecture_required: true
architecture_status: approved
created: 2026-06-21
author: PM
sources:
  - "operator (dogfooding, 2026-06-21): wants to see all recurring subscriptions in one place with the total monthly cost — the recurring spend that quietly adds up."
  - "Planned transaction-overlay pair (memory: transaction-overlays-followup-subscriptions) — follow-up flag + subscriptions, sharing one transaction_flags substrate; subscriptions decided MANUAL-FIRST, DETECT-LATER."
key_metric:
  name: Subscription-aware accounts (marked ≥1 subscription)
  baseline: 0 (new surface)
  target: ≥30% of active (connected) accounts within the window
  source: transaction_flags table + subscription_marked / subscriptions_viewed funnel events
guardrails:
  - name: Subscriptions aggregation read stays bounded
    threshold: paginated past the 1000-row PostgREST cap (the FIX-2026-06-20c lesson) — no silent undercount of the monthly total
  - name: No category/budget regression
    threshold: a subscription flag is ORTHOGONAL to category — marking a subscription must not change its category, budget total, or the WLT-22-5 spend/transfer classification
  - name: No new PII surface
    threshold: the Subscriptions view shows only the user's own merchant/amount/date (same posture as the WLT-23 ledger) — no fabricated or third-party data
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [frontend, backend, data, spending]
estimate:
  duration_weeks: 2
  confidence: low
  refined_by: brief-approval
  refined_at: 2026-06-21
---

# Subscriptions — see and manage your recurring spend

## Problem

Recurring charges are the spend people lose track of: a forgotten free trial that started billing, a service they stopped using, a price that crept up. They're scattered across the transaction history one charge at a time, so the **total monthly weight of "subscriptions" is invisible** — exactly the "I can't make sense of where it goes" pain the product exists to fix. Today the app can show every transaction (WLT-23 ledger) and the budget by category (WLT-21/22), but there's no surface that says "here are your recurring subscriptions, and together they cost $X/month." The left-nav even has a **"Subscriptions"** item, stubbed "Coming soon" since the WLT-19 shell — a promised surface still empty.

## User

A connected, dogfooding user (operator now; the non-wealthy habit-former in the foundation thesis) who wants to **understand and trim recurring spend** — the job-to-be-done is "show me what's quietly auto-billing me each month so I can decide what to keep."

## Why this matters

It's the natural next **overlay** on the transaction ledger after category-correction (WLT-22) and the ledger itself (WLT-23), and it turns passive data into an **action** the user can take repeatedly — reviewing/curating subscriptions is a WAWU-contributing behavior (the north-star is prompted financial actions, not logins). It also fills a nav promise. Strategically it sets up the **transaction-overlay substrate** (`transaction_flags`) that a planned **follow-up flag** bet reuses — so the investment is shared, not single-use.

## Hypothesis (the bet)

If we let users **see and mark their recurring subscriptions in one place with a running monthly + annualized total**, then users worried about where their money goes will return to **review and curate recurring spend** (a repeatable, WAWU-contributing action), measured by **≥30% of active accounts marking ≥1 subscription within 30 days** of the surface going live.
**Wrong if:** with the surface live, fewer than ~10% of active accounts ever mark a subscription — signalling the manual-first burden is too high and detection (the fast-follow) is actually the load-bearing piece.

## Defensibility (optional for feature bets)

Mild. The user's curated subscription list + (later) detection history is **proprietary usage data** and a small **switching cost** (their managed list lives here). Not a primary moat.

**Moat impact (one line):** minor — proprietary recurring-spend data + a sticky user-curated list; not load-bearing for defensibility.

## Scope

### In scope (slice-able under this bet)

- **`transaction_flags` substrate** — a new owner-CRUD table `(user_id, dedup_key, flag_type, …)` with `flag_type ∈ {subscription}` _this bet_ (the schema admits `followup` for the planned sibling bet), owner RLS, keyed by the stable `dedup_key` so a flag survives Plaid CDC re-syncs. Reuses the WLT-22 saved-assignment pattern + WLT-22-3/4 `normalizeMerchant`.
- **Mark / unmark a transaction as a subscription** — an action on the WLT-23 ledger row (reusing the existing in-row picker/popover), and optionally the budget drill. A `'user'` mark is authoritative.
- **The Subscriptions view** (the nav placeholder → live): the list of subscription merchants with their typical amount, derived cadence (where ≥2 occurrences let us infer monthly/annual), and a **headline monthly + annualized total** (all cadences normalized to a monthly figure). Honest empty state until the user marks something.
- Funnel events (`subscription_marked`, `subscriptions_viewed`) for the metric.

### Out of scope (this bet — deferred to explicit fast-follow stories or other bets)

- **Auto-DETECTION** of subscriptions (Plaid `/transactions/recurring/get` behind a swappable adapter, or a custom `normalizeMerchant` + cadence detector). The deliberate **fast-follow** — when it lands it AUTO-SETS the subscription flag as a _signal/default_ the user overrides (the WLT-22-5 pattern, [[providers-signal-human-decides]]). Slice 1 is manual-first.
- The **follow-up flag** — a separate bet on the same `transaction_flags` substrate.
- Cancel-a-subscription integrations, renewal reminders, price-change alerts, free-trial-ending nudges.
- Editing transaction amounts/dates (Plaid owns the entries).

## Open questions for Researcher / Architect elicitation

- **Detection source (for the fast-follow, decided at architecture):** Plaid `/transactions/recurring/get` behind a swappable adapter (lower effort, higher accuracy, region-coupled) **vs** a custom `normalizeMerchant` + cadence/amount-stability detector (provider-agnostic, more work) **vs** manual-only for longer. A real `[elicitation-with-options]`.
- **Cadence derivation in slice 1:** infer cadence from the marked transactions' occurrence intervals (≥2 occurrences → monthly/annual/weekly) or just show merchant + latest amount + occurrence count until detection lands? (Leaning: derive simple cadence when history allows, else show "marked — cadence pending.")
- **Monthly-total normalization:** annual ÷ 12, weekly × 4.33, etc. — confirm the normalization + how to treat a subscription with only one observed charge.
- **Entry points:** ledger row only for slice 1, or also the budget drill? (Leaning: ledger row first; it's the natural "I recognize this recurring merchant" moment.)
- **Overlap with WLT-22-5 transfers:** a subscription is real spend (it stays counted); confirm a subscription flag never interacts with `counts_as_spending`.

## Research findings

_To be filled by Researcher — user-pain evidence (subscription-fatigue / forgotten-trial prevalence), competitive context (Rocket Money/Truebill, Plaid's recurring product), and the marginal value of manual-first vs detection-first._

## User pain input (from Support)

_To be filled by Support — recurring-charge confusion as a support/dogfooding theme._

## Stories

_Decomposed one at a time via `/create-story WLT-24` after approval. Likely: (1) the `transaction_flags` substrate + mark/unmark + the Subscriptions view (manual-first); (2) the detection fast-follow (adapter/elicitation)._

## DRI Log

### Decisions

- [2026-06-21] [PM] **Manual-first, detect-later** — rationale: ships the user-controllable surface + the shared substrate cheaply and proves demand before investing in detection; detection then rides the same flag as an auto-set signal the user overrides ([[providers-signal-human-decides]]) — area: scope — alternatives: detection-first (rejected — heavier, couples to a provider before demand is proven); never-detect (rejected — recurring manual marking is friction the fast-follow removes) — reversibility: easy
- [2026-06-21] [PM] **A new `transaction_flags` overlay table, NOT a category** — rationale: a subscription is orthogonal to category (a Netflix charge is both "Entertainment" AND a subscription); overloading the category axis would lose one or the other (the WLT-22-5 distinction) — area: architecture — alternatives: a "Subscriptions" category (rejected — conflates axes); a boolean column on transactions (rejected — churns on CDC re-sync; the dedup_key-keyed table survives it) — reversibility: medium (schema)
- [2026-06-21] [PM] **architecture_required: true** — rationale: new owner-CRUD table + an aggregation read + the future provider-recurring adapter seam warrant an architecture pass (esp. the cadence/normalization model + the detection seam) — area: process — reversibility: n/a

### Risks

- [2026-06-21] [PM] **Manual-first adoption is too low** (the marking burden outweighs the value before detection lands) — likelihood: medium — impact: medium — mitigation: keep slice 1 tiny (reuse the ledger picker; no new ceremony); the metric's "wrong if <10%" makes the manual-vs-detect question falsifiable fast → prioritize the detection fast-follow if so — area: product
- [2026-06-21] [PM] **Cadence/total is misleading on thin history** (one observed charge → wrong monthly figure) — likelihood: medium — impact: low — mitigation: only assert a cadence with ≥2 occurrences; otherwise label honestly ("cadence pending") and exclude from the normalized total or show it as a single charge — area: data
- [2026-06-21] [PM] **The aggregation read undercounts on a heavy account** (the 1000-row cap, again) — likelihood: medium — impact: medium — mitigation: paginate the subscriptions read from day one (guardrail) — area: scale

### Issues

- [2026-06-21] [PM] **Detection-source elicitation deferred to architecture** — severity: low — owner: Architect — status: open — area: architecture — the Plaid-recurring-vs-custom-detector choice is a `/create-bet-architecture` decision, flagged here so it isn't lost.

---

_Approved by: operator on 2026-06-21_
