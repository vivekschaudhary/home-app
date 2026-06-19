---
id: WLT-23
type: feature
status: shipped
priority: P2
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-2, WLT-19, WLT-22]
parallel_with: []
architecture_required: false
created: 2026-06-18
author: PM
sources:
  - "user feedback (operator/dogfooding, 2026-06-18): 'I'd like to see all the transactions in the account' — today the app shows accounts (balances) + budgets (categorized spend) but has no plain ledger of all transactions."
  - "competitive scan (2026-06-18): every major PFM ships a searchable transactions ledger — Monarch ('all your transactions in one clean, searchable list'), Copilot ('tracks each transaction in a simple ledger … organized by day'), YNAB."
  - docs/bets/WLT-2/brief.md # the aggregation pipeline + transactions data
  - docs/bets/WLT-22/brief.md # the saved-category resolver reused for the category column
  - docs/foundation/product.md
key_metric:
  name: the user can SEE + FIND any transaction — a complete, searchable ledger of all their activity
  baseline: 0 — there is no all-transactions view today; transactions are only visible per-category for the current month (the WLT-22-1 drill-down)
  target: of users who connect an account, a meaningful share open the Transactions view and use it (search/scroll); it becomes a recurring surface (return visits), without degrading the budget/recap engagement it sits beside
  source: a new additive funnel event (transactions_viewed) alongside the existing budget_viewed / recap_viewed
guardrails:
  - name: Honest data only
    threshold: the ledger shows the user's REAL transactions (date · merchant/description · amount · resolved category · account) — no fabricated/sample rows; superseded/removed (CDC) rows hidden; amounts/dates exactly as stored
  - name: Owner-scoped (load-bearing)
    threshold: a user sees ONLY their own transactions — owner-SELECT under their RLS session (the #36 / [real-path-integration-coverage] discipline); proven by a gated real-path E2E
  - name: One category truth
    threshold: the category shown for a transaction is the SAME user-resolved value the budget uses — read through the WLT-22 `saved ?? Plaid` resolver, never a divergent raw read
  - name: Fast on a large history
    threshold: the list stays responsive across a full 24-month history — paginated / lazy-loaded, never a single unbounded fetch of every row
  - name: Don't over-build
    threshold: read-only ledger this bet — NO editing amounts/dates/merchant (Plaid owns the entries), NO manual-add/CSV here (that's WLT-2's connect flow), NO bulk actions or split-transaction; recategorize-in-the-list reuses the existing WLT-22 picker if included at all, never a rebuild
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [frontend, spending, aggregation]
estimate:
  duration_days: 2-4
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-18
---

# WLT-23 — Transactions: a searchable ledger of all your activity

## Problem

The app can show you your **accounts** (balances, connection status) and your **budgets** (categorized spend, this month + the 12-month chart), but there is **no plain list of all your transactions.** The only place to see individual transactions today is the WLT-22-1 drill-down — and that's scoped to **one category, current month only.** A user who just wants to scan "what have I actually spent on, across everything?" — or find a specific charge — has nowhere to go. The first real operator hit this immediately: _"I'd like to see all the transactions in the account."_

## User

The **Consumer persona (~80%)** in the **"let me actually look at my money"** moment — they've connected an account and want to **browse and search their real activity**, not just the rolled-up budget numbers. Job-to-be-done: _"show me a clean, scrollable, searchable list of everything that's happened in my accounts, so I can scan it and find what I'm looking for."_

## Why this matters

1. **Table stakes for a money app + a trust reinforcement.** Every serious PFM (Monarch, Copilot, YNAB) has a searchable transactions ledger as a primary surface; its absence is conspicuous. Seeing the full, honest list of real transactions directly reinforces the **trust moat** (product.md moat #5) the budget transparency bet (WLT-22) is built on — the budget numbers stop being a black box when the underlying activity is one tap away.
2. **It's the natural home for verification + (later) correction.** WLT-22 gave per-category drill-down + recategorization; a full ledger is where a user naturally lands to verify and (as a fast-follow) correct across all categories — the same saved-category model, a broader surface.
3. **Low cost, high "feels complete."** It's a read over data we already store (no re-sync, no new schema), so it's a small slice that closes an obvious gap and makes the product feel whole.

## Hypothesis (the bet)

If we add a **Transactions** view — a new top-level nav item opening a searchable, reverse-chronological ledger of **all** the user's transactions across accounts (date · merchant · amount · resolved category · account) — then users will **browse and find their activity** there (and trust the budget numbers more), making it a recurring surface alongside the budget/recap — **without** us having to build an editing/categorization product. **Wrong if:** nobody opens it (the budget drill-down already covers the real need), or it only gets used once (a novelty, not a habit).

## Scope

### In scope

- **A new top-level "Transactions" left-nav item** (sibling to Accounts) → a `/transactions` page mounted in the WLT-20 `(app)` shell, behind the same AAL2 gate.
- **A reverse-chronological (newest-first) list of ALL the user's transactions, all accounts**: **date · merchant** (or `description` when merchant is null) **· amount · category** (the WLT-22 resolved category) **· account name**.
- **Pagination / lazy-load** so a full 24-month history stays fast (no single unbounded fetch).
- **Search** — at minimum, free-text over merchant/description. (Account and/or category **filter** is desirable; the minimum filter set is a story decision.)
- **Owner-scoped read** (RLS session), reusing the existing `transactions` read + the **WLT-22 `saved ?? Plaid` resolver** (so the category column matches the budget) + the WLT-22-1 row pattern + money formatter.
- **Honest states** — loading; empty (no connected account → the connect nudge); a category/search with no matches.
- **Instrumentation** — an additive `transactions_viewed` funnel event.

### Out of scope (explicit)

- **Editing transactions** (amount / date / merchant) — read-only; Plaid owns the entries.
- **Manual transaction add / CSV import here** — that's WLT-2's connect/import flow.
- **Recategorize-in-the-ledger** — _if_ included, it reuses the existing WLT-22 picker; otherwise a fast-follow. Not a rebuild, and not assumed in this brief's core slice.
- **Advanced filtering** (date-range, amount-range, multi-select, saved views), **bulk actions**, **split-transaction**, **"mark as reviewed"** — later if wanted; start minimal.
- Multi-currency; per-account sub-pages (the nav decision was a single all-accounts ledger, not a per-account drill).

## Open questions for Researcher

_(Most are design/story-level, not evidence questions — flagged for the story + Designer.)_

- **Pagination model:** cursor/offset over `occurred_on` + page size — confirm the read shape that stays fast on 24mo (the existing reads use bounded windows; this is the first deliberately-unbounded list).
- **Minimum filter set:** search-only first, or search + an account filter + a category filter for v1? (Competitive norm is search + category + account.)
- **Recategorize from the list:** reuse the WLT-22 `CategoryPicker` inline, or keep the ledger read-only for the first slice and add it as a fast-follow?
- **Pending + transfers:** show pending transactions (flagged)? Show transfers/income, or debits only? (The budget hides transfers; the ledger is "everything", so likely show all with the direction visible.)

## Research findings

- **User pain (qualitative) — our own user.** Direct operator/dogfooding request (2026-06-18): _"I'd like to see all the transactions in the account."_ Strongest possible source (source hierarchy #1 — our user's own words). The proxy for every user who connects an account and looks for a plain activity list.
- **Competitive (market) — table stakes.** A searchable transactions ledger is a primary surface in every major PFM: **Monarch** ("all your transactions in one clean, searchable list"), **Copilot** ("tracks each transaction in a simple ledger … organized by day", with natural-language search), **YNAB** — [Monarch](https://www.monarch.com/), [Copilot](https://www.copilot.money/), [comparison](https://wallethub.com/edu/b/ynab-vs-monarch-vs-copilot-vs-wallethub/150687). Its absence here is a conspicuous gap; the pattern is well-proven and low-risk.
- **Technical (feasibility) — already in place.** `transactions` (owner-SELECT RLS, hides superseded/removed) is populated by the shipped WLT-2 pipeline (24mo history) and is already read for the WLT-22-1 drill-down. The WLT-20 shell adds a nav item via the single `NAV_SECTIONS` config; the WLT-22 `effectiveCategory` resolver gives the category column. **No new schema, no re-sync, no architecture pass** — a read + a list UI + a nav entry. (Hence `architecture_required: false`.)
- **Quantitative / Trends:** `n/a — a table-stakes read-only list surfaced by direct user request; no quantitative validation or trend forecast is load-bearing for the decision.`

## Defensibility (optional for feature bets)

**Moat impact (one line):** reinforces the **trust/transparency moat** (product.md #5 — the full honest ledger makes the budget numbers verifiable) and surfaces the **proprietary saved-category data** (WLT-22) across all activity; not itself a new moat, but a trust multiplier on existing ones.

## User pain input (from Support)

`Direct operator/dogfooding feedback (2026-06-18) on the shipped app: the user wanted to "see all the transactions in the account" and found no such view — transactions are only reachable per-category, current-month (WLT-22-1). The exact gap this bet closes; the proxy for every future user who opens the app to browse their activity.`

## Stories

_Decomposed via `/create-story WLT-23` (nested numbering). Suggested first slice:_

- **WLT-23-1 — The Transactions ledger** → the nav item + the owner-scoped, paginated, searchable all-accounts list (date · merchant · amount · resolved category · account), honest states, instrumentation. Read-only. — **shipped** (PR #66, `fd1094f`).
- **WLT-23-2 — Filter the ledger (account + category)** → an account filter + a resolved-category filter alongside the search, composing with keyset paging; honest no-match + Clear; `transactions_filtered`. — **ready**.
- **WLT-23-3 — Recategorize from the ledger** → reuse the WLT-22 `CategoryPicker` **as a popover off the row** (not an inline-expanding row — per the popover preference) to correct a transaction's category (and optionally "remember the merchant") directly from the list; exposes the row's `dedup_key` (the write target), reuses the AAL2 routes + events. — **shipped** (PR #69, `478a16c`). **Bet COMPLETE.**

## DRI Log

### Decisions

- [2026-06-18] [PM] **A new top-level "Transactions" nav item, not a sub-menu under Accounts** — rationale: the nav is flat (no sub-menus today); a full ledger is a primary, return-to surface that deserves top-level discoverability; "Accounts" is about accounts/balances, "Transactions" reads as its sibling — area: ux/nav — alternatives: sub-menu under Accounts (rejected — buries it + introduces a nav sub-menu pattern for one item), per-account transaction sub-pages (rejected — the ask is an all-accounts ledger) — reversibility: easy
- [2026-06-18] [PM] **Read-only ledger this bet; reuse the WLT-22 resolver for the category column** — rationale: the whole value is a clean honest view of existing data; editing/categorization is WLT-22's domain (reuse, don't rebuild); one resolver keeps the category consistent with the budget — area: scope/correctness — reversibility: easy
- [2026-06-18] [PM] **`architecture_required: false`** — rationale: no new schema, no re-sync, no new architectural decision — an owner-scoped read of existing `transactions` + a list UI + a `NAV_SECTIONS` entry, all on shipped patterns (WLT-2 data, WLT-20 shell, WLT-22 resolver) — area: process — reversibility: n/a

### Risks

- [2026-06-18] [PM] **Low usage — the budget drill-down already covers the real need** — likelihood: medium — impact: low — mitigation: it's table stakes + a small slice; the `transactions_viewed` metric tells us if it's a habit or a novelty; cheap to ship, easy to learn from — area: product
- [2026-06-18] [PM] **Performance on a large history** (24mo can be thousands of rows) — likelihood: medium — impact: medium — mitigation: pagination/lazy-load from the start (a guardrail); never a single unbounded fetch; the read is indexed + owner-scoped — area: performance
- [2026-06-18] [PM] **Scope creep into an editing/categorization product** — likelihood: medium — impact: medium — mitigation: the "don't over-build" guardrail — read-only; reuse the WLT-22 picker if recategorize is added at all — area: scope

### Issues

- [2026-06-18] [PM] **Pending / transfers / income display** — severity: low — owner: PM/Designer — status: resolved (WLT-23-1: show all directions, credits with `+`, pending flagged).
- [2026-06-19] [Scanner] **Production-Readiness artifacts absent (runbook/SLO/monitoring/rollback/on-call/cost)** — severity: critical (4) + high (1) + medium (1) — owner: Human — status: open — from `/scan WLT-23` v1 (`docs/bets/WLT-23/scan-report.md`). The bet shipped to prod reusing shipped infra (WLT-2/WLT-20/WLT-22 + OPS-1/OPS-2) **without bet-level ops docs**. Product/Architecture/Build are clean. All six are **suppression candidates** given no new data store / external service / data category (backup + compliance assessed n/a / satisfied-by-inheritance) — decide per finding: add a minimal artifact or suppress with rationale, then re-run `/scan WLT-23`.

---

_Approved by: Vivek (DRI) on 2026-06-18_
