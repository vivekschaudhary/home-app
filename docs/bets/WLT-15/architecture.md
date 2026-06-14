---
id: WLT-15-ARCH
bet: WLT-15
status: proposed
created: 2026-06-14
authors: [Architect, Enterprise/Solution Architect]
area_tags: [frontend, backend, data, jobs, metrics]
---

# Technical Design: "Your money since last time" (the reason to return)

## Decision

Build the recurring **"since last time"** surface entirely **within the approved foundational stack** — no new tools, services, runtimes, or data stores. Movement is computed from a **new `net_worth_snapshots` time-series** sampled by a **daily Inngest job** (balances aren't reconstructable from transactions, so net worth must be *sampled*, not derived); **spending vs. last week** is an on-the-fly query over the existing indexed `transactions`; **progress toward target** diffs the latest snapshot against the existing `workflow.config.target`; and **anomalies** are produced by a **daily rules-based Inngest scan** into a new `anomalies` table (the already-modeled foundational `Anomaly` entity). Pure computation lives in `packages/core` (`recap.ts`, `anomaly.ts`); the **`/dashboard` RSC** reads live and renders a new `RecapCard` that surfaces **exactly one** priority-ranked prompted action; completing it writes a repeatable **`WorkflowRun` (the WAWU unit)** via a route handler. Return + action are instrumented as new **funnel events** feeding new **metric views** on `/admin/metrics`. Anomaly detection ships **rules-based, high-precision, dismissible** (not statistical) to honor the trust guardrail. The bet is sliced: ship the three computable signals + one action first (prove the return mechanic), then layer the anomaly engine.

## Context

The MVP loop completes once and goes static (dogfood dead-end: *"nothing left to do"*). WLT-15 makes every visit different. It builds on shipped code (no new data sources):

- **Financial data (WLT-2/10):** `transactions` (`amount`, `direction` debit|credit, `category`, `occurred_on`; owner-SELECT RLS; indexed `idx_transactions_user_occurred` on `(user_id, occurred_on desc)`), `financial_accounts` (`kind` depository|credit, `balance_current`), `account_connections` (`health_status`, `history_synced_at` — 24-month history now settles). `supabase/migrations/0003_aggregation.sql`, `0005_aggregation_history.sql`.
- **Workflow/target (WLT-4/12):** `workflows.config` jsonb holds `{ netWorth, assets, debts, suggestedTarget, target? }` for the `networth_snapshot` archetype; `workflow_runs` is the immutable WAWU action record (owner SELECT+INSERT only), emitting `action_completed`. The onboarding action is once-ever, guarded by `uniq_workflow_runs_kind_once`. `complete_workflow_action()` is INVOKER/atomic. `supabase/migrations/0006_workflow.sql`, `app/lib/workflow-engine.ts`, `packages/core/workflow.ts`. **Key gap:** the `running` state is a static row — the target is set once and never re-measured. `personalizeNetWorth()` / `suggestTarget()` already exist in `packages/core/workflow.ts`.
- **Funnel (WLT-5):** `auth_funnel_events(event, user_id, context jsonb, occurred_at)` (owner-SELECT, service-role INSERT), emitted via `emitFunnel()` (`packages/db/emit.ts`, best-effort). `metrics_wawu_weekly` already counts distinct users with ≥1 `action_completed` per 7-day window. `/admin/metrics` (AAL2 + `ADMIN_EMAILS` gate) renders TTFV/WAWU/funnel via `readMetrics()`. `supabase/migrations/0007_metrics.sql`, `app/lib/metrics.ts`.
- **Surface:** `/dashboard` RSC (AAL2-gated, Suspense) renders `WorkflowCard` (4 states: pending_data → active → target → running). `app/dashboard/page.tsx`, `WorkflowCard.tsx`. Reads via `readAccountBalances()` (owner-SELECT). **Lesson carried (#36 / `[real-path-integration-coverage]`):** the recap must reconcile on load (read live), never trust stale server props; persistence must not happen in RSC render.
- **Jobs:** `packages/jobs` with the fan-out cron pattern (`aggregationScheduledRefresh` = `{ cron: "0 */6 * * *" }`, `aggregationSettleSweep` = `{ cron: "*/10 * * * *" }`), registered in `packages/jobs/index.ts`. Foundation already names **"scheduled anomaly scans"** as Inngest's job (architecture.md Layer 4) — this bet realizes it.

**Foundational-stack assertion (deviation gate, step 7): NO DEVIATION.** WLT-15 uses only Stack-table entries: **Supabase Postgres** (new tables `net_worth_snapshots`, `anomalies` — normal bet-level data-model changes within the relational+audit posture, default-deny RLS keyed on `auth.uid()`), **Inngest durable jobs** (two new crons), **Next.js Route Handlers + RSC**, and the **funnel events** instrumentation. No new third-party service, data store, runtime, or major dependency. The `Anomaly` entity is already in the Foundational Data Model. See Enterprise Architect input for the one ERD drift-note (`net_worth_snapshots`).

## Approach

### Components affected

- **`supabase/migrations/0008_recap.sql`** (new) — `net_worth_snapshots` + `anomalies` tables + RLS; new `auth_funnel_events` event-name allowances; new metric views; `workflow_runs` recap-kind weekly idempotency (below).
- **`packages/core/recap.ts`** (new, pure) — `computeNetWorthMovement(snapshots)`, `computeSpendingComparison(txns, now)` (this-week vs last-week debit sums, by category), `computeTargetProgress(currentNetWorth, workflowConfig)`, and the ranker **`selectPromptedAction(signals) → PromptedAction | null`** (the ONE-action selector + the honest "nothing new" empty state).
- **`packages/core/anomaly.ts`** (new, pure) — `detectAnomalies(txns, baselines) → AnomalyCandidate[]`: high-precision rules only (large-charge vs category baseline, new-recurring/likely-bill, low-balance). Each rule independently unit-tested for **no false-positive on normal data**.
- **`packages/jobs/recap/snapshot.ts`** (new) — `netWorthSnapshotDaily` (`{ cron: "0 8 * * *" }`): fan-out over users with active connections → compute net worth from `financial_accounts` balances → upsert one `net_worth_snapshots` row per `(user_id, captured_on)`.
- **`packages/jobs/recap/anomaly-scan.ts`** (new) — `anomalyScanDaily` (`{ cron: "0 9 * * *" }`): fan-out → run `detectAnomalies()` over recent txns → INSERT into `anomalies` (idempotent on dedup key). Registered in `packages/jobs/index.ts`.
- **`app/lib/recap.ts`** (new) — `getRecap(userId)`: reads snapshots + spending query + open anomalies + active workflow (all owner-SELECT, read live), assembles the `RecapView` incl. the single `selectPromptedAction()` result.
- **`app/dashboard/RecapCard.tsx`** (new) + `app/dashboard/page.tsx` (edit) — render the recap above `WorkflowCard`; reconcile-on-load (no stale props).
- **`app/api/recap/action/route.ts`** (new) — POST the prompted action → writes a repeatable `WorkflowRun` + emits `action_completed` (context `{ action_type, source: "recap" }`).
- **`app/api/anomaly/[id]/route.ts`** (new) — PATCH status (acknowledge/dismiss); owner-only, status-only; emits `anomaly_dismissed`.
- **`app/admin/metrics/page.tsx`** + **`app/lib/metrics.ts`** (edit) — add **return-rate** (Day-7) + **prompt→action conversion** + **anomaly-precision (dismiss-rate)** panels.

### Data model changes

Two new tables (additive, expand-contract, owner-scoped, composite-FK posture per WLT-11/12):

```sql
-- net_worth_snapshots: the time-series that makes "movement" + "progress" computable.
-- Sampled (not derived) — balances can't be rebuilt from transactions (market moves, transfers, opening balances).
create table net_worth_snapshots (
  id uuid primary key default uuid_generate_v7(),
  user_id uuid not null references auth.users(id),
  captured_on date not null,
  net_worth numeric not null, assets numeric not null, debts numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, captured_on)          -- one sample/user/day; job is idempotent
);
-- RLS: owner SELECT only; service-role INSERT (written by the daily job, like other aggregated data).
-- Index: (user_id, captured_on desc).

-- anomalies: the foundational `Anomaly` entity (first materialization).
create table anomalies (
  id uuid primary key default uuid_generate_v7(),
  user_id uuid not null references auth.users(id),
  account_id uuid, transaction_id uuid,
  kind text not null,                    -- large_charge | new_recurring | low_balance
  severity text not null,                -- info | attention
  summary jsonb not null,                -- amounts/enums ONLY — no PII (merchant/desc excluded)
  status text not null default 'open',   -- open | surfaced | acted | dismissed
  detected_on date not null,
  dedup_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references financial_accounts(id, user_id),  -- same-user composite FK
  unique (user_id, dedup_key)            -- scan is idempotent; won't re-create the same anomaly
);
-- RLS: owner SELECT; owner UPDATE limited to status only (acknowledge/dismiss); service-role INSERT.
```

**`workflow_runs` recap kinds (repeatable):** the onboarding `target_set` stays once-ever (`uniq_workflow_runs_kind_once`). Recap actions use new `kind` values (`recap_review_anomaly`, `recap_adjust_savings`, `recap_set_budget`) scoped by a **per-`(workflow_id, kind, iso_week)` partial unique index** — once per week (prevents double-submit; allows weekly recurrence so WAWU is repeatable). Recap runs attach to the user's existing running `networth_snapshot` workflow (no new workflow row needed).

**Spending: no table** — on-the-fly query over `transactions` (`direction='debit'`, grouped by `category`, this-week vs last-week) using the existing `idx_transactions_user_occurred`. Volume per user is small (24mo); a materialized view is deferred (Alt D).

### API / contract changes

- `POST /api/recap/action` — `{ action_type, payload? }` → inserts `workflow_runs` + emits `action_completed`; weekly-idempotent (re-POST same week → 200 no-op). Additive.
- `PATCH /api/anomaly/:id` — `{ status: "acted" | "dismissed" }` → owner+status-only update; emits `anomaly_dismissed`. Additive.
- New funnel events (additive to the enum + the `auth_funnel_events` check): `recap_viewed` (return signal), `recap_action_prompted` (`{ action_type }`), `anomaly_surfaced`, `anomaly_dismissed`. Recap completions reuse `action_completed` (so `metrics_wawu_weekly` counts them unchanged).

### Dependencies

**None new.** All within the existing stack (Postgres, Inngest, Next, the funnel). No new libraries.

## Enterprise/Solution Architect input

### Cross-system implications

No new service, third-party, data store, or runtime crosses a boundary. Two new Inngest crons join the existing four under the same `wealth-platform` client and fan-out pattern. Net-worth sampling and anomaly scanning run **off the request path** (the foundation's serverless-long-running rule) — never in RSC render (the #36 lesson). The daily snapshot adds one small write/user/day; the anomaly scan reads recent txns/user — both negligible against the cost FF.

### Standards compliance

- **RLS / tenancy:** new tables are owner-scoped default-deny; `anomalies` owner-UPDATE is **status-only**; snapshots are service-role-write (aggregated-data posture). Same-user **composite FK** `(account_id, user_id)` matches WLT-11/12. No cross-user exposure — insight reads only touch data the user already owns.
- **No PII in derived data:** `anomalies.summary` and all new event `context` carry **amounts/enums only** — merchant/description are excluded (cross-cutting "no PII in logs/derived records" standard).
- **Migration:** additive expand-contract, zero-downtime (Reliability + Ops FFs).
- **One drift-note (low severity):** `net_worth_snapshots` is a **new derived entity not in the Foundational Data Model ERD** (`Anomaly` *is* already there; the net-worth time-series is not). This is a normal bet-level data-model change within Postgres — **not** a stack-deviation-gate trigger — but the foundational ERD should gain a `NetWorthSnapshot` node at the next `/setup-foundation-architecture` amend. Logged as Issue I1 (not a blocker).

### Cost / capacity / vendor lock-in

No new vendor → no new lock-in. Inngest exposure unchanged (R3 stands). Daily snapshot + scan are O(active users/day) — well inside Phase-1 envelope.

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|--------|------|------|----------------|
| **Chosen** — period-anchored, daily snapshot job + on-the-fly spending + rules-based anomalies | Deterministic windows; off-request; honest empty state; no new tools | Movement needs ≥2 daily snapshots before it shows (accrues forward) | — |
| **Alt A — visit-anchored "since *your* last visit"** (track `last_seen`, snapshot-on-visit, diff vs prior visit) | Literally "since last time"; personal | Variable windows → noisy deltas (1-hr revisit shows ~$0); snapshot-on-read **couples a write to RSC render** (the #36 cookie-write failure mode) | Rejected — non-deterministic + violates the no-persist-in-RSC lesson |
| **Alt B — derive net-worth movement from transaction deltas** (no snapshot table) | One fewer table | Balances aren't reconstructable from txns (market moves, transfers, opening balances) | Rejected — wrong by construction; balances must be sampled |
| **Alt C — statistical anomaly detection (z-score/category) in v1** | Catches subtler anomalies | Low data volume → high false-positive → **breaks the anomaly-precision guardrail + trust moat** | Rejected for v1 — rules-based high-precision first; statistical is a later slice |
| **Alt D — materialized spending view** | Faster reads at scale | Refresh complexity for marginal gain at 24mo/user volume | Deferred — on-the-fly query over the existing index suffices; revisit if slow |

## Consequences

**Positive:**
- The `running` workflow finally **tracks** (target progress re-measured daily) — closes the dead-end.
- Each visit surfaces **one** action that writes a **repeatable WAWU run** — the north-star metric becomes generatable, not one-shot.
- The moat starts compounding: which prompted actions complete + which anomalies users act on becomes proprietary action-effectiveness data (no new data sources needed).
- Pure `packages/core` computation → fully unit-testable; jobs/reads are thin.

**Negative:**
- **Cold start:** net-worth movement is empty until ≥2 daily snapshots exist (no historical balances to backfill). Mitigated by an honest empty state ("we'll show movement once we've watched a few days") + a feature flag.
- Two more crons + two tables to operate.
- Anomaly precision needs tuning; conservative thresholds may under-surface at first (acceptable — precision over recall is the guardrail).

**Reversibility:** medium — additive tables/jobs/events; no contract breaks. Recap is an additive surface (WorkflowCard untouched). Dropping it = remove the surface + disable two crons; data is owner-scoped and disposable.

## Test strategy

- **Unit (domain, `packages/core`):** `recap.ts` — movement (up/down/flat, <2 snapshots → null), spending comparison (category rollup, week boundaries), target progress (start/current/target math, target-not-set), and **`selectPromptedAction()` priority ranking** (anomaly > behind-target > spend-spike > on-track nudge) + the empty "nothing new" state. `anomaly.ts` — each rule fires on its fixture AND **does not false-positive on normal data** (the precision guard).
- **Integration / API:** `/api/recap/action` writes a `WorkflowRun` + emits `action_completed`; **weekly idempotency** (re-POST same week = no-op; next week = new run). `/api/anomaly/:id` — owner-only, status-only transition.
- **RLS policy tests:** `net_worth_snapshots` + `anomalies` cross-tenant default-deny; `anomalies` UPDATE limited to own rows + status column only.
- **Jobs:** `netWorthSnapshotDaily` idempotent on `(user_id, captured_on)`, fans out to active-connection users only; `anomalyScanDaily` idempotent on `dedup_key`.
- **Component (frontend):** `RecapCard` states — movement up/down, behind/ahead of target, anomaly present, and the empty/cold-start state.
- **E2E (Codex), real-path per `[real-path-integration-coverage]`:** seed snapshots + an anomaly via admin → load `/dashboard` → recap renders the real values → take the prompted action → assert a real `workflow_runs` row + `action_completed` event exist → advance a week → recap re-derives. Assert the **surface**, not just the math (the #36 class of bug).

## Rollout

- **Feature flag?** yes — `RECAP_ENABLED` (default **off**; flip on after ≥1 snapshot cycle so the surface has an anchor). Recap degrades gracefully when empty.
- **Migration?** yes — additive `0008_recap.sql` (expand-contract, zero-downtime). No historical net-worth backfill possible; snapshots accrue forward (one optional seed snapshot from current balances on first run gives a same-day anchor).
- **Backwards compatibility?** required — `WorkflowCard`, existing funnel/metrics, and the once-ever `target_set` guard are untouched; everything is additive.
- **Staged rollout?** yes — **Slice 1:** the three computable signals (movement, spending, target progress) + one prompted action end-to-end (proves the return mechanic + WAWU generation). **Slice 2:** the anomaly engine (`anomalies` table + `anomalyScanDaily` + the anomaly action). Matches the brief's slice plan and de-risks the "biggest bet yet" concern.

## Open questions for Engineer

Escalate to Architect (don't improvise):
- **Anomaly rule thresholds** (e.g. what multiple of category-median = "large charge", what defines "new recurring") — start conservative; these are precision-tuning decisions with trust stakes.
- **The ONE-action priority ranking** when several signals fire — proposed default is anomaly > behind-target > spend-spike > on-track nudge; escalate changes.
- Figure out without escalating: the exact spending-window SQL, the RecapCard layout, the empty-state copy (pull from `copy.md` once UX-Writer authors it in `/create-story`).

## DRI Log

### Decisions
- [2026-06-14] [Architect] **Period-anchored recap via a daily `net_worth_snapshots` time-series** (not visit-anchored, not txn-derived) — rationale: deterministic windows + off-request sampling; balances must be sampled, not derived; avoids the #36 write-in-RSC failure mode — area: data/frontend — alternatives: visit-anchored (Alt A, noisy + couples write to render), txn-delta derivation (Alt B, wrong by construction) — reversibility: medium
- [2026-06-14] [Architect] **Rules-based, high-precision, dismissible anomalies in v1** (statistical deferred) — rationale: low data volume makes statistical detection false-positive-prone; a wrong "unusual charge" erodes the trust moat (brief guardrail) — area: backend/trust — alternatives: statistical z-score v1 (Alt C, rejected) — reversibility: medium
- [2026-06-14] [Architect] **Recap actions are repeatable `WorkflowRun`s** (new kinds, per-`(workflow,kind,iso_week)` idempotency) attached to the running net-worth workflow — rationale: WAWU must be weekly-repeatable; the onboarding once-ever guard stays intact — area: data/metrics — alternatives: relax the global once-guard (rejected — would un-guard onboarding) — reversibility: medium
- [2026-06-14] [Architect] **Spending vs. last week as an on-the-fly query** (no materialized view in v1) — rationale: small per-user volume + existing `(user_id, occurred_on desc)` index; defer materialization — area: data — alternatives: materialized view (Alt D, deferred) — reversibility: easy
- [2026-06-14] [Architect] **Slice it: computable signals + one action first, then the anomaly engine** — rationale: prove the return mechanic before the biggest-build piece (brief risk mitigation) — area: process — reversibility: easy
- [2026-06-14] [Enterprise Architect] **No foundational-stack deviation** — bet uses only Postgres + Inngest + Next + the funnel; new tables are normal bet-level data-model changes; the `Anomaly` entity is already foundational — area: architectural — reversibility: n/a

### Risks
- [2026-06-14] [Architect] **Anomaly false-positives erode trust on a financial app** — likelihood: medium · impact: high — mitigation: rules-based high-precision only (no statistical v1), conservative thresholds, always dismissible, the anomaly-precision guardrail; precision-tuning escalates to Architect — area: trust
- [2026-06-14] [Architect] **Cold start — movement empty until ≥2 daily snapshots** (no historical balances to backfill) — likelihood: high · impact: low — mitigation: honest empty state + `RECAP_ENABLED` flag flipped after ≥1 cycle; optional same-day seed snapshot — area: ux/data
- [2026-06-14] [Enterprise Architect] **Insight/anomaly computation reads all of a user's financial data** — likelihood: low · impact: high — mitigation: owner-scoped reads only (no new exposure); `anomalies.summary` + event context are amounts/enums only (no PII); mandatory Security Reviewer (Codex) pass — area: security
- [2026-06-14] [Enterprise Architect] **Two new crons add operational surface** (R3 Inngest exposure unchanged) — likelihood: low · impact: medium — mitigation: thin job logic, same fan-out pattern as shipped crons, idempotent writes — area: operations

### Issues
- [2026-06-14] [Enterprise Architect] **I1 — `net_worth_snapshots` is a new derived entity absent from the Foundational Data Model ERD** — severity: low · owner: Enterprise Architect · status: open — area: architectural — add a `NetWorthSnapshot` node at the next `/setup-foundation-architecture` amend; not a blocker (within-Postgres data-model change, not a stack deviation).
- [2026-06-14] [Architect] **I2 — Anomaly rule thresholds undecided** — severity: medium · owner: Architect · status: open — Engineer must escalate threshold choices during `/build`; start conservative (precision over recall).

---

_Approved by: <pending HITL> on <date>_
