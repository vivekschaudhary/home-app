---
id: WLT-23-1
bet: WLT-23
type: story
status: in-review
priority: P2
created: 2026-06-18
author: PM
design_link: docs/bets/WLT-23/stories/WLT-23-1/design.md
copy_link: docs/bets/WLT-23/stories/WLT-23-1/copy.md
area_tags: [frontend, spending, aggregation, data, security]
dependencies:
  - WLT-2 (the transactions data + aggregation pipeline — shipped)
  - WLT-19/WLT-20 (the app shell + nav contract — shipped)
  - WLT-22 (the saved-category resolver, reused for the category column — shipped)
---

# WLT-23-1 — The Transactions ledger

## Description

Give the user a **new top-level "Transactions" view** — a searchable, reverse-chronological list of **all** their transactions across every account (**date · merchant · amount · resolved category · account**), paginated so a full 24-month history stays fast. It's a **read** of data we already store (no new schema, no re-sync) plus a list UI and a nav entry, reusing the WLT-2 `transactions` table, the WLT-20 shell, and the WLT-22 `saved ?? Plaid` resolver. It closes the operator's gap — _"I'd like to see all the transactions in the account"_ — and makes the budget numbers verifiable across all activity, not just one category's current month (the WLT-22-1 drill-down). **Read-only**: editing, filters beyond search, and recategorize-in-the-list are fast-follows.

## Acceptance Criteria

- [ ] **AC1 — Nav + route.** A new **top-level "Transactions" left-nav item** (`status: live`, adjacent to Accounts) routes to **`/transactions`**, mounted in the WLT-20 `(app)` shell behind the same **AAL2 gate**, with correct active-state highlighting (`isActiveNav`). Label from `COPY.nav.transactions`.
- [ ] **AC2 — The ledger (honest, all-accounts, reverse-chron).** `/transactions` lists **all** the user's transactions across **all accounts**, **newest first**: **date · merchant** (or `description` when merchant is null) **· amount · category · account name**. **Real data only** — the user's own rows; **superseded/removed (CDC) rows never appear** (enforced by the `transactions` owner-SELECT RLS, `superseded_by is null and removed_at is null`). Both **directions** show: debits as the amount, **credits with a leading `+`** and an accessible "credit" label; **pending** rows carry a "Pending" badge.
- [ ] **AC3 — Category matches the budget (one truth).** The category column is the **WLT-22 resolved value** — `effectiveCategory(plaidCategory, savedName)` via the shared `readCategoryAssignments` map, `humanizeCategory` for display, null → "Other" — i.e. the **same value the budget shows**, never a divergent raw `transactions.category` read.
- [ ] **AC4 — Paginated / fast on a large history.** The list is **keyset-paginated** over `(occurred_on desc, id desc)` with a fixed page size (≈50); a **"Load more"** control appends the next page; it is **never a single unbounded fetch**, stays responsive across a full 24-month history, and each query stays under the PostgREST 1000-row cap. End-of-list shows a quiet end-marker; the control is busy/disabled while a page loads.
- [ ] **AC5 — Search.** A **free-text search over merchant/description** (server-side, case-insensitive) filters the list and **composes with pagination**; a search with no matches shows the **"No transactions match \"{query}\""** state with the search still editable to recover. (Account/category filters are out of scope — fast-follow.)
- [ ] **AC6 — Honest states.** **Loading** (skeleton, `aria-busy`); **empty — no connected account** → the "Connect an account" nudge to the existing accounts/connect entry; **empty — connected, no rows** → calm "nothing yet (may still be syncing)"; **empty — search no match**; **error** (first-page **or** Load-more) → calm inline message + **retry**, never a silent blank.
- [ ] **AC7 — Owner-scoped (load-bearing security).** The page reads **only the user's own** transactions **and** account names — owner-SELECT under their RLS session (`createServerSupabase()` → RLS), the `financial_accounts` join owner-scoped too. Proven by a **gated real-path E2E** (session → RLS → rendered rows; a second user cannot read user 1's transactions/accounts). The #36 / `[real-path-integration-coverage]` discipline.
- [ ] **AC8 — Accessibility + responsive.** Semantic `<table>` with `<th scope="col">` (Date/Merchant/Amount/Category/Account) and label↔value association; labelled `<input type="search">`; polite result-count (`aria-live`); **Load more** is a real `<button>` that moves focus to the first newly-loaded row on append; `aria-busy` during loads; credits carry an accessible "credit" label; "Pending" is text (not color-only); WCAG AA. Clean on **phone ≤640** (rows stack; ≥44px targets; no horizontal scroll), tablet, desktop.
- [ ] **AC9 — Instrumentation.** `transactions_viewed` (additive funnel event) emitted **once per page view**, server-side from the RSC (the `budget_viewed` pattern via `emitFunnel`).

## Standard Experience Checklist

- [ ] **Navigation** — the new top-level nav item + `/transactions` route + active state; the page is a destination (Load more appends in place, no route change): **AC1, AC4** + design "Surfaces & flow".
- [ ] **States** — loading · populated · loading-more · end-of-list · empty (no-account / no-rows / no-search-match) · error; Load-more disabled/busy while loading: **AC4, AC6** + design States table.
- [ ] **Feedback** — discriminated calm error + retry on both first-page and Load-more; polite result-count announcement; **no success/destructive feedback** — `n/a — read-only, no mutation this slice`: **AC6, AC8**.
- [ ] **Accessibility** — semantic table + `th scope`, labelled search, `aria-live` count, Load-more focus management, `aria-busy`, accessible credit label, AA: **AC8**.
- [ ] **Edge cases** — `merchant` null → `description`; credit vs debit direction; **pending** flagged; the "Other" (null-category) bucket; CDC superseded/removed hidden; **>1000 rows** handled by keyset paging; no connected account: **AC2, AC3, AC4, AC6**.
- [ ] **Cross-surface consistency** — `n/a — web-only at Phase 1`; responsive desktop/tablet/phone variants are one component (rows ↔ stacked): **AC8**.

## Tech notes

Per the brief, **`architecture_required: false`** — no new schema, no re-sync, no new architectural decision. Build on shipped patterns:

- **Nav** — add `{ key: "transactions", label: COPY.nav.transactions, href: "/transactions", icon: QueueListIcon, status: "live" }` to `NAV_SECTIONS` in [app/(app)/nav.ts](app/(app)/nav.ts), positioned **before** `accounts`. Import `QueueListIcon` from `@heroicons/react/24/outline`. Add `COPY.nav.transactions`.
- **Page** — `app/(app)/transactions/page.tsx` (RSC): AAL2 user id; emit `FUNNEL_EVENTS.TRANSACTIONS_VIEWED` once (mirror [app/(app)/budget/page.tsx](app/(app)/budget/page.tsx)); read the first page server-side and hand it to a client component for search + Load-more.
- **Read** — new `app/lib/transactions.ts` `readTransactionsPage(userId, { cursor, search, limit })`: select `id, occurred_on, merchant, description, amount, direction, category, dedup_key, pending, account_id` from `transactions` (RLS already hides `superseded_by`/`removed_at`), **left-join `financial_accounts(name)`** for the account column; order `occurred_on desc, id desc`; keyset filter on the cursor `(occurred_on, id)`; `.limit(limit + 1)` to detect "has more"; optional `.or("merchant.ilike.%q%,description.ilike.%q%")` for search. Resolve each row's category via `effectiveCategory(category, assignmentMap.get(dedup_key))` using `readCategoryAssignments(client, userId)` ([packages/db/categories.ts](packages/db/categories.ts)); `humanizeCategory` ([packages/core/recap.ts](packages/core/recap.ts)) for display.
- **API** — `app/api/transactions/route.ts` GET (`runtime = "nodejs"`, `getAal2UserId` guard, discriminated JSON), params `cursor` + `q`, returns `{ rows, nextCursor | null }`; mirror [app/api/budget/route.ts](app/api/budget/route.ts).
- **Client/DTO** — a `TransactionRow` DTO (`id, occurredOn, merchant, description, amount, direction, category (resolved), account, pending`); reuse the `money()` + short-date formatters from [app/(app)/budget/CategoryTransactions.tsx](app/(app)/budget/CategoryTransactions.tsx) (extract/share if cleaner). Credits render `+{money}`; pending → badge.
- **Funnel** — add `TRANSACTIONS_VIEWED: "transactions_viewed"` to `FUNNEL_EVENTS` ([packages/core/funnel.ts](packages/core/funnel.ts)).
- **Copy** — add the `transactions` + `transactionsA11y` blocks verbatim from [copy.md](docs/bets/WLT-23/stories/WLT-23-1/copy.md).
- **Pagination is load-bearing** — keyset (not offset/unbounded) is what keeps this, the app's first deliberately-unbounded list, under the 1000-row PostgREST cap; don't fall back to a single `.select()` of all rows.

## PRs

- PR #66 — implementation (ledger + nav + read + API + tests) — in-review (Codex owns the gated owner-isolation E2E)

## Tests

- **Engineer (this PR):** unit (keyset cursor encode/decode + "has more"; `effectiveCategory` resolution into the row; credit/debit + pending rendering; search filter shape); component jsdom (first page renders; Load-more appends + focus moves; search → no-match state; the three empty states; error + retry on first-page and Load-more; `transactions_viewed` emitted once); guard test that the read resolves category through the resolver (not raw `transactions.category`).
- **Codex (separate `test:` handoff):** the **gated real-path E2E** (`E2E_PASSKEY=1`): the ledger renders the user's own rows through session→RLS→render across accounts, paginates, and **a second user cannot read user 1's transactions or account names** (AC7); RLS confirmation that `financial_accounts` name join is owner-scoped.

Tags: `regression: true`, `e2e: true` (Codex E2E).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-18] [PM] **Slice WLT-23-1 = the ledger itself** (nav + owner-scoped, paginated, searchable all-accounts list, honest states, instrumentation) — rationale: smallest independently-shippable thing that delivers the whole "see + find my activity" value; filters-beyond-search and recategorize-in-list are clean fast-follows — area: scope — reversibility: easy
- [2026-06-18] [PM] **Reuse the WLT-22 resolver for the category column, read-only ledger** — rationale: one category truth with the budget; editing/categorization is WLT-22's domain (reuse, don't rebuild) — area: correctness/scope — reversibility: easy
- [2026-06-18] [Designer] **Show all directions + pending; keyset "Load more"; search-only v1; nav adjacent to Accounts** — see design.md DRI (resolves the brief's pending/transfers open Issue) — area: ux — reversibility: easy/medium
- [2026-06-18] [PM] **Jira mirror skipped (no silent skip)** — `connectors.ticketing: jira` + `jira_sync: true`, but no Jira MCP is connected on this host — per PM host-degradation, the WLT-23-1 sub-ticket mirror is skipped; create it manually under the WLT-23 epic when the connector is available — area: process — reversibility: n/a
- [2026-06-18] [Engineer] **Keyset pagination via a PostgREST `.or()` predicate + `.limit(n+1)`** — the next page is `occurred_on.lt.D OR (occurred_on.eq.D AND id.lt.ID)` ordered `occurred_on desc, id desc`; the opaque cursor is base64url of `occurred_on|id`; `limit+1` detects "has more" without a count — area: data/perf — alternatives: offset (drifts under inserts; hits the 1000-row cap) — reversibility: easy
- [2026-06-18] [Engineer] **Account name + saved category via in-memory maps, not PostgREST embedding** — fetch `financial_accounts(id,name)` + the shared `readCategoryAssignments` map and resolve in JS (mirrors the WLT-22 reader) — avoids embedding ambiguity on the composite FK, stays owner-scoped, and `accountName.size` cheaply yields `hasAccount` for the empty-state branch — area: data — reversibility: easy
- [2026-06-18] [Engineer] **The RSC server-read is the real-path seam; no client mount-refetch** — `/transactions` is `force-dynamic`, so the RSC read (session→RLS→render) is fresh per load (#36); unlike `/budget` it does NOT also refetch page 1 on mount — that would double a heavy paginated read for no freshness gain — area: perf — reversibility: easy
- [2026-06-18] [Engineer] **Search sanitized for the `.or()` grammar** — strip `% , ( ) * \` from the user term (the or-filter delimiters + ilike wildcards) and bound to 100 chars, so a search term can't break or inject into the keyset filter — area: security/correctness — reversibility: easy
- [2026-06-18] [Engineer] **Cursor strict-validation (Codex ISSUE/LOW, fixed `150aa37`)** — `decodeCursor` rejects any decoded payload whose fields aren't a strict (date, uuid); a crafted `cursor` query param can no longer alter the `.or()` predicate or force a 502 — it degrades to page 1. The search term was already sanitized; this closes the same gap on the cursor — area: security/correctness — reversibility: easy

### Risks
- [2026-06-18] [PM] **The deliberately-unbounded list hits the 1000-row PostgREST cap or feels slow on 24mo** — likelihood: medium — impact: medium — mitigation: keyset pagination (≈50/page) is an AC, not optional; each query stays bounded — area: performance
- [2026-06-18] [Engineer-watch] **`readCategoryAssignments` returns an unbounded map** (a user with >1000 saved assignments) — likelihood: low — impact: low — mitigation: same pattern the budget already uses; assignments are sparse (only user-touched rows); revisit only if it surfaces — area: performance/data
- [2026-06-18] [Engineer] **Keyset correctness depends on `id` being a stable total-order tiebreak within a date** — likelihood: low — impact: medium — mitigation: `id` is a per-row uuid (stable, unique), so `(occurred_on desc, id desc)` is a deterministic non-skipping order; the cursor predicate matches it exactly — the gated real-path E2E (Codex) should paginate across a page boundary to confirm no row is dropped/duplicated — area: data/correctness

### Issues
- [2026-06-18] [PM] **"Connect an account" nudge target** — severity: low — owner: Engineer — status: resolved — links to `/accounts` (the existing entry; no new flow).
- [2026-06-18] [Codex→Engineer] **Gated owner-isolation real-path E2E missing (BLOCKER)** — severity: blocker — owner: **Codex (Reviewer)** — status: open — routed back per cross-model independence: the E2E/RLS proof for this diff is the Reviewer's deliverable, not the Engineer's (the WLT-22-1/2/3 pattern). Codex to author `e2e/transactions*.spec.ts` (two users, cross-account own-rows, paginate across a page boundary, second-user can't read user 1's transactions/account names) with a `test:` prefix.

---

_Story closed: <date>, brief link: docs/bets/WLT-23/brief.md_
