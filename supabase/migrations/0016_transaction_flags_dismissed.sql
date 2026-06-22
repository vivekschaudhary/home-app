-- 0016_transaction_flags_dismissed.sql — WLT-24-2 (subscription auto-detection):
-- the DISMISSAL model. The detector writes transaction_flags(source='auto') as a
-- SIGNAL the user overrides. For that override to be DURABLE — the detector must
-- never re-add a subscription the user removed — an unmark can no longer
-- HARD-delete the flag (a deleted row carries no "the user said no" memory, so the
-- next detect run would just re-create it). Instead:
--
--   * unmark becomes a SOFT-delete: set dismissed_at = now() (for BOTH 'user' and
--     'auto' flags). The detector skips any merchant that has a dismissed flag.
--   * an explicit re-mark CLEARS dismissed_at (source -> 'user'); a user choice
--     always wins (precedence: user > auto > dismissed).
--   * the active-flags read filters `dismissed_at is null` IN THE QUERY.
--
-- IMPORTANT — the WLT-21 RLS soft-delete lesson, deliberately AVOIDED: we do NOT
-- put `dismissed_at is null` in the SELECT policy. If we did, an authenticated
-- `update set dismissed_at = now()` would make the row invisible to the same
-- statement's read-back, so PostgREST would return 0 rows and the write would look
-- like it failed (the exact trap that forced hard-deletes on budgets). Here the
-- dismissed filter lives in the APPLICATION read query; the owner SELECT policy
-- stays `auth.uid() = user_id`, so the UPDATE reads back fine. => NO new RLS policy
-- is needed: dismissal is an owner UPDATE, already gated by
-- transaction_flags_update_own (from 0015). The existing delete_own policy is left
-- in place (harmless; nothing calls DELETE after this change).
--
-- Expand-only; OPS-2 auto-applies on deploy. No change to transactions/categories/budgets.

alter table transaction_flags add column if not exists dismissed_at timestamptz;

-- The hot path is "this user's ACTIVE flags of a type" (the Subscriptions panel,
-- the ledger ★, and the detector's already-flagged skip-set). A partial index over
-- the non-dismissed rows keeps that read tight as the dismissed set grows.
create index if not exists idx_transaction_flags_active
  on transaction_flags (user_id, flag_type)
  where dismissed_at is null;
