---
id: WLT-9
bet: WLT-2
type: story
status: ready
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

> **Synced from GDrive (co-work).** Created there as "WLT-7" — **renumbered to WLT-9** because WLT-6/WLT-7 are shipped and WLT-8 is parked (recovery). Authored without the approved bet architecture loaded; see the **⚠️ Architecture reconciliation** note in Tech notes + the DRI Issue — `docs/bets/WLT-2/architecture.md` is authoritative for the build.

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

> ⚠️ **Architecture reconciliation (BLOCKING for /build).** This story was authored in co-work **without the approved bet architecture** and its original tech notes were **Plaid-direct** — `PlaidItem` table, `/api/plaid/*` routes, direct `vault.encrypt()`, types in `/packages/core`. That is the exact alternative the approved architecture **rejected** (it violates the pluggability directive). **`docs/bets/WLT-2/architecture.md` is authoritative.** Build per the architecture, not the original notes:
> - **Schema:** `account_connections` / `financial_accounts` / `transactions` (provider-neutral; opaque `provider_connection_id` + `vault_token_ref`) — **not** `PlaidItem`/`Account`. Hardened dedup = `(user_id, dedup_key, content_hash)` + `superseded_by` (handles Plaid `modified`/`removed`/pending) — **not** `(account_id, date, amount, description)`.
> - **Package/boundaries:** the `@wealth/aggregation` package — `AggregationProvider` + `createPlaidProvider()` (isolated `plaid` SDK), `TokenVault` (`createSupabaseVault`), `createAggregationHandlers(...)`; routes under **`app/api/aggregation/**`** (not `/api/plaid/*`); Inngest in **`packages/jobs/aggregation/`**.
> - **Cursor + ingest in one transaction** (no silent transaction loss); webhook trust-boundary + ownership re-derivation on every service-role write; token never leaks into Inngest step output/Sentry — all per the architecture's "Hardening from independent review".

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

### Risks
- [2026-06-08] [PM] Plaid coverage gaps (Fidelity, some credit unions) → some users hit an empty Link — likelihood: medium — impact: medium — mitigation: `connection_error` event surfaces it; CSV fallback is the next story — area: technical

### Issues
- [2026-06-08] [Architect→sync] **Tech notes diverge from the approved architecture (BLOCKING for build).** Co-work authored Plaid-direct (PlaidItem / `/api/plaid/` / direct `vault.encrypt` / naive dedup) — contradicts the approved provider-neutral `@wealth/aggregation` pluggable design + the user's pluggability directive. **Resolve:** build per `architecture.md` (see the Tech-notes reconciliation block); a few schema-specific ACs (AC2/AC4/AC7) are reworded here to match. — severity: high — owner: Architect/Engineer — status: open (reconcile before `/build`)
- [2026-06-08] [Designer/UX] **`design.md` + `copy.md` missing** — the co-work run produced only `story.md`; this is a UI-heavy story (consent screen, connected-accounts list, error/empty states) — they must exist before `/build`. — severity: medium — owner: Designer/UX Writer — status: open

---

_Synced from GDrive prime 2026-06-08; renumbered WLT-7→WLT-9. Brief: docs/bets/WLT-2/brief.md_
