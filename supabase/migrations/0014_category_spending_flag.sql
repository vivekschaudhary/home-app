-- 0014_category_spending_flag.sql — WLT-22-5: transfers & payments don't count
-- as spending. Three additive pieces (expand-only; OPS-2 auto-applies on deploy):
--
--   1. categories.counts_as_spending — a per-user, per-category flag (default
--      true, so every existing category keeps today's behavior). A protected
--      "Transfers & Payments" category (source='system') is seeded false by the
--      app; the budget/recap/anomaly computes drop non-spending categories from
--      the spend TOTALS while still SHOWING the bucket (the visible group).
--   2. source='system' + an undeletable-at-the-DB delete policy for the protected
--      category, and assigned_by='system' for its auto-assignments.
--   3. transactions.kind — the normalized transfer/payment classification
--      (AC8, region-pluggable: the provider ADAPTER maps its taxonomy → kind, so
--      core never branches on Plaid strings). Backfilled from the stored provider
--      `category` (primary-level) here; ingest writes the detailed-aware value
--      going forward. kind is NOT in the CDC content_hash, so adding it never
--      forces a transaction revision.

-- ─── 1 + 2: categories.counts_as_spending + source='system' ──────────────────
alter table categories add column if not exists counts_as_spending boolean not null default true;

-- Extend the source domain to allow the protected system category.
alter table categories drop constraint if exists categories_source_check;
alter table categories add constraint categories_source_check
  check (source in ('seed','custom','system'));

-- The protected system category is undeletable at the DB boundary — an
-- authenticated delete on a source='system' row fails the policy (not just hidden
-- by the UI). Owner can still delete their own seed/custom categories.
drop policy if exists categories_delete_own on categories;
create policy categories_delete_own on categories
  for delete using (auth.uid() = user_id and source <> 'system');

-- Auto-assignments written by the transfer/payment classifier carry assigned_by
-- = 'system' (precedence: 'user' > 'rule'/'system'; a user/rule row is never
-- clobbered — the writer upserts with ignoreDuplicates).
alter table transaction_categories drop constraint if exists transaction_categories_assigned_by_check;
alter table transaction_categories add constraint transaction_categories_assigned_by_check
  check (assigned_by in ('user','rule','system'));

-- ─── 3: transactions.kind (AC8) ──────────────────────────────────────────────
-- Normalized classification. NOT NULL default 'spend' so existing rows are
-- immediately valid; the backfill below corrects transfers/income/fees from the
-- stored provider category. NOT part of content_hash (dedup.ts) → no CDC churn.
alter table transactions add column if not exists kind text not null default 'spend'
  check (kind in ('spend','transfer','payment','income','fee'));

-- Backfill existing rows from the stored Plaid PRIMARY category. This mirrors the
-- PRIMARY-level branch of the TS classifier (packages/aggregation/plaid/map.ts
-- classifyKind) so history == go-forward for primary-only rows. LOAN_PAYMENTS
-- stays 'spend' (mortgage-safe) — the credit-card-payment leg is only separable
-- via the Plaid DETAILED key, absent on history; the user override is the backstop.
update transactions set kind = case
  when category in ('TRANSFER_IN','TRANSFER_OUT') then 'transfer'
  when category = 'INCOME' then 'income'
  when category = 'BANK_FEES' then 'fee'
  else 'spend'
end
where kind = 'spend'
  and category in ('TRANSFER_IN','TRANSFER_OUT','INCOME','BANK_FEES');
