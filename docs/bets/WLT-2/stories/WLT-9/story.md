---
id: WLT-9
bet: WLT-2
type: story
status: shipped
priority: P1
created: 2026-06-08
author: PM
design_link: docs/bets/WLT-2/stories/WLT-9/design.md
copy_link: docs/bets/WLT-2/stories/WLT-9/copy.md
area_tags: [backend, frontend, data, security]
dependencies:
  - WLT-6
synced_from: gdrive (co-work /create-story 2026-06-08) — renumbered from WLT-7 (collision)
---

# WLT-9 — Connect first bank account via Plaid OAuth + initial sync

> Originated in co-work as "WLT-7"; **renumbered to WLT-9** on sync (WLT-6/7 shipped, WLT-8 parked). Tech notes + the schema-specific ACs are **reconciled to the approved architecture** (`docs/bets/WLT-2/architecture.md`).

## Description

A signed-in user (WLT-1 complete) opens a consent screen, accepts data-use terms, completes the Plaid Link OAuth flow, and sees their real transactions in the platform within 30 seconds. This is the smallest slice that proves the aggregation loop runs on real data — WLT-4 has live transaction inputs after this story ships. CSV fallback, connection-health monitoring, and incremental sync are the next stories.

## Acceptance Criteria

- [ ] AC1 — Consent screen: before Plaid Link opens, the user sees a consent screen stating what data is accessed (account names, balances, 90 days of transactions), why (to power workflows and insights), and how long retained (until the user disconnects); explicit "Connect account" CTA required to proceed; "Not now" returns to dashboard without linking. Consent screen uses `copy.md` strings verbatim.
- [ ] AC2 — Provider link happy path: link session created **server-side**; the provider's Link widget opens in a modal; user selects institution + authenticates; the public artifact is exchanged for the durable access secret **server-side**; the secret is stored via the **`TokenVault`** (Supabase Vault) and only an opaque `vault_token_ref` is persisted on the connection row; the access secret never appears in client state, logs, or Sentry breadcrumbs.
- [ ] AC3 — Account entity: on successful exchange, accounts are fetched and account rows created with institution_name, mask (last 4), kind (checking/savings/credit/other), current_balance, available_balance, connection_status: "connected", last_synced_at; duplicates handled (re-link same connection = upsert, not a duplicate row).
- [ ] AC4 — Initial backfill: on connection creation, an Inngest function runs a 90-day transaction backfill; transactions are written append/CDC to the transactions table; **idempotent on retry via the architecture's dedup key** — no duplicate rows; backfill completes and transactions are visible in the UI within **30s p95** for a typical account (< 500 transactions).
- [ ] AC5 — Connected-accounts UI: list view shows institution logo, masked account number, account-type badge, current balance, connection_status chip ("Connected"), last_synced_at; empty state shows "Connect your first account" CTA before any accounts linked; "Add another account" CTA visible once ≥1 account is connected.
- [ ] AC6 — Disconnect: each account row has a "Disconnect" action; on confirm, the access secret is **revoked at the provider then deleted from the Vault**, the connection status is set to "disconnected", an Inngest job soft-deletes transaction history (mark `deleted_at`, not hard delete, to preserve the audit trail); the account is removed from the list immediately (optimistic UI).
- [ ] AC7 — RLS: transactions, financial_accounts, and account_connections are **owner-SELECT only; ALL writes via the service role** (no user write policies — financial-table posture); cross-tenant reads return 0 rows; RLS policy tests (cross-tenant default-deny, own-rows-accessible, incl. CSV/null-connection accounts) pass in CI.
- [ ] AC8 — States: loading during link-session creation (CTA spinner, disabled); loading during backfill (accounts list shows "Syncing transactions…" with progress); error state if the provider returns institution-unavailable / down, or the user cancels (discriminated per AC9); success state shows account + balance immediately after exchange, transactions appear as backfill completes.
- [ ] AC9 — Feedback: error messages discriminate — user-cancelled, institution unavailable, network error, server error — all strings from `copy.md`; success confirmation per copy.
- [ ] AC10 — Accessibility: consent screen + connected-accounts list completable keyboard-only; the provider Link modal uses the provider's own a11y (do not wrap/intercept); focus returns to "Add account" after the modal closes; loading states use `aria-live="polite"`; account list items have descriptive aria-labels; WCAG AA contrast; reduced-motion respected on the progress indicator.
- [ ] AC11 — WLT-5 events: `account_linked`, `connection_error`, `sync_completed` emitted **server-side** with no PII in payloads (via the architecture's `onEvent`→funnel mapping into `auth_funnel_events`).
- [ ] AC12 — Security: all provider API calls from Route Handlers or Inngest (server-side only); `NEXT_PUBLIC_*` env contains no secrets; the client only ever holds the `vault_token_ref`; Vault key rotation does not require re-linking accounts (ref stable). Mandatory **Security Review** at build.

## Standard Experience Checklist
- [x] **Navigation** — AC1 (consent → Link → connected accounts); AC5 (empty → Add-account CTA); AC6 (disconnect confirm + cancel path)
- [x] **States** — AC8 (loading: link-session + backfill; error: discriminated per AC9; success); AC5 (empty); AC3 (re-link upsert)
- [x] **Feedback** — AC9 (discriminated errors from copy.md); AC8 success; AC11 events
- [x] **Accessibility** — AC10
- [x] **Edge cases** — AC3 (re-link upsert); AC4 (dedup on retry); AC8 (institution down / cancel / network / server); AC6 (disconnect + soft-delete); AC12 (vault rotation safe)
- [x] **Cross-surface consistency** — `n/a — web-only Phase-1 target (architecture.md: mobile deferred)`

## Tech notes

Build per the approved architecture (`docs/bets/WLT-2/architecture.md`) — the provider-neutral, pluggable design:

- **Package:** implement in `@wealth/aggregation` (currently an empty stub). `core/` holds the seams (`AggregationProvider`, `TokenVault`, `createAggregationHandlers`, `ingestTransactions`, `dedup`); `plaid/createPlaidProvider()` is the isolated adapter (only the `plaid` SDK lives there — core never imports it); `vault/createSupabaseVault()` is the default `TokenVault`. App wires it in `app/lib/aggregation.ts` (mirrors `app/lib/auth.ts`): `createAggregationHandlers({ registry: createProviderRegistry([createPlaidProvider()]), defaultProviderId: "plaid", vault: createSupabaseVault(), sources: {}, onEvent })`.
- **Routes:** thin `runtime="nodejs"` delegations under `app/api/aggregation/**` → `handlers.{linkStart, linkComplete, connectionsList, disconnect}`. Handlers do request-tier work only (validate, **re-derive `auth.uid()` ownership**, vault put/get, `inngest.send`); the 90-day backfill runs in Inngest, off the request path.
- **Schema (migration `0003_aggregation.sql`):** `account_connections` (provider, opaque `provider_connection_id`, `vault_token_ref`, `health_status`, `sync_cursor`, soft-delete) · `financial_accounts` (`user_id not null`, `connection_id`, `provider_account_id`, kind, `numeric(20,4)` balances, `balance_updated_at`, mask) · `transactions` (`user_id`, `account_id`, `source`, `provider_transaction_id`, **`unique(user_id, dedup_key, content_hash)`** + `superseded_by` for CDC — handles Plaid `modified`/`removed`/pending). **RLS owner-SELECT only; ALL writes service-role.**
- **Vault is the highest-risk piece** (first real Supabase Vault use) — spike `createSupabaseVault()` first. Only `vault_token_ref` lands in a table; `vault.get` runs **inside** the provider-call Inngest step (never memoized/returned/logged); SDK errors sanitized before throw.
- **Sync:** Inngest `aggregation/connection.linked` → backfill: `fetchAccounts` → upsert `financial_accounts`; page `fetchTransactions(cursor=null)` → `ingestTransactions` → persist `sync_cursor` **in the same DB transaction** (no silent transaction loss). Idempotent via the dedup key. `account_linked` / `sync_completed` funnel events via `onEvent`→`emitFunnel` (into `auth_funnel_events`).
- **Disconnect:** revoke at Plaid (`removeConnection`) → `vault.delete(ref)` → soft-delete the connection + queue transaction soft-delete; ownership re-derived before the service-role write.
- **Env:** `PLAID_CLIENT_ID` / `PLAID_SECRET` / `PLAID_ENV=sandbox` / `PLAID_WEBHOOK_URL` added to `check-env` (fail-loud in prod). **Plaid Sandbox** for dev + E2E; **Supabase Vault must be enabled** on the project (ops prereq).

## PRs

_Auto-populated by `/build`._

## Tests
- Engineer: unit (link-session creation, exchange handler, dedup, vault put/get via fake), API (link/start, link/complete), component (consent states, connected-accounts list + empty state), RLS policy tests (cross-tenant default-deny, own-rows, soft-delete visibility, incl. CSV null-connection accounts).
- Codex reviewer: E2E (consent → link → backfill → transactions visible happy path; user-cancel; institution-unavailable) using Plaid **Sandbox**; plus a second sync exercising `modified`/`removed`/pending.

## DRI Log

### Decisions
- [2026-06-08] [PM] First story = provider OAuth + initial backfill only; CSV import, connection-health, incremental/webhook sync deferred to separate stories — rationale: smallest slice proving real data end-to-end — area: scope — alternatives: include CSV/webhook now (rejected — independent journeys / polling acceptable for first proof) — reversibility: easy
- [2026-06-08] [PM] Disconnect = soft-delete (`deleted_at`), not hard delete — rationale: audit-trail + reconnect without losing history — area: data — reversibility: medium
- [2026-06-08] [PM→sync] **Story ID corrected WLT-7 → WLT-9 on sync** — WLT-7 is the shipped TOTP story; WLT-8 is parked (recovery). Co-work numbered sequentially without the repo's story history — area: tooling
- [2026-06-08] [Engineer] **Vault bridge via `SECURITY DEFINER` `token_vault_*` wrappers** (migration 0003), service-role-only — rationale: PostgREST doesn't expose the `vault` schema to supabase-js, so `createSupabaseVault()` calls thin wrappers; guarded on the vault extension so the CI shim still applies the migration — area: security — reversibility: medium
- [2026-06-08] [Engineer] **Per-environment Plaid secret** (`PLAID_SANDBOX_SECRET` / `PLAID_PRODUCTION_SECRET` selected by `PLAID_ENV`), not one generic `PLAID_SECRET` — rationale: Plaid issues a separate secret per env; matches how the keys were provisioned — area: config — reversibility: easy
- [2026-06-08] [Engineer] **Cursor-after-commit, not a literal single DB transaction** for backfill — rationale: supabase-js/PostgREST can't span the ingest + cursor write in one txn; persisting the cursor only after a page's rows land makes a mid-sync failure re-ingest (dedup-safe) rather than drop rows — area: data-integrity — reversibility: medium

### Risks
- [2026-06-08] [PM] Plaid coverage gaps (Fidelity, some credit unions) → some users hit an empty Link — likelihood: medium — impact: medium — mitigation: `connection_error` event surfaces it; CSV fallback is the next story — area: technical

### Issues
- [2026-06-08] [Architect→sync] Tech notes originally authored Plaid-direct in co-work — **reconciled to the approved provider-neutral `@wealth/aggregation` architecture** (Tech notes + AC2/AC4/AC7 reworded) — severity: high — owner: Architect — status: **resolved** (2026-06-08)
- [2026-06-08] [Designer/UX] `design.md` + `copy.md` were missing from the co-work sync — **created 2026-06-08** (Designer + UX Writer) — severity: medium — owner: Designer/UX Writer — status: **resolved**

---

_Synced from GDrive prime 2026-06-08; renumbered WLT-7→WLT-9. Brief: docs/bets/WLT-2/brief.md_
