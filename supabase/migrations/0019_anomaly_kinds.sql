-- 0019_anomaly_kinds.sql — WLT-26-2: widen the anomaly kind domain for the two
-- dashboard intelligence detector kinds. No new table, no new column, no
-- RLS/trigger change — the existing owner-SELECT, owner-status-only-UPDATE,
-- service-role-INSERT policies and the anomalies_status_only trigger all apply
-- unchanged to the new kinds.
--
-- Suppression semantics (architecture decision):
--   new_merchant   → permanent (dedup_key ties to the debut transaction; once dismissed,
--                    never re-surfaces for the same merchant debut)
--   category_spike → monthly (dedup_key encodes YYYY-MM; next month = fresh dedup_key)
--
-- Constraint name: verified as 'anomalies_kind_check' (the Postgres default for an
-- inline unnamed CHECK on column 'kind' in table 'anomalies', created in 0009).
-- Using DROP + ADD to handle both new-DB and existing-DB safely.

alter table anomalies drop constraint if exists anomalies_kind_check;
alter table anomalies add constraint anomalies_kind_check
  check (kind in ('large_charge', 'recurring_due', 'low_balance', 'new_merchant', 'category_spike'));
