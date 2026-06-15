-- 0009_anomalies.sql — WLT-15 / WLT-18: the anomaly engine ("worth a look").
-- The foundational `Anomaly` entity, first materialization. Additive, expand-only.
--
-- Security posture (bet architecture):
--   * FINANCIAL-data posture for INSERT: service-role only (the daily scan).
--   * owner-SELECT; owner-UPDATE limited to `status` ONLY (a trigger enforces it
--     regardless of column grants — the user can acknowledge/dismiss, nothing else).
--   * same-user COMPOSITE FK (account_id, user_id) — a forged cross-tenant link is
--     blocked at the DB, not just RLS.
--   * `summary` jsonb carries amounts/enums/date ONLY — NO merchant/description (no PII).
--   * the review action reuses 0008's workflow_runs `period` mechanism: one
--     `recap_review_anomaly` run per anomaly (period = anomaly id).

-- Composite-FK target on financial_accounts (PK is id alone; add (id,user_id)).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'financial_accounts_id_user_unique') then
    alter table financial_accounts add constraint financial_accounts_id_user_unique unique (id, user_id);
  end if;
end $$;

-- ─── anomalies ───────────────────────────────────────────────────────────────
create table if not exists anomalies (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  account_id     uuid,                                            -- nullable; composite FK below
  transaction_id uuid,                                            -- informational (no FK: txns are CDC/superseded)
  kind           text        not null check (kind in ('large_charge','recurring_due','low_balance')),
  severity       text        not null default 'attention' check (severity in ('info','attention')),
  summary        jsonb       not null default '{}'::jsonb,        -- amounts/enums/date only — NO PII
  status         text        not null default 'open'
                   check (status in ('open','surfaced','acted','dismissed')),
  detected_on    date        not null,
  dedup_key      text        not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- idempotency: the scan never re-creates the same anomaly.
  unique (user_id, dedup_key),
  -- same-user composite FK (only enforced when account_id is non-null).
  foreign key (account_id, user_id) references financial_accounts (id, user_id) on delete cascade
);
-- The recap reads unresolved anomalies (open/surfaced) by severity.
create index if not exists idx_anomalies_user_status on anomalies (user_id, status);

drop trigger if exists trg_anomalies_updated_at on anomalies;
create trigger trg_anomalies_updated_at before update on anomalies
  for each row execute function set_updated_at();

-- status-ONLY update guard: the owner may change `status` (+ updated_at), nothing
-- else. Enforced here so it holds regardless of column-level GRANTs (the CI shim
-- grants UPDATE on all columns; this trigger is the real boundary).
create or replace function anomalies_status_only()
returns trigger language plpgsql as $$
begin
  if (new.user_id, new.account_id, new.transaction_id, new.kind, new.severity,
      new.summary, new.detected_on, new.dedup_key, new.created_at)
     is distinct from
     (old.user_id, old.account_id, old.transaction_id, old.kind, old.severity,
      old.summary, old.detected_on, old.dedup_key, old.created_at) then
    raise exception 'anomalies: only status may be updated';
  end if;
  return new;
end $$;
drop trigger if exists trg_anomalies_status_only on anomalies;
create trigger trg_anomalies_status_only before update on anomalies
  for each row execute function anomalies_status_only();

alter table anomalies enable row level security;
-- Owner SELECT; owner UPDATE (status-only via the trigger). NO insert/delete
-- policy → INSERT is service-role only (the scan), like the other financial data.
drop policy if exists anomalies_select_own on anomalies;
create policy anomalies_select_own on anomalies for select using (auth.uid() = user_id);
drop policy if exists anomalies_update_own on anomalies;
create policy anomalies_update_own on anomalies for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── complete_anomaly_review: the review action commit, ATOMIC ───────────────
-- Mirrors complete_recap_action (0008): SECURITY INVOKER (owner RLS applies),
-- FOR UPDATE serializes, and the anomaly status flip + the WorkflowRun insert
-- commit together. The run is period-scoped by the anomaly id → exactly one
-- review run per anomaly (0008's uniq_workflow_runs_kind_period). A replay is an
-- idempotent no-op. Dismiss is a plain status UPDATE (no run) — done in the route.
create or replace function complete_anomaly_review(p_anomaly_id uuid, p_workflow_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_an record;
  v_wf record;
begin
  select id, user_id, kind into v_an
    from anomalies where id = p_anomaly_id and status in ('open','surfaced') for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select w.id, w.user_id, w.archetype, g.kind as goal_kind into v_wf
    from workflows w
    join goals g on g.id = w.goal_id and g.user_id = w.user_id
   where w.id = p_workflow_id and w.status = 'active' and w.deleted_at is null
   for update of w;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  begin
    insert into workflow_runs (user_id, workflow_id, kind, context, period)
    values (
      v_wf.user_id, p_workflow_id, 'recap_review_anomaly',
      jsonb_build_object('source', 'recap', 'anomaly_kind', v_an.kind),  -- enums only, no PII
      p_anomaly_id::text
    );
  exception when unique_violation then
    update anomalies set status = 'acted' where id = p_anomaly_id and status in ('open','surfaced');
    return jsonb_build_object('ok', true, 'noop', true, 'archetype', v_wf.archetype, 'goal_kind', v_wf.goal_kind);
  end;
  update anomalies set status = 'acted' where id = p_anomaly_id;
  return jsonb_build_object('ok', true, 'noop', false, 'archetype', v_wf.archetype, 'goal_kind', v_wf.goal_kind);
end $$;

revoke all on function complete_anomaly_review(uuid, uuid) from public;
grant execute on function complete_anomaly_review(uuid, uuid) to authenticated;

-- ─── metrics_anomaly_weekly: precision watch (dismiss-rate) ──────────────────
-- Per-week counts straight off the anomalies table (accurate per-anomaly, not
-- per-view). Server-only: SELECT revoked (views bypass base-table RLS).
create or replace view metrics_anomaly_weekly as
select
  date_trunc('week', created_at)::date                          as week_start,
  count(*)                                                      as detected,
  count(*) filter (where status in ('surfaced','acted','dismissed')) as surfaced,
  count(*) filter (where status = 'acted')                     as acted,
  count(*) filter (where status = 'dismissed')                 as dismissed
from anomalies
group by 1
order by 1 desc;

revoke all on metrics_anomaly_weekly from authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on metrics_anomaly_weekly from anon;
  end if;
end $$;
