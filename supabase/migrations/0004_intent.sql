-- 0004_intent.sql — WLT-3 intent-first onboarding (Intent → Goal).
-- Foundation entities (data model L65–66; ER USER→INTENT→GOAL). Unlike the
-- financial tables (0003, owner-SELECT-only / service-role writes), these are
-- USER-DECLARED config the user writes directly → owner-CRUD RLS. Expand-only.

create extension if not exists pgcrypto;

-- ─── intents: a user's declared intent across the 6 clusters ─────────────────
create table if not exists intents (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  cluster     text        not null
                check (cluster in ('fear','goal','confusion','control','habit','aspiration')),
  intent_key  text        not null,                     -- canonical taxonomy key (validated app-side)
  label       text        not null,                     -- verbatim copy.md label at declare time
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, user_id)   -- composite-FK target so goals can enforce same-user intent
);
create index if not exists idx_intents_user on intents (user_id) where deleted_at is null;

drop trigger if exists trg_intents_updated_at on intents;
create trigger trg_intents_updated_at before update on intents
  for each row execute function set_updated_at();

alter table intents enable row level security;
-- Owner CRUD: the user declares + manages their own intent.
drop policy if exists intents_select_own on intents;
create policy intents_select_own on intents for select using (auth.uid() = user_id and deleted_at is null);
drop policy if exists intents_insert_own on intents;
create policy intents_insert_own on intents for insert with check (auth.uid() = user_id);
drop policy if exists intents_update_own on intents;
create policy intents_update_own on intents for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists intents_delete_own on intents;
create policy intents_delete_own on intents for delete using (auth.uid() = user_id);

-- ─── goals: concrete objective derived from an intent (WLT-4 hand-off) ───────
create table if not exists goals (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  intent_id   uuid        not null,
  kind        text        not null,                     -- derived from the intent (e.g. save_specific)
  params      jsonb       not null default '{}',         -- optional (target amount / timeframe), filled later
  status      text        not null default 'pending_workflow'
                check (status in ('pending_workflow','active','done','archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  -- COMPOSITE FK: the referenced intent must belong to the SAME user — blocks a
  -- forged cross-tenant goal→intent link at the DB boundary, not just via RLS.
  foreign key (intent_id, user_id) references intents (id, user_id) on delete cascade
);
create index if not exists idx_goals_user on goals (user_id) where deleted_at is null;
create index if not exists idx_goals_intent on goals (intent_id);

drop trigger if exists trg_goals_updated_at on goals;
create trigger trg_goals_updated_at before update on goals
  for each row execute function set_updated_at();

alter table goals enable row level security;
drop policy if exists goals_select_own on goals;
create policy goals_select_own on goals for select using (auth.uid() = user_id and deleted_at is null);
drop policy if exists goals_insert_own on goals;
create policy goals_insert_own on goals for insert with check (auth.uid() = user_id);
drop policy if exists goals_update_own on goals;
create policy goals_update_own on goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists goals_delete_own on goals;
create policy goals_delete_own on goals for delete using (auth.uid() = user_id);
