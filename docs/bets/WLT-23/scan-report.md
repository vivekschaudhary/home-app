---
id: SCAN-WLT-23
type: scan-report
status: living
bet_id: WLT-23
current_phase: Production Ready
scanned_at: 2026-06-19 20:46 UTC
scanner_version: 1
open_findings:
  critical: 4
  high: 1
  medium: 1
  low: 0
suppressed_findings: 1
blocking_advance: true
---

# Scan Report — WLT-23 (Transactions: a searchable ledger of all your activity)

> Continuous quality scanner output. Findings, not failures. Re-render with `/scan WLT-23`. Never hand-edited — the next `/scan` overwrites (suppressions preserved by ID). Owners triage; the scanner informs.

**Scanned:** 2026-06-19 20:46 UTC · **Current phase:** Production Ready · **Mode:** strict (per `compass/config.yaml` `scanner.per_phase.production_ready`)

## Summary

- **Open findings:** 6 total (4 critical · 1 high · 1 medium · 0 low)
- **Suppressed:** 1 (BUILD-03 — owner-accepted, linked below)
- **Blocking phase advance:** **yes** (strict mode + 4 open Criticals) — *but see context: all four are the standard Production-Ready artifact gaps for a feature that ships on already-prod infra; strong suppression candidates, not defects.*
- **Top pattern this scan:** **bet-level Production-Readiness artifacts absent** (runbook / SLO / monitoring / rollback / on-call / cost) — WLT-23 shipped to prod reusing shipped infra (WLT-2 data, WLT-20 shell, WLT-22 routes, OPS-1/OPS-2 ops) **without bet-specific ops docs**. Product / Architecture / Build phases are clean.

## Findings by phase

### Product — _no open findings_

PROD-01 (approved ✓ — `status: shipped`, "Approved by: Vivek (DRI) 2026-06-18") · PROD-02/03 (clear User + In/Out-of-scope) · PROD-04 (testable hypothesis: `transactions_viewed`, baseline 0, target, "wrong if") · PROD-05 (≥3 cited sources: operator feedback + Monarch/Copilot/YNAB + technical feasibility) · PROD-06 (Defensibility section present) · PROD-07 (approval recorded) — all pass.

### Architecture — _declined via DRI; no open findings_

ARCH-01 satisfied: `architecture_required: false` with a documented DRI decision ("no new schema, no re-sync, no new architectural decision — owner-scoped read of existing `transactions` + list UI + `NAV_SECTIONS` entry"). No new external service → ARCH-05 n/a. ARCH-02/03/04/06/07 n/a (no architecture doc required).

### Build — 1 suppressed

BUILD-01/02 pass (each story has unit + component test refs; API routes reused). BUILD-04 pass (all 4 PRs #66/#67/#68/#69 merged, zero open BLOCKERs). BUILD-05 pass (Security reviews ran on #66 + #68; the recategorize write path + RLS isolation were security-reviewed in WLT-22 and reused unchanged). BUILD-06/07 n/a (no arch doc / no perf budget defined).

#### [HIGH] BUILD-03 — E2E coverage gap (WLT-23-3 recategorize-from-the-ledger) — **SUPPRESSED**

See **Suppressed findings** below.

### Production Ready — 4 critical · 1 high · 1 medium

#### [CRITICAL] PROD_READY-01 — Runbook missing

- **Confidence:** High — `docs/bets/WLT-23/runbook.md` does not exist (file-absence check).
- **Location:** `docs/bets/WLT-23/runbook.md` (absent)
- **Reason:** No bet-level operational runbook (diagnostic steps, common failures, escalation). Confidence High because it's a pure file-existence check.
- **Fix:** Either add a short `runbook.md` (the ledger is a read + the reused recategorize write — likely diagnostics: "rows empty → check the WLT-2 sync / RLS session; recategorize failing → the WLT-22 `/api/categories` path"), **or** suppress with a DRI entry noting the bet adds no new operational surface (reuses WLT-2/WLT-20/WLT-22 + OPS-1/OPS-2).
- **Applies to:** all except continuous-improvement · **Suppressible:** Yes (DRI)

#### [CRITICAL] PROD_READY-02 — SLO undefined

- **Confidence:** High — `docs/bets/WLT-23/slo.md` absent.
- **Location:** `docs/bets/WLT-23/slo.md` (absent)
- **Reason:** No SLI / target / error-budget / alert thresholds for the ledger. High confidence (file-absence).
- **Fix:** Define a minimal SLO (e.g. `/transactions` p95 latency + read error-rate), **or** suppress (HITL) noting the surface rolls up under the app-wide availability SLO and adds only owner-scoped reads.
- **Applies to:** all except continuous-improvement · **Suppressible:** Yes (HITL approval)

#### [CRITICAL] PROD_READY-03 — Monitoring not wired

- **Confidence:** Medium — no bet-specific dashboards/alerts artifact, and no observability MCP connected this run to corroborate (Sentry MCP disconnected). Medium because absence couldn't be MCP-confirmed.
- **Location:** observability config / `docs/bets/WLT-23/` (no monitoring artifact)
- **Reason:** No evidence of bet-level monitoring (error/latency alerts) for `/transactions` + the recategorize path. The product-metric funnel events (`transactions_viewed` / `transactions_filtered`) are wired, but those are adoption signals, not ops monitoring.
- **Fix:** Confirm app-wide error/latency monitoring covers the new route (likely yes via the platform), document it, **or** suppress (HITL) with that confirmation.
- **Applies to:** all production-bound bets · **Suppressible:** Yes (HITL approval)

#### [CRITICAL] PROD_READY-04 — Rollback untested

- **Confidence:** Medium — no DRI entry confirming a non-prod rollback test for WLT-23; the de-facto path (Vercel redeploy-to-previous, additive/expand-only — no migration) exists but is undocumented for this bet.
- **Location:** `docs/bets/WLT-23/` DRI / ops notes (no rollback-test entry)
- **Reason:** No recorded rollback test. Medium confidence: the bet is purely additive (UI + a read + a reused write; **no migration**), so rollback = revert the deploy — low-risk but unverified on paper.
- **Fix:** Add a one-line DRI confirming rollback = Vercel revert (no schema to unwind), **or** suppress (HITL).
- **Applies to:** all except continuous-improvement · **Suppressible:** Yes (HITL approval)

#### [HIGH] PROD_READY-05 — On-call unprepared

- **Confidence:** High — no DRI ack from on-call on a runbook (and no runbook exists).
- **Location:** `docs/bets/WLT-23/` DRI (no on-call ack)
- **Reason:** No on-call acknowledgment. Dependent on PROD_READY-01 (no runbook to ack). High confidence.
- **Fix:** On-call acks the runbook once it exists, **or** suppress (DRI) given the additive, reused-infra nature.
- **Applies to:** all production-bound bets · **Suppressible:** Yes (DRI)

#### [MEDIUM] PROD_READY-07 — Cost monitoring absent

- **Confidence:** Medium — no cost-threshold alerts; no cost guardrail in the brief.
- **Location:** cost monitoring config (none for this bet)
- **Reason:** The ledger adds DB read load (the resolved-category filter's keyset scan reads up to a bounded `20×PAGE_SIZE` per request). No cost alerting, but the scan is **bounded** by design and reads existing data. Medium confidence.
- **Fix:** Accept (owner) given the bounded read pattern, **or** add a DB-read/cost threshold alert.
- **Applies to:** all production-bound bets · **Suppressible:** Yes (owner accept)

#### PROD_READY-06 / 08 / 09 — not raised (assessed n/a or satisfied)

- **PROD_READY-06 (Backup unverified)** — **n/a:** WLT-23 introduces **no new data store** (reads existing `transactions`; the recategorize write uses the existing WLT-22 tables — last migration is `0012`).
- **PROD_READY-08 (Compliance unverified)** — **satisfied by inheritance** (confidence Medium): no new data category or flow — same financial-transaction data, **same owner-scoped RLS + AAL2 posture** established at foundation + WLT-2, and **proven owner-isolated** by the WLT-23-1/23-2 gated real-path E2Es (second user can't read another's rows/account names). No new collection/sharing → the non-suppressible financial-data trigger does not apply.
- **PROD_READY-09 (Vendor capability unverified)** — **n/a / pass:** relies only on the baseline stack (Supabase Postgres / PostgREST keyset + `.or()` filters + RLS), already exercised against a real Postgres in CI + the gated E2Es. No new vendor feature beyond the foundational baseline.

### GTM — _phase not yet active_
### Operate — _phase not yet active_

## Suppressed findings

| ID | Severity | Suppressor | Date | Rationale | DRI link |
|---|---|---|---|---|---|
| BUILD-03 | High | Vivek (Human) | 2026-06-19 | The recategorize **write path** (session→RLS→render + second-user isolation) is already E2E-proven by **WLT-22** on the same routes + the same `CategoryPicker`. The WLT-23-3 delta is the picker's placement in the ledger + the reconcile logic — both covered by the new component tests. Accepted rather than add a near-duplicate browser E2E. | `docs/bets/WLT-23/stories/WLT-23-3/story.md` DRI (E2E coverage decision) |

## Scan history

| Version | Scanned at | Phase | Critical | High | Medium | Low | Suppressed | Blocking |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-06-19 20:46 UTC | Production Ready | 4 | 1 | 1 | 0 | 1 | yes |

---

_Derived, not authored. Owners triage findings; suppress (with rationale) or remediate, then re-run `/scan WLT-23`._
