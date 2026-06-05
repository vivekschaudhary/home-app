-- 0001_init.sql — foundational conventions only.
--
-- This migration establishes the PATTERNS every domain table inherits; it does
-- NOT create the 13 domain entities. Those are created per architectural-
-- initiative bet against the Foundational Data Model in
-- docs/foundation/architecture.md. Keeping this lean avoids front-loading
-- schema before any bet validates the shape.

-- ─── Extensions ───────────────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid(), crypto

-- UUID v7 (time-sortable, externally safe) is the identity strategy. Postgres
-- < 18 has no native v7 generator; domain tables use uuidv7() once available,
-- or a uuid_generate_v7() helper added in the bet that introduces them. The
-- example below uses gen_random_uuid() as a placeholder default.

-- ─── updated_at trigger convention ────────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Default-deny RLS pattern (keyed on auth.uid()) ───────────────────────
-- Every user-scoped table follows this exact shape: enable RLS (default-deny),
-- then add explicit owner-only policies. This is the convention that closes
-- former DRI Risk R1 (tenancy enforced natively via Supabase Auth identities).
create table if not exists example_user_scoped (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                                  -- soft-delete convention
);

create trigger trg_example_updated_at
  before update on example_user_scoped
  for each row execute function set_updated_at();

alter table example_user_scoped enable row level security;

create policy example_select_own on example_user_scoped
  for select using (auth.uid() = user_id);
create policy example_insert_own on example_user_scoped
  for insert with check (auth.uid() = user_id);
create policy example_update_own on example_user_scoped
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy example_delete_own on example_user_scoped
  for delete using (auth.uid() = user_id);
