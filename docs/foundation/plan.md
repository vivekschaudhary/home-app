---
id: PROJECT-PLAN
type: plan
version: 2
status: living
created: 2026-06-05
last_refreshed: 2026-06-09
parent: FOUNDATION-PRODUCT
---

# Project Plan — Wealth at Your Fingertips

> Living, time-bound schedule for the MVP bet wedge. Derived from per-bet artifacts; refreshed by `/plan`. Never hand-edited — re-run `/plan` to refresh. Rows are bets (units of product intent), not implementation tasks.

**Last refreshed:** 2026-06-09 (version 2 — refresh after WLT-1 shipped + WLT-2/WLT-9 shipped to prod)

**MVP = the value loop completing once, measured:** sign up + MFA → connect a real account → declare an intent → get an auto-assembled workflow + do one prompted action — **TTFV < 3 min** (KR1) instrumented.

**Headline forecast:** MVP loop lands **~July 1, 2026** — *low-medium confidence*, gated by WLT-4 (the novel engine). Pulled in from the July 17 seed forecast on **observed velocity**: WLT-1 shipped in ~3 days and WLT-9 in ~1, vs the 2-week stub defaults.

## Currently in flight

| Bet | Title | Actual start | Progress | Est. end |
|-----|-------|--------------|----------|----------|
| WLT-2 | Account aggregation + CSV fallback | 2026-06-08 | **WLT-9 shipped + live in prod** (Plaid → Vault → Inngest → ingest; 154 real txns verified). **WLT-10 `ready`** (full-history + webhook sync). CSV / connection-health / Statements are later slices. | 2026-06-16 |

Loop-minimum for stage ② (connect + see real transactions) is **already met by WLT-9**.

## Next up (unblocked, not yet started)

| Bet | Title | Estimated start | Est. duration | Confidence |
|-----|-------|-----------------|---------------|------------|
| WLT-3 | Intent-first onboarding | 2026-06-10 | ~1 week | low |
| WLT-5 | TTFV + WAWU instrumentation | 2026-06-12 | ~1 week | low |

WLT-3 is the **critical-path unblocker for WLT-4** (`depends_on: WLT-1` ✅). WLT-5 has no deps and best instruments the loop as each stage lands.

## Blocked

| Bet | Title | Blocked by | Mitigation |
|-----|-------|------------|------------|
| WLT-4 | Workflow engine + pre-built workflows | WLT-3 (not started) + WLT-2 (in flight) | The wedge's convergence point — the novel core. Promote its brief early; `architecture_required` (block/workflow model) adds ~1 week. Thin the pre-built workflow set to the minimum for **one** loop. |

## Done

| Bet | Title | Actual start | Actual end | Notes |
|-----|-------|--------------|------------|-------|
| WLT-1 | Identity & MFA onboarding | 2026-06-05 | **2026-06-07** | Shipped to prod (WLT-6 passkey + WLT-7 TOTP); extracted + published as `@vc1023/passkey-2fa@0.3.0`. **WLT-8** (support-gated recovery) **parked** — not MVP-blocking. |
| — | Foundation (product/research/architecture/portfolio) | 2026-06-05 | 2026-06-05 | All `approved` (+ADR-001 passkey, ADR-002 Plaid). |

## Full schedule

| Bet | Title | Depends on | Est. start | Est. end | Actual start | Actual end | Dur (wk) | Confidence | Last refined by |
|-----|-------|------------|------------|----------|--------------|------------|----------|------------|-----------------|
| WLT-1 | Identity & MFA onboarding | — | 2026-06-05 | 2026-06-07 | 2026-06-05 | **2026-06-07** | 0.4 | high | build-actuals |
| WLT-2 | Account aggregation + CSV fallback | WLT-1 | 2026-06-08 | 2026-06-16 | **2026-06-08** | — | 1.2 | medium | build-actuals |
| WLT-3 | Intent-first onboarding | WLT-1 | 2026-06-10 | 2026-06-17 | — | — | 1 | low | dep-shift |
| WLT-5 | TTFV + WAWU instrumentation | — | 2026-06-12 | 2026-06-19 | — | — | 1 | low | re-sequence |
| WLT-4 | Workflow engine + pre-built workflows | WLT-2, WLT-3 | 2026-06-18 | 2026-07-01 | — | — | 2 | low | dep-shift |

## Calendar view

```
Week of:                  | Jun 9 | Jun 16 | Jun 23 | Jun 30 |
--------------------------|-------|--------|--------|--------|
WLT-1 (identity & MFA)    | done  |        |        |        |
WLT-2 (aggregation)       |  ██   |   ▓    |        |        |
WLT-3 (intent onboarding) |  ██   |   ▓    |        |        |
WLT-5 (instrumentation)   |   ░   |   ██   |   ▓    |        |
WLT-4 (workflow engine)   |       |   ░    |   ██   |  ▓→MVP |
```
_██ active · ▓ wrap-up · ░ start/spin-up_

## Refinement log

| Date | Bet | Field changed | From | To | Triggered by |
|------|-----|---------------|------|-----|--------------|
| 2026-06-09 | WLT-1 | est_end → actual_end | 2026-06-19 | **2026-06-07** | build-actuals — WLT-6/WLT-7 `status: shipped` (`docs/bets/WLT-1/stories/*`) |
| 2026-06-09 | WLT-2 | start → actual; est_end | 06-22 / 07-03 | **06-08 (actual)** / 06-16 | build-actuals — WLT-9 shipped + WLT-10 `ready` (`docs/bets/WLT-2/stories/*`) |
| 2026-06-09 | WLT-3 | estimated_start / end | 06-22 / 07-03 | **06-10 / 06-17** | dep `WLT-1` finished early (`actual_end 06-07`) unblocks it; scope re-sized to ~1wk |
| 2026-06-09 | WLT-5 | estimated_start / end | 06-08 / 06-19 | **06-12 / 06-19** | PM re-sequence — instrument the loop as stages land rather than day-1 |
| 2026-06-09 | WLT-4 | estimated_start / end | 07-06 / 07-17 | **06-18 / 07-01** | upstream bets pulled in (WLT-2/WLT-3 earlier) |

## Risks to plan

- **WLT-4 is the whole forecast** — it's novel (auto-assembly engine), double-dependent (WLT-2 + WLT-3), and `architecture_required`. Any slip moves the MVP date 1:1 — likelihood: medium — impact: high — mitigation: promote its brief early; thin pre-built workflows to one loop's minimum; spike the block/workflow model before committing stories.
- **Velocity may not hold for novel work** — WLT-1/WLT-2 were well-trodden (auth, aggregation); WLT-3/WLT-4 are more bespoke. The ~1-week estimates assume the observed pace continues — likelihood: medium — impact: medium — re-baseline at each brief promotion.
- **Capacity is solo** — the calendar shows dependency-feasible parallelism (WLT-2 ∥ WLT-3, WLT-5 alongside); a single builder serializes, which the dates already lean into but could still push WLT-4's start later — likelihood: medium — impact: medium — `/plan` re-run after WLT-3 brief.

## DRI Log

### Decisions
- [2026-06-09] [Project Manager] **MVP forecast re-baselined to ~2026-07-01** on build-actuals (WLT-1 in ~3d, WLT-9 in ~1d) — rationale: two shipped bets give real throughput; the July-17 stub forecast was 2-week-default-grade — area: scheduling
- [2026-06-09] [Project Manager] **WLT-3 is the recommended next start** (over more WLT-2 slices) — rationale: WLT-2 already meets the loop-minimum (WLT-9); WLT-3 is the unblocker for WLT-4, the long pole — area: sequencing
- [2026-06-05] [Project Manager] Plan kept repo-only (no GDrive mirror) — derived artifact regenerated every `/plan`; stakeholder surface is the dashboard Plan tab — area: tooling

### Risks
- [2026-06-09] [Project Manager] Confidence still low on the 3 unbuilt bets (WLT-3/4/5 are stubs/next-up) — likelihood: high — impact: medium — mitigation: refinement log + confidence column flag staleness; re-run `/plan` at each promotion

### Issues
_None._

---

_Living artifact — re-run `/plan` to refresh. Cron-driven refresh available per `compass/config.yaml`._
