-- 0007_metrics.sql — WLT-5 / WLT-13: the instrument panel's read-only metric
-- views over auth_funnel_events. Additive; NO table or event-contract changes
-- (the 17-event contract stays frozen — consolidation happens here, in views).
--
-- Security posture (story AC1): Postgres views execute with the view OWNER's
-- privileges — base-table RLS does NOT protect view readers — so SELECT is
-- REVOKED from authenticated (and anon where it exists). The views are
-- reachable only via server-side service-role reads (the admin page + the
-- snapshot script). This closes the would-be PostgREST cross-user leak by
-- construction.
--
-- Semantics: FIRST occurrence per user per event (min(occurred_at)) — repeat
-- sign-ins / second workflows never skew the first-value clock.

-- ─── per-user first-event timestamps (the base everything derives from) ─────
create or replace view metrics_first_events as
select
  user_id,
  min(occurred_at) filter (where event = 'signup_started')     as signup_at,
  min(occurred_at) filter (where event = 'mfa_enrolled')       as mfa_at,
  min(occurred_at) filter (where event = 'account_linked')     as linked_at,
  min(occurred_at) filter (where event = 'intent_declared')    as intent_at,
  min(occurred_at) filter (where event = 'workflow_assembled') as assembled_at,
  min(occurred_at) filter (where event = 'action_completed')   as action_at
from auth_funnel_events
where user_id is not null
group by user_id;

-- ─── TTFV per user: the full-loop clock + split times (seconds) ─────────────
create or replace view metrics_ttfv_per_user as
select
  user_id,
  extract(epoch from (action_at    - signup_at)) as ttfv_seconds,
  extract(epoch from (linked_at    - signup_at)) as split_linked_seconds,
  extract(epoch from (assembled_at - signup_at)) as split_assembled_seconds
from metrics_first_events
where signup_at is not null;

-- ─── TTFV summary: the KR1 headline (p80 vs 180s) + split medians + n ───────
create or replace view metrics_ttfv_summary as
select
  count(ttfv_seconds)                                                        as n_completed,
  count(*)                                                                   as n_signups,
  percentile_cont(0.8) within group (order by ttfv_seconds)                  as p80_ttfv_seconds,
  percentile_cont(0.5) within group (order by ttfv_seconds)                  as median_ttfv_seconds,
  percentile_cont(0.5) within group (order by split_linked_seconds)          as median_split_linked_seconds,
  percentile_cont(0.5) within group (order by split_assembled_seconds)       as median_split_assembled_seconds
from metrics_ttfv_per_user;

-- ─── WAWU: distinct users with ≥1 action_completed per 7-day window ─────────
create or replace view metrics_wawu_weekly as
select
  date_trunc('week', occurred_at)::date as week_start,
  count(distinct user_id)               as wawu
from auth_funnel_events
where event = 'action_completed' and user_id is not null
group by 1
order by 1 desc;

-- ─── Funnel: per-stage distinct users (conversion computed by the reader) ───
create or replace view metrics_funnel_stages as
select stage, stage_order, users from (
  select 'signup_started' as stage, 1 as stage_order, count(*) as users from metrics_first_events where signup_at    is not null
  union all
  select 'mfa_enrolled',       2, count(*) from metrics_first_events where mfa_at       is not null
  union all
  select 'account_linked',     3, count(*) from metrics_first_events where linked_at    is not null
  union all
  select 'intent_declared',    4, count(*) from metrics_first_events where intent_at    is not null
  union all
  select 'workflow_assembled', 5, count(*) from metrics_first_events where assembled_at is not null
  union all
  select 'action_completed',   6, count(*) from metrics_first_events where action_at    is not null
) s order by stage_order;

-- ─── privileges: server-only (see header) ───────────────────────────────────
revoke all on metrics_first_events, metrics_ttfv_per_user, metrics_ttfv_summary,
  metrics_wawu_weekly, metrics_funnel_stages from authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on metrics_first_events, metrics_ttfv_per_user, metrics_ttfv_summary,
      metrics_wawu_weekly, metrics_funnel_stages from anon;
  end if;
end $$;
