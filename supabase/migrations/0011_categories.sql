-- 0011_categories.sql — WLT-22-2 Budget transparency: user-owned categories +
-- the SAVED per-transaction assignment. Like intents/goals (0004) + budgets
-- (0010) — USER-DECLARED config the user writes directly → owner-CRUD RLS (NOT
-- the financial-table service-role posture of 0003). `transactions.category`
-- (Plaid's) is UNTOUCHED — it stays the cold-start indication; what the user
-- saves lives here, keyed off the stable `dedup_key` so it survives Plaid's CDC
-- re-syncs (a new transaction revision keeps the same dedup_key). Expand-only.
--
-- Clearing HARD-deletes (no soft-delete): a `deleted_at`-filtering SELECT policy
-- makes an authenticated `update … set deleted_at` fail Postgres' UPDATE
-- WITH-CHECK — soft-delete-via-RLS is structurally impossible (the WLT-21
-- lesson). These are user preferences (no audit-trail need), so hard-delete is
-- the honest model.
--
-- This slice ships TWO of the saved-category model's three tables — the spine +
-- manual per-transaction correction. `category_rules` (the "remember the
-- merchant" automation) is WLT-22-3; `transaction_categories.assigned_by` /
-- `rule_id` are already shaped to accept rule-written rows then.

create extension if not exists pgcrypto;

-- ─── categories: the user's OWN category set (Plaid strings seeded + custom) ──
-- `name` is the canonical key everywhere: seeded categories carry the exact
-- provider string (e.g. FOOD_AND_DRINK) so WLT-21 string-keyed budgets carry
-- over for free; custom categories carry the user's text (e.g. Rent). `kind`
-- feeds the recommendation (essentials untrimmed); seeded from the WLT-21
-- essential allow-list.
create table if not exists categories (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  name        text        not null,
  kind        text        not null default 'discretionary'
                check (kind in ('essential','discretionary')),
  source      text        not null default 'custom'
                check (source in ('seed','custom')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, lower(name)),   -- one category per name per user (case-insensitive)
  unique (id, user_id)             -- composite-FK target (same-user assignment)
);
create index if not exists idx_categories_user on categories (user_id);

drop trigger if exists trg_categories_updated_at on categories;
create trigger trg_categories_updated_at before update on categories
  for each row execute function set_updated_at();

alter table categories enable row level security;
-- Owner CRUD: the user defines + manages their own categories.
drop policy if exists categories_select_own on categories;
create policy categories_select_own on categories for select using (auth.uid() = user_id);
drop policy if exists categories_insert_own on categories;
create policy categories_insert_own on categories for insert with check (auth.uid() = user_id);
drop policy if exists categories_update_own on categories;
create policy categories_update_own on categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists categories_delete_own on categories;
create policy categories_delete_own on categories for delete using (auth.uid() = user_id);

-- ─── transaction_categories: the SAVED per-transaction assignment ─────────────
-- Keyed by the stable `dedup_key` (NOT a FK to transactions.id — that row churns
-- on CDC re-sync; dedup_key is invariant). One assignment per (user, dedup_key);
-- re-categorizing upserts it. `assigned_by` is only 'user' this slice (rules =
-- WLT-22-3). Reads resolve `saved ?? Plaid` via one shared helper.
create table if not exists transaction_categories (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  dedup_key   text        not null,                      -- the stable txn identity (survives CDC)
  category_id uuid        not null,
  assigned_by text        not null default 'user'
                check (assigned_by in ('user','rule')),
  rule_id     uuid,                                      -- which rule wrote it (WLT-22-3); null for 'user'
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, dedup_key),                           -- one saved category per transaction
  -- COMPOSITE FK: the category must belong to the SAME user — blocks a forged
  -- cross-tenant assignment→category link at the DB boundary, not just via RLS.
  foreign key (category_id, user_id) references categories (id, user_id) on delete cascade
);
create index if not exists idx_txn_categories_user on transaction_categories (user_id);
create index if not exists idx_txn_categories_category on transaction_categories (category_id);

drop trigger if exists trg_txn_categories_updated_at on transaction_categories;
create trigger trg_txn_categories_updated_at before update on transaction_categories
  for each row execute function set_updated_at();

alter table transaction_categories enable row level security;
-- Owner CRUD: the user sets + manages their own saved assignments.
drop policy if exists txn_categories_select_own on transaction_categories;
create policy txn_categories_select_own on transaction_categories for select using (auth.uid() = user_id);
drop policy if exists txn_categories_insert_own on transaction_categories;
create policy txn_categories_insert_own on transaction_categories for insert with check (auth.uid() = user_id);
drop policy if exists txn_categories_update_own on transaction_categories;
create policy txn_categories_update_own on transaction_categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists txn_categories_delete_own on transaction_categories;
create policy txn_categories_delete_own on transaction_categories for delete using (auth.uid() = user_id);
