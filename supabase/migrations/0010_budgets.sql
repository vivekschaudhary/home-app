-- 0010_budgets.sql — WLT-21 / WLT-21-1 Budget & Spending.
-- A user's per-category monthly budget. Like intents/goals (0004) — USER-DECLARED
-- config the user writes directly → owner-CRUD RLS (NOT the financial-table
-- service-role posture of 0003). Recommended + actual are COMPUTED from
-- transactions (packages/core/budget.ts); nothing derived is stored here.
-- Expand-only.
--
-- Clearing a budget HARD-deletes the row (budgets_delete_own). We deliberately do
-- NOT soft-delete: a `deleted_at`-filtering SELECT policy makes an authenticated
-- `update … set deleted_at` fail Postgres' UPDATE WITH-CHECK (the new row leaves
-- the policy's visibility) — so soft-delete-via-RLS is structurally impossible
-- here. Budgets are user preferences (no audit-trail requirement), so a hard
-- delete is the correct model + keeps the schema honest.

-- ─── budgets: one cap per (user, category) ───────────────────────────────────
create table if not exists budgets (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  category      text        not null,                 -- Plaid PRIMARY / legacy string (the key we humanize)
  limit_amount  numeric(20,4),                        -- a dollar cap, OR…
  limit_percent numeric(5,2),                         -- …a percent (% of typical monthly spend)
  period        text        not null default 'monthly'
                  check (period in ('monthly')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- exactly one limit form is set
  check ((limit_amount is not null) <> (limit_percent is not null)),
  -- sane ranges
  check (limit_amount is null or limit_amount > 0),
  check (limit_percent is null or (limit_percent > 0 and limit_percent <= 100)),
  -- one budget per category per user (a re-set updates this row; clearing deletes it)
  unique (user_id, category)
);
create index if not exists idx_budgets_user on budgets (user_id);

drop trigger if exists trg_budgets_updated_at on budgets;
create trigger trg_budgets_updated_at before update on budgets
  for each row execute function set_updated_at();

alter table budgets enable row level security;
-- Owner CRUD: the user sets + manages their own budgets.
drop policy if exists budgets_select_own on budgets;
create policy budgets_select_own on budgets for select using (auth.uid() = user_id);
drop policy if exists budgets_insert_own on budgets;
create policy budgets_insert_own on budgets for insert with check (auth.uid() = user_id);
drop policy if exists budgets_update_own on budgets;
create policy budgets_update_own on budgets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists budgets_delete_own on budgets;
create policy budgets_delete_own on budgets for delete using (auth.uid() = user_id);
