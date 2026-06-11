---
id: WLT-12
bet: WLT-4
type: story
status: shipped
priority: P1
created: 2026-06-11
author: PM
design_link: docs/bets/WLT-4/stories/WLT-12/design.md
copy_link: docs/bets/WLT-4/stories/WLT-12/copy.md
area_tags: [backend, data, frontend, product]
dependencies:
  - WLT-11
  - WLT-9
---

# WLT-12 — Assemble + run your first workflow (engine + net-worth snapshot)

## Description

The first slice of the workflow engine — and the one that **closes the MVP loop**. Build the engine end-to-end (data model, archetype registry, two-phase assembly, the action surface, funnel events) and ship the **first archetype, `networth_snapshot`**. A signed-in user who declared an overview/aspiration/checkup intent (WLT-11) and connected a bank (WLT-9) sees their **real net worth** assembled into a **running workflow** with **one platform-prompted action — "set your target"** — and completing it records a **`WorkflowRun`** (the first WAWU event). The engine lands here; the remaining archetypes (savings rule, spending snapshot, budget, cashflow, debt payoff) are subsequent stories on the same engine. `networth_snapshot` is first because it covers the most `goalKind`s (5) and needs only **account balances** — no transaction categorization — so it proves the convergence point at the lowest data risk.

## Acceptance Criteria

- [ ] AC1 — **Data model:** migration `0006_workflow.sql` creates `workflows` (owner-CRUD RLS) and `workflow_runs` (owner SELECT+INSERT, **immutable** — no update/delete) + the `goals (id, user_id)` unique constraint. **Composite same-user FKs**: `workflows(goal_id,user_id)→goals(id,user_id)` and `workflow_runs(workflow_id,user_id)→workflows(id,user_id)`. UUID PK, `timestamptz`, `set_updated_at` on workflows, soft-delete on workflows only.
- [ ] AC2 — **Archetype registry:** `@wealth/core/workflow.ts` exports `WORKFLOW_ARCHETYPES` + `archetypeForGoalKind(goalKind)`. `networth_snapshot` is implemented; the **5 goalKinds it covers** (`unified_view`, `grow_wealth`, `long_range_plan`, `financial_checkup`, `understand_money`) resolve to it. The API **validates server-side** against the registry (unknown/unmapped → rejected, never assembled).
- [ ] AC3 — **Two-phase assembly:** for a mapped goalKind, the engine selects the archetype and creates a `Workflow` (`status='pending_data'`) — at declare-time or first dashboard load, **no data required**. Once the user has ≥1 synced account, it **personalizes** (computes net worth from real balances) and flips `status='active'` + the `Goal` `pending_workflow→active`. **Idempotent:** at most **one non-archived Workflow per Goal** (enforced by a partial unique index).
- [ ] AC4 — **Real-data personalization:** the active workflow shows the user's **actual net worth** (assets − debts from `financial_accounts` balances, owner-SELECT). **0 mock/placeholder values** (real-data guardrail) — if balances are unavailable, it stays `pending_data`, never shows a fake number.
- [ ] AC5 — **The action (WAWU unit):** the workflow surfaces **one** action — **"set your net-worth target"** (one tap on a suggested target, or a short input). Completing it writes a **`WorkflowRun`** (`kind='target_set'`) and the workflow reads as **running** (tracking toward the target). This is the first WAWU action.
- [ ] AC6 — **Pending-data bridge (no dead-end):** a user who declared an intent but hasn't connected sees **"your plan's ready — connect to activate"** → bridges to the WLT-9 connect flow (intent-first ordering). Returning post-connect, the workflow personalizes.
- [ ] AC7 — **RLS:** `workflows` + `workflow_runs` are **owner-scoped** (`auth.uid()`); cross-tenant reads/writes return 0 / are denied; the **composite FK rejects a forged `goal_id`/`workflow_id` owned by another user**; `workflow_runs` are **immutable** (update/delete denied). RLS tests pass in CI.
- [ ] AC8 — **Events:** `workflow_assembled` (on personalize→active) and `action_completed` (on the action) emitted **server-side** via `emitFunnel`, **no PII, no free-text** (`{ archetype, goalKind }` only). The WLT-5 baseline for intent→workflow→action.
- [ ] AC9 — **States:** `pending_data` (connect bridge — AC6) / loading (assembling/personalizing) / `active` (snapshot + action) / action-completed (running confirmation) / error (AC10) / empty (no accounts → connect).
- [ ] AC10 — **Feedback:** discriminated errors — network, save, server — all strings from `copy.md`; success confirmation per copy. The "assembling…" and "saving…" transitions are announced.
- [ ] AC11 — **Accessibility:** completable keyboard-only; the target control + action button are labeled; **focus moves to the running-confirmation** on completion; loading/assembling use `aria-live="polite"`; WCAG AA; reduced-motion respected.
- [ ] AC12 — **Scope / no regression:** only `networth_snapshot`'s 5 goalKinds enter the engine this story; the **other 9 goalKinds keep the WLT-11 "putting your plan together" placeholder** (current behavior — no regression, no new dead-end). The total-coverage guardrail test is the **bet's exit gate** (final archetype story), noted in DRI.
- [ ] AC13 — **Speed guardrail:** assembly + personalization are **synchronous, no third-party call** (balances are already synced by WLT-9) — must not push TTFV past the < 3-min target (KR1 guardrail).

## Standard Experience Checklist
- [x] **Navigation** — AC6 (declare → connect bridge → workflow), AC5 (action → running), AC12 (unmapped intents → existing placeholder)
- [x] **States** — AC9 (pending_data / loading / active / completed / error / empty)
- [x] **Feedback** — AC10 (discriminated errors + success), AC8 (events)
- [x] **Accessibility** — AC11 (keyboard, labeled controls, focus-to-confirmation, aria-live, AA, reduced-motion)
- [x] **Edge cases** — AC3 (idempotent one-workflow-per-goal), AC4 (no balances → stay pending_data, never fake), AC7 (cross-tenant denied / forged FK), AC12 (unmapped goalKind)
- [x] **Cross-surface consistency** — `n/a — web-only Phase-1 (architecture.md: mobile deferred)`

## Tech notes

Per `docs/bets/WLT-4/architecture.md` (approved). Within-stack; no foundational deviation.
- **Migration `0006_workflow.sql`** — see AC1; mirrors the `0004_intent.sql` RLS/trigger conventions; `workflow_runs` immutable (no update/delete policies). Partial unique index: `unique (goal_id) where deleted_at is null and status != 'archived'`.
- **`@wealth/core/workflow.ts`** — `WORKFLOW_ARCHETYPES` (typed constant, mirrors `intent.ts`); `archetypeForGoalKind`; `networth_snapshot` spec (personalize from balances → `{ netWorth, assets, debts, suggestedTarget }`; action `target_set`). Unit test asserts its 5 goalKinds resolve.
- **`app/lib/aggregation-read.ts`** — owner-scoped net-worth read (`financial_accounts` balances via `createServerSupabase`; **no service-role**).
- **`app/lib/workflow.ts`** — `selectWorkflow` / `personalizeWorkflow` / `completeAction` (emit `workflow_assembled` / `action_completed`). One-workflow-per-goal idempotency.
- **`app/api/workflow/route.ts`** + **`app/api/workflow/action/route.ts`** (or server actions) — AAL2-gated, owner-scoped, `runtime="nodejs"`.
- **UI** — extend the WLT-11 post-declare flow (pending_data bridge) + a **dashboard workflow card** (active snapshot + action); states + a11y per `design.md`; strings verbatim from `copy.md`. Seed reusable card in `@wealth/ui`.
- **Funnel** — `WORKFLOW_ASSEMBLED` / `ACTION_COMPLETED` in `packages/core/funnel.ts` → existing `emitFunnel` → `auth_funnel_events`.

## Dependencies
- **WLT-11** — the declared `Goal` (status `pending_workflow`) is the engine's input; this story consumes + flips it.
- **WLT-9** — connected accounts + synced balances are the personalization source; the connect flow is the pending_data bridge target.

## DRI Log

### Decisions
- [2026-06-11] [PM] **First slice = engine + `networth_snapshot` (universal-overview archetype), not all 6 at once** — rationale: smallest slice that closes the loop end-to-end; covers the most goalKinds (5) on balances alone (no categorization risk) — area: scope — reversibility: easy
- [2026-06-11] [PM] **Incremental matching map (not a universal v1 fallback):** only `networth_snapshot`'s 5 semantically-matching goalKinds enter the engine; the other 9 keep the WLT-11 placeholder until their archetype story — rationale: honors the assembly-correctness guardrail (don't show a debt user a net-worth workflow); no regression, no new dead-end. **The total-coverage guardrail test (every goalKind resolves) is the BET exit gate**, not this story's — area: scope/sequencing — alternatives: architecture's "ship full map first + generic fallback" (rejected — would mis-match intents in v1) — reversibility: easy
- [2026-06-11] [PM] **The action = "set your net-worth target"** as the WAWU unit — rationale: a real commitment backed by real data (not a bare tap); makes the workflow "running" (tracking) — area: product — reversibility: medium
- [2026-06-11] [PM] **`workflow_runs` immutable (no update/delete)** — rationale: it's the action/WAWU record (audit-adjacent, retention-bound) — area: security/data — reversibility: hard

### Risks
- [2026-06-11] [PM] **"Set a target" reads as a vanity tap** if nothing tracks it — likelihood: medium — impact: medium — mitigation: the WorkflowRun + active workflow persist as a tracked target the user returns to; ongoing tracking/progress is the named fast-follow — area: product
- [2026-06-11] [PM] **Net worth from balances can mislead** if an account is mid-sync / needs reauth — likelihood: medium — impact: low — mitigation: personalize only from `active`/synced accounts; stay `pending_data` if none (AC4) — area: data-quality
- [2026-06-11] [Security] **New owner-writable workflow tables + a financial-data read on the action path** — likelihood: medium — impact: high — mitigation: owner-CRUD RLS + composite same-user FK + immutable runs; AAL2-gated; mandatory Security Review — area: security

- [2026-06-11] [Engineer→review] **The action commits via an atomic plpgsql function (`complete_workflow_action`, SECURITY INVOKER)** — rationale: a successful run-insert + failed config-save would strand the workflow outside `running` with the replay guard blocking recovery; one transaction (FOR UPDATE) makes the half-committed state unreachable while owner RLS still applies — area: data-integrity — reversibility: medium
- [2026-06-11] [Engineer→review] **Replay-guarded at two layers** — in-transaction `config ? 'target'` check + DB `unique (workflow_id, kind)` on runs — a replayed POST can never append WAWU-counted runs or re-emit `action_completed` — area: metrics-integrity — reversibility: medium
- [2026-06-11] [Engineer→review] **`workflow.assemble` + `workflow.action` audit events** added (foundation L88 "workflow actions"); ids/enums only — area: security
- [2026-06-11] [Engineer→review] **Engine logic behind an injectable `EngineStore` seam** (pure `workflow-engine.ts` / supabase `workflow.ts`) — same discipline as `@wealth/aggregation`; 12 unit tests + live-PG RLS incl. the atomic RPC driven as an authenticated user — area: testability
- [2026-06-11] [Engineer] **E2E verified live** (19.5s, real stack): declare → bridge (no fake figure) → real snapshot → one-tap target → running → reload-persistent → exactly one immutable run + goal `active` — area: verification

### Issues
- _none — shipped 2026-06-11 (PR #31; 4 review rounds: funnel contract, loading state, engine coverage, replay, atomicity, audit, E2E)._
