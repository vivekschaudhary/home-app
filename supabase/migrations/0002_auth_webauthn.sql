-- 0002_auth_webauthn.sql — WLT-6 auth tables.
--
-- Custom WebAuthn passkey second factor (architecture ADR-001) over Supabase
-- email+password (AAL1). All user-scoped tables follow the 0001 default-deny
-- RLS convention keyed on auth.uid(). Server-only tables (challenges) enable
-- RLS with NO permissive policies — only the service role (which bypasses RLS)
-- writes them.

-- ─── webauthn_credentials: a user's registered passkeys (the 2nd factor) ───
create table if not exists webauthn_credentials (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  credential_id text        not null unique,           -- base64url credential id
  public_key    text        not null,                  -- base64url COSE public key
  counter       bigint      not null default 0,         -- replay-protection signature counter
  transports    text[],                                 -- usb/nfc/ble/internal/hybrid
  device_type   text,                                   -- singleDevice | multiDevice
  backed_up     boolean     not null default false,
  aaguid        text,                                   -- authenticator model id
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_webauthn_credentials_user on webauthn_credentials (user_id);

create trigger trg_webauthn_credentials_updated_at
  before update on webauthn_credentials
  for each row execute function set_updated_at();

alter table webauthn_credentials enable row level security;

-- Owner-only. Counter updates happen server-side (service role) during auth.
create policy webauthn_credentials_select_own on webauthn_credentials
  for select using (auth.uid() = user_id);
create policy webauthn_credentials_insert_own on webauthn_credentials
  for insert with check (auth.uid() = user_id);
create policy webauthn_credentials_delete_own on webauthn_credentials
  for delete using (auth.uid() = user_id);

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

-- ─── audit_events: append-only auth + financial-action audit trail ───
create table if not exists audit_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references auth.users (id) on delete set null,
  action     text        not null,
  context    jsonb       not null default '{}'::jsonb,   -- never store PII here
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_user_created on audit_events (user_id, created_at desc);

alter table audit_events enable row level security;

-- Owner may read their own audit trail; inserts are server-only (service role).
-- No update/delete policies → append-only by construction.
create policy audit_events_select_own on audit_events
  for select using (auth.uid() = user_id);

-- ─── auth_funnel_events: TTFV / WAWU funnel (WLT-5 schema contract) ───
create table if not exists auth_funnel_events (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users (id) on delete set null,
  event       text        not null,
  context     jsonb       not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_auth_funnel_events_event_time on auth_funnel_events (event, occurred_at);

alter table auth_funnel_events enable row level security;

-- Owner may read their own funnel events; inserts are server-only (service role).
create policy auth_funnel_events_select_own on auth_funnel_events
  for select using (auth.uid() = user_id);
