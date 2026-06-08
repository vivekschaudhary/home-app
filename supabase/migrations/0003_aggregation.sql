-- 0003_aggregation.sql — WLT-2 account aggregation (Plaid + CSV).
-- Provider-NEUTRAL schema (no Plaid-specific columns beyond `provider` + opaque
-- provider_*_id). Financial-table RLS posture (per the passkey audit): owner-SELECT
-- only; ALL writes via the service role (no insert/update/delete-own policies) —
-- a user must never write a financial row directly. Expand-only; no alters to 0001/0002.

create extension if not exists pgcrypto;

-- ─── account_connections: one authorized aggregation link ───────────────────
create table if not exists account_connections (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references auth.users (id) on delete cascade,
  provider                text        not null,                       -- "plaid" | future "mx"…
  provider_connection_id  text        not null,                       -- opaque (Plaid item id)
  vault_token_ref         uuid        not null,                       -- opaque Vault handle; NEVER the token
  institution_id          text,
  institution_name        text,
  health_status           text        not null default 'active'
                            check (health_status in ('active','needs_reauth','error','disconnected')),
  sync_cursor             text,                                       -- provider tx cursor (Plaid /sync)
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  unique (provider, provider_connection_id)
);
create index if not exists idx_account_connections_user
  on account_connections (user_id) where deleted_at is null;

drop trigger if exists trg_account_connections_updated_at on account_connections;
create trigger trg_account_connections_updated_at
  before update on account_connections for each row execute function set_updated_at();

alter table account_connections enable row level security;
-- Owner read only; ALL writes via the service role.
drop policy if exists account_connections_select_own on account_connections;
create policy account_connections_select_own on account_connections
  for select using (auth.uid() = user_id and deleted_at is null);

-- ─── financial_accounts: accounts surfaced by a connection (or manual/CSV) ───
create table if not exists financial_accounts (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users (id) on delete cascade,  -- denormalized for direct RLS
  connection_id        uuid        references account_connections (id) on delete cascade,  -- null = manual/CSV
  provider_account_id  text,                                          -- opaque; null for manual
  name                 text        not null,
  kind                 text        not null check (kind in ('depository','credit')),
  currency             text        not null default 'USD',
  balance_current      numeric(20,4),
  balance_available    numeric(20,4),
  balance_updated_at   timestamptz,                                   -- snapshot time (not derived from txns)
  mask                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (connection_id, provider_account_id)
);
create index if not exists idx_financial_accounts_user
  on financial_accounts (user_id) where deleted_at is null;
create index if not exists idx_financial_accounts_connection
  on financial_accounts (connection_id);

drop trigger if exists trg_financial_accounts_updated_at on financial_accounts;
create trigger trg_financial_accounts_updated_at
  before update on financial_accounts for each row execute function set_updated_at();

alter table financial_accounts enable row level security;
drop policy if exists financial_accounts_select_own on financial_accounts;
create policy financial_accounts_select_own on financial_accounts
  for select using (auth.uid() = user_id and deleted_at is null);

-- ─── transactions: append/CDC ledger; service-role writes only ──────────────
create table if not exists transactions (
  id                      uuid          primary key default gen_random_uuid(),
  user_id                 uuid          not null references auth.users (id) on delete cascade,
  account_id              uuid          not null references financial_accounts (id) on delete cascade,
  source                  text          not null,                    -- "plaid" | "csv" | "email"
  provider_transaction_id text,                                      -- opaque; null for CSV
  dedup_key               text          not null,                    -- logical txn identity
  content_hash            text          not null,                    -- hash of mutable fields (revision)
  amount                  numeric(20,4) not null,
  direction               text          not null check (direction in ('debit','credit')),
  currency                text          not null default 'USD',
  description             text          not null,
  merchant                text,
  category                text,
  occurred_on             date          not null,                    -- provider posted date (no TZ shift)
  pending                 boolean       not null default false,
  removed_at              timestamptz,                               -- tombstone for provider `removed`
  superseded_by           uuid          references transactions (id),-- CDC: a `modified` event supersedes
  ingested_at             timestamptz   not null default now(),
  created_at              timestamptz   not null default now(),
  -- Idempotency + CDC: same content re-emitted ⇒ no-op; a modified revision is a new row.
  unique (user_id, dedup_key, content_hash)
);
create index if not exists idx_transactions_account_occurred
  on transactions (account_id, occurred_on desc) where superseded_by is null and removed_at is null;
create index if not exists idx_transactions_user_occurred
  on transactions (user_id, occurred_on desc) where superseded_by is null and removed_at is null;

alter table transactions enable row level security;
-- Owner read only; append/CDC + no write policy ⇒ immutable from the user's side.
drop policy if exists transactions_select_own on transactions;
create policy transactions_select_own on transactions
  for select using (auth.uid() = user_id and superseded_by is null and removed_at is null);

-- ─── TokenVault bridge: SECURITY DEFINER wrappers over Supabase Vault ────────
-- Bridges supabase-js (`.rpc`) → the `vault` schema (PostgREST doesn't expose it).
-- Service-role-only. Guarded on the `vault` extension so the CI auth-shim DB (no
-- Vault) still applies this migration — the RLS tests don't call these.
do $vault$
begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $f$
      create or replace function public.token_vault_put(p_secret text)
      returns uuid language plpgsql security definer set search_path = vault, public as $b$
      begin return vault.create_secret(p_secret); end $b$;
    $f$;
    execute $f$
      create or replace function public.token_vault_get(p_ref uuid)
      returns text language plpgsql security definer set search_path = vault, public as $b$
      declare v text;
      begin select decrypted_secret into v from vault.decrypted_secrets where id = p_ref; return v; end $b$;
    $f$;
    execute $f$
      create or replace function public.token_vault_delete(p_ref uuid)
      returns void language plpgsql security definer set search_path = vault, public as $b$
      begin delete from vault.secrets where id = p_ref; end $b$;
    $f$;
    -- Service-role only — never anon/authenticated.
    execute 'revoke all on function public.token_vault_put(text) from public';
    execute 'revoke all on function public.token_vault_get(uuid) from public';
    execute 'revoke all on function public.token_vault_delete(uuid) from public';
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'grant execute on function public.token_vault_put(text) to service_role';
      execute 'grant execute on function public.token_vault_get(uuid) to service_role';
      execute 'grant execute on function public.token_vault_delete(uuid) to service_role';
    end if;
  end if;
end $vault$;
