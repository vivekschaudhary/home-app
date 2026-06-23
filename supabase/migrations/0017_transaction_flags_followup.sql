-- 0017_transaction_flags_followup.sql — WLT-25-1: enable the SECOND overlay (Follow-up).
--
-- The `transaction_flags` table was built (WLT-24-1) to carry two overlays on one
-- substrate. Subscriptions shipped first; this widens the `flag_type` check from
-- ('subscription') to ('subscription','followup') so a per-transaction "follow up"
-- flag can be written. A follow-up is `(flag_type='followup', source='user')`,
-- keyed by the stable `dedup_key` (survives Plaid CDC), orthogonal to BOTH category
-- and subscription, and RESOLVED via the existing `dismissed_at` (soft-delete:
-- null ⇒ open, set ⇒ done). It reuses the table's owner-CRUD RLS, the
-- `unique(user_id, dedup_key, flag_type)` (one follow-up per transaction), and the
-- partial active index `(user_id, flag_type) where dismissed_at is null` unchanged.
--
-- The inline check from 0015 is auto-named `transaction_flags_flag_type_check`
-- (verified on an ephemeral Postgres). Drop + re-add it widened. Expand-only (it
-- only ADMITS a new value — never rejects existing rows); OPS-2 auto-applies on
-- deploy. No new table, no new column, no change to transactions/categories/budgets.

alter table transaction_flags drop constraint if exists transaction_flags_flag_type_check;
alter table transaction_flags add constraint transaction_flags_flag_type_check check (flag_type in ('subscription', 'followup'));
