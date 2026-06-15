---
id: OPS-1
type: ops
bet: null
hygiene: true
status: shipped             # resync done + auto-sync wired (CI post-deploy PUT)
domain: ci-cd
blast_radius: medium
author: Enterprise/Solution Architect
created: 2026-06-15
area_tags: [inngest, deploy, durable-jobs]
---

# Ops Change: prod Inngest never auto-synced — durable functions unregistered since 6/8

## What & Why

The production Inngest app (`wealth-platform`, env Production, URL `https://home-app.kindtree.us/api/inngest`) **last synced 2026-06-08** (the WLT-9 deploy, when `aggregation-initial-backfill` was the only function) and had **never re-synced since** — so every Inngest function added after WLT-9 was **registered in code + served by `/api/inngest` but never registered in the Inngest control plane**, and therefore **never executed in prod**. Discovered 2026-06-15 while activating the WLT-16 recap (`RECAP_ENABLED` flipped on) — the dashboard showed only 1 function. Auto-sync-on-deploy was not wired (the app card shows `Vercel project: -`, `Vercel deployment: -`; Method: Serve), so syncs were manual and drifted for ~7 days across three releases.

**Functions that were inert in prod (registered in `packages/jobs/index.ts`, never synced):**
- `aggregation-refresh` (WLT-10 — webhook-driven incremental sync; the Plaid webhook fired `connection.refresh` into Inngest but **no subscriber existed**, so real-time sync was a no-op)
- `aggregation-scheduled-refresh` (WLT-10 — 6h cron data-freshness fallback)
- `aggregation-settle-sweep` (#39 fix — 10m cron that stamps `history_synced_at` on quiesced imports)
- `recap-networth-snapshot-daily` (WLT-16 — daily net-worth sample; the recap's movement signal)

Net effect: since 6/8, account data refreshed **only via the initial backfill at link time** — no ongoing webhook/cron refresh, no settle-sweep, no net-worth sampling.

## Affected systems

- Inngest (durable-jobs control plane) — Production app `wealth-platform`
- Aggregation freshness (Plaid webhook → `connection.refresh` → `aggregation-refresh`)
- WLT-16 recap (net-worth movement depends on the daily snapshot cron)

## Blast radius assessment

Medium. No data loss or corruption — financial data is append/CDC and idempotent; the missing functions are all *refresh/maintenance*, not writes-of-record. Impact was **staleness**: balances/transactions only as fresh as each connection's initial backfill; "Importing…" could linger without the settle-sweep; the recap could never show movement. User-facing but non-destructive. A re-sync is safe and idempotent (Inngest registers declared functions; reruns are guarded by the existing replay/idempotency keys).

## Plan

1. **[done 2026-06-15]** Resync the `wealth-platform` app in Inngest (Apps → Resync; URL already correct) → function count 1 → **7** (5 declared + 2 `onFailure` handlers for backfill & refresh). Confirmed `recap-networth-snapshot-daily` + the 3 aggregation crons now registered.
2. **[recommended]** Invoke `recap-networth-snapshot-daily` once to seed today's first snapshot (so movement appears in ~1 day rather than after two cron cycles).
3. **[done 2026-06-15 — the durable fix]** Wired **auto-sync on every Vercel production deploy** via CI: **`.github/workflows/inngest-sync.yml`** fires on Vercel's GitHub `deployment_status` (state `success`, environment `Production`) and **`PUT`s the serve endpoint**, which makes the freshly-deployed app re-register its current functions with Inngest Cloud (verified: `PUT /api/inngest` → `{"message":"Successfully registered","modified":true}`). Idempotent + retried. **No marketplace integration needed** — the app is a "Serve" app and the PUT trigger is unauthenticated (the app authenticates to Inngest with its own `INNGEST_SIGNING_KEY`). The Inngest-side Vercel marketplace integration (which would populate the app's empty "Vercel project" field) was unavailable/not in use; this CI hook supersedes it.

## Rollback procedure (MANDATORY)

A resync only *adds* function registrations; there is nothing destructive to roll back. If a newly-activated cron misbehaved:

1. In Inngest → Functions → the offending function → **Pause** (stops scheduling; < 1 min).
2. If needed, revert the code (remove the function from `packages/jobs/index.ts` `functions[]`) and redeploy + resync.
3. The aggregation refresh/settle functions are idempotent (cursor-after-commit, dedup keys, `on conflict do nothing`) — re-runs are safe; no data cleanup required.

**Rollback tested:** n/a — additive registration, no destructive change. Pause is the instant mitigation.

## Verification

- Inngest app shows **7** functions incl. `recap-networth-snapshot-daily` + the 3 aggregation crons. ✅ (2026-06-15)
- `recap-networth-snapshot-daily` produces `net_worth_snapshots` rows (one per active-connection user per day) — verify a row appears for the operator after the manual invoke / next 08:00 UTC run.
- `aggregation-scheduled-refresh` shows runs every 6h; `aggregation-settle-sweep` every 10m (Runs tab).
- Plaid webhook deliveries now produce `aggregation-refresh` runs (no longer dropped).

## Execution log

- Started: 2026-06-15 (during RECAP_ENABLED activation)
- Steps completed: app resynced (1 → 7 functions); URL confirmed = production alias; **auto-sync wired** (`.github/workflows/inngest-sync.yml`, post-deploy `PUT`)
- Open: manual snapshot invoke (Plan step 2 — optional, seeds today's first net-worth sample sooner)
- Outcome: **resolved — resync done + durable auto-sync in CI. Verification: the next production deploy (e.g. WLT-18) should auto-sync the function list with no manual click.**

## DRI Log

### Decisions
- [2026-06-15] [Enterprise Architect] **Manual resync now; wire auto-sync as the durable fix** — rationale: restore the inert functions immediately, then remove the human-in-the-loop that caused 7 days of drift — area: ops — reversibility: easy (pause/redeploy)

### Risks
- [2026-06-15] [Enterprise Architect] **Recurrence if auto-sync isn't wired** — likelihood: high (it already happened) — impact: medium (silent non-execution of new durable jobs) — mitigation: Inngest Vercel integration OR a post-deploy sync hook; until then, a manual-resync line in the deploy checklist
- [2026-06-15] [Enterprise Architect] **Silent failure mode is the real hazard** — a served-but-unsynced function looks healthy in code/CI/build (the build manifest shows `/api/inngest`) yet never runs — likelihood: medium — impact: medium — mitigation: add a post-deploy check that the Inngest function count matches `functions.length` (+ onFailure handlers)

### Issues
- [2026-06-15] [Enterprise Architect] **Auto-sync not wired** — severity: high — owner: Enterprise/Solution Architect — status: **resolved** — area: ci-cd — wired via `.github/workflows/inngest-sync.yml` (post-deploy `PUT` on Vercel production `deployment_status: success`); supersedes the manual resync. Removes the deploy-checklist manual step.
- [2026-06-15] [Enterprise Architect] **Aggregation freshness was degraded 6/8→6/15** — severity: medium — owner: Enterprise/Solution Architect — status: resolved-by-resync — area: aggregation — connections refreshed only via initial backfill in that window; now that `aggregation-refresh` + the crons are live, freshness self-heals on the next webhook/cron cycle.
