---
id: WLT-16
bet: WLT-15
type: story
status: in-build
priority: P1
created: 2026-06-14
author: PM
design_link: docs/bets/WLT-15/stories/WLT-16/design.md
area_tags: [frontend, backend, data, jobs, metrics]
dependencies:
  - WLT-12   # the running net-worth workflow + target (the population this serves)
  - WLT-10   # settled 24-month history / balances the snapshot samples
  - WLT-13   # the /admin/metrics surface the return panel extends
---

# WLT-16 — The "since last time" recap: net-worth movement + target progress + one move

## Description

A returning user opens the dashboard and, for the first time, sees **what changed with their money since last time** and **where they stand against their target** — plus **one** move they can make. This is the slice that closes the dogfood dead-end ("nothing left to do" after setting a target): it wires the WLT-12 "running" workflow to **actually track** (daily net-worth sampling → a progress bar that moves), and it turns the visit into a **repeatable WAWU action** — completing the one prompted action writes a `WorkflowRun` the user can take again next week. Spending-vs-last-week and anomalies are explicitly **out of this story** (later WLT-15 slices); this story builds the core new infra (the `net_worth_snapshots` time-series + daily job) and proves the return mechanic end-to-end.

## Acceptance Criteria

- [ ] **AC1 — Daily net-worth sampling.** A new Inngest cron (`netWorthSnapshotDaily`) fans out over users with active connections and writes **one** `net_worth_snapshots` row per user per day (net worth, assets, debts from current balances). Idempotent on `(user_id, captured_on)` — re-running the same day inserts nothing new. Runs **off the request path** (never in RSC render).
- [ ] **AC2 — Movement, real or absent.** When ≥2 snapshots exist, the recap shows net-worth **movement since the prior period** in words ("Up {amount} / Down {amount} / About the same"). With <2 snapshots, it shows the honest **cold-start** line (`recap.coldStart`) and **never a fabricated movement number** ($0-change is not shown as "movement").
- [ ] **AC3 — Progress toward target (the thing that now tracks).** The recap renders a progress bar + plain "{current} of {target}" + "{percent}% there", computed from the latest net worth vs `workflow.config.target`. This appears from day one (no snapshot history required for current-vs-target).
- [ ] **AC4 — Exactly one prompted action, state-ranked + honest.** The recap surfaces **at most one** primary action (behind → "Adjust your target"; on-track/ahead → "Aim higher?"; cold-start → no manufactured action). The action opens the **real target step** (reuses the WLT-12 target mechanism) — no vanity tap.
- [ ] **AC5 — The action writes a repeatable WAWU run.** Completing the action calls `POST /api/recap/action`, which writes a `workflow_runs` row (new recap `kind`) and emits `action_completed` (context `{ action_type, source: "recap" }`, amounts/enums only — **no PII**). It is **weekly-idempotent**: re-submitting the same week is a no-op (200); the user **can** take the action again in a later ISO week (so WAWU is repeatable). The onboarding once-ever `target_set` guard is untouched.
- [ ] **AC6 — Return instrumentation + metrics.** Viewing the recap emits `recap_viewed` (carries `user_id`); a new `metrics_return_weekly` view counts distinct users with ≥1 `recap_viewed` per 7-day window; `/admin/metrics` gains a **return-rate** panel (AAL2 + `ADMIN_EMAILS` gated, like the existing panels). Existing `metrics_wawu_weekly` now also counts recap actions (no view change needed — they emit `action_completed`).
- [ ] **AC7 — Reconcile-on-load (the #36 lesson).** The recap reads **live** on mount and never trusts stale server props; persistence happens only in the route handler. A real-path E2E asserts the rendered surface against real DB rows (per `[real-path-integration-coverage]`).
- [ ] **AC8 — Owner-scoped + flagged.** `net_worth_snapshots` is owner-SELECT / service-role-INSERT with default-deny RLS (cross-tenant test proves it). The surface is behind `RECAP_ENABLED` (default off), so it can ship dark and flip on after ≥1 snapshot cycle.

## Standard Experience Checklist

- [ ] **Navigation** — the recap lives on `/dashboard` (no new route); the one action's target step has Cancel/Esc back to the recap (reused from WLT-12): **AC4** + design "Surfaces & flow".
- [ ] **States** — loading (`recap.loading`), cold-start/empty (`recap.coldStart`, **AC2**), steady/on-track/behind (**AC2/AC3**), success/acked (`acked.line`, **AC5**), disabled (action busy while saving), error (discriminated banner): **AC2, AC3, AC4, AC5** + design States table.
- [ ] **Feedback** — error messages discriminate network / save / server (copy `errors.*`); success acknowledgment on the action (`acked.line`); the action is a deliberate decision on real data, not destructive → no confirm dialog needed: **AC5** + copy `errors.*`.
- [ ] **Accessibility** — focus moves to the acked line on completion; progress bar uses `role="progressbar"` + `aria-valuenow/min/max`; SR labels spell out movement+net-worth+progress; direction in words not color; reduced-motion honored; keyboard-operable action + target step: design "Accessibility" + copy `a11y.*`.
- [ ] **Edge cases** — cold-start (<2 snapshots, **AC2**); missing balances / connection error → recap hides rather than showing a hollow shell (defers to WorkflowCard repair path); slow load → skeleton not spinner; no target set → recap doesn't appear (WorkflowCard onboarding owns the screen); action save failure → figures still render, action retryable: design "States" + "Honest/reduced-design notes".
- [ ] **Cross-surface consistency** — `n/a — web-only at Phase 1 (foundational Stack: deploy_targets [web]); no mobile/native surface exists`.

## Tech notes

Build strictly within the approved bet architecture (`docs/bets/WLT-15/architecture.md`) — **no foundational-stack deviation** (Postgres + Inngest + Next Route Handlers/RSC + the funnel only).

- **Migration `0008_recap.sql` (this story = the snapshot half):** `net_worth_snapshots` table (cols + `unique (user_id, captured_on)` + index `(user_id, captured_on desc)` + owner-SELECT/service-role-INSERT RLS); add `recap_viewed`, `recap_action_prompted` to the `auth_funnel_events` event allowance; `metrics_return_weekly` view; the `workflow_runs` recap-kind weekly idempotency (per-`(workflow_id, kind, iso_week)` partial unique index) leaving `uniq_workflow_runs_kind_once` intact for `target_set`. **The `anomalies` table is NOT in this story** (Slice 2).
- **Domain (`packages/core/recap.ts`, pure):** `computeNetWorthMovement(snapshots)`, `computeTargetProgress(currentNetWorth, workflowConfig)`, `selectPromptedAction(signals) → PromptedAction | null` (the ranker — only target/movement signals this slice). Reuse `personalizeNetWorth()` / `readAccountBalances()` for current net worth.
- **Job (`packages/jobs/recap/snapshot.ts`):** `netWorthSnapshotDaily` `{ cron: "0 8 * * *" }`, fan-out pattern matching `aggregationScheduledRefresh`; register in `packages/jobs/index.ts`.
- **Read + surface:** `app/lib/recap.ts` `getRecap(userId)` (live reads); `app/dashboard/RecapCard.tsx` rendered above `WorkflowCard` in `app/dashboard/page.tsx`; reconcile-on-load.
- **Routes:** `app/api/recap/action/route.ts` (POST → repeatable WorkflowRun + `action_completed`); the target step reuses the existing `/api/workflow/action` mechanism where it fits, or a recap-scoped write — Engineer's call, but the weekly-idempotency contract (AC5) is fixed.
- **Metrics:** extend `app/lib/metrics.ts` + `app/admin/metrics/page.tsx` with the return panel.
- **Escalate (per architecture I2):** the "behind target" pace/threshold math and the exact recap action taxonomy (adjust vs raise vs affirm) — start conservative; don't improvise the numbers.
- **Carry the lessons:** reconcile-on-load + real-path E2E (`[real-path-integration-coverage]`, #36); no write in RSC render; no PII in events/derived rows; mandatory Codex Security Review (touches financial reads + a new write path).

## PRs

_Auto-populated as PRs open._

## Tests

_Engineer: unit (recap.ts computations incl. cold-start + ranker; the snapshot job idempotency), API (`/api/recap/action` weekly idempotency + emits; owner-scope), component (RecapCard states), RLS (net_worth_snapshots cross-tenant default-deny). Codex: real-path E2E (seed snapshots → load dashboard → recap renders real values → take the action → assert a real workflow_runs row + action_completed + recap_viewed → advance a week → action available again)._

Tags:
- `regression: true|false`
- `e2e: true|false`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-14] [Engineer] **Recap action committed via a new atomic `complete_recap_action` (SECURITY INVOKER), mirroring `complete_workflow_action`** — rationale: the WLT-12 reviewer's deepest catch was a non-atomic action commit; the recap run-insert + config-update must commit together. A `period` column + partial unique indexes split the once-ever guard (period null → `target_set`) from the weekly-repeatable recap guard (period non-null) without touching onboarding — area: data — alternatives: relax the global once-guard (rejected — would un-guard onboarding) — reversibility: medium
- [2026-06-14] [Engineer] **Current net worth read LIVE from balances; movement from the daily snapshot series** — rationale: freshest figure for progress; movement needs the sampled time-series (balances aren't derivable). `getRecap` reads live on every dashboard load (reconcile-on-load, the #36 lesson) — area: frontend/data — reversibility: easy
- [2026-06-14] [Engineer] **`recap_viewed` emitted server-side (service-role) during the RSC read, same pattern as `workflow_assembled`** — rationale: distinct-user-per-week return metric is robust to multiple emits; no cookie write (the #36 constraint is about cookie persistence, which this isn't) — area: metrics — reversibility: easy
- [2026-06-14] [Engineer] **Conservative v1 progress status (ahead/behind/on_track) without invented pace math** — rationale: "behind" fires only when an unmet target's net worth actually fell (a real signal); threshold tuning stays the escalation (I2) — area: backend — reversibility: easy
- [2026-06-14] [PM] **First WLT-15 story = movement + target progress + one action** (spending → WLT-17, anomalies → Slice 2) — rationale: smallest independent slice that builds the core new infra (snapshot time-series), closes the dead-end (target now tracks), and proves the return + WAWU mechanic end-to-end — area: scope — alternatives: bundle all three signals (rejected — too big for one story, against one-at-a-time discipline); spending-first (rejected — doesn't close the dead-end or wire target tracking) — reversibility: easy
- [2026-06-14] [PM] **The one action must be honest (adjust/raise/affirm the real target), not a vanity tap** — rationale: the no-dark-patterns + real-data-only guardrails; WAWU must reflect genuine decisions — area: trust/metrics — reversibility: easy
- [2026-06-14] [PM] **Ship behind `RECAP_ENABLED` (default off)** — rationale: movement is empty until ≥2 snapshots; flip on after ≥1 cycle so the surface has an anchor — area: rollout — reversibility: easy

### Risks
- [2026-06-14] [PM] **Cold-start makes the first-ever view thin** (no movement for the first day) — likelihood: high — impact: low — mitigation: honest cold-start copy + target progress works from day one + the flag — area: ux
- [2026-06-14] [PM] **Vanity-WAWU temptation** — a too-easy action could inflate WAWU dishonestly — likelihood: medium — impact: medium — mitigation: the action opens the real target step (a genuine decision on real data); AC4/AC5 forbid a manufactured action — area: metrics/trust

### Issues
- [2026-06-14] [PM] **Recap action-write path vs the existing once-ever `target_set` guard** — severity: medium — owner: Engineer — status: open — area: data — Engineer must keep `uniq_workflow_runs_kind_once` intact for onboarding while adding the weekly-idempotent recap kinds; escalate to Architect if the two collide.

---

_Story closed: <date>, brief link: docs/bets/WLT-15/brief.md_
