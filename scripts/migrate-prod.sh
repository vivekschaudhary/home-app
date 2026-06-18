#!/usr/bin/env bash
# OPS-2 — apply PENDING Supabase migrations to production, safely.
#
# Design (see docs/ops/OPS-2.md):
#   • ONLY-NEW: a `public._migrations` tracking table records what's applied, so we
#     never re-run an already-applied migration. (Re-running every migration on a
#     LIVE prod DB would briefly `drop policy … create policy`, opening an RLS gap.)
#   • TRANSACTIONAL: each migration file + its tracking insert run in ONE
#     transaction — if the SQL fails, nothing is recorded and the next run retries.
#   • ORDERED: the glob sorts 0001…NNNN lexically.
#   • IDEMPOTENT first run: after the one-time baseline (0001…current marked
#     applied), the first CI run applies 0 migrations — a safe no-op. Real work
#     happens only when a NEW migration merges.
#
# Requires: $PROD_DB_URL (a Postgres connection string with DDL privileges).
set -euo pipefail

: "${PROD_DB_URL:?PROD_DB_URL is not set}"

run() { psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 "$@"; }

# Tracking table (idempotent — safe to run every time).
run -q -c "create table if not exists public._migrations (
  filename   text        primary key,
  applied_at timestamptz not null default now()
);"

applied=0
for f in supabase/migrations/*.sql; do
  base="$(basename "$f")"
  if [ "$(run -tAc "select 1 from public._migrations where filename = '$base'")" = "1" ]; then
    echo "✓ already applied: $base"
    continue
  fi
  echo "→ applying: $base"
  # File + the tracking insert in a SINGLE transaction: a failure rolls back both,
  # so a half-applied migration is never recorded as done.
  run --single-transaction -f "$f" \
    -c "insert into public._migrations (filename) values ('$base');"
  applied=$((applied + 1))
done

echo "── migrate-prod: applied $applied new migration(s)"
