---
id: WLT-23-2
bet: WLT-23
type: story
status: ready
priority: P2
created: 2026-06-18
author: PM
design_link: docs/bets/WLT-23/stories/WLT-23-2/design.md
copy_link: docs/bets/WLT-23/stories/WLT-23-2/copy.md
area_tags: [frontend, spending, aggregation, data, security]
dependencies:
  - WLT-23-1 (the ledger — this adds filters to it; shipped)
  - WLT-22 (the saved-category resolver + the user's category set; shipped)
  - WLT-2 (transactions + financial_accounts; shipped)
---

# WLT-23-2 — Filter the ledger (account + category)

## Description

Add an **account** filter and a **category** filter to the shipped Transactions ledger, alongside its search — so a user can narrow to "just my credit card" or "all my dining," the competitive norm. Filters **compose** with the existing free-text search and keyset pagination (all AND-ed, server-side); the **category** filter operates on the **resolved** (`saved ?? Plaid`) category so it agrees with the ledger's column and the budget. No new schema — filter params on the WLT-23-1 read + two select controls. **Recategorize-in-the-list is the next slice (WLT-23-3), not this one.**

## Acceptance Criteria

- [ ] **AC1 — Account filter.** A labelled control lists **All accounts** (default) + one option per the user's connected accounts (name); selecting one scopes the ledger to that account (`account_id`), composing with search + category + keyset paging.
- [ ] **AC2 — Category filter (resolved).** A labelled control lists **All categories** (default) + the user's categories (resolved names, humanized; "Other" for the null bucket if present); selecting **C** shows transactions whose **resolved** category (`effectiveCategory(plaid, saved)`) is C — a transaction **moved into** C appears, one **moved out** drops. Computed **keyset-safely** in the query (never by post-filtering a page — that would break page size).
- [ ] **AC3 — Compose + reset + clear.** Account, category, and search apply **together (AND)**, all server-side; changing **any** of them **resets to page 1** (a fresh keyset scan); **Load more** continues within the active filter set; a **Clear** affordance (shown when any is active) resets to All / All / empty.
- [ ] **AC4 — Honest empty.** A filter/search combination with no matches shows **"No transactions match these filters."** with the filters **left set and editable** (+ one-tap Clear); a failed filtered read shows the calm inline error + retry, never a silent blank.
- [ ] **AC5 — Owner-scoped (load-bearing security).** The **filter options** (accounts, categories) and the **filtered reads** are owner-scoped under the user's RLS session; a second user's accounts/categories never appear and their rows are never returned — proven by extending the gated real-path E2E (filter by account + by a moved-category and reconcile; cross-tenant negative).
- [ ] **AC6 — Accessibility + responsive.** Each control is a labelled `<select>` (full keyboard + SR support); the polite result-count (WLT-23-1) announces the new total on a filter change; Clear is a real `<button>`; clean on **phone ≤640** (search full-width, selects stack/side-by-side, ≥44px), tablet, desktop; WCAG AA.
- [ ] **AC7 — Instrumentation.** `transactions_filtered` (additive funnel event) emitted when a filter is applied (not on every keystroke).

## Standard Experience Checklist

- [ ] **Navigation** — filters live on the existing `/transactions` page; no route change; Load-more continues within the filter: **AC1, AC3** + design.
- [ ] **States** — default · filtered-populated · loading · empty-no-match · error: **AC1–AC4** + design States table.
- [ ] **Feedback** — calm no-match + Clear; calm error + retry; polite result-count on change; **no success/destructive feedback** — `n/a — read-only, no mutation this slice`: **AC4, AC6**.
- [ ] **Accessibility** — labelled selects, keyboard, `aria-live` count, Clear as a button, AA: **AC6**.
- [ ] **Edge cases** — the "Other" (null-category) bucket as a category option; a category the user moved transactions into/out of (resolved filter, AC2); an account with no transactions (empty); composing all three filters; the resolved-category keyset-safety (no short/over-long pages): **AC2, AC3, AC4** + tech notes.
- [ ] **Cross-surface consistency** — `n/a — web-only at Phase 1`; responsive variants are one component: **AC6**.

## Tech notes

`architecture_required: false` holds — filter params on an existing read + two controls; no schema, no re-sync.

- **Read** — extend `readTransactionsPage(userId, { cursor, search, accountId, category, limit })` ([app/lib/transactions.ts](app/lib/transactions.ts)):
  - **account** → `.eq("account_id", accountId)` (trivially keyset-safe).
  - **category (resolved = C)** → push into the query, keyset-safe. Build two owner-scoped dedup_key sets: `savedToC` (dedup_keys whose saved category name == C) and `savedAny` (all the user's saved dedup_keys), then filter `dedup_key.in.(savedToC…) OR (category.eq.C AND NOT dedup_key.in.(savedAny…))` — a third `.or()` group AND-ed with the keyset + search `.or()`s. **This is the load-bearing implementation decision.** Do NOT post-filter a fetched page (breaks page size / cursor). **Edge:** very large saved sets → long `.in()` lists (URL length) — low-likelihood (assignments are sparse; same risk class as `readCategoryAssignments`); if it surfaces, fall back to a **bounded over-fetch-and-filter keyset scan** (cursor = last *scanned* row, capped scan per request) and `log()` the cap.
  - return the **accounts list** (`[{id,name}]`) in the page payload (the read already builds the account-name map) for the dropdown.
- **API** — `app/api/transactions/route.ts` reads `account` + `category` params, threads them through.
- **Client** ([TransactionsClient.tsx](app/(app)/transactions/TransactionsClient.tsx)) — two `<select>`s + Clear; account options from the page payload, category options from `fetchCategories()` (the existing `/api/categories`); thread `accountId` + `category` into `fetchTransactions`; **reset cursor on any filter/search change**; emit `transactions_filtered` (debounced/on-change, not per keystroke).
- **Funnel** — add `TRANSACTIONS_FILTERED: "transactions_filtered"` ([packages/core/funnel.ts](packages/core/funnel.ts)).
- **Copy** — extend the `transactions` / `transactionsA11y` blocks verbatim from [copy.md](docs/bets/WLT-23/stories/WLT-23-2/copy.md) (do not fork a new block).

## PRs

_Auto-populated as PRs open._

## Tests

- **Engineer (this PR):** unit (the resolved-category filter predicate / set construction — saved-into-C appears, moved-out drops, "Other" bucket; account `.eq`; cursor resets on filter change); component jsdom (account select filters; category select filters; compose with search; Clear resets; no-match empty; `transactions_filtered` fired on change once, not per keystroke; options come from payload + `/api/categories`).
- **Codex (separate `test:` handoff):** extend the gated real-path E2E — filter by account and by a **moved** category and reconcile through session→RLS→render; filter options + filtered reads are owner-scoped (a second user's accounts/categories never appear; their rows never returned).

Tags: `regression: true`, `e2e: true` (Codex E2E).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-18] [PM] **Slice WLT-23-2 = both filters (account + category); recategorize is WLT-23-3** — rationale: the two fast-follows are independent; filters finish the "find" value and build directly on the shipped search/keyset; one story at a time — area: scope — reversibility: easy
- [2026-06-18] [PM] **Category filter on the RESOLVED category, keyset-safe in the query** — rationale: must agree with the ledger column + the budget; post-filtering a page would break pagination; the engineer picks the exact query shape per the tech-note contract — area: correctness/perf — reversibility: medium
- [2026-06-18] [Designer] **Native selects + Clear; filters AND + reset to page 1** — see design.md DRI — area: ux — reversibility: easy

### Risks
- [2026-06-18] [PM] **Resolved-category filter query complexity / large saved sets** — likelihood: low — impact: medium — mitigation: the keyset-safe SQL set filter (sparse assignments keep `.in()` lists short); a bounded over-fetch-scan fallback with a logged cap if it ever surfaces — area: data/perf
- [2026-06-18] [PM] **Filter ⇄ search ⇄ paging interaction bugs (stale cursor)** — likelihood: medium — impact: low — mitigation: changing any of the three resets the cursor to page 1 (an AC); component tests cover the compositions — area: correctness

### Issues
- [2026-06-18] [PM] **Category options source** — severity: low — owner: Engineer — status: open — reuse `/api/categories`; if a Plaid-only category present in transactions is missing from that set, include the distinct resolved categories present. Decide at build.
- [2026-06-18] [PM] **Jira sub-ticket mirror** — severity: low — owner: PM — status: open — no Jira connector on host; create the WLT-23-2 sub-ticket manually under the WLT-23 epic (per WLT-23-1 precedent).

---

_Story closed: <date>, brief link: docs/bets/WLT-23/brief.md_
