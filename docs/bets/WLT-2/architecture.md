---
id: WLT-2-ARCH
bet: WLT-2
status: approved
created: 2026-06-07
revised: 2026-06-07 # hardened after independent review (see "Hardening from independent review")
authors: [Architect, Enterprise/Solution Architect]
area_tags: [backend, payments, data, security]
---

# Technical Design: WLT-2 — Account aggregation (Plaid + CSV)

## Decision

Implement account aggregation as a **provider-neutral ingest pipeline behind three swappable seams**, mirroring the proven passkey precedent (`createPasskeyAuthHandlers({ rateLimit, onEvent })`). The `@wealth/aggregation` package's **core never imports Plaid**; the Plaid implementation is isolated in an adapter (`@wealth/aggregation/plaid`) selected at runtime via a **provider registry**. OAuth tokens are accessed only through a `TokenVault` interface (Supabase Vault is the default impl) — only an opaque `vault_token_ref` ever lands in a table. CSV import (and future email-import) are `ImportSource` adapters that emit the same `NormalizedTransaction[]` into one idempotent `ingestTransactions(...)` target, so file import and provider sync converge on a single dedup-keyed writer. All provider I/O + ingest runs in **Inngest**, off the request path; routes are thin delegations to `createAggregationHandlers(...)`. This makes a second provider (KR2) and email-import **additive registrations**, not rewrites — structurally enforcing the reversibility ADR-002 promised and the user directive that every external tool be swappable.

## Context

- **Brief + ADR-002** _(the foundation amendment lands in **PR #15** — merge before/with this bet PR)_: Plaid selected (read-only OAuth, US institutions, Accounts/Balance/Transactions); CSV is the coverage-gap fallback; email-import is a deferred fast-follow that must plug into the same seam. Read-only / US-only / depository+credit for Phase 1; PSD2 deferred. `key_metric` = real-data activation ≥70%.
- **Stack (foundation):** Supabase (Postgres + **Vault**) + Inngest (durable jobs) + Upstash + Vercel are all in the stack. **Supabase Vault is designed but never implemented yet** — WLT-2 is its first real use.
- **Scaffold:** `@wealth/aggregation` exists as an empty stub (its intended home). `@wealth/jobs` exports `inngest` + `functions=[]`; `app/api/inngest/route.ts` serves them. Data access is via `createServerSupabase()` (RLS) / `createServiceSupabase()` (service-role) from `@vc1023/passkey-2fa`; `@wealth/db/emit` shows the best-effort service-role write pattern. Migrations `0001_init` (patterns) + `0002_auth_webauthn`; next is `0003`. **No aggregation tables exist yet.**
- **Security lesson (passkey audit):** financial tables must be **owner-SELECT only; ALL writes via the service role** (no insert/update/delete-own policies) — a user must never write a financial row directly.

## Approach

### Components affected

- `packages/aggregation/` (currently empty) — the pluggable core + adapters. Subpath exports like `@vc1023/passkey-2fa`:
  - `core/` — `provider.ts` (`AggregationProvider`), `types.ts` (`NormalizedAccount`/`NormalizedTransaction`), `vault.ts` (`TokenVault`), `registry.ts`, `handlers.ts` (`createAggregationHandlers` factory), `ingest.ts` (`ingestTransactions`), `dedup.ts`, `events.ts` (`AggregationEvent`/`OnAggregationEvent`), `sources/{source.ts, csv.ts}`. **Zero runtime deps** — fully fakeable.
  - `plaid/` — `createPlaidProvider(): AggregationProvider` + `map.ts`; declares the `plaid` SDK dep (isolated so the request bundle/core never pulls it).
  - `vault/supabase-vault.ts` — `createSupabaseVault(): TokenVault` (default impl).
  - Exports map: `.`→core, `./plaid`, `./vault`, `./sources/csv`.
- `packages/jobs/` — push aggregation sync functions into `functions`; new `aggregation/sync.ts` (+ event types). Off-request durable runtime.
- `app/api/aggregation/**/route.ts` — thin `runtime="nodejs"` delegations to the factory handlers.
- `app/lib/aggregation.ts` — app wiring (registry + Plaid adapter + Supabase vault + `onEvent`→audit/funnel), mirroring `app/lib/auth.ts`.
- `packages/core/{audit.ts, funnel.ts}` — new `AGGREGATION_AUDIT` + `AGGREGATION_FUNNEL` constants (the WLT-5 contract for the activation metric).
- `scripts/check-env.mjs` + `.env.example` — Plaid env group.

**The pluggable seams (provider-neutral interfaces; money is decimal-as-string → `numeric`, never float):**

- `AggregationProvider`: `id` · `createLinkSession({userId,redirectUri})` · `completeLink({publicToken,userId})`→`{providerConnectionId, accessSecret, institution}` · `fetchAccounts({accessSecret})` · `fetchTransactions({accessSecret,cursor})`→`{added, modified, removed, nextCursor, hasMore}` (delta-sync shape — added/modified/removed channels for correct CDC) · `getConnectionStatus` · `removeConnection`. _(Interface note: this is a delta-sync abstraction; a non-delta provider's adapter synthesizes the diff internally — see the pluggability caveat in Consequences.)_ **The provider never touches the vault or DB** — the caller reads the secret from `TokenVault` and passes it in (pure protocol translator; trivial to fake).
- `TokenVault`: `put({userId,connectionId,secret})`→`{ref}` · `get({ref})` · `delete({ref})`. Default uses Supabase Vault RPCs under the service role.
- `ImportSource`: `parse({userId,financialAccountId,raw,mapping})`→`NormalizedTransaction[]`. `CsvImportSource` is a pure parser (synthesizes a stable id from a content hash). Email-import later = one new source file.
- `ProviderRegistry`: `get(id)/register/ids`. App wires `createProviderRegistry([createPlaidProvider()])`; the persisted `account_connections.provider` routes existing connections. **2nd provider = an additive registration.**
- `createAggregationHandlers({ registry, defaultProviderId, vault, sources, onEvent?, rateLimit? })` → `{ linkStart, linkComplete, csvImport, connectionsList, connectionHealth, disconnect, plaidWebhook }`. Handlers do request-tier work only (validate, vault put/get, `inngest.send`); the heavy fetch/ingest runs in Inngest. `onEvent`/`rateLimit` injected with defaults + a best-effort emit wrapper — **identical shape to the passkey factory**.

### Data model changes

New migration `supabase/migrations/0003_aggregation.sql` (expand-only; no alters to 0001/0002). Conventions inherited: UUID PK, `timestamptz` + `set_updated_at()` trigger, soft-delete on user entities, **append/CDC** for transactions. **RLS = owner-SELECT only; ALL writes service-role** (financial-table posture). **No funnel-table rename in WLT-2.** Aggregation funnel events are emitted into the **existing `auth_funnel_events`** table (it accepts any event name) — WLT-6 (shipped) froze this emitter contract ("no rename later") for **WLT-5, the funnel/instrumentation owner**. A neutral cross-domain rename, if wanted, is a **WLT-5 decision**, not a WLT-2 one — WLT-2 does not reopen a shipped cross-bet interface.

- **`account_connections`** — `user_id`, `provider`, opaque `provider_connection_id`, **`vault_token_ref`** (opaque handle; never the token), `institution_{id,name}`, `health_status` (active|needs_reauth|error), `sync_cursor`, `last_synced_at`, soft-delete. `unique(provider, provider_connection_id)`.
- **`financial_accounts`** — **`user_id not null`** (denormalized for direct RLS — never a nullable-FK hop), `connection_id` (nullable → manual/CSV), opaque `provider_account_id`, `name`, `kind` (depository|credit), `currency`, `balance_current/available numeric(20,4)`, **`balance_updated_at`** (balance is an independent point-in-time snapshot, not derived from transactions), `mask`. `unique(connection_id, provider_account_id)`. FK to `auth.users` is **`on delete restrict`/`set null` + anonymize** (NOT cascade — 7-year financial retention).
- **`transactions`** — `user_id`, `account_id`, `source` (plaid|csv|email), opaque `provider_transaction_id`, `pending_transaction_id` (reconcile pending→posted), `amount numeric(20,4)` + `direction`, `currency` (per-txn), `description/merchant/category`, **`occurred_on date`** (Plaid posted date, stored as `date` to avoid TZ day-shift) + optional `occurred_at timestamptz`, `pending`, `removed_at` (tombstone for Plaid `removed`), append/CDC via `superseded_by`. **Idempotency + CDC reconciled:** dedup `(user_id, dedup_key, content_hash)` unique — `dedup_key` = the logical txn (`source:account:providerTxnId`; CSV `csv:accountId:sha256(date|amount|desc)`), `content_hash` = a hash of the mutable fields. Same content re-emitted ⇒ no-op (idempotent); a `modified` event ⇒ new revision row + prior row's `superseded_by` set; `removed` ⇒ `removed_at` tombstone. The active-read view filters `superseded_by is null and removed_at is null`.

### API / contract changes (all additive)

Thin routes under `app/api/aggregation/**` → factory handlers: `link/start`, `link/complete`, `import/csv`, `connections` (GET), `connections/health` (GET), `connections/disconnect`, `webhooks/plaid` (verifies the Plaid signature; no user session). `onEvent`→`emitAudit`/`emitFunnel` via new `@wealth/core` constants — `AGGREGATION_FUNNEL.{account_linked, first_transactions_visible}` lights up the bet's `key_metric`. These write to the **existing `auth_funnel_events`** table via `emitFunnel` (no rename — the funnel contract is WLT-5-owned; see Data model).

### Dependencies

- **`plaid`** (official SDK) — declared only by the `plaid` adapter sub-package, never by core/app request tier. Justified: ADR-002's selected provider.
- No other new runtime deps. Supabase Vault uses the existing service-role client; Inngest is already wired.

## Enterprise/Solution Architect input

### Cross-system implications

- **First real Supabase Vault use** — previously named-only. Crosses into Supabase's `vault` schema (RPCs / `decrypted_secrets` view) under the service role; isolated behind `TokenVault` so the blast radius is one file.
- **New durable workload** in Inngest (backfill/refresh/webhook) — aligns with why Inngest is in the stack (off-request long-running sync). Payloads carry ids only, never secrets.
- **New external vendor (Plaid)** — recorded at foundation level (ADR-002 / Stack table), not silently in this bet.

### Standards compliance

- Conforms to the foundational stack (no deviation remains post-ADR-002). RLS default-deny + service-role-write matches the hardened financial-table posture. UUID/timestamp/soft-delete/append-CDC conventions followed. Token-at-rest guardrail (**0 tokens in tables**) met by construction. **No drift flagged.**

### Cost / capacity / vendor lock-in

- Plaid per-connection fees are variable (Plaid→JPMorgan precedent) — the cost guardrail is modeled; polling refresh adds call volume → pruned via connection-health (dead links stop syncing). Lock-in is the user **re-link** cost on a provider switch, not the data (provider-neutral in Postgres, `pg_dump`-portable). Reversibility is high _within_ the design — provider/vault/source are all swap-points.

## Alternatives considered

| Option                                                                                  | Pros                                                                                         | Cons                                                                  | Why not chosen                                                                                |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Chosen — provider-neutral core + isolated Plaid adapter + TokenVault + ImportSource** | Swappable everything; additive 2nd provider/email; core fakeable; guardrails by construction | More interfaces; provider capabilities must be expressed neutrally    | —                                                                                             |
| Plaid SDK direct in app + Plaid-shaped schema                                           | Fastest to first link                                                                        | Plaid ids leak into columns/routes; 2nd provider = rewrite            | Violates the pluggability directive + ADR-002 reversibility                                   |
| Sync in the request path                                                                | No event plumbing                                                                            | Backfill exceeds Vercel function limits; breaks <5min freshness       | The exact serverless-timeout failure mode Inngest exists to avoid                             |
| Token in an encrypted app column                                                        | One fewer seam                                                                               | Ciphertext + keys in the app blast radius; RLS-reachable by misconfig | Breaks the 0-tokens-in-tables guardrail; `TokenVault` keeps secrets out of schema + swappable |
| CSV as a one-off importer (separate from sync)                                          | Less abstraction now                                                                         | Re-plumb dedup/CDC/normalization when email-import lands              | The `ImportSource→ingest` convergence makes email additive                                    |

## Consequences

**Positive:**

- 2nd provider (KR2) + email-import are additive registrations — reversibility structurally enforced.
- Core has zero deps + is fully unit-testable via fake provider/vault/writer; Plaid SDK never enters the request bundle.
- Token-at-rest + RLS posture met by construction; idempotent append/CDC gives WLT-4 (the engine) a clean, retry-safe data spine.

**Negative:**

- Adapter indirection (more files); a provider with offset pagination maps less cleanly than Plaid's cursor model — accepted price of the directive.
- **First real Supabase Vault implementation is the highest-risk integration** (RPC ergonomics, rotation unproven). Mitigation: isolate behind `TokenVault`; **spike `createSupabaseVault()` first**; a `pgsodium`-column or KMS impl swaps in behind the same interface with zero ripple.
- Polling refresh adds Plaid call volume (cost guardrail) — pruned via connection-health.

**Reversibility:** medium — provider, vault, and source are all swap-points; the retained lock-in is the user re-link cost, not the data.

## Hardening from independent review (2026-06-07)

Two independent reviews (architecture-soundness + security/data) surfaced these — **all are build-gating** and must be implemented + verified before the first aggregation story merges. They do not change the design's shape (the seams + RLS posture + Inngest model were validated); they close correctness/security details the sketch omitted.

**Correctness (sync + ingest):**

- **Cursor + ingest are ONE transaction.** Persist `account_connections.sync_cursor` in the **same DB transaction** as the ingested rows (both service-role Postgres writes). Advancing the cursor before a durable ingest commit silently drops transactions (invisible financial data loss). If Inngest step boundaries split them, advance the cursor only after a verified read-back.
- **Plaid `removed` + pending→posted** are handled per the data model (`removed_at` tombstone; `pending_transaction_id` reconciliation) — exercised by a **second sync** in the E2E, not just the first backfill.
- **Multi-account-per-item:** cursor is per-item; transactions map to `financial_accounts` via `provider_account_id`; partial account failure doesn't stall the item; vanished accounts soft-delete.
- **Re-auth (update-mode):** `createLinkSession` accepts an existing `connectionId` → Plaid update-mode link token; `completeLink` **reattaches** to the existing connection (no duplicate connection/accounts) on `ITEM_LOGIN_REQUIRED`.

**Security (all BLOCKER/HIGH from the security review):**

- **Ownership re-derivation on every service-role write.** RLS is bypassed on writes, so each handler (csvImport, disconnect, connectionHealth, …) MUST re-derive `auth.uid()` (via `createServerSupabase`) and assert the client-supplied `financialAccountId`/`connectionId` belongs to the caller **before** enqueuing. Prevents cross-tenant CSV import + disconnect.
- **Webhook trust boundary:** verify the Plaid `Plaid-Verification` JWT against Plaid's JWKs (`/webhook_verification_key/get`, cached + rotated), assert the body SHA-256 matches, enforce a short replay window, then resolve the connection by `item_id` and act only on the owning connection. Idempotent on redelivery. Reject (not 500) on any failure. Read the raw body before JSON parsing.
- **Token never leaks:** `vault.get` runs **inside** the provider-call Inngest step (never its own memoized step, never returned from a step, never in event data/logs). Sanitize Plaid SDK errors before throw; add a token-shaped-value redaction filter on Sentry + logs. Audit-log every `vault.{get,put,delete}` to `audit_events` (who/ref/when). Disconnect ordering: **revoke at Plaid → `vault.delete` → soft-delete connection**, idempotent with partial-failure reconciliation.
- **GDPR erasure (foundation-mandated):** transaction PII (`description`, `merchant`, `institution_name`, `mask`) is encrypted with a **per-user data key held in Vault**; erasure = revoke Plaid item + destroy the user's key (**crypto-shred**) + anonymize, while **retaining** numeric `amount`/`occurred_on`/audit history (7-year retention). Add an erasure handler + a consent-record audit event at link-complete (scope + `link_session_id`).

**Cost / abuse:**

- **`rateLimit` is non-optional** with concrete per-user ceilings (links/hr, refreshes/hr, CSV size + count/day) on Upstash; **debounce/coalesce** webhook- and cron-triggered Plaid syncs per connection; a per-connection daily call ceiling. The cost model names actual call counts per sync.
- **CSV hardening:** max upload size + row cap, stream-parse, MIME check, **formula-injection** escaping on leading `= + - @`, per-row error report (quarantine bad rows, don't partial-fail).

**Observability:** sync failures are first-class — Sentry capture on exhausted Inngest retries + webhook-verify failures; alert on `health_status='error'` rate. Don't route failure signal solely through the swallowed best-effort `onEvent`.

**Indexes:** `transactions(account_id, occurred_on desc)` + partial index on active rows (`where superseded_by is null and removed_at is null`) for the p95<200ms cash-flow read.

## Test strategy

- **Unit:** CSV parser (mapping, date/amount/sign, malformed rows, id stability); dedup-key determinism; Plaid→Normalized mapping (fixtures, no network); `ingestTransactions` idempotency (fake `ServiceWriter`); **adapter-contract via a `FakeProvider`** (drives the factory + backfill, proves the seam without Plaid).
- **Integration / API:** financial-table RLS (extend `supabase/tests/rls.test.ts`) — owner reads own, cross-tenant denied, **user cannot insert/update/delete** (asserts no write policy exists), **incl. CSV null-connection `financial_accounts`** (the no-`user_id` BLOCKER); ingest idempotency + **a second sync exercising `modified`/`removed`/pending→posted** (the CDC path); cross-tenant CSV-import + disconnect denial (ownership re-derivation).
- **Component (frontend):** the link entry + CSV upload/mapping + connection-health states (story-level).
- **E2E** (written by Codex): Plaid **Sandbox** link (`ins_109508`) → backfill → normalized transactions visible under the user's session; CSV import + re-import (no duplicates).
- **Other:** **mandatory Security Review** at build (token handling, RLS, webhook signature verification, consent/revocation/deletion — $58M-precedent risk).

## Rollout

- **Feature flag?** yes — `aggregation_enabled` (env-gated, default **off**); routes + link UI ship dark; Inngest fns register but no-op without a connection.
- **Migration?** yes — `0003_aggregation.sql`, **expand-only**, via Supabase CLI (expand-contract convention). **Ops prereq: enable Supabase Vault on the project** before `linkComplete` can run.
- **Backwards compatibility?** not required (all new surface).
- **Staged rollout?** yes — Plaid **Sandbox** first (`PLAID_ENV=sandbox`) in preview → production keys + webhook URL (`check-env` enforces the Plaid group in prod, like the WLT-6 outage fix) → flip the flag per environment.

## Open questions for Engineer

- **Supabase Vault API shape** — if `createSupabaseVault()` against the live Vault RPCs disappoints (rotation, view access), escalate before falling back to a `pgsodium`-column impl (same `TokenVault` interface).
- Do **not** widen Phase-1 scope (investments/holdings, payment initiation, UK) without a brief change.

## DRI Log

### Decisions

- [2026-06-07] [Architect] **Provider-neutral core + isolated Plaid adapter + `TokenVault` + `ImportSource`, all injected via a factory** — rationale: satisfies the standing pluggability directive + ADR-002 reversibility; mirrors the passkey factory precedent; makes 2nd provider/email/Vault-swap additive — area: architecture — alternatives: Plaid-direct, request-path sync, encrypted-column token, one-off CSV (all rejected, see table) — reversibility: medium.
- [2026-06-07] [Enterprise Architect] **Financial tables = owner-SELECT only, all writes service-role** (no insert/update/delete-own) — rationale: applies the passkey-audit RLS lesson to the sensitive aggregation tables; users never write financial rows directly — area: security — reversibility: medium.
- [2026-06-07] [Architect] **All sync in Inngest, off the request path; handlers only enqueue** — rationale: backfill exceeds Vercel function limits; durability/retries meet the freshness + reliability FFs — area: infrastructure — reversibility: medium.
- [2026-06-07] [Enterprise Architect] **No funnel-table rename in WLT-2 — deferred to WLT-5** — rationale: WLT-6 (shipped) froze the funnel emitter contract ("no rename later") for WLT-5, the contract owner; WLT-2 emits aggregation events into the existing `auth_funnel_events` table without reopening a shipped cross-bet interface. A neutral cross-domain rename belongs to WLT-5 — area: data — alternatives: rename now in WLT-2 (rejected — overreaches WLT-5's contract + reopens a "no rename" commitment; flagged in review) — reversibility: easy.

### Risks

- [2026-06-07] [Enterprise Architect] **First real Supabase Vault implementation** — likelihood: medium — impact: high — mitigation: isolate behind `TokenVault`, spike it first, KMS/`pgsodium` swap-in if RPCs disappoint — area: security/integration.
- [2026-06-07] [Architect] **Aggregation data quality is the comparable-product long pole** (carried from brief) — likelihood: medium — impact: high — mitigation: CSV fallback in scope; connection-health observability; Plaid (highest coverage) — area: technical.
- [2026-06-07] [PM] **Variable Plaid per-connection cost** — likelihood: med-high — impact: high — mitigation: model fees first-order; prune dead links via health; revisit at scale — area: financial.

### Issues

- [2026-06-07] [Architect] **Independent review (2 reviewers) found 4 BLOCKER + 8 HIGH gaps** in the data-model/sync/security details (financial_accounts `user_id`/RLS, dedup-vs-CDC contradiction, cursor/ingest atomicity, GDPR erasure, Plaid removed/pending, webhook trust boundary, CSV ownership, outbound rate-limiting, token-leak surfaces, funnel-rename safety). Design shape validated; details closed in the data model + "Hardening from independent review" section. — severity: high — owner: Architect — status: resolved-in-doc (build must implement + the Security Review must verify) — area: architecture/security

---

_Approved by: Vivek on 2026-06-08 (post independent-review hardening; Codex reviewer clean)_
