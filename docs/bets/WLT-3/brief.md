---
id: WLT-3
type: feature
status: approved
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-1]
parallel_with: [WLT-2]
architecture_required: false
created: 2026-06-05
author: PM
key_metric:
  name: Intent-declaration completion — signed-in users who declare ≥1 structured intent in onboarding
  baseline: 0 (no intent capture today; the front door is a blank canvas)
  target: ≥75% of users who reach onboarding declare an intent
  source: WLT-5 instrumentation (intent_declared funnel event)
guardrails:
  - name: Intent-flow time (median, declaration start → done)
    threshold: < 90s — it's on the TTFV<3min critical path, must not bloat it
  - name: Cluster coverage
    threshold: all 6 clusters (Fear/Goal/Confusion/Control/Habit/Aspiration) representable (KR1)
  - name: Structured-intent quality (declared intent → a Goal the engine can consume)
    threshold: 100% of declared intents persist a valid Intent + derived Goal (WLT-4 handoff contract honored)
  - name: No dead-end
    threshold: a user who isn't ready can pick "not sure yet" / explore and still proceed (completion not coerced)
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [frontend, product, data]
estimate:
  duration_weeks: 1
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-09
  estimated_start: 2026-06-10
  estimated_end: 2026-06-17
primary: gdrive://1zRVK9LRolTq0OWKAV6p7fHqGkRtZZm4oaA-yoT03eRE
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/1zRVK9LRolTq0OWKAV6p7fHqGkRtZZm4oaA-yoT03eRE/edit

# WLT-3 — Intent-first onboarding

## Problem

Every incumbent PFM tool hands the user a **blank canvas** and asks them to supply the discipline: build a budget, set up categories, define rules. The product's primary persona — the financially-anxious, Mint-refugee wage-earner — **doesn't know where to start**, so they bounce (≈68% abandon financial onboarding; product research). The whole thesis is the opposite: an **intent-first front door** where the user declares *what they're worried about or want*, and the platform takes it from there. Without intent capture, the loop has **data (WLT-2) but no direction** — the engine (WLT-4) has nothing to act on, and the product is just another dashboard.

## User

The **Consumer persona (~80%, primary)** — financially-anxious, post-WLT-1 sign-in, often a Mint refugee. Job-to-be-done: *"Let me tell this thing what I'm worried about or trying to do — without making me build a spreadsheet — and put me on a path."* They want **direction and reassurance**, not tools.

## Why this matters

This is the **intent-first front door** — the product's core differentiation (the "OS underneath your financial life" vs. point solutions that each win one category). It's the loop's **"declare an intent"** stage and the **input to WLT-4** (the engine that auto-assembles a workflow from the declared goal). It directly serves **Q2 KR1** ("Ship intent onboarding + workflows across all 6 intent clusters") and the **Phase-1 objective** ("validate the intent-first front door converts intent → running workflow"). It's the bridge from **real data (WLT-2)** to **prompted action (WLT-4)** — without it, the WAWU loop can't close.

**Moat impact:** indirect but foundational — the declared intent is what makes the auto-assembled workflow *personal*, which is the switching-cost + data-intelligence moat the whole loop compounds into.

## Hypothesis (the bet)

If signed-in users declare an intent through a **guided 6-cluster front door** (Fear/Goal/Confusion/Control/Habit/Aspiration) instead of a blank canvas, then a high share **complete intent declaration** and produce a **structured intent the engine can act on** — proving the intent-first model converts where blank-canvas tools see abandonment, measured by **intent-declaration completion ≥75%** within 30 days.

## Defensibility

Yes — indirectly. The declared intent is the seed that makes every later workflow personal; combined with the user's real data (WLT-2), it's what makes the assembled experience expensive to leave and impossible to clone generically. No standalone moat, but it's a load-bearing input to the primary (data/switching-cost) moats.

## Scope

### In scope
- **Intent-capture onboarding flow** — a guided, **non-blank-canvas** UI presenting the **6 clusters** (Fear/Goal/Confusion/Control/Habit/Aspiration), each with a few **concrete starter intents** (e.g. Fear → "I'm scared of overspending"; Goal → "Save for something"; Control → "See all my money in one place"; Habit → "Build a savings habit"). User selects/declares **≥1**.
- **Intent → Goal derivation** — persist a structured **`Intent`** + derived **`Goal`** (existing foundation entities; see foundation data model L65–66 + ER diagram `USER → INTENT → GOAL`): cluster, specific intent, optional params (target amount / timeframe). **RLS owner-scoped.**
- **Handoff contract to WLT-4** — the persisted `Goal` is the payload the engine consumes (`GOAL → WORKFLOW` is foundational). WLT-3 produces it; WLT-4 assembles from it.
- **Independent-ship placeholder** — until WLT-4 is live, a post-intent state ("We're putting your plan together" / explore) so WLT-3 ships on its own without the engine.
- **`intent_declared` funnel event** — the baseline for intent→workflow conversion (WLT-5 consumes).
- **Design + copy** for the front door (anxiety-reducing, plain, reassuring — the highest-stakes first impression after sign-in).

### Out of scope
- **The workflow engine + auto-assembly + pre-built workflow library** — WLT-4.
- **Free-text / NLP intent parsing** — MVP uses structured clusters + starter intents; free-text expression is a fast-follow (data-driven).
- **Intent management over time** (edit, multiple concurrent intents, re-declare) — MVP declares ≥1; lifecycle management is post-MVP.
- **Marketplace / builder intent authoring** — post-MVP.
- **Workflow recommendation logic** (which workflow serves which intent) — that's WLT-4.

## Resolved (HITL) + open questions

- ✅ **Placement — RESOLVED: intent-first, always.** Intent is the **first thing after sign-in**, *before* connecting a bank or any setup. Per the **user-first directive**: lead with what the user wants; defer friction (account connection, configuration) until after the user is engaged with their own intent. The declared `Goal` is data-independent — it's captured up front, then WLT-2 (connect) and WLT-4 (workflow) follow.
- **(Open) The 6-cluster → starter-intent taxonomy:** the canonical, recognizable starter intents per cluster (the ones the anxious persona self-identifies with) — the heart of the flow; resolve at `/create-story` with Designer.
- **(Open) Required vs. skippable:** "not sure yet / explore" is a first-class no-dead-end path (guardrail) — but is an intent *required* to proceed to connect? Lean: strongly encouraged, not hard-blocked (user-first = don't coerce).

## Research findings

Blank-canvas / manual-discipline onboarding is the shared failure mode of YNAB ($109), Monarch ($99–199), Copilot ($95) — each wins a category but assumes the user already knows what to do. The financially-anxious beachhead (62% paycheck-to-paycheck; ≈3.6M Mint refugees) is precisely the cohort that *can't* self-direct. The 6-intent-cluster framing (Fear/Goal/Confusion/Control/Habit/Aspiration) is the product's wedge: meet the user at the emotion, not the spreadsheet. Intent/Goal are already first-class in the foundation data model, so this is a within-stack feature, not new infrastructure.

## DRI Log

### Decisions
- [2026-06-09] [HITL/PM] **Intent-first, user-first — always lead with what the user wants; defer friction.** Intent declaration is the FIRST step after sign-in, *before* connecting a bank or any setup. Standing product principle (applies beyond this bet): every onboarding/flow surfaces the user's desire first and pushes friction (account connection, configuration, permissions) to *after* engagement. So the user journey is sign-in → **intent (WLT-3)** → connect (WLT-2) → workflow (WLT-4), even though WLT-2 was built first — area: product/UX — reversibility: low (core principle)
- [2026-06-09] [PM] **`architecture_required: false`** — `Intent`/`Goal` are already foundation entities (data model L65–66, ER diagram `USER→INTENT→GOAL→WORKFLOW`); WLT-3 implements them in the established Supabase + Next.js stack with no new external dependency and no foundational deviation. The WLT-4 handoff is the foundational `Goal` schema — area: architecture — alternatives: a bet architecture for the Intent schema (rejected — foundation already specifies it; over-engineering) — reversibility: easy
- [2026-06-09] [PM] **Structured clusters + starter intents for MVP, not free-text NLP** — rationale: reduces ambiguity, ships fast, gives WLT-4 a clean enumerable input; free-text is a data-driven fast-follow — area: scope — reversibility: easy
- [2026-06-09] [PM] **WLT-3 ships independently of WLT-4** via a placeholder post-intent state — rationale: the intent persists now; the workflow assembles when WLT-4 lands; decouples the two bets on the critical path — area: sequencing — reversibility: easy
- [2026-06-09] [PM] **Primary metric = intent-declaration completion** (not intent→workflow conversion) — rationale: WLT-3 alone can't produce a workflow; intent→workflow conversion is the joint WLT-3+WLT-4 metric WLT-5 baselines once WLT-4 lands — area: metrics — reversibility: medium
- [2026-06-09] [PM] Jira mirror **skipped** — no Jira MCP on host (consistent with WLT-1/WLT-2) — area: tooling — reversibility: easy

### Risks
- [2026-06-09] [PM] **Intent capture lengthens TTFV** (on the <3-min critical path) — likelihood: medium — impact: high — mitigation: guardrail median < 90s; keep it to a few taps, defer free-text — area: UX/metrics
- [2026-06-09] [Researcher] **The 6-cluster taxonomy may not resonate or map cleanly to workflows** — likelihood: medium — impact: high — mitigation: validate starter intents with the persona; ensure each maps to a Goal WLT-4 can assemble; iterate post-baseline — area: product
- [2026-06-09] [PM] **Coercing intent could hurt completion** (forcing a choice the anxious user isn't ready for) — likelihood: medium — impact: medium — mitigation: "not sure yet / explore" as a first-class no-dead-end path — area: UX

### Issues
- [2026-06-09] [Designer] Intent placement (pre/post connect) — **resolved 2026-06-09 (HITL): intent-first, always** (user-first directive) — severity: medium — owner: Designer/PM — status: **resolved**

---

_Approved by: Vivek on 2026-06-09 (intent-first / user-first directive baked in)_
