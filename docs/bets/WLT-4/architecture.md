---
bet: WLT-4
type: bet-architecture
status: proposed
author: Architect
created: 2026-06-11
foundational_stack_deviation: none
---

# Technical Design: WLT-4 — Workflow engine + pre-built workflows

## Decision

Build the engine as **archetype-registry + template-selection + real-data personalization**, entirely within the foundational stack. A small typed **archetype registry** in `@wealth/core` maps every `Goal.kind` (WLT-3's 14 starter kinds) onto one of **~6 workflow archetypes**; assembly = *select the archetype for the Goal → personalize its config from the user's real aggregated data → persist a `Workflow` → surface one concrete action whose completion writes a `WorkflowRun`* (the WAWU unit). Two new tables (`workflows`, `workflow_runs`) with **owner-scoped RLS + the composite-FK same-user pattern** (the WLT-11 lesson). **No `Block` table, no runtime composition, no Inngest scheduler** in this bet — Blocks are code-level archetype steps stored as JSONB config (foundation L199 anticipates "JSONB Workflow/Block configs"); composition + marketplace + scheduled execution are deferred per the brief.

## Context

- **Inputs are live:** WLT-3 persists `Goal` (`kind`, `params`, `status='pending_workflow'`, owner-CRUD RLS, composite-FK to `intents`); WLT-2 persists `financial_accounts` + `transactions` (owner-SELECT RLS, service-role writes). Both shipped.
- **Constraint — intent precedes data (intent-first):** a user declares intent *before* connecting (WLT-11 → WLT-2). So at declare-time there is **no real data to personalize from**. Assembly is therefore **two-phase**: (1) archetype selection at declare-time (Goal.kind only, no data) → `Workflow status='pending_data'`; (2) personalization + action-surfacing **after** the first sync → `status='active'`. The WAWU action lives post-connect (on the dashboard), which is correct — WAWU requires real data.
- **The "5 vs 14" tension:** KR1 says "5 workflows across 6 clusters"; WLT-3 emits **14 distinct `goalKind`s**. Resolved by archetypes: ~6 real action-types, with a total `goalKind→archetype` map (every kind resolves → the brief's no-dead-end guardrail, enforced by a unit test over `INTENT_CLUSTERS`).
- **Foundational entities exist** (architecture.md ER L119–123: Goal→Workflow→WorkflowRun, Workflow⋈Block); this bet realizes Workflow + WorkflowRun and represents Block as code.

## Approach

### Components affected

- **`packages/core/workflow.ts`** (new) — the archetype registry, mirroring `intent.ts`:
  - `WORKFLOW_ARCHETYPES`: typed constant. Each archetype `{ key, title, goalKinds: string[], personalize(spec), action: { kind, prompt } }`.
  - `archetypeForGoalKind(goalKind): Archetype | null` (the map; `null` = dead-end → forbidden by test).
  - The 6 archetypes (each consumes real data, each yields one action):
    | Archetype | Covers goalKinds | Personalized from | First action (WAWU unit) |
    |---|---|---|---|
    | `networth_snapshot` | unified_view, grow_wealth, long_range_plan, financial_checkup, understand_money | all account balances (assets−debts) | set a net-worth target |
    | `spending_snapshot` | understand_spending | top categories, last 90d txns | watch your top category |
    | `savings_rule` | emergency_fund, build_safety_net, savings_habit, save_specific | cash-flow headroom (income−spend) | start a $X/cadence savings rule |
    | `budget_guardrail` | control_spending, budget_adherence | biggest discretionary category | set + track a budget |
    | `cashflow_forecast` | cashflow_forecast | recurring bills + projected balance | set a low-balance alert |
    | `debt_payoff` | pay_off_debt | credit/loan balances | start a payoff plan |
  - (6, not 5 — aspiration's long-range kinds need distinct coverage; KR1's "5" is approximately met and the no-dead-end guarantee is the hard requirement.)
- **`packages/core/workflow.test.ts`** — the load-bearing guardrail test: iterate every `goalKind` in `INTENT_CLUSTERS`, assert `archetypeForGoalKind` is non-null (mechanical "no dead-end").
- **`app/lib/aggregation-read.ts`** (new or extend `aggregation-client` server side) — owner-scoped reads of the personalization inputs (balances, top categories, recurring bills) via `createServerSupabase` (owner-SELECT RLS — the user reads their own data; **no service-role**).
- **`app/lib/workflow.ts`** (new) — orchestration:
  - `selectWorkflow({ userId, goalId })` → resolve archetype, insert `Workflow status='pending_data'`, flip `Goal` `pending_workflow→active`, emit `workflow_assembled`. (Declare-time; no data.)
  - `personalizeWorkflow({ userId, workflowId })` → read real data, write `config`, `status→'active'`. (Post-sync.)
  - `completeAction({ userId, workflowId })` → insert `WorkflowRun` (the WAWU unit), emit `action_completed`.
- **`app/api/workflow/route.ts`** + **`app/api/workflow/action/route.ts`** (or server actions) — AAL2-gated, owner-scoped, thin (`runtime="nodejs"`).
- **UI** — replace the WLT-11 `IntentFrontDoor` "putting your plan together" placeholder with: declare → "Your plan's ready — connect to activate" (bridges to WLT-2); and a **dashboard workflow card** (post-connect) showing the personalized summary + the one action button. Strings via `@wealth/ui` + copy (UX Writer in `/create-story`).

### Data model changes

Migration **`0006_workflow.sql`** (additive, expand-only):
- `alter table goals add constraint goals_id_user_unique unique (id, user_id);` — composite-FK target.
- **`workflows`**: `id uuid pk`, `user_id uuid not null`, `goal_id uuid not null`, `archetype text not null`, `config jsonb not null default '{}'`, `status text not null default 'pending_data' check (status in ('pending_data','active','paused','archived'))`, `created_at/updated_at/deleted_at`, `unique (id, user_id)`, **`foreign key (goal_id, user_id) references goals (id, user_id) on delete cascade`**. Owner-CRUD RLS (user writes own — like `goals`). `set_updated_at` trigger.
- **`workflow_runs`**: `id uuid pk`, `user_id uuid not null`, `workflow_id uuid not null`, `kind text not null`, `status text not null default 'completed'`, `context jsonb not null default '{}'`, `created_at`, **`foreign key (workflow_id, user_id) references workflows (id, user_id) on delete cascade`**. RLS = **owner SELECT + owner INSERT only; no UPDATE/DELETE** (immutable action record, retention-bound — audit-adjacent per architecture L88/L92).

### API / contract changes

- **Funnel events** (`packages/core/funnel.ts`): add `WORKFLOW_ASSEMBLED='workflow_assembled'`, `ACTION_COMPLETED='action_completed'` — emitted via the existing `emitFunnel` path into `auth_funnel_events` (WLT-5 instruments; no rename — WLT-5 owns any).
- **WLT-3 contract consumed:** `Goal{kind,params,status}`; assembly flips `pending_workflow→active` (existing enum value; no schema change to goals beyond the unique constraint).
- **No external API changes.**

## Enterprise/Solution Architect input

### Cross-system implications
WLT-4 sits at the loop's convergence: **reads** WLT-3 (`goals`) + WLT-2 (`financial_accounts`/`transactions`), **writes** `workflows`/`workflow_runs`, **emits** to the WLT-5 funnel. The only cross-bet write is the `goals.status` flip (the WLT-3→WLT-4 handoff contract). The intent-first ordering (data after intent) is handled by the two-phase assemble→personalize, not by reordering WLT-2/WLT-3.

### Standards compliance
Owner-scoped RLS + **composite same-user FK** (consistent with WLT-9/WLT-11); append-only immutable `workflow_runs` (consistent with the AuditEvent/CDC posture); JSONB config (foundation L199); reuse `emitFunnel`, `createServerSupabase`, the migration/`set_updated_at` conventions. **No standards drift.**

### Cost / capacity / vendor lock-in
No new vendor, runtime, or datastore. Pure Postgres + Next RSC/route-handlers + existing patterns → **no added lock-in, no cost line**. Within `p95<200ms` (reads are indexed owner-scoped queries; assembly is synchronous, no third-party call).

**Foundational-stack assertion: NO deviation.** Uses Stack-table entries: Supabase Postgres + Auth/RLS, Next.js App Router (RSC + Route Handlers), `@wealth/core`, `emitFunnel`/`auth_funnel_events`. No tool/service/framework outside the table.

## Alternatives considered

1. **Dynamic Block-composition engine now** — assemble from composable primitives at runtime, with a `Block` table + `workflow_blocks` join. *Rejected:* the brief's elicitation deferred composition + marketplace; Blocks-as-data serves authoring/marketplace which don't exist yet; over-scopes the convergence-point bet. Foundation's JSONB-config note explicitly permits representing blocks as config now.
2. **14 distinct templates (one literal template per goalKind)** — *Rejected:* 14 near-duplicate templates add surface, not value; ~6 archetypes + a total map deliver the same no-dead-end guarantee with real distinct action-types, closer to KR1's "5".
3. **Inngest-scheduled execution in this bet** (workflows fire rules on a schedule) — *Rejected for loop-close:* the first WorkflowRun is user-triggered ("start it"); scheduled firing is a fast-follow and would inflate the 2-week estimate. Inngest is in-stack when that lands.
4. **Personalize at declare-time** — *Rejected:* impossible under intent-first (no data yet); forced the two-phase design.

## Consequences

**Positive:**
- Closes the MVP loop and produces the WAWU unit, reusing proven patterns (RLS, composite-FK, `emitFunnel`, RSC) → low build risk on the convergence-point bet.
- The archetype registry mirrors `INTENT_CLUSTERS` (one mental model); the no-dead-end guarantee is a unit test, not a hope.
- Thin + within-stack → fits the ~2-week estimate; additive migration → easy rollback.

**Negative:**
- The MVP "running workflow" is **shallow** — one action, no scheduled execution — so "running" is partly aspirational until the execution fast-follow (named risk in the brief).
- The archetype registry is **code-coupled**: adding/altering archetypes is a deploy, not config, until the marketplace bet. Acceptable pre-marketplace.
- Two-phase assembly adds a `pending_data` state to reason about (mitigated: it mirrors the existing intent→connect bridge).

**Reversibility:** medium — data model is additive; archetypes are code; deferring Blocks-as-data is reversible when composition lands (expand the model then).

## Test strategy

- **Unit (`@wealth/core`):** `archetypeForGoalKind` resolves **every** `goalKind` in `INTENT_CLUSTERS` (no-dead-end guardrail); personalization builders produce correct `config` from fixture balances/txns; `selectWorkflow`/`completeAction` (with a fake data reader + writer) produce the right archetype/config and flip `Goal` status.
- **RLS integration (live PG, extend `supabase/tests/rls.test.ts`):** `workflows` owner-CRUD + cross-tenant denied; `workflow_runs` owner select/insert, **update/delete denied** (immutable); **composite-FK rejects a forged `goal_id`/`workflow_id` owned by another user** (the WLT-11 cross-tenant test, applied here).
- **E2E (gated):** declare intent → "connect to activate" → (connect) → personalized workflow card → tap action → `WorkflowRun` recorded → "running" state.

## Rollout

- **Migration `0006`** — additive; safe to apply ahead of code (expand-only).
- **No feature flag needed** — it replaces a dead-end placeholder; nothing regresses. Gated naturally by intent-declaration + (for the action) by connected data. If we want to ship the engine dark first, a `check-env`/config gate is trivial — Engineer's call at build.
- **Staged stories:** first story = engine + **one archetype** end-to-end (prove the loop closes on one cluster); subsequent stories add archetypes to fill the map (the guardrail test goes green incrementally as the map completes — keep it `.skip`-free by shipping the full map's *selection* first, archetypes' *personalization* incrementally).

## Open questions for Engineer

- The exact personalization inputs per archetype (e.g., category derivation, recurring-bill detection) — start simple (top-N by sum); refine in story/design. Don't invent a categorization engine — use Plaid's category if present, else merchant grouping.
- Whether `selectWorkflow` runs as a server action on the declare path or lazily on first dashboard load — Engineer's call; both are owner-scoped + idempotent (one active workflow per goal).
- Idempotency: enforce **one non-archived `Workflow` per `Goal`** (partial unique index) so re-declares/re-loads don't duplicate.

## DRI Log

### Decisions
- [2026-06-11] [Architect] **Archetype registry + total goalKind→archetype map (~6 archetypes) instead of 14 templates or a composition engine** — rationale: satisfies no-dead-end (testable) + KR1's "~5 across 6" with real distinct action-types; defers composition/marketplace per brief — area: engine/scope — alternatives: dynamic composition (rejected — deferred), 14 templates (rejected — duplicative) — reversibility: medium
- [2026-06-11] [Architect] **Two-phase assembly (archetype at declare → personalize post-sync)** — rationale: intent-first means no data at declare-time; WAWU needs real data → action lives post-connect — area: data-flow — alternatives: personalize-at-declare (rejected — no data) — reversibility: easy
- [2026-06-11] [Architect] **`workflows` + `workflow_runs` only; no `Block` table** — rationale: Blocks-as-data serves composition/marketplace (deferred); JSONB config covers the MVP (foundation L199) — area: data-model — reversibility: medium (expand when composition lands)
- [2026-06-11] [Architect] **Composite same-user FKs `(goal_id,user_id)` / `(workflow_id,user_id)`; `workflow_runs` immutable (no update/delete RLS)** — rationale: the WLT-11 cross-tenant-forgery lesson + the append-only action-record posture — area: security/data — reversibility: hard (schema)
- [2026-06-11] [Enterprise Architect] **No foundational-stack deviation** — uses Postgres/Supabase, Next App Router, `@wealth/core`, `emitFunnel` only — area: standards — reversibility: n/a

### Risks
- [2026-06-11] [Architect] **Shallow "running" (no scheduled execution)** could read as a vanity action — likelihood: medium — impact: medium — mitigation: the action instantiates a *persistent personalized* workflow from real data (not a bare tap); scheduled firing is the named fast-follow — area: product
- [2026-06-11] [Architect] **Personalization quality depends on transaction categorization** — likelihood: medium — impact: medium — mitigation: start with Plaid category / merchant grouping + top-N; don't build a categorizer this bet — area: data-quality
- [2026-06-11] [Architect] **`pending_data` workflows that never get data** (user declares, never connects) — likelihood: medium — impact: low — mitigation: dashboard shows the connect bridge; no WorkflowRun until active; harmless — area: lifecycle

### Issues
- _none open — Engineer can start once approved._
