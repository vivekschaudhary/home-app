# Design: WLT-23-1 — The Transactions ledger

## Design intent

Give the user the thing every money app has and ours doesn't: **a single, clean, scrollable, searchable list of everything that's happened across their accounts.** Not a rolled-up budget number, not one category's slice — the **full ledger**. It answers the operator's ask verbatim ("I'd like to see all the transactions in the account") and quietly reinforces the trust the budget is built on: the numbers stop being a black box when the underlying activity is one nav click away.

## Surfaces & flow

1. A new **top-level "Transactions" item in the left nav** (sibling to Accounts), `status: live`, → `/transactions`, mounted in the WLT-20 `(app)` shell behind the same AAL2 gate. Active-state highlighting via the shell's existing `isActiveNav`.
2. The page is a **reverse-chronological (newest-first) list of ALL the user's transactions, all accounts**: **date · merchant** (or `description` when merchant is null) **· amount · category** (the WLT-22 resolved value) **· account name**.
3. A **search box** at the top filters by merchant/description (server-side, case-insensitive), combined with paging.
4. The list is **paginated** — the first page renders with the page; a **"Load more"** control appends the next page. Never one unbounded fetch (the 24-month-history guardrail).
5. It's a **destination, read-only** — no row opens an editor this slice. (Recategorize-in-the-list reuses the WLT-22 picker as a fast-follow, not here.)

## States (every state ships)

| State | What renders |
|---|---|
| **Loading (first page)** | A calm skeleton / "Loading your transactions…" (`aria-busy`). |
| **Populated** | The rows (date · merchant · amount · category · account), newest first, + a **Load more** control while more remain. |
| **Loading more** | The Load-more control shows a busy/disabled "Loading…"; existing rows stay put (no jump). |
| **End of list** | When no more pages remain, the control is replaced by a quiet "You're all caught up" end-marker. |
| **Empty — no connected account** | A calm empty state with a **"Connect an account"** nudge → the accounts/connect flow (the real reason there's nothing to show). |
| **Empty — connected, no transactions** | "No transactions to show yet." (honest; data may still be syncing). |
| **Empty — search no match** | "No transactions match \"{query}\"." with the search still editable to recover. |
| **Error** | A calm inline message + a **retry**; never a silent blank. Applies to both the first-page load and a failed Load-more. |

## The ledger shows *everything* (resolving the brief's open question)

The budget hides transfers/income; **the ledger is the full activity**, so it shows **both directions**:
- **Debits** (spending) render as the amount, e.g. `$52.10`.
- **Credits** (income, refunds, transfers-in) render with a leading **`+`** and a positive/muted treatment, e.g. `+$1,200.00`, with an accessible "credit" label so screen readers don't see a bare number.
- **Pending** transactions carry a small **"Pending"** badge (they're real activity, just not settled).
- **Superseded / removed (CDC) rows never appear** — the `transactions` owner-SELECT RLS policy already filters `superseded_by is null and removed_at is null`, so honesty is enforced at the database, not the UI.

## Category column (one truth with the budget)

The category shown is the **WLT-22 resolved value** — `effectiveCategory(plaidCategory, savedName)` (`saved ?? Plaid`), read through the shared `readCategoryAssignments` map, `humanizeCategory` for display, null → **"Other"**. It is the **same value the budget uses**, never a divergent raw read — so a category a user corrected reads consistently here and in the budget.

## Pagination (keyset, not offset)

- **Keyset/cursor over `(occurred_on desc, id desc)`** with a fixed page size (≈50). The cursor is the last row's `(occurred_on, id)`; the next page fetches rows strictly "older than" it. This is **stable under inserts** (no offset drift) and keeps every query well **under the PostgREST 1000-row cap** — the load-bearing reason this list, the first deliberately-unbounded one in the app, stays fast on a full 24-month history.
- Search is applied as a `merchant/description ilike` filter on the same keyset query, so paging works within a search too.

## Layout & responsive

- **Desktop/tablet:** a five-column table — date · merchant · amount (right-aligned) · category · account — with a sticky-ish header; comfortable row height.
- **Phone ≤640:** each row **stacks** — merchant as the line, with date · amount on the next line and category · account beneath (account/category as small muted chips); full-width; ≥44px tap targets; no horizontal scroll.
- **Load more** is a full-width secondary button on phone, inline on desktop.

## Accessibility

- The list is a **semantic `<table>`** with `<th scope="col">` headers (Date/Merchant/Amount/Category/Account) so each amount is associated with its row; or an equivalent labelled structure on phone.
- **Search** is a labelled `<input type="search">`; results update politely (`aria-live="polite"` count, e.g. "Showing N transactions").
- **Load more** is a real `<button>`; on append, focus moves to the **first newly-loaded row** (or stays on the button if it remains) so keyboard users don't lose place.
- `aria-busy` during loads; credits carry an accessible "credit" label; "Pending" is text, not color-only; WCAG AA; transitions `motion-safe`.

## Honest / reduced-design notes (don't over-build)

- **Search-only this slice.** Account filter + category filter are desirable (competitive norm) but are a **fast-follow** — search closes the core "find a charge" need with the smallest surface.
- **Read-only.** No editing amounts/dates/merchant (Plaid owns the entries), no manual-add/CSV (that's WLT-2), no bulk/split/"mark reviewed". Recategorize-in-the-list reuses the WLT-22 picker **if** added later — never a rebuild.
- **Reuses, doesn't reinvent:** the WLT-22-1 row treatment, the `money()` + short-date formatters, the resolver, the nav contract, the AAL2 API pattern.

## DRI Log

### Decisions
- [2026-06-18] [Designer] **Show ALL directions (debits + credits), with pending flagged** — rationale: the ledger is "everything", unlike the budget which hides transfers/income; a partial ledger would be dishonest about what's in the account — area: ux/correctness — alternatives: debits-only (rejected — not "all transactions") — reversibility: easy — *(resolves the brief's open Issue on pending/transfers/income)*
- [2026-06-18] [Designer] **Keyset (cursor) pagination with "Load more", not offset or infinite-scroll** — rationale: stable under inserts, stays under the 1000-row PostgREST cap, and "Load more" is the simplest honest control (no scroll-jacking, keyboard-friendly); infinite-scroll is a fast-follow — area: ux/perf — reversibility: medium
- [2026-06-18] [Designer] **Search-only for v1; account/category filters deferred** — rationale: search closes the "find a specific charge" need with the smallest surface; filters are a clean fast-follow — area: scope — reversibility: easy
- [2026-06-18] [Designer] **Place the nav item adjacent to Accounts (before it), `status: live`** — rationale: Transactions is the activity *in* the accounts; siblings read together; keeps Accounts last — area: ux/nav — reversibility: easy

### Risks
- [2026-06-18] [Designer] **A long list feels heavy / slow on phone** — likelihood: medium — impact: medium — mitigation: keyset paging (≈50/page) + skeleton; stacked rows; no unbounded fetch — area: perf
- [2026-06-18] [Designer] **Credit vs debit ambiguity (a `+` alone is missable)** — likelihood: low — impact: medium — mitigation: an accessible "credit" label + positive treatment, not color-only — area: a11y/clarity

### Issues
- [2026-06-18] [Designer] **Where the "Connect an account" nudge links** — severity: low — owner: Engineer — status: open — point it at the existing accounts/connect entry (reuse, don't invent a flow).
