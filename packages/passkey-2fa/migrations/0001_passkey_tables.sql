-- @vc1023/passkey-2fa — apply this to your Supabase project (SQL editor
-- or `supabase db push`). Creates the two tables the passkey 2FA layer needs,
-- with default-deny RLS keyed on auth.uid(). Audit/analytics tables are NOT
-- created here — wire those via the route handlers' onEvent hook in your app.

create extension if not exists pgcrypto;

-- updated_at trigger helper (idempotent).
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── webauthn_credentials: a user's registered passkeys (the 2nd factor) ───
create table if not exists webauthn_credentials (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  credential_id text        not null unique,
  public_key    text        not null,
  counter       bigint      not null default 0,
  transports    text[],
  device_type   text,
  backed_up     boolean     not null default false,
  aaguid        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_webauthn_credentials_user on webauthn_credentials (user_id);

drop trigger if exists trg_webauthn_credentials_updated_at on webauthn_credentials;
create trigger trg_webauthn_credentials_updated_at
  before update on webauthn_credentials
  for each row execute function set_updated_at();

alter table webauthn_credentials enable row level security;

-- Read-own only. Credential rows are WRITTEN exclusively by the server via the
-- service role (which bypasses RLS) after a verified WebAuthn ceremony — there
-- is intentionally NO user-facing insert/delete policy, so a signed-in user
-- cannot plant or remove a passkey credential directly through the anon client
-- (which would skip attestation / the last-factor guard). The drops below also
-- remove the insert/delete policies from any database created by an earlier
-- version of this migration.
drop policy if exists webauthn_credentials_select_own on webauthn_credentials;
drop policy if exists webauthn_credentials_insert_own on webauthn_credentials;
drop policy if exists webauthn_credentials_delete_own on webauthn_credentials;
create policy webauthn_credentials_select_own on webauthn_credentials
  for select using (auth.uid() = user_id);

-- ─── webauthn_challenges: single-use server-issued ceremony nonces ───
create table if not exists webauthn_challenges (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  challenge  text        not null,
  type       text        not null check (type in ('registration', 'authentication')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_webauthn_challenges_user_type on webauthn_challenges (user_id, type);

-- Default-deny: RLS on, NO policies. Only the service role (server) touches it.
alter table webauthn_challenges enable row level security;
