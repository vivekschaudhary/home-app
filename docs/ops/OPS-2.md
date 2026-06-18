---
id: OPS-2
type: ops
bet: null
hygiene: true
status: planned             # planned | approved | in-execution | shipped | rolled-back | deploy-failed
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
- [2026-06-17] [Enterprise Architect] **No staging Supabase project confirmed** — severity: medium — owner: EA — status: open — the dry-run (Plan step 5) needs a non-prod Supabase project; if none exists, provision one or dry-run against the CI test DB.
- [2026-06-17] [Enterprise Architect] **Whether a scoped token or a raw `PROD_DB_URL` is used** — severity: low — owner: Security Reviewer — status: open — resolve at execution.

---

_Awaiting HITL approval of this plan (status `planned` → `approved`) before execution. Companion already shipped: PR #63 (CI applies all migrations to the test PG + the `0011` syntax fix)._
