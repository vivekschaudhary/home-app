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

-- ─── complete_workflow_action: the action commit, ATOMIC ───────────────────
-- One transaction for run-insert + config-update, so a partial failure can
-- never strand a workflow (run recorded but target unset → permanently stuck
-- outside 'running' with replay blocked). SECURITY INVOKER: runs as the calling
-- authenticated user — every statement stays under owner RLS. FOR UPDATE
-- serializes concurrent completes on the same workflow.
create or replace function complete_workflow_action(p_workflow_id uuid, p_target numeric)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_wf record;
begin
  select w.id, w.user_id, w.archetype, w.config, g.kind as goal_kind
    into v_wf
    from workflows w
    join goals g on g.id = w.goal_id and g.user_id = w.user_id
   where w.id = p_workflow_id
     and w.status = 'active'
     and w.deleted_at is null
     for update of w;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  -- Replay guard (engine layer, now in-transaction): action already completed.
  if v_wf.config ? 'target' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  begin
    insert into workflow_runs (user_id, workflow_id, kind, context)
    values (v_wf.user_id, p_workflow_id, 'target_set', jsonb_build_object('target', p_target));
  exception when unique_violation then
    -- The DB replay guard (unique workflow_id+kind) — reject, change nothing.
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end;
  update workflows
     set config = config || jsonb_build_object('target', p_target)
   where id = p_workflow_id;
  return jsonb_build_object('ok', true, 'archetype', v_wf.archetype, 'goal_kind', v_wf.goal_kind);
end $$;

revoke all on function complete_workflow_action(uuid, numeric) from public;
grant execute on function complete_workflow_action(uuid, numeric) to authenticated;
