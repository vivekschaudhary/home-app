-- 0012_category_rules.sql — WLT-22-3: "remember the merchant" rules. The third
-- table of the saved-category model (categories + transaction_categories shipped
-- in 0011). A rule maps a NORMALIZED merchant → one of the user's categories;
-- creating it backfills `transaction_categories` (assigned_by='rule') for the
-- user's matching transactions, and the sync applies it to new ones — so a
-- recurring mis-tag is corrected once, for past + future. A user's explicit
-- 'user' assignment always outranks a 'rule' (never clobbered).
--
-- Owner-CRUD RLS (the intents/budgets/categories pattern), hard-delete (the
-- WLT-21 lesson — a deleted_at SELECT filter makes soft-delete-via-RLS
-- impossible). Composite FK (category_id, user_id) blocks a forged cross-tenant
-- link at the DB boundary. Expand-only.

create extension if not exists pgcrypto;

-- ─── category_rules: one category per normalized merchant, per user ──────────
-- `merchant_norm` is the normalized match key (lowercase + trim + collapse
-- whitespace — computed app-side by normalizeMerchant, the SAME function the
-- match uses, so keys can't drift). `unique (user_id, merchant_norm)` →
-- last-write-wins: re-remembering a merchant replaces the rule + re-backfills.
create table if not exists category_rules (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  merchant_norm text       not null,                      -- normalized merchant match key
  category_id  uuid        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, merchant_norm),                        -- one rule per merchant per user
  -- COMPOSITE FK: the category must belong to the SAME user — blocks a forged
  -- cross-tenant rule→category link at the DB boundary, not just via RLS.
  foreign key (category_id, user_id) references categories (id, user_id) on delete cascade
);
create index if not exists idx_category_rules_user on category_rules (user_id);

drop trigger if exists trg_category_rules_updated_at on category_rules;
create trigger trg_category_rules_updated_at before update on category_rules
  for each row execute function set_updated_at();

alter table category_rules enable row level security;
-- Owner CRUD: the user defines + manages their own merchant rules.
drop policy if exists category_rules_select_own on category_rules;
create policy category_rules_select_own on category_rules for select using (auth.uid() = user_id);
drop policy if exists category_rules_insert_own on category_rules;
create policy category_rules_insert_own on category_rules for insert with check (auth.uid() = user_id);
drop policy if exists category_rules_update_own on category_rules;
create policy category_rules_update_own on category_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists category_rules_delete_own on category_rules;
create policy category_rules_delete_own on category_rules for delete using (auth.uid() = user_id);
