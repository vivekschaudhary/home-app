-- 0020_financial_accounts_kind.sql — WLT-27-2
-- Widen financial_accounts.kind to admit manual-only account types.
-- 'investment' and 'other' are only valid for non-Plaid accounts; the prior
-- constraint ('depository','credit') was scoped to the Plaid provider type.
-- Expand-only migration: no data backfill (no existing rows use these kinds).
-- OPS-2 auto-applies on deploy.

-- Drop the old constraint (name confirmed from 0003_aggregation.sql inline check).
alter table financial_accounts drop constraint if exists financial_accounts_kind_check;

alter table financial_accounts
  add constraint financial_accounts_kind_check
  check (kind in ('depository', 'credit', 'investment', 'other'));
