-- WLT-26-1: composite index on (user_id, occurred_on, category) for the
-- category spend chart aggregation query (readCategorySpendChart). The 6-month
-- rolling-window read filters by user_id + occurred_on range and groups by
-- category. The existing idx_transactions_user_occurred index covers the
-- (user_id, occurred_on) prefix; adding category avoids a table heap fetch
-- for the category column, keeping the 6-month aggregation under 50ms for
-- typical corpus sizes (architecture.md p95 < 200ms fitness function).
--
-- Partial index (superseded_by is null AND removed_at is null) matches the
-- RLS policy and the existing idx_transactions_user_occurred idiom — only
-- live (non-CDC-superseded, non-removed) rows are indexed.
create index if not exists idx_transactions_user_occurred_category
  on transactions (user_id, occurred_on desc, category)
  where superseded_by is null and removed_at is null;
