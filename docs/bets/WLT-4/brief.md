---
id: WLT-4
type: feature
status: approved
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-2, WLT-3]
parallel_with: []
architecture_required: true
architecture_status: approved
created: 2026-06-05
author: PM
sources:
  - gdrive://1_tLI4T1udKEiw0f0VfpsmCRa_mC3x8-Kl5gpKg2SO10
  - docs/foundation/product.md
  - docs/foundation/architecture.md
  - docs/foundation/portfolio.md
key_metric:
  name: intent→first-action conversion (declared-intent users who complete ≥1 WorkflowRun action)
  baseline: 0 (no engine today; Goals sit at pending_workflow)
  target: ≥40% within 30 days (inaugural baseline per Q2 KR3)
  source: funnel events (intent_declared → workflow_assembled → action_completed) in auth_funnel_events; dashboards land with WLT-5
guardrails:
  - name: TTFV (time to first value)
    threshold: stays < 3 min for ≥80% of new accounts (KR1 — assembly must not slow onboarding)
  - name: Real-data integrity
    threshold: 100% of assembled workflows + prompted actions operate on the user's actual aggregated data — 0 mock/placeholder runs
  - name: Assembly correctness / no dead-end
    threshold: 100% of Goal.kinds WLT-3 can emit resolve to a workflow template (no "coming soon" dead-end); assembled workflow matches the declared Goal.kind
  - name: Tenant isolation
    threshold: Workflow/WorkflowRun owner-scoped (auth.uid()); same-user enforcement on workflow_id/goal_id FKs; cross-tenant reads/writes = 0
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [backend, data, frontend, product]
estimate:
  duration_weeks: 2
  confidence: low
  refined_by: brief-approval
  refined_at: 2026-06-11
  estimated_start: 2026-06-18
  estimated_end: 2026-07-01
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/1_tLI4T1udKEiw0f0VfpsmCRa_mC3x8-Kl5gpKg2SO10/edit

# WLT-4 — Workflow engine + pre-built workflows (intent → running workflow → first action)

## Problem

A user who declared an intent (WLT-3) now has a `Goal` sitting at `pending_workflow` and real aggregated data (WLT-2) — but **nothing runs**. They see WLT-11's _"we're putting your plan together"_ placeholder and then… nothing assembles, no action is prompted. The loop is open: declared intent → placeholder → dead end. This is precisely the failure mode the product thesis names — existing tools fail at **orchestration, not information** (product.md L60): they hand the user a blank canvas and manual discipline (YNAB, Monarch, Copilot each win one category but none turn a stated goal into a _running, personalized plan_). The user never gets the one thing they came for: a plan that's actually working and tells them the next concrete thing to do.

## User

The **Consumer persona (~80%)** — "connects accounts, runs pre-built/marketplace workflows, builds nothing; success = control + consistent progress" (product.md L23). At this point in the loop they've already declared an intent and connected real data; their job-to-be-done is _"turn what I said I want into something that's running and tells me my next move,"_ without composing anything themselves.

## Why this matters

This is the **convergence point of the MVP loop** and the bet that produces the **north-star unit itself**: WAWU = "users taking ≥1 platform-prompted financial action (run/adjust workflow, hit a savings rule, act on an anomaly) per 7-day window" (product.md L38), and **one WorkflowRun = one such action**. Until WLT-4 ships, WLT-2 (data) and WLT-3 (intent) are inputs to nothing and the **foundational hypothesis is untestable**. The portfolio names this the deepest unknown and the dependency-graph convergence point — "slip cascades to the whole loop" (portfolio.md DRI risk). It is the last bet to close the Phase-1 loop. Maps directly to the **Q2 Objective** ("Validate the intent-first front door converts intent → running workflow"), **KR1** (5 pre-built workflows across all 6 clusters) and **KR3** (baseline intent→workflow conversion).

## Hypothesis (the bet)

If we **auto-assemble a personalized, running workflow from a declared Goal on the user's real aggregated data — surfacing one concrete platform-prompted action** — then a declared-intent user will **complete ≥1 action (a WorkflowRun = the WAWU unit)**, measured by **intent→first-action conversion reaching ≥40% within 30 days** (the inaugural baseline). **Wrong if:** with the engine live, fewer than ~40% of declared-intent users complete a first action, OR assembly pushes TTFV past the 3-min target.

## Defensibility (optional for feature bets)

This is the feature that _activates_ the two primary moats, not just a convenience. Running workflows + their run-history raise **switching costs** (product.md moat row 2: "linked accounts + workflows + history = high exit friction") — leaving now means abandoning live automation, not just exporting data. And WorkflowRun outcomes become **proprietary action-effectiveness data** (moat row 3 / L68) that no point-solution competitor holds.

**Moat impact (one line):** Turns passive linked-data into embedded running automation → switching costs become real, and run outcomes seed the action-intelligence data moat.

## Scope

### In scope

- **Data model** (migration): `Workflow` (definition; JSONB config; soft-delete), `WorkflowRun` (execution instance = the WAWU action unit; status lifecycle), and a minimal `Block` representation for templates. Owner-scoped RLS (`auth.uid()`); **same-user FK enforcement** on `workflow_id` / `goal_id` (the WLT-11 composite-FK lesson — no forged cross-tenant links).
- **Goal → Workflow auto-assembly** via **template-selection + real-data personalization** (per elicitation): map each `Goal.kind` WLT-3 emits to a pre-built workflow template, then personalize it with the user's accounts/transactions (WLT-2). No runtime composition.
- **Pre-built workflow template set — one per `Goal.kind`** (per elicitation: "no dead-end"), spanning all 6 clusters (the KR1 "5 across 6" shape). Thin but real: each produces a concrete, real-data-backed action.
- **Platform-prompted action surface**: the assembled workflow surfaces ≥1 concrete action the user completes (**one tap → one WorkflowRun = WAWU**). Replaces WLT-11's "putting your plan together" placeholder with the live workflow.
- **WorkflowRun lifecycle**: assemble → propose action → user completes → run recorded; flip the consumed `Goal` `pending_workflow` → `assembled`.
- **Funnel events** (reusing the `emitFunnel` path, as `intent_declared` does): `workflow_assembled`, `action_completed` — the raw signal WLT-5 will instrument.

### Out of scope

- **Dynamic Block-composition** (assembling workflows from primitives at runtime) — deferred; MVP is template-select + personalize.
- **The marketplace** (`MarketplaceListing`, Builder-published workflows, the Block library) and the **Builder persona's** authoring tools — later phase (product.md L24).
- **WAWU / TTFV instrumentation dashboards** — WLT-5 owns; WLT-4 only _emits_ the events.
- **Anomaly-/alert-triggered** workflows — the first action set is goal-driven; anomaly triggers are a later slice.
- **Multi-step chains / scheduling beyond the first action** — the first WorkflowRun closes the loop; depth is a fast-follow.

## Open questions for Researcher

- Exact count of distinct `Goal.kind`s WLT-3's `INTENT_CLUSTERS` taxonomy emits — fixes the template count against the KR1 "5 across 6 clusters" target.
- The canonical **"first action" per template** (e.g., start a savings rule · confirm a spending category · set a tracking target) — the concrete WAWU unit per cluster; refine in `/create-bet-architecture` + design.
- **WorkflowRun retention posture**: it's an action record (audit-adjacent, retention-bound per architecture L88/L92) vs. user-soft-deletable config — confirm in architecture.

## Research findings

- **The gap is orchestration, not information** — the foundational thesis (product.md L60) and the moat analysis hold that incumbents lose on turning intent into a running plan, not on data display. WLT-4 is the bet that tests it directly.
- **Competitive white space** — point solutions each win one category (YNAB $109 budgeting, Monarch $99.99–$199 aggregation+budgets, Copilot $95) but **none auto-assemble a running workflow from a declared goal**; advisory ($300/hr) is inaccessible (product.md L35; portfolio.md Researcher DRI citing Monarch's ~1yr data-quality beta — [Sub Club](https://subclub.com/episode/learning-and-profiting-from-black-swan-events-val-agostino-monarch-money), [TechCrunch](https://techcrunch.com/2021/07/23/monarch-raises-4-8m/)).
- **Moat reinforcement** — running workflows + run-history are the mechanism behind the named primary moats (switching costs + data intelligence; product.md L67–L76).
- `n/a` categories: fresh quantitative/Sentry signal — `n/a — pre-launch; no production WAWU data yet (this bet establishes the baseline, KR3/KR5)`.

## User pain input (from Support)

`n/a — pre-launch; no support queue yet.` Proxy pain is the incumbent-orchestration-failure evidence above (product.md thesis + competitive set).

## Stories

_Decomposed one at a time via `/create-story WLT-4` after this brief is approved AND `/create-bet-architecture WLT-4` lands (architecture_required: true). Likely first story: the data model + single-template assembly + one cluster's action end-to-end (prove the loop closes), then breadth across the remaining Goal.kinds._

## DRI Log

### Decisions

- [2026-06-11] [PM] **Promoted from portfolio stub.** Scope = close the MVP loop: Goal → assembled running Workflow → one platform-prompted action (WorkflowRun = WAWU). Marketplace + Builder tooling explicitly deferred — area: scope — reversibility: medium
- [2026-06-11] [PM, elicited] **Workflow breadth = one template per `Goal.kind` (no dead-end)** — rationale: every declared intent across the 6 clusters must assemble into a real workflow or the loop dead-ends for that user; this is the "thin to the minimum needed for one loop" reading of the KR1 "5 across 6" target — area: scope — alternatives: one flagship cluster (rejected — leaves other clusters at "coming soon"), full richly-built KR1 set (rejected — over-scopes the convergence-point bet) — reversibility: easy
- [2026-06-11] [PM, elicited] **Engine depth = template-selection + real-data personalization; dynamic Block-composition deferred** — rationale: the loop closes with "pick the right template + fill it with the user's real data + surface one action"; runtime composition + the marketplace are a later phase and would push the loop-close out — area: scope/architecture — alternatives: dynamic Block-composition (rejected for MVP), hybrid template+Block-seam (rejected — over-engineering before the marketplace exists) — reversibility: medium
- [2026-06-11] [PM] **`architecture_required: true`** — the foundation defines the _entities_ (Goal/Workflow/WorkflowRun/Block, ER L119–123) but not the _engine_: the assembly algorithm, template/Block representation, the WorkflowRun state machine, and the action-surface contract are novel and load-bearing — area: process — reversibility: n/a
- [2026-06-11] [PM] **Primary metric = intent→first-action conversion (≥40%, inaugural baseline)** rather than raw WAWU — rationale: this bet's falsifiable claim is that the assembled workflow produces an action users actually take; WAWU is the ongoing north-star WLT-5 tracks — area: metrics — reversibility: easy
- [2026-06-11] [PM] **Jira/Confluence mirror skipped** — no MCP on this host (same posture as prior bets); logged per no-silent-skips — area: tooling — reversibility: easy

### Risks

- [2026-06-11] [PM] **Convergence-point slip cascades to the whole loop** (inherited from portfolio) — likelihood: medium — impact: high — mitigation: thinnest real scope chosen (template-select, one-per-kind); first story proves the loop end-to-end on ONE cluster before breadth — area: schedule
- [2026-06-11] [PM] **"Personalization" can degrade into a glorified static template** (no real data → no value, fails the Real-data guardrail + the trust moat) — likelihood: medium — impact: high — mitigation: Real-data-integrity guardrail (0 mock runs); each template must consume actual accounts/transactions to produce its action — area: product/trust
- [2026-06-11] [PM] **Measurement depends on WLT-5** (dashboards not built) — likelihood: high — impact: low — mitigation: WLT-4 emits raw `workflow_assembled` / `action_completed` into `auth_funnel_events` now; baseline is computable from raw events pre-WLT-5 — area: measurement
- [2026-06-11] [Security] **WorkflowRun executes an action on financial data = new write surface** — likelihood: medium — impact: high — mitigation: owner-scoped RLS + same-user FK enforcement; AAL2-gated; mandatory Security Review at build; AuditEvent on every run — area: security

### Issues

- [2026-06-11] [PM] Jira + Confluence MCPs not connected on this host — severity: low — owner: PM — status: open — area: tooling
