-- 0015_transaction_flags.sql — WLT-24-1 Subscriptions: a per-transaction OVERLAY
-- flag, orthogonal to category. A subscription is BOTH a category (Entertainment)
-- AND a recurring charge — so it can't live on the category axis; it's a flag.
--
-- Owner-CRUD (the user marks their own, like categories/budgets — NOT the
-- service-role financial-table posture). Keyed by the stable `dedup_key` so a
-- mark survives Plaid CDC re-syncs (a revision is a new transactions row; the
-- flag hangs off the invariant key, same as transaction_categories). HARD-delete
-- on unmark (a `deleted_at`-filtering SELECT policy makes an authenticated
-- soft-delete structurally impossible — the WLT-21 lesson; and a mark is user
-- config, no audit need).
--
-- `flag_type` is 'subscription' this bet; the check admits 'followup' for the
-- planned sibling bet on the same substrate. `source` reserves auto-detection
-- (slice 1 writes only 'user'); the detector fast-follow writes 'auto' as a
-- signal the user overrides. NO composite FK — the flag is self-contained
-- (nothing cross-table to forge); the plain user_id owner policy is the isolation.

create extension if not exists pgcrypto;

create table if not exists transaction_flags (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  dedup_key   text        not null,                       -- the stable txn identity (survives CDC)
  flag_type   text        not null
                check (flag_type in ('subscription')),    -- 'followup' admitted later
  source      text        not null default 'user'
                check (source in ('user','auto')),         -- 'auto' reserved for the detector fast-follow
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, dedup_key, flag_type)                  -- one flag of a type per transaction
);
create index if not exists idx_transaction_flags_user_type on transaction_flags (user_id, flag_type);

drop trigger if exists trg_transaction_flags_updated_at on transaction_flags;
create trigger trg_transaction_flags_updated_at before update on transaction_flags
  for each row execute function set_updated_at();

alter table transaction_flags enable row level security;
-- Owner CRUD: the user marks + manages their own flags.
drop policy if exists transaction_flags_select_own on transaction_flags;
create policy transaction_flags_select_own on transaction_flags for select using (auth.uid() = user_id);
drop policy if exists transaction_flags_insert_own on transaction_flags;
create policy transaction_flags_insert_own on transaction_flags for insert with check (auth.uid() = user_id);
drop policy if exists transaction_flags_update_own on transaction_flags;
create policy transaction_flags_update_own on transaction_flags for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists transaction_flags_delete_own on transaction_flags;
create policy transaction_flags_delete_own on transaction_flags for delete using (auth.uid() = user_id);
