-- CI-only shim so the cross-tenant RLS test (rls.test.ts) can run against a
-- plain Postgres service instead of a live Supabase project. Recreates the two
-- Supabase primitives the RLS policies depend on: the `authenticated` role and
-- `auth.uid()` (reads the JWT `sub` claim from the session GUCs). NOT applied to
-- real Supabase — there these already exist.

create role authenticated;

create schema if not exists auth;

create or replace function auth.uid()
  returns uuid
  language sql
  stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
