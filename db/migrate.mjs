#!/usr/bin/env node
/**
 * OPS-2 — apply PENDING Supabase migrations, safely + serialized. One runner for
 * BOTH CI (against the throwaway test PG) and production (against prod), so a
 * migration that applies in CI applies identically in prod — `pnpm migrate`.
 *
 * Replaces the earlier psql script (scripts/migrate-prod.sh) + the CI psql loop.
 * Uses `pg` (already a dependency — the RLS suites use the same Client), so the
 * apply logic is testable JS instead of psql `\gset`/`\if` metaprogramming.
 *
 * The four guarantees (unchanged from the reviewed psql design):
 *   • SERIALIZED at the DB: the whole pass runs on ONE connection holding a session
 *     advisory lock (pg_advisory_lock). A second runner — another deploy's job OR a
 *     manual break-glass run — BLOCKS on the lock until the first finishes. (Codex
 *     round-2 BLOCKER: a read-then-apply check outside a lock let two close deploys
 *     both decide a migration was "pending" and race.) The workflow `concurrency`
 *     key is the belt; this lock is the suspenders (covers manual runs too).
 *   • ONLY-NEW, checked INSIDE the lock: each migration is applied only if it is not
 *     already in `public._migrations`, and that check runs within the locked
 *     connection — so there is no window between "is it applied?" and "apply it".
 *     (Re-running a migration on a LIVE prod DB would briefly drop+recreate its RLS
 *     policies.)
 *   • ATOMIC per file: each migration + its tracking insert run in ONE transaction;
 *     any error rolls that file back, so nothing is left half-recorded, and the
 *     process exits non-zero (aborting the pass) before the next file.
 *   • ORDERED: filenames sort 0001…NNNN lexically (same as the old glob).
 *
 * Connection string (session-mode — NOT the transaction pooler; this holds a
 * session advisory lock + multi-statement transactions): the first set of
 *   DATABASE_URL  →  PROD_DB_URL  →  SUPABASE_DB_URL
 * so prod passes PROD_DB_URL (the secret) and CI reuses its SUPABASE_DB_URL.
 */
import { Client } from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Arbitrary constant key identifying the "migrate" advisory lock (matches the
// prod baseline + the prior psql script).
const LOCK_KEY = 823471;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

const url = process.env.DATABASE_URL || process.env.PROD_DB_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("migrate: no connection string — set DATABASE_URL (or PROD_DB_URL / SUPABASE_DB_URL)");
  process.exit(1);
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 0001…NNNN lexical order

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    // Serialize: only ONE runner proceeds at a time; any other (a second deploy's
    // job or a manual run) blocks here until this connection releases the lock.
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);

    await client.query(
      "create table if not exists public._migrations (" +
        "filename text primary key, applied_at timestamptz not null default now())",
    );

    let applied = 0;
    for (const file of files) {
      // Checked INSIDE the lock — no window between the check and the apply.
      const { rows } = await client.query("select 1 from public._migrations where filename = $1", [file]);
      if (rows.length > 0) {
        console.log(`✓ already applied: ${file}`);
        continue;
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`→ applying ${file}`);

      // Atomic per file: the migration + its tracking insert in ONE transaction.
      // The migration body is sent as a single multi-statement query (no params →
      // simple query protocol), wrapped by an explicit begin/commit on this same
      // connection so a mid-file error rolls the whole file back.
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into public._migrations(filename) values ($1)", [file]);
        await client.query("commit");
        applied++;
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw new Error(`migration ${file} failed (rolled back): ${err.message}`);
      }
    }

    console.log(`── migrate: pass complete — ${applied} applied, ${files.length - applied} already present`);
  } finally {
    // Release explicitly (also released on connection end); ignore errors so a
    // failure during the pass still surfaces the real cause.
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`migrate: ${err.message || err}`);
  process.exit(1);
});
