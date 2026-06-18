---
id: OPS-2
type: ops
bet: null
hygiene: true
status: in-execution        # planned | approved | in-execution | shipped | rolled-back | deploy-failed
domain: ci-cd               # (also database) — automate Supabase migration apply to prod
blast_radius: high
author: Enterprise/Solution Architect
created: 2026-06-17
area_tags: [database, ci-cd, secrets]
---

# Ops Change: Automate Supabase migration apply to production (migrate-on-deploy)

## What & Why

Today there is **no automated path that applies `supabase/migrations/*.sql` to the production Supabase database.** Vercel's `buildCommand` is just `pnpm build`; CI only provisions a throwaway RLS-test DB. Migrations are applied to prod **by hand** — so a merged migration silently fails to reach prod until someone remembers to run it.

This bit us on 2026-06-17 (WLT-22): `0011_categories.sql` + `0012_category_rules.sql` shipped to the repo but were never applied to prod → `createCategory` / recategorize / remember all failed in prod with `{"error":"save_failed"}` (absent `categories` table). The same gap hid a **syntax error** in `0011` (`unique (user_id, lower(name))` — an expression isn't valid in a table constraint) because the SQL had never executed against any real Postgres. **Companion fix already in flight (PR #63):** CI now loops over *all* migrations against the test PG, so this class of syntax/dep error is caught before merge. This ops change closes the other half: **getting merged migrations onto prod, automatically and safely.**

Goal: every migration merged to `main` is applied to the prod Supabase DB as part of the deploy, exactly once, in order, with a human gate — so prod schema never drifts behind the repo, and a bad migration can't reach prod undetected.

## Affected systems

- **GitHub Actions** (a new post-merge `migrate-prod` job)
- **Production Supabase Postgres** (schema — DDL applied automatically)
- **GitHub Actions secrets / a protected `production` Environment** (prod DB credential)
- The deploy pipeline (ordering relative to Vercel's deploy)

## Blast radius assessment

**HIGH** — this runs **DDL against the production database automatically.** A wrong or destructive migration could corrupt or lock the prod schema affecting *all* users. Mitigated by: migrations are **expand-only + idempotent** (`create … if not exists`, `drop policy if exists`); the **CI loop (PR #63) applies every migration to a throwaway PG first**, so syntax/dependency errors fail the build before prod; and a **required human approval gate** on the prod-migrate job (a GitHub `production` Environment with a required reviewer) — so it's *staged automation*, not unattended. The credential is the other risk surface → Security Reviewer engages.

## Plan

**Prerequisite — baseline the tracking (one-time).** Prod now has `0001`–`0012` applied (manually, 2026-06-17). Establish the migration-tracking baseline so the automation only runs *new* migrations and never re-applies these (idempotency makes re-runs safe, but tracking is cleaner + faster). With the Supabase CLI: `supabase migration repair --status applied <each>` against the linked prod project (or seed `supabase_migrations.schema_migrations`).

**Approach (Enterprise/Solution Architect recommendation — A).**

- **A) GitHub Action, gated, after CI green (RECOMMENDED).** A `migrate-prod` job that runs **only** on `push` to `main`, **needs: [the CI job]** (so the test-PG migration apply must pass first), and runs **inside a protected `production` GitHub Environment with a required reviewer** (a human clicks approve). It applies pending migrations to prod via the Supabase CLI (`supabase db push --linked`) or a `psql` loop with `ON_ERROR_STOP=1`, using a `PROD_DB_URL` (or `SUPABASE_ACCESS_TOKEN` + project ref) **secret**. Minimal change; works with the existing `00NN_*.sql` files + the idempotent migrations; the CI loop already validates them against a real PG, so syntax errors never reach this job.
- **B) Supabase native GitHub integration.** Supabase can auto-apply migrations on push. Cleaner long-term, but expects the CLI's `<timestamp>_name.sql` migration convention (ours are `00NN_name.sql`) → would require renaming history or adopting `supabase migration` tooling. Heavier; defer.
- **C) Manual + documented runbook.** Status quo; reject as the primary (it's exactly what failed). Keep a written runbook as the **break-glass fallback** when the automation is disabled.

**Steps (Approach A):**
1. Baseline the tracking table on prod (prerequisite above).
2. Add `PROD_DB_URL` (or Supabase access token + project ref) as a secret on a new **protected `production` Environment** (required reviewer = a human; deployment branches = `main` only).
3. Add a `migrate-prod` job to the deploy workflow: `on: push: branches: [main]`, `needs: [ci]`, `environment: production`, runs `supabase db push --linked` (or the `psql` loop) with `ON_ERROR_STOP=1`, logging applied migrations. **No secret echoed.**
4. Open the PR (this is committed CI config) → full Codex + Security review.
5. Dry-run against a **staging/test** Supabase project first (apply a trivial no-op migration end-to-end) before enabling on prod.
6. Enable; document the runbook + the rollback in this file.

## Rollback procedure (MANDATORY)

**Disable the automation (fast — the primary rollback):**
1. `git revert` the workflow commit that added `migrate-prod` (removes the auto-apply) **and/or** delete/rotate the `PROD_DB_URL` secret → automation is hard-disabled. **Executable in < 5 min.** Fall back to the manual runbook for any pending migration.

**A bad migration reaches prod (mitigated, but the plan):**
2. Migrations are **expand-only + idempotent + `ON_ERROR_STOP`**, so a failure aborts at the first error leaving a known partial state; **forward-fix** with a new migration (project policy: no destructive down-migrations). Emergency revert of a just-added object = a documented manual `drop … if exists` (additive objects only — `categories`/`category_rules`/etc. carry no data loss for users beyond their own corrections).
3. The CI test-PG apply + the required-reviewer gate are designed to make (2) nearly unreachable — a bad migration fails CI or is caught at the approval step.

**Rollback tested:** no — to be tested in the staging dry-run (Plan step 5) before prod enablement.

## Verification

- A **no-op test migration** flows end-to-end on staging: merged → CI green → `migrate-prod` approves+applies → the object exists in staging.
- On the first real prod run: the job logs "applied N migration(s)"; a smoke query confirms the new objects exist in prod; the feature works.
- **Drift check (verification + optional follow-on OPS-3):** a read-only job comparing prod's applied-migration set to `supabase/migrations/` and alerting on drift — confirms the automation stays healthy and catches any out-of-band manual change.

## Execution log (filled by Engineer)

- Started: —
- Steps completed: —
- Completed: —
- Outcome: —

## DRI Log

### Decisions
- [2026-06-17] [Enterprise Architect] **Automate via a gated GitHub Action (Approach A), not the Supabase native integration (B)** — rationale: minimal change, works with the existing `00NN_*.sql` + idempotent migrations, runs after the CI loop already validates them against a real PG; B needs a migration-filename convention change — area: ops — reversibility: easy (revert the workflow)
- [2026-06-17] [Enterprise Architect] **Require a human approval gate (protected `production` Environment), not unattended apply** — rationale: HIGH blast radius (auto DDL on prod); staged automation keeps a human in the loop without reverting to fully-manual — area: ops — reversibility: easy
- [2026-06-17] [Enterprise Architect] **Expand-only migrations; forward-fix over down-migrations** — rationale: additive DDL is safe to auto-apply + idempotent; destructive rollbacks are riskier than a forward fix — area: database — reversibility: medium

### Risks
- [2026-06-17] [Enterprise Architect] **Auto DDL corrupts/locks prod schema** — likelihood: low — impact: high — mitigation: CI test-PG apply gates it; expand-only + idempotent; required-reviewer approval; staging dry-run first
- [2026-06-17] [Enterprise Architect] **Prod DB credential exposure** — likelihood: low — impact: high — mitigation: a GitHub Environment secret (not a plain repo secret), `main`-only, never logged; Security Reviewer engages; prefer a scoped Supabase access token over a raw superuser DSN
- [2026-06-17] [Enterprise Architect] **Tracking-baseline mismatch re-runs migrations** — likelihood: low — impact: low — mitigation: migrations are idempotent; repair the tracking table to mark 0001–0012 applied before enabling

### Issues
- [2026-06-17] [Enterprise Architect] **No staging Supabase project confirmed** — severity: medium — owner: EA — status: **mitigated** — a staging DB isn't strictly needed: after the baseline, the FIRST `migrate-prod` run applies **0** migrations (no-op), and every run is gated by the required-reviewer Environment + proven against the CI test PG. The real first exercise is the next new migration, under human approval.
- [2026-06-17] [Enterprise Architect] **Whether a scoped token or a raw `PROD_DB_URL` is used** — severity: low — owner: Security Reviewer — status: open — implemented with a `PROD_DB_URL` Environment secret; Security Review may prefer a scoped role/token.

### Decisions (execution)
- [2026-06-17] [Human] **OPS-2 APPROVED** — proceed to execution.
- [2026-06-17] [Engineer] **Implement as a custom only-new tracking script (`scripts/migrate-prod.sh`), not `supabase db push`** — rationale: (1) re-running every migration on a LIVE prod DB would `drop policy … create policy` each deploy → a brief RLS gap; an only-new tracker avoids that; (2) sidesteps the Supabase-CLI `<timestamp>_name.sql` convention (our files are `00NN_*`); (3) each file + its tracking insert run in one transaction (atomic) — area: ci-cd — reversibility: easy
- [2026-06-17] [Codex] **BLOCKER (round 1): the `on: push` job races Vercel's independent deploy** — a parallel push-triggered job (esp. one waiting on a reviewer) lets new code go live before the migration → the exact "schema behind code" window. The repo already solved this class for Inngest via `deployment_status`.
- [2026-06-17] [Human + Engineer] **Re-key to `deployment_status` (post-deploy auto), mirroring `inngest-sync.yml`** — fire when Vercel reports the **Production** deploy succeeded, check out the **deployed sha**, auto-apply pending migrations. **No human gate** (a gate post-deploy would pause WITH code already live); safety = the CI pre-merge validation (every migration applied to a real test PG) + expand-only migrations. Window shrinks from "indefinite" to ~seconds — area: ci-cd — alternatives: gated deploy-from-CI / migrate-before-promote (true ordering, zero window, but a much bigger deploy-pipeline change — deferred) — reversibility: easy
- [2026-06-17] [Codex] **BLOCKER (round 2): concurrent prod deploys could still race** — the script's read-then-apply check sat outside any lock, so two close deploys could both see a migration as pending; the older commits, the newer fails on the `_migrations` PK insert and exits before its newer-SHA-only files. Fix: serialize the runs.
- [2026-06-17] [Engineer] **Serialize two ways** — (1) workflow `concurrency: {group: migrate-prod, cancel-in-progress: false}` (one run at a time; the newest pending survives, so no migration is dropped); (2) the runner runs the whole pass on ONE connection holding `pg_advisory_lock`, with the per-file "already applied?" check **inside** the lock — so there's no read-then-apply window even for a manual run. **Validated against a throwaway local Postgres:** run 1 applied all 12 (incl. the fixed `0011`) + created the WLT-22 tables; run 2 applied 0 (idempotent) — area: ci-cd — reversibility: easy
- [2026-06-18] [Human + Engineer] **Switch the apply mechanism from a psql script (`scripts/migrate-prod.sh`) to a Node runner (`db/migrate.mjs`, `pnpm migrate`), and unify CI onto it** — rationale: (1) **one apply path for CI + prod** — CI now runs the SAME `pnpm migrate` it ships to prod (replacing CI's separate `psql` migration loop), so "passes in CI" means "applies identically in prod"; (2) **testable, readable logic** in JS vs the psql `\gset`/`\if` metaprogramming, using `pg` (already a devDependency — the RLS suites use the same `Client`, zero new deps); (3) the **four guarantees are preserved exactly** — session `pg_advisory_lock` held across the whole pass on one connection, only-new checked **inside** the lock, atomic per file (`begin`/file/tracking-insert/`commit`, rollback + non-zero exit on error), ordered `0001…NNNN`. **`scripts/migrate-prod.sh` deleted.** The runner doubles as the manual break-glass runbook (`PROD_DB_URL=… pnpm migrate`). **Re-validated on a throwaway Postgres:** 12 applied fresh (ordered) → 0 on idempotent re-run → a deliberately-broken migration exits non-zero, **rolls back** (its partial table absent, not recorded), prior 12 intact — area: ci-cd — reversibility: easy — **NOTE: this changed the prod-credential code path → re-opens Codex + Security review.**
- [2026-06-18] [Codex + Security] **CLEAR — tied to HEAD `faaac7a`** (the Node-runner refactor). Re-review of the changed prod-credential apply path came back clean. The clear is bound to this exact SHA: any further commit to the branch re-opens it. **Code-side review complete; the remaining gate is the Human's prod-access prerequisites below (baseline → secret/Environment) before merge.**

## Execution

**Committed (this PR):** `db/migrate.mjs` (only-new, transactional, advisory-locked) + `"migrate"` script in `package.json` + **`.github/workflows/migrate-prod.yml`** — a `deployment_status` workflow that runs `pnpm migrate` to auto-apply pending migrations after a successful **Production** deploy, at the deployed sha (mirrors `inngest-sync.yml`). CI (`ci.yml`) now applies migrations via the **same** `pnpm migrate` (replacing its psql loop) — one apply path for CI + prod. (Superseded: `scripts/migrate-prod.sh`, deleted.)

**Residual + its mitigation (honest):** this is **post-deploy** — code is live a few seconds before the schema. Safe for **expand-only** migrations + code that tolerates the pre-migration schema (**expand-contract**); it is NOT a substitute for backward-compatible code on a schema-requiring change. The WLT-22 incident is fully closed regardless (migrations now always apply, automatically, tied to the deploy). The zero-window alternative (gated deploy-from-CI) is deferred.

**Manual steps required before this is live (prod access — owner: Human + Security Reviewer):**
1. **Create the `production` GitHub Environment** (repo → Settings → Environments) and add the **`PROD_DB_URL` secret** (a Postgres DSN with DDL privileges). **Do NOT add Required reviewers** — this runs post-deploy, so a reviewer pause would strand new code on the old schema. (Restrict to `main` if desired.)
2. **One-time tracking baseline** (so the first run is a no-op — `0001`–`0012` are already applied to prod):
   ```bash
   psql "$PROD_DB_URL" -c "create table if not exists public._migrations (filename text primary key, applied_at timestamptz not null default now());"
   for f in supabase/migrations/*.sql; do psql "$PROD_DB_URL" -c "insert into public._migrations(filename) values ('$(basename "$f")') on conflict do nothing;"; done
   ```
3. Merge this PR → the **next production deploy** triggers `migrate-prod` (applies 0 until a new migration lands).

- Started: 2026-06-17 — script validated end-to-end on a throwaway local Postgres (12/12 apply, idempotent re-run) — Outcome: pending (manual Environment/secret/baseline steps)

---

_Status `in-execution`: revised per Codex's BLOCKER — workflow re-keyed to `deployment_status` (post-deploy, tied to the real prod release). Awaiting the manual Environment/secret/baseline steps + Security review before live. Companion already shipped: PR #63 (CI applies all migrations to the test PG + the `0011` syntax fix)._
