---
id: WLT-10
bet: WLT-2
type: story
status: ready
priority: P1
created: 2026-06-08
author: PM
design_link: docs/bets/WLT-2/stories/WLT-10/design.md
copy_link: docs/bets/WLT-2/stories/WLT-10/copy.md
area_tags: [backend, data, frontend, security]
dependencies:
  - WLT-9
---

# WLT-10 — Full-history backfill + webhook-driven sync

## Description

WLT-9 proved the pipe but only lands the **recent** window (~90 days) on connect, and the data goes **stale** after — there's no mechanism to pull the rest of Plaid's history or to ingest new transactions as they post. This story makes the data **complete and fresh**: request up to **24 months** at link time, and keep transactions current via **Plaid webhooks** (with a scheduled fallback for missed webhooks). On first connect the user's full available history fills in over the next minute or two; thereafter new transactions appear automatically. Deeper-than-24-month history (Statements) and the re-auth UI are separate stories.

## Acceptance Criteria

- [ ] AC1 — **History depth:** the Plaid link token requests **`days_requested: 730`** (24 months — the Transactions ceiling), not the 90-day default. The initial backfill (WLT-9) ingests whatever is ready immediately; the rest arrives asynchronously (below).
- [ ] AC2 — **Webhook endpoint** `app/api/aggregation/plaid/webhook` (`runtime="nodejs"`, **no user session**): verifies the Plaid webhook is authentic — **JWT signature against Plaid's JWK** (key fetched + cached), body-hash match, and a freshness/replay check on the timestamp. An unverified or stale webhook is rejected (`401`) and never acted on.
- [ ] AC3 — **Sync events:** `SYNC_UPDATES_AVAILABLE` (and the historical-update signal) resolve the Plaid `item_id` → our `account_connections` row (per-connection authz — never trust the body's identifiers without re-deriving ownership) → enqueue `aggregation/connection.refresh` on Inngest. Idempotent: duplicate webhooks collapse to one effect.
- [ ] AC4 — **Incremental re-sync** (`connection.refresh` Inngest fn): reads the stored `sync_cursor`, pages `fetchTransactions(cursor)` → `ingestTransactions` (added/modified/removed) → **persists the new cursor only after the page commits** (no silent loss; re-sync is dedup-safe). Updates `last_synced_at`. Reuses the WLT-9 sync logic.
- [ ] AC5 — **Re-auth signal:** `ITEM_LOGIN_REQUIRED` / `PENDING_EXPIRATION` webhooks set `health_status = needs_reauth` on the connection (status only — the re-auth *flow/UI* is a later story; this just stops silent staleness and surfaces the chip from WLT-9).
- [ ] AC6 — **Scheduled fallback:** an Inngest **cron** (e.g. every 6h) fans out `connection.refresh` over `active` connections, so a missed/late webhook still completes the history and keeps data fresh. Pruned by `health_status` (skip `needs_reauth`/`error`/soft-deleted).
- [ ] AC7 — **Full-history-on-connect (the headline):** after linking, the user's available history (up to 24 months) is fully ingested within a few minutes (webhook) or by the next cron at the latest. The connected-accounts UI shows an **ongoing "Importing your history…"** state until the first historical update lands, then settles to **Connected · Updated {time}**.
- [ ] AC8 — **Security:** webhook signature verification is **mandatory** (no bypass); the endpoint is unauthenticated-but-verified; no secrets/tokens in logs or webhook handling; `vault.get` only inside the Inngest step (per WLT-9). Mandatory **Security Review** at build (new public webhook surface + external input).
- [ ] AC9 — **Observability (WLT-5):** emit a funnel/audit event on a completed refresh and on a `needs_reauth` transition; **no PII** in payloads.
- [ ] AC10 — **States + a11y:** the "Importing your history…" state uses `aria-live="polite"`; discriminated handling for webhook-verification failure (logged, not user-facing), provider errors during refresh (connection → `error` health), and the happy completion. Idempotent re-syncs never double-count (covered by AC4 + WLT-9's dedup tests).

## Standard Experience Checklist
- [x] **Navigation** — `n/a — no new surfaces; this enriches the existing /settings/accounts list (WLT-9)`
- [x] **States** — AC7 (importing-history → connected), AC5 (needs_reauth chip), AC10 (error health)
- [x] **Feedback** — AC7 (ongoing sync indicator + "Updated {time}"), AC9 (events)
- [x] **Accessibility** — AC10 (`aria-live` on the importing state; reduced-motion on any progress)
- [x] **Edge cases** — AC3 (duplicate webhooks idempotent), AC4 (re-sync dedup-safe, cursor-after-commit), AC6 (missed webhook → cron), AC2 (replay/stale rejected), AC5 (re-auth)
- [x] **Cross-surface consistency** — `n/a — web-only Phase-1 (architecture.md: mobile deferred)`

## Tech notes

Build per the approved architecture (`docs/bets/WLT-2/architecture.md` → Sync topology + "Hardening from independent review"):
- **Depth:** add `transactions: { days_requested: 730 }` (+ `webhook: PLAID_WEBHOOK_URL`) to `createPlaidProvider().createLinkSession` → `linkTokenCreate`.
- **Webhook trust boundary:** `app/api/aggregation/plaid/webhook` verifies the **Plaid-signed JWT** against the cached **JWK** (`/webhook_verification_key/get`), checks the body hash + timestamp freshness, then maps the `webhook_code`. Resolve `item_id` → connection via the service role; **re-derive ownership** before any write.
- **Refresh job:** `packages/jobs/aggregation/` — new `connection.refresh` function (cursor-based incremental sync, reuses `ingestTransactions`) + a **scheduled** cron function fanning out over active connections. Register both in `@wealth/jobs` `functions[]`.
- **Env:** `PLAID_WEBHOOK_URL` (already in `.env.example` + the `check-env` Plaid group) must point at `https://<host>/api/aggregation/plaid/webhook`; set it in prod + the Plaid dashboard.
- **UX:** extend the WLT-9 `AccountsClient` syncing state to persist until the connection reports a completed historical sync (poll `connectionsList` until `last_synced_at` stabilizes, or flip on a "history complete" signal).

## Dependencies
- **WLT-9** (the aggregation pipeline + Inngest + UI) — shipped.
- **Plaid webhook configured** in prod: `PLAID_WEBHOOK_URL` env + the URL registered with Plaid (via the link token / dashboard). Ops prereq, flagged at build.

## DRI Log

### Decisions
- [2026-06-08] [PM] **Scope = depth + freshness via webhooks (with cron fallback); defer re-auth UI + Statements** — rationale: "full history on first connect" needs `days_requested` *and* an async re-sync trigger; webhooks deliver that *and* ongoing freshness (the architecture's intent), so they're the same slice. The re-auth *flow* and >24-month Statements are independent follow-ups — area: scope — alternatives: poll/sleep-only backfill (rejected — doesn't solve ongoing freshness; webhooks needed eventually anyway) — reversibility: easy
- [2026-06-08] [PM] **Cron fallback is in-scope, not deferred** — rationale: without it, a single missed historical webhook means the user never gets full history (a silent data-completeness failure on the headline AC) — area: reliability — reversibility: easy

### Risks
- [2026-06-08] [PM] **Plaid historical pull latency varies** (seconds → minutes) — the UI must not imply "done" prematurely — likelihood: high — impact: low — mitigation: keep the "Importing your history…" state until `last_synced_at` stabilizes / the historical signal lands; the cron backstops — area: UX
- [2026-06-08] [Security] **New public webhook endpoint = external-input attack surface** — likelihood: medium — impact: high — mitigation: mandatory JWT/JWK verification + body-hash + replay check + per-connection ownership re-derivation; Security Review at build — area: security

### Issues
- _none_

---

_Next after WLT-10: re-auth/connection-health UI · CSV/email import · Statements (>24-month history). Brief: docs/bets/WLT-2/brief.md_
