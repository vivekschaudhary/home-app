---
id: WLT-5
type: feature
status: proposed
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: []
parallel_with: [WLT-1]
architecture_required: false
created: 2026-06-05
author: PM
sources:
  - gdrive://1Ejx3hxaXrwmC7TObNFCLWWzntvLd0JfsLFya82TqIA4
  - docs/foundation/product.md
  - docs/foundation/portfolio.md
  - packages/core/funnel.ts
key_metric:
  name: instrumentation completeness — TTFV (per-user + p80), weekly WAWU, and stage-by-stage funnel conversion all computable + rendered on the admin surface
  baseline: 0 (events emit into auth_funnel_events, but nothing computes TTFV/WAWU/conversion — the hypothesis is unfalsifiable today)
  target: all three metric families live + a baseline snapshot recorded within 30 days (KR4 "TTFV instrumentation live vs <3-min target")
  source: auth_funnel_events (the 17-event frozen contract in packages/core/funnel.ts); snapshots in docs/metrics/
guardrails:
  - name: No PII in metrics
    threshold: metric outputs carry aggregates/enums/ids only — 0 PII columns on the admin surface or in snapshots (events already carry no PII; preserve)
  - name: No per-user exposure
    threshold: the admin surface shows cross-user aggregates only — no per-user drill-down
  - name: Zero user-path load
    threshold: metrics are read-only views/queries — 0 writes and 0 added latency on any user-facing path
  - name: Event contract frozen
    threshold: 0 renames/schema changes to auth_funnel_events or FUNNEL_EVENTS — consolidation happens in views, not in the contract
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [backend, data, frontend, product]
estimate:
  duration_weeks: 1
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-12
  estimated_start: 2026-06-12
  estimated_end: 2026-06-19
primary: gdrive://1Ejx3hxaXrwmC7TObNFCLWWzntvLd0JfsLFya82TqIA4
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/1Ejx3hxaXrwmC7TObNFCLWWzntvLd0JfsLFya82TqIA4/edit

# WLT-5 — TTFV + WAWU instrumentation (make the hypothesis falsifiable)

## Problem

The MVP loop is **closed but unmeasured**. All five stages are live in production and every funnel event already lands in `auth_funnel_events` (`signup_started → … → account_linked → intent_declared → workflow_assembled → action_completed` — 17 events, `packages/core/funnel.ts`), but **nothing computes anything from them**: there is no TTFV clock, no WAWU count, no funnel-conversion view, and `docs/metrics/` is empty. The foundational hypothesis ("Wrong if: Day-30 retention stays below ~40% or TTFV can't get under ~3 min" — product.md L60) is therefore **unfalsifiable today** — exactly the state Q2 KR4 ("TTFV instrumentation live vs <3-min target", product.md L54) exists to prevent. Every week without measurement is a week of real-user signal lost.

## User

Primarily **the team/DRI** (the brief's "user" is the operator of the bet portfolio): the PM needs TTFV/WAWU/conversion baselines to validate or kill the foundational bet, and the `/measure` + `/metrics` workflows need real numbers to run at all. Indirectly **every end user** — the loop only improves if its drop-offs are visible.

## Why this matters

This is the **last MVP bet** and the one the portfolio exists to serve: "the loop completing once, **measured**" (portfolio.md MVP definition — instrumentation is in the user's own one-sentence MVP). It maps directly to **KR4** (TTFV instrumentation live), **KR5** (establish the WAWU baseline), and **KR3** (baseline intent→workflow conversion). The north-star metric itself (**WAWU**, product.md L38) is currently uncomputed — the product has a north star nobody can see. With WLT-12 shipped, every input event exists; this bet is pure leverage: ~1 week of views + one gated page makes the entire 6-day build measurable.

## Hypothesis (the bet)

If we compute **TTFV, weekly WAWU, and stage-by-stage funnel conversion** from the already-emitting events and surface them on an admin page + `/measure` snapshots, then the foundational hypothesis becomes **falsifiable**: the team can read a real baseline within days of user traffic and validate/refute KR1/KR3/KR5 — measured by all three metric families being live + a recorded baseline snapshot within 30 days. **Wrong if:** the events as emitted turn out insufficient to compute TTFV or WAWU without schema changes (the frozen contract fails its purpose).

## Defensibility (optional for feature bets)

Indirect. Measurement doesn't create a moat itself, but the **data/proprietary-intelligence moat** (product.md row 3) starts with knowing which prompted actions users actually take — `action_completed` aggregates are the seed of action-effectiveness intelligence.

**Moat impact (one line):** No direct moat; it's the instrument panel the data moat is steered by.

## Scope

### In scope
- **TTFV** — clock = **`signup_started` → `action_completed`** per user (the full loop; elicited decision #1): per-user durations, the **p80 vs the <3-min target** (KR1's "≥80% of new accounts" framing), plus **split times** at `account_linked` and `workflow_assembled` so a red TTFV is attributable (product speed vs OAuth vs deliberation).
- **WAWU** — weekly rollup: distinct users with ≥1 `action_completed` per 7-day window (the WorkflowRun = the WAWU unit, product.md L38). The KR5 baseline.
- **Funnel conversion** — stage-by-stage: signup → mfa_enrolled → account_linked → intent_declared → workflow_assembled → action_completed; includes KR3's **intent→workflow conversion baseline** (also WLT-4's key_metric source).
- **SQL views** (read-only, additive migration) over `auth_funnel_events` implementing the above — the single query source both surfaces render from.
- **Admin metrics page** (elicited decision #2): in-app, **AAL2 + admin-gated** (`users.role` / allow-list — mechanism decided at story level), server-rendered, **cross-user aggregates only, no per-user drill-down, no PII**.
- **`/measure` wiring** — the queries packaged so the compass `/measure` workflow can record `docs/metrics/<bet-id>-<date>.json` snapshots + brief check-ins (the framework's artifact trail).

### Out of scope
- **Event renames / schema changes** — the contract stays frozen; consolidation happens in views (decided, see DRI).
- **Day-30 retention, plan-adherence, anomaly catch rate** — named as WAWU input metrics (product.md L38) but their features don't exist yet; each lands with its feature.
- **Alerting/paging** on metric thresholds — read first, alert later.
- **User-facing metrics** (e.g. "your progress") — a product surface, not instrumentation.
- **Sentry product-analytics expansion** — Sentry stays errors/performance; the funnel store is Postgres (architecture cross-cutting standards).

## Open questions for Researcher

- Exact p-quantile presentation for KR1 ("<3 min for ≥80%" → p80 ≤ 180s) — confirmed as the headline stat; per-stage split-time medians accompany it.
- Whether `signup_started` fires reliably pre-account-creation for anonymous visitors (clock-start integrity) — verify in the story against the WLT-6 emit points.
- Minimum traffic for a non-noisy baseline — pre-launch, n is tiny; snapshots must carry n alongside every aggregate.

## Research findings

- **The contract was built for this** — every event was added "ADDITIVE only … WLT-5 owns the consolidated funnel" (packages/core/funnel.ts L12–21); the table was named "WLT-5 schema contract" at creation (migration 0002 L73). The instrumentation seam has been kept clean across all four bets.
- **The framework expects it** — `/measure` and `/metrics` workflows exist and expect `key_metric` + `docs/metrics/<bet>-<date>.json` snapshots; `docs/metrics/` is empty (only `.gitkeep`). This bet feeds the machinery that's already installed.
- **The definitions are canonical** — WAWU (product.md L38), KR1 <3min/≥80% (L43), KR4 instrumentation-live (L54), KR3 conversion baseline (L53); the MVP definition itself ends "**with TTFV instrumented**" (portfolio.md L27).
- `n/a` categories: competitive/quantitative — `n/a — internal instrumentation bet; no competitive surface, no production traffic yet (this bet creates the quantitative baseline)`.

## User pain input (from Support)

`n/a — pre-launch; no support queue. The "user" here is the DRI flying blind without an instrument panel.`

## Stories

_Decomposed via `/create-story WLT-5` after approval. Likely a single story (1-week bet): views migration + admin page + snapshot wiring; possibly a second thin slice if the admin-role mechanism warrants its own review._

## DRI Log

### Decisions
- [2026-06-12] [PM] **Promoted from portfolio stub.** Scope = compute + surface (views, admin page, snapshots); the emission layer is already complete — this bet writes no new events — area: scope — reversibility: easy
- [2026-06-12] [PM, elicited] **TTFV clock = `signup_started` → `action_completed`** (the full loop; value = the user *acted*) — rationale: the strictest reading of the MVP definition ("the loop completing once"); honest consequence: the <3-min target now includes Plaid OAuth + human deliberation, so **split times at `account_linked` and `workflow_assembled` ship alongside** to make a miss attributable — area: metrics — alternatives: stop at `workflow_assembled` (rejected — measures the product's speed but not the thesis's "action" claim), stop at `account_linked` (rejected — undersells the value moment) — reversibility: easy (views recompute)
- [2026-06-12] [PM, elicited] **Measurement surface = in-app AAL2 + admin-gated metrics page**, with `/measure` snapshots as the artifact trail — rationale: day-to-day visibility in the product itself; aggregates-only + no-PII guardrails bound the new surface's risk — area: surface — alternatives: SQL views + snapshots only (rejected — DRI wants an in-product panel), external Supabase Studio/Sentry (rejected — metrics outside the repo, vendor-coupled reading of the north star) — reversibility: easy
- [2026-06-12] [PM] **The event contract stays frozen — renames declined** — rationale: WLT-5 owns the rename right (funnel.ts L13) and exercises it by *declining*: every consumer comment says "no rename later", and views give consolidation without breaking the seam — area: data — reversibility: medium
- [2026-06-12] [PM] **`architecture_required: false`** — within-stack (Postgres views + one gated Next page + the existing emit/RLS patterns); no new tooling, boundaries, or contracts — area: process — reversibility: n/a
- [2026-06-12] [PM] **Jira/Confluence mirror skipped** — no MCP on this host (consistent posture); logged per no-silent-skips — area: tooling — reversibility: easy

### Risks
- [2026-06-12] [PM] **Tiny-n baseline reads as signal** — pre-launch traffic is ~1 real user — likelihood: high — impact: medium — mitigation: every aggregate carries its n; snapshots labeled pre-launch; no KR verdicts until n is meaningful — area: measurement
- [2026-06-12] [PM] **Full-loop TTFV may read red for non-product reasons** (OAuth latency, user deliberation) — likelihood: medium — impact: medium — mitigation: the split times decompose the clock; KR conversations cite the splits — area: metrics
- [2026-06-12] [Security] **New admin surface over cross-user data** — likelihood: low — impact: high — mitigation: AAL2 + admin gate, aggregates-only, no PII, service-role reads server-side only; mandatory Security Review at build — area: security

### Issues
- [2026-06-12] [PM] Jira + Confluence MCPs not connected on this host — severity: low — owner: PM — status: open — area: tooling
