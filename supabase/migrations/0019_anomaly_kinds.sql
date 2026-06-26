-- WLT-26-2: widen the anomaly kind domain to admit the two dashboard intelligence
-- detector kinds. No new table, no new column, no RLS/trigger change.
--
-- The existing owner-SELECT, owner-status-only-UPDATE, service-role-INSERT policies
-- and the anomalies_status_only trigger all apply unchanged to the new kinds.
-- The unique(user_id, dedup_key) index provides idempotency for both new kinds.
--
-- Suppression semantics (architecture.md decision):
--   new_merchant   → permanent (dedup_key keys on the debut transaction's dedupKey)
--   category_spike → monthly   (dedup_key encodes YYYY-MM; re-evaluates next month)
--
-- Constraint name confirmed: the 0009 migration uses an inline unnamed check;
-- Postgres default is anomalies_kind_check. drop + re-add is idempotent.
alter table anomalies drop constraint if exists anomalies_kind_check;
alter table anomalies add constraint anomalies_kind_check
  check (kind in ('large_charge', 'recurring_due', 'low_balance', 'new_merchant', 'category_spike'));
