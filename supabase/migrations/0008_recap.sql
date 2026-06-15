-- 0008_recap.sql — WLT-15 / WLT-16: the "since last time" recap.
-- Additive, expand-only. Three things:
--   1. net_worth_snapshots — the daily-sampled time series that makes
--      net-worth MOVEMENT and target PROGRESS computable. Balances can't be
--      reconstructed from transactions (market moves, transfers, opening
--      balances), so net worth is SAMPLED, not derived (bet architecture).
--   2. workflow_runs repeatable recap actions — the onboarding `target_set`
--      stays once-ever; recap actions repeat once per ISO week (the WAWU unit
--      becomes weekly-repeatable). Done WITHOUT touching the once-ever guard.
--   3. metrics_return_weekly — distinct returning users per 7-day window
--      (the Day-7 return metric the /admin/metrics panel renders).
--
-- Security posture (bet architecture):
--   * net_worth_snapshots: FINANCIAL-table posture (like financial_accounts) —
--     owner-SELECT only; ALL writes via the service role (the daily job). A user
--     never writes a snapshot directly.
--   * metrics_return_weekly: server-only, SELECT revoked from authenticated/anon
--     (views bypass base-table RLS → the revoke IS the boundary, per 0007).

-- ─── net_worth_snapshots: the daily net-worth sample (service-role writes) ───
create table if not exists net_worth_snapshots (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references auth.users (id) on delete cascade,
  captured_on date          not null,                    -- one sample per user per day (UTC)
  net_worth   numeric(20,4) not null,
  assets      numeric(20,4) not null,
  debts       numeric(20,4) not null,
  created_at  timestamptz   not null default now(),
  -- Idempotency: the daily job upserts; re-running the same day is a no-op.
  unique (user_id, captured_on)
);
-- Movement reads the latest two samples → index ordered by (user, captured_on desc).
create index if not exists idx_net_worth_snapshots_user_captured
  on net_worth_snapshots (user_id, captured_on desc);

alter table net_worth_snapshots enable row level security;
-- Owner read only; ALL writes via the service role (financial-table posture).
drop policy if exists net_worth_snapshots_select_own on net_worth_snapshots;
create policy net_worth_snapshots_select_own on net_worth_snapshots
  for select using (auth.uid() = user_id);

-- ─── workflow_runs: repeatable recap actions (weekly idempotency) ───────────
-- A `period` column distinguishes once-ever actions (null → the onboarding
-- target_set) from repeatable recap actions (an ISO-week string, e.g. '2026-W24',
-- computed in app code so the uniqueness key stays IMMUTABLE — date_trunc over a
-- timestamptz is only STABLE and can't be indexed directly).
alter table workflow_runs add column if not exists period text;

-- Re-scope the once-ever guard to period-null rows ONLY (target_set is unchanged:
-- it inserts no period → null → still one-per-(workflow,kind) forever). Recap
-- runs carry a non-null period and are exempt from this index.
drop index if exists uniq_workflow_runs_kind_once;
create unique index if not exists uniq_workflow_runs_kind_once
  on workflow_runs (workflow_id, kind) where period is null;

-- Repeatable-but-weekly guard: at most ONE recap run of a given kind per workflow
-- per ISO week. A double-submit in the same week is rejected (idempotent no-op at
-- the app layer); a new week is a fresh run → WAWU is weekly-repeatable.
create unique index if not exists uniq_workflow_runs_kind_period
  on workflow_runs (workflow_id, kind, period) where period is not null;

-- ─── complete_recap_action: the recap action commit, ATOMIC ─────────────────
-- Mirrors complete_workflow_action (0006): SECURITY INVOKER (runs under the
-- caller's RLS — ownership enforced by owner policies), FOR UPDATE serializes
-- concurrent completes, and the run-insert + config-update commit in ONE
-- transaction. p_kind MUST be a recap kind (validated app-side) and p_period
-- non-null (the weekly key). A replay in the same period is an idempotent no-op
-- (ok:true, noop:true) — NOT an error — so a double-tap returns 200.
create or replace function complete_recap_action(
  p_workflow_id uuid, p_target numeric, p_kind text, p_period text
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_wf record;
begin
  if p_period is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');  -- recap runs are period-scoped
  end if;
  select w.id, w.user_id, w.archetype, g.kind as goal_kind
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
  begin
    insert into workflow_runs (user_id, workflow_id, kind, context, period)
    values (
      v_wf.user_id, p_workflow_id, p_kind,
      jsonb_build_object('target', p_target, 'source', 'recap'),  -- amounts/enums only, no PII
      p_period
    );
  exception when unique_violation then
    -- Already acted this period — idempotent no-op (one recap action per week).
    return jsonb_build_object('ok', true, 'noop', true, 'archetype', v_wf.archetype, 'goal_kind', v_wf.goal_kind);
  end;
  update workflows
     set config = config || jsonb_build_object('target', p_target)
   where id = p_workflow_id;
  return jsonb_build_object('ok', true, 'noop', false, 'archetype', v_wf.archetype, 'goal_kind', v_wf.goal_kind);
end $$;

revoke all on function complete_recap_action(uuid, numeric, text, text) from public;
grant execute on function complete_recap_action(uuid, numeric, text, text) to authenticated;

-- ─── metrics_return_weekly: distinct returning users per 7-day window ────────
-- Mirrors metrics_wawu_weekly (0007). recap_viewed = a user opened the recap.
create or replace view metrics_return_weekly as
select
  date_trunc('week', occurred_at)::date as week_start,
  count(distinct user_id)               as returners
from auth_funnel_events
where event = 'recap_viewed' and user_id is not null
group by 1
order by 1 desc;

-- Server-only (see 0007 header): views bypass base-table RLS, so the revoke is
-- the security boundary — reachable only via the service-role admin read.
revoke all on metrics_return_weekly from authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on metrics_return_weekly from anon;
  end if;
end $$;
