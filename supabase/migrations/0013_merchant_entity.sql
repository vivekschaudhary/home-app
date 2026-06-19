-- WLT-22-4 — Plaid's stable `merchant_entity_id` as the PRIMARY "remember the
-- merchant" match key. Plaid's display `merchant_name` varies across a merchant's
-- transactions (Walmart / Walmart.com / Walmart Supercenter #1234); the entity id
-- is consistent, so it fixes the name-variability misses (INC-2026-06-19) exactly,
-- with the canonical name as the fallback.
--
-- EXPAND-ONLY + nullable: matching tolerates a null entity (falls back to the name),
-- so there is no backfill requirement and no expand-contract window — existing rows
-- repopulate organically as Plaid sends revisions. Idempotent for OPS-2 + the CI loop.

alter table transactions   add column if not exists merchant_entity_id text;
alter table category_rules add column if not exists merchant_entity_id text;

-- Entity-first rule matching reads transactions by (user_id, merchant_entity_id).
create index if not exists transactions_user_merchant_entity_idx
  on transactions (user_id, merchant_entity_id);
