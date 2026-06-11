-- 0005_aggregation_history.sql — WLT-10. Mark when a connection's initial
-- historical backfill has actually SETTLED, so the "Importing…" UI is derived
-- from real sync state (not a clock) and survives page reloads. Expand-only.
alter table account_connections add column if not exists history_synced_at timestamptz;
