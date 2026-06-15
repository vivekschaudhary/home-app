---
id: WLT-15
type: feature
status: shipped
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-2, WLT-4, WLT-5]
parallel_with: []
architecture_required: true
architecture_status: approved
created: 2026-06-14
author: PM
sources:
  - "dogfood: the first real user hit the dead-end ('nothing left to do' after setting a target)"
  - docs/foundation/product.md
  - docs/foundation/portfolio.md
key_metric:
  name: Day-7 return rate + WAWU (distinct users taking ≥1 prompted action per 7-day window)
  baseline: 0 — no return mechanic exists; WLT-5 shows a flat WAWU/retention line (one action, then nothing)
  target: Day-7 return ≥40% AND WAWU growing month-over-month within the window (the foundational habit threshold; "wrong if" Day-30 stays < ~40%)
  source: WLT-5 funnel (auth_funnel_events) + new return-visit / prompted-action events; the /admin/metrics panel
guardrails:
  - name: One action, not a wall
    threshold: each visit surfaces AT MOST ONE primary prompted action (relevance over volume) — no notification/insight spam
  - name: Real-data only
    threshold: 100% of "what changed" + anomalies computed from the user's actual data — 0 fabricated insights
  - name: Anomaly precision
    threshold: anomalies are high-precision (low false-positive); a wrong "unusual charge" erodes the trust moat — dismissible, never alarming
  - name: No dark patterns
    threshold: prompts/return mechanics are honest + genuinely valuable — never manipulative re-engagement
  - name: Tenant isolation
    threshold: any new tables owner-scoped (auth.uid()) + same-user composite-FK posture (the WLT-11/WLT-12 standard); insight reads add no cross-user exposure
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [frontend, backend, data, product]
estimate:
  duration_weeks: 4
  confidence: low
  refined_by: brief-approval
  refined_at: 2026-06-14
---

# WLT-15 — "Your money since last time" (the reason to return)

## Problem

The MVP loop **completes once and then goes static.** A user signs up, connects, declares an intent, and sets a target — and after that, nothing is ever new: the "running" workflow doesn't actually track, there's no view of where the money went, no signal when something changes. So there is **no reason to come back** — and the north-star (**WAWU** = _weekly_ active, _compounding_ actions) and Day-30 retention can't form: a user takes one action and never returns. This isn't theoretical — **dogfooding surfaced it directly**: the first real user, having walked the whole loop, said _"nothing left to do… nothing left for user to do."_ That is the gap between _"the loop completes"_ and _"a product worth returning to"_ — and closing it is the literal test of the foundational hypothesis (habit + retention), which the MVP proved _can complete_ but never proved people _return to_.

## User

The **Consumer persona (~80%)** — has connected real data, declared an intent, and taken the first action; now needs an ongoing reason to engage. Their job-to-be-done: _"every time I come back, show me what changed with my money and what to do about it."_ They will not return for a static dashboard; they return when the app **tells them something they didn't know and hands them the next move.**

## Why this matters

This is **the retention bet** — it turns WAWU + Day-30 from theoretical into real. The MVP validated **TTFV** (the loop _can_ complete); this validates the rest of the foundational hypothesis: _"non-wealthy users form a continuous habit (≥3–5 active days/week) and stay (Day-30 ≥60%)"_ (product.md L60). Without it the product is a one-shot. It is also **where the data-moat starts compounding** — which prompted actions users take, and which anomalies they act on, is proprietary action-effectiveness intelligence (product.md moat row 3) that grows with usage; and the embedded weekly habit raises **switching costs** (row 2). The portfolio explicitly parked anomaly detection as _"deliberately out of MVP… returns via `/create-brief` after the MVP ships"_ — the MVP has shipped, so this is that bet.

## Hypothesis (the bet)

If **every visit shows the user what changed with their money since last time** (net-worth movement, spending vs. last week, progress toward their target, and notable anomalies) **and surfaces one relevant next action off it**, then users **return weekly and take ≥1 action (a WAWU event)** — measured by **Day-7 return ≥40% + WAWU growing MoM** within 30 days. **Wrong if:** the recurring surface doesn't lift return visits / WAWU above the (zero) baseline — i.e. "what changed + a move" isn't a compelling enough reason to come back.

## Defensibility

This is the bet where the moat **starts turning**, not a convenience. The record of _which prompted actions users complete_ and _which anomalies they act on_ is **proprietary action-effectiveness data** (moat row 3) that no point-solution holds and that compounds with every week of use. And a genuine weekly habit — "I check this every Monday" — is the highest form of **switching cost** (row 2): leaving means losing the thing that tells you what changed.

**Moat impact (one line):** Converts one-time linked data into a compounding weekly habit + an action-effectiveness dataset — the two primary moats, finally accreting.

## Scope

### In scope

- **The recurring "since last time" home surface** — net-worth movement (vs. last visit/period), **spending vs. last week / where the money went** (the deferred `spending_snapshot`, the breakdown the user wanted), and **progress toward the declared target** (wiring the WLT-4 "running" workflow to _actually track_).
- **Action-first (the elicited spine):** each visit surfaces **ONE** relevant prompted action derived from what changed — spending up in a category → _set a budget_; behind target → _adjust your savings_; an anomaly → _review it_ — and completing it writes a **`WorkflowRun` (WAWU)**.
- **Anomaly detection (elicited: in the first cut):** detect notable changes worth attention from the now-available **24-month history** (unusual charge, upcoming bill, large movement); **high-precision**, surfaced as a dismissible action.
- **The "what changed" computation** — period-over-period comparisons (net worth, spending by category) over the existing accounts/transactions.
- **Return instrumentation** — return-visit + per-visit-action events into the WLT-5 funnel so **WAWU + Day-7/30 retention** become computable + visible on `/admin/metrics`.

### Out of scope

- **Push notifications / email** (the "pull them back" channel) — the spine is **action-first in-app**, not push-first (per elicitation); a later slice.
- **Deep automation** of the surfaced actions (auto-moving money, executing rules) — the action creates the commitment; deep execution is later.
- **Marketplace / builder-composed workflows** — still a later phase.
- **New data sources** — builds entirely on shipped WLT-2 (data + 24mo history), WLT-4 (workflow/target), WLT-5 (funnel).
- **Mobile / multi-channel** — web Phase-1 (architecture.md).

## Open questions for Researcher

- How do comparable PFM products drive _weekly_ return — Monarch (recurring reports), Copilot (daily review), Cleo (nudges)? What converts to action vs. just a glance?
- Anomaly-detection approach: **rules-based** (bill-due, large-charge / category-threshold) vs. **statistical** (deviation from a category baseline)? The precision/recall tradeoff at low data volume — start high-precision.
- The **change → action mapping**: what's the single right action per change-type (and how to pick _one_ when several changed)?
- Retention thresholds pre-scale: what Day-7 / Day-30 / WAWU numbers count as "working" at low n?

## Research findings

- **The foundational thesis, directly tested.** product.md L60: habit (≥3–5 active days/week) + Day-30 ≥60%; "wrong if Day-30 < ~40%." The MVP couldn't test this; this bet is its instrument.
- **Dogfood evidence (strongest signal).** The first real user completed the entire loop and reported there was _nothing left to do_ — empirical confirmation that "loop completes" ≠ "product worth returning to."
- **Competitive.** Incumbents drive return via insights/alerts (Cleo nudges, Copilot's daily review, Monarch's recurring reports); **none** pair it with the intent-first + action-first framing (the white space, product.md L35).
- **Moat.** Action-effectiveness + anomaly-relevance data is proprietary (row 3); the weekly habit is a switching cost (row 2).
- `n/a` — quantitative return data: `n/a — pre-launch; this bet + WLT-5 establish the WAWU/retention baseline (flat today)`.

## User pain input (from Support)

`n/a — pre-launch. The proxy pain is the dogfood dead-end (the operator IS the first user): "nothing left to do."`

## Stories

_Decomposed one at a time via `/create-story WLT-15` after this brief is approved AND `/create-bet-architecture WLT-15` lands (architecture_required: true). Likely first slice: the "since last time" recap (the 3 computable signals) + one prompted action end-to-end — proving the return mechanic — before layering the anomaly-detection engine._

## DRI Log

### Decisions

- [2026-06-14] [PM] **First post-MVP bet**, created fresh — the portfolio parked anomaly detection / engagement "until the MVP ships"; it has — area: scope — reversibility: medium
- [2026-06-14] [PM, elicited] **Action-first spine** — each visit surfaces one prompted action off "what changed," so the reason-to-return _generates_ WAWU actions — rationale: WAWU is action-based; a glance doesn't move the north star — alternatives: view-first (rejected — awareness ≠ action), push-first (rejected — adds a channel; deferred) — area: product/metrics — reversibility: medium
- [2026-06-14] [PM, elicited] **Anomalies in the first cut** (not a fast-follow) — the fuller reason-to-return; accepts a bigger build + the "needs accumulated history" caveat, now mitigated by WLT-10's 24-month history — area: scope — alternatives: defer anomalies (rejected by user — wanted the full surface) — reversibility: medium
- [2026-06-14] [PM] **`architecture_required: true`** — the anomaly-detection engine (definition + precision tuning), period-over-period computation, the change→action mapping, and the ongoing-WorkflowRun model are novel + load-bearing — area: process — reversibility: n/a
- [2026-06-14] [PM] **Primary metric = Day-7 return + WAWU** (not a vanity DAU) — the bet's claim is _return + act_, the compounding-action thesis — area: metrics — reversibility: easy
- [2026-06-14] [PM] **Builds entirely on the shipped loop; no new data sources** — pure leverage on WLT-2/4/5 — area: scope — reversibility: easy
- [2026-06-14] [DRI] **Brief APPROVED** — HITL gate cleared; proceed to `/create-bet-architecture WLT-15` (architecture_required) then `/create-story WLT-15` — area: process — reversibility: n/a

### Risks

- [2026-06-14] [PM] **Anomaly false-positives erode trust** — a wrong "unusual charge" on a financial app is costly — likelihood: medium — impact: high — mitigation: high-precision rules first (bill-due, large-charge, category-threshold), statistical later; always dismissible; the anomaly-precision guardrail — area: trust
- [2026-06-14] [PM] **Biggest bet yet** (anomaly engine + recurring surface + action-mapping, anomalies-in-first-cut) — likelihood: high — impact: medium — mitigation: `/create-story` slices it — ship the computable "what changed + one action" first to prove the mechanic, then layer the anomaly engine — area: scope/schedule
- [2026-06-14] [PM] **Pre-launch n makes the retention verdict noisy** — likelihood: high — impact: low — mitigation: instrument now (return + action events); no KR verdict until real traffic — area: measurement
- [2026-06-14] [Security] **Insight/anomaly computation reads ALL the user's financial data** — likelihood: low — impact: high — mitigation: owner-scoped reads only (no new exposure beyond what the user already owns); mandatory Security Review — area: security

### Issues

- [2026-06-14] [PM] Jira/Confluence MCPs not connected — mirror skipped (consistent posture) — severity: low — owner: PM — status: open — area: tooling
