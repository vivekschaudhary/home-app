-- 0018_category_index.sql — WLT-26-1: composite index on transactions for the
-- 6-month category spend aggregation. The readCategorySpendChart reader filters
-- on (user_id, occurred_on) and resolves category in JS — this index makes the
-- bounded 6-month window scan sub-50ms for typical user corpus sizes (brief
-- guardrail: dashboard p95 < 200ms).
--
-- Additive only — no table/policy/trigger changes.

create index if not exists idx_transactions_user_occurred_cat
  on transactions (user_id, occurred_on desc, category)
  where superseded_by is null and removed_at is null;
