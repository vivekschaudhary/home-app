#!/usr/bin/env bash
# OPS-2 — apply PENDING Supabase migrations to production, safely + serialized.
#
# Design (see docs/ops/OPS-2.md):
#   • SERIALIZED at the DB: the whole pass runs in ONE psql session holding a session
#     advisory lock (pg_advisory_lock). A second runner — another deploy's job OR a
#     manual run — BLOCKS on the lock until the first finishes. (Codex round-2 BLOCKER:
#     a read-then-apply check outside a lock let two close deploys both decide a
#     migration was "pending" and race.) Workflow `concurrency` is the belt; this is
#     the suspenders (covers manual runs too).
#   • ONLY-NEW, checked INSIDE the lock: each migration is applied only if it isn't
#     already in `public._migrations` — and that check happens within the locked
#     session, so there's no window between "is it applied?" and "apply it". (Re-running
#     a migration on a LIVE prod DB would briefly drop+recreate its RLS policies.)
#   • ATOMIC per file: each migration + its tracking insert run in their own
#     transaction; ON_ERROR_STOP aborts (and rolls back) on the first failure, so
#     nothing is left half-recorded.
#   • ORDERED: the glob sorts 0001…NNNN lexically.
#
# Requires: $PROD_DB_URL (a Postgres connection string with DDL privileges).
set -euo pipefail

: "${PROD_DB_URL:?PROD_DB_URL is not set}"

# Arbitrary constant key identifying the "prod migrate" advisory lock.
LOCK_KEY=823471

# Build ONE psql script: lock → ensure the tracking table → for each file, apply it
# ONLY if not yet recorded (\gset + \if, evaluated INSIDE the lock). Piped to a single
# session so the advisory lock is held for the entire pass (released on session exit).
{
  echo "\\set ON_ERROR_STOP on"
  echo "select pg_advisory_lock(${LOCK_KEY});"
  echo "create table if not exists public._migrations (filename text primary key, applied_at timestamptz not null default now());"
  for f in supabase/migrations/*.sql; do
    base="$(basename "$f")"
    echo "select case when exists(select 1 from public._migrations where filename = '${base}') then 'false' else 'true' end as _do \\gset"
    echo "\\if :_do"
    echo "  \\echo '→ applying ${base}'"
    echo "  begin;"
    echo "  \\i ${f}"
    echo "  insert into public._migrations(filename) values ('${base}');"
    echo "  commit;"
    echo "\\else"
    echo "  \\echo '✓ already applied: ${base}'"
    echo "\\endif"
  done
} | psql "$PROD_DB_URL"

echo "── migrate-prod: pass complete"
