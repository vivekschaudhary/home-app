---
id: PROJECT-PLAN
type: plan
version: 1
status: living
created: 2026-06-05
last_refreshed: 2026-06-05
parent: FOUNDATION-PRODUCT
---

# Project Plan — Wealth at Your Fingertips

> Living, time-bound schedule for the MVP bet wedge. Derived from per-bet artifacts; refreshed by `/plan`. Never hand-edited — re-run `/plan` to refresh. Written for stakeholders: rows are bets (units of product intent), not implementation tasks.

**Last refreshed:** 2026-06-05 (version 1 — seed run, portfolio approved 2026-06-05)

**Headline forecast:** MVP loop ("one real user completes the core value loop once") lands **~July 17, 2026** — *low confidence*: all five bets are unpromoted stubs on default 2-week estimates. The forecast sharpens at each brief approval; treat this as a starting calendar and slip-detector, not a commitment.

## Currently in flight

_None — portfolio approved today; no bet has started._

## Next up (unblocked, not yet started)

| Bet | Title | Estimated start | Estimated duration | Confidence |
|-----|-------|-----------------|---------------------|------------|
| WLT-1 | Identity & MFA onboarding | 2026-06-08 | 2 weeks | low |
| WLT-5 | TTFV + WAWU instrumentation | 2026-06-08 | 2 weeks | low |

Both are day-1 starts with no dependencies — the two parallel streams from the portfolio.

## Blocked

| Bet | Title | Blocked by | Since | Mitigation |
|-----|-------|------------|-------|------------|
| WLT-2 | Account aggregation + CSV fallback | WLT-1 (identity must exist before account connections) | 2026-06-05 | Promote WLT-2's brief during WLT-1 build so it starts the day WLT-1 lands |
| WLT-3 | Intent-first onboarding | WLT-1 (intent capture sits behind sign-in) | 2026-06-05 | Same — brief promotion can run ahead of the dependency |
| WLT-4 | Workflow engine + pre-built workflows | WLT-2 + WLT-3 (engine consumes real data + declared intents) | 2026-06-05 | Convergence point of the wedge — promote its brief early (PM DRI risk, portfolio.md) |

## Done

_None yet._

## Full schedule

| Bet | Title | Depends on | Est. start | Est. end | Actual start | Actual end | Duration (wk) | Confidence | Last refined by |
|-----|-------|------------|------------|----------|--------------|------------|---------------|------------|-----------------|
| WLT-1 | Identity & MFA onboarding | — | 2026-06-08 | 2026-06-19 | — | — | 2 | low | stub |
| WLT-5 | TTFV + WAWU instrumentation | — | 2026-06-08 | 2026-06-19 | — | — | 2 | low | stub |
| WLT-2 | Account aggregation + CSV fallback | WLT-1 | 2026-06-22 | 2026-07-03 | — | — | 2 | low | stub |
| WLT-3 | Intent-first onboarding | WLT-1 | 2026-06-22 | 2026-07-03 | — | — | 2 | low | stub |
| WLT-4 | Workflow engine + pre-built workflows | WLT-2, WLT-3 | 2026-07-06 | 2026-07-17 | — | — | 2 | low | stub |

## Calendar view

```
Week of:                  | Jun 8 | Jun 15 | Jun 22 | Jun 29 | Jul 6 | Jul 13 |
--------------------------|-------|--------|--------|--------|-------|--------|
WLT-1 (identity & MFA)    |  ██   |   ██   |        |        |       |        |
WLT-5 (instrumentation)   |  ██   |   ██   |        |        |       |        |
WLT-2 (aggregation + CSV) |       |        |   ██   |   ██   |       |        |
WLT-3 (intent onboarding) |       |        |   ██   |   ██   |       |        |
WLT-4 (workflow engine)   |       |        |        |        |  ██   |   ██   |
```

## Refinement log

| Date | Bet | Field changed | From | To | Triggered by |
|------|-----|---------------|------|-----|--------------|
| 2026-06-05 | WLT-1 | estimated_start / estimated_end | — | 2026-06-08 / 2026-06-19 | seed run — portfolio approved (docs/foundation/portfolio.md v1, dep-graph root) |
| 2026-06-05 | WLT-5 | estimated_start / estimated_end | — | 2026-06-08 / 2026-06-19 | seed run — portfolio approved (no dependencies, day-1 parallel stream) |
| 2026-06-05 | WLT-2 | estimated_start / estimated_end | — | 2026-06-22 / 2026-07-03 | seed run — dep-graph position (after WLT-1) |
| 2026-06-05 | WLT-3 | estimated_start / estimated_end | — | 2026-06-22 / 2026-07-03 | seed run — dep-graph position (after WLT-1) |
| 2026-06-05 | WLT-4 | estimated_start / estimated_end | — | 2026-07-06 / 2026-07-17 | seed run — dep-graph position (after WLT-2 + WLT-3) |

## Risks to plan

- **Parallel streams assume parallel capacity** — the calendar shows dependency-feasible parallelism (WLT-1 ∥ WLT-5, then WLT-2 ∥ WLT-3); a solo builder serializes these, pushing the loop-complete forecast toward ~mid-August — medium / medium — re-run `/plan` after first brief approval with honest capacity
- **WLT-4 convergence slip cascades** — both mid-graph bets feed it; any slip moves the headline date 1:1 — medium / high — promote WLT-4's brief early; thin the pre-built workflow set to the minimum for one loop
- **All estimates are stub-grade (2wk defaults)** — first brief promotions could re-size bets materially in either direction — high / medium — confidence column flags this; forecast re-baselines at each promotion

## DRI Log

### Decisions

- [2026-06-05] [Project Manager] Seed schedule starts Monday 2026-06-08 (first business day after approval), full-overlap parallelism per the portfolio's parallel-build candidates — rationale: dependency-feasible schedule is the honest baseline; capacity-adjusted serialization is a refinement once real throughput data exists — area: scheduling
- [2026-06-05] [Project Manager] Plan kept repo-only (no GDrive mirror) — rationale: plan is a living derived artifact regenerated on every `/plan`; the stakeholder surface is the dashboard Plan tab, and a GDrive copy would go stale immediately — logged per no-silent-skips — area: tooling

### Risks

- [2026-06-05] [Project Manager] Stub-grade confidence on 100% of rows — likelihood: high — impact: medium — mitigation: refinement log + confidence column make staleness visible; re-run `/plan` after each brief approval

### Issues

_None._

---

_Living artifact — re-run `/plan` to refresh. Cron-driven refresh available per `compass/config.yaml`._
