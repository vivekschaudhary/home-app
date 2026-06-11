-- 0006_workflow.sql — WLT-4 / WLT-12: the workflow engine data model.
-- workflows (the assembled, personalized definition) + workflow_runs (one
-- execution/action record = the WAWU unit). Additive, expand-only.
--
-- Security posture (bet architecture):
--   * owner-scoped RLS keyed on auth.uid() — user-declared/owned config, like
--     intents/goals (NOT the financial-table service-role posture).
--   * COMPOSITE same-user FKs (the WLT-11 lesson): workflows.goal_id and
--     workflow_runs.workflow_id must belong to the SAME user — a forged
--     cross-tenant link is blocked at the DB boundary, not just via RLS.
--   * workflow_runs is an IMMUTABLE action record (audit-adjacent): owner may
--     SELECT + INSERT only — no UPDATE/DELETE policies exist at all.

-- Composite-FK target on goals (intents already has one from 0004).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'goals_id_user_unique'
  ) then
    alter table goals add constraint goals_id_user_unique unique (id, user_id);
  end if;
end $$;

-- ─── workflows ──────────────────────────────────────────────────────────────
create table if not exists workflows (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  goal_id     uuid        not null,
  archetype   text        not null,
  -- Personalized config (JSONB per foundation L199): for networth_snapshot —
  -- { netWorth, assets, debts, suggestedTarget, target? }. Amounts only, no PII.
  config      jsonb       not null default '{}'::jsonb,
  status      text        not null default 'pending_data'
                check (status in ('pending_data','active','paused','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, user_id),  -- composite-FK target so workflow_runs can enforce same-user
  -- COMPOSITE FK: the goal must belong to the SAME user.
  foreign key (goal_id, user_id) references goals (id, user_id) on delete cascade
);
create index if not exists idx_workflows_user on workflows (user_id) where deleted_at is null;
-- Idempotency: at most ONE live workflow per goal (re-assembly never duplicates).
create unique index if not exists uniq_workflows_goal_live
  on workflows (goal_id) where deleted_at is null and status != 'archived';

drop trigger if exists trg_workflows_updated_at on workflows;
create trigger trg_workflows_updated_at before update on workflows
  for each row execute function set_updated_at();

alter table workflows enable row level security;
drop policy if exists workflows_select_own on workflows;
create policy workflows_select_own on workflows for select using (auth.uid() = user_id and deleted_at is null);
drop policy if exists workflows_insert_own on workflows;
create policy workflows_insert_own on workflows for insert with check (auth.uid() = user_id);
drop policy if exists workflows_update_own on workflows;
create policy workflows_update_own on workflows for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists workflows_delete_own on workflows;
create policy workflows_delete_own on workflows for delete using (auth.uid() = user_id);

-- ─── workflow_runs (immutable — the WAWU action record) ────────────────────
create table if not exists workflow_runs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  workflow_id  uuid        not null,
  kind         text        not null,                          -- e.g. 'target_set'
  status       text        not null default 'completed'
                 check (status in ('completed')),
  context      jsonb       not null default '{}'::jsonb,      -- amounts only, no PII
  created_at   timestamptz not null default now(),
  -- COMPOSITE FK: the workflow must belong to the SAME user.
  foreign key (workflow_id, user_id) references workflows (id, user_id) on delete cascade
);
create index if not exists idx_workflow_runs_user on workflow_runs (user_id);
create index if not exists idx_workflow_runs_workflow on workflow_runs (workflow_id);
-- Replay guard: ONE completed action of a given kind per workflow. A replayed
-- POST cannot append duplicate immutable runs (WAWU/metrics integrity). Future
-- repeatable actions get their own kind or a relaxation per archetype.
create unique index if not exists uniq_workflow_runs_kind_once
  on workflow_runs (workflow_id, kind);

alter table workflow_runs enable row level security;
-- Owner SELECT + INSERT only. Deliberately NO update/delete policies: the run
-- is an immutable action record (retention-bound, audit-adjacent).
drop policy if exists workflow_runs_select_own on workflow_runs;
create policy workflow_runs_select_own on workflow_runs for select using (auth.uid() = user_id);
drop policy if exists workflow_runs_insert_own on workflow_runs;
create policy workflow_runs_insert_own on workflow_runs for insert with check (auth.uid() = user_id);
