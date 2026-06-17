---
id: WLT-22-1
bet: WLT-22
type: story
status: ready
priority: P1
created: 2026-06-17
author: PM
design_link: docs/bets/WLT-22/stories/WLT-22-1/design.md
copy_link: docs/bets/WLT-22/stories/WLT-22-1/copy.md
area_tags: [frontend, spending, budgets, data, security]
dependencies:
  - WLT-21-1 (the budget table — this drills into its rows; shipped)
  - WLT-2 (transactions — the line items; shipped)
---

# WLT-22-1 — Drill into a category (verify the number)

## Description

Let a user **tap a category's "This month so far" amount** to reveal the **real transactions** that make up it — date · merchant · amount — summing to exactly the number shown. This is the **verification** half of WLT-22, and it needs **no schema and no category model** (a read of existing owner-scoped transactions + a UI), so it ships first and immediately answers the blocker from shipped WLT-21: _"I can't tell what got counted as rent."_ Recategorization + the saved-category model are WLT-22-2.

## Acceptance Criteria

- [ ] **AC1 — Drill into a category.** A category row with this-month spend exposes its **current-month line items** via the **"This month so far" amount acting as a button** (real `<button>`, keyboard-operable, `aria-expanded` + `aria-controls`). A category with no spend this month has no drill affordance (nothing to verify).
- [ ] **AC2 — The line items (honest, reconciling).** The opened panel lists the category's **current-month** transactions: **date · merchant** (or `description` when merchant is null) **· amount**, newest first. The panel's **Total equals the row's "This month so far" figure** — the sum of the items shown reconciles to the number exactly (the load-bearing honesty contract).
- [ ] **AC3 — Lazy load + honest states.** Line items **fetch on open** (a loading state, `aria-busy`); real data only (the user's own merchant/description/amount/date — no placeholder rows); a failed load shows a calm inline error + retry, never a silent blank.
- [ ] **AC4 — Owner-scoped (load-bearing security).** The drill-down reads **only the user's own** transactions, owner-SELECT under their RLS session — proven by a gated real-path E2E (session → `createServerSupabase()` → RLS → rendered rows; the #36 discipline). No cross-tenant read.
- [ ] **AC5 — Responsive + accessibility.** Clean on **phone ≤640** (items stack; ≥44px targets), **tablet**, **desktop** (compact date·merchant·amount rows). Semantic list/table with label↔value association; keyboard-operable; focus returns to the trigger on close; WCAG AA.
- [ ] **AC6 — Instrumentation.** `category_drilldown_viewed` (additive funnel event) emitted on first open per load.

## Standard Experience Checklist

- [ ] **Navigation** — the in-row amount-button opens/closes the line items inline (no route change); coexists with the WLT-21-2 year panel: **AC1** + design "Surfaces & flow".
- [ ] **States** — closed · loading · populated · empty (no txns) · error: **AC1, AC2, AC3** + design States table.
- [ ] **Feedback** — `aria-busy` loading placeholder; inline error + retry; (no save in this slice): **AC3**.
- [ ] **Accessibility** — amount-as-button with `aria-expanded`/`aria-controls`, semantic list, keyboard, focus return, AA: **AC5**.
- [ ] **Edge cases** — `merchant` null → `description`; a category with no this-month spend (no affordance); the "Other" (null-category) bucket; the **Total == sum of items** integrity: **AC1, AC2** + design.
- [ ] **Cross-surface consistency** — same list semantics phone/tablet/desktop, layout differs (rows ↔ stacked): **AC5**. (`n/a — web-only at Phase 1`.)

## Tech notes

Per `docs/bets/WLT-22/architecture.md` (drill-down needs **no schema** — it's the read-only slice):
- **Read:** `app/lib/budget.ts` (or a sibling) `readCategoryTransactions(userId, category, month)` — owner-SELECT `transactions` (`occurred_on, merchant, description, amount` where `user_id = … and category = … and occurred_on` in the month, RLS hides superseded/removed). Newest first. The sum must equal `computeMonthlySpending`'s value for that category (same debits) — share the filter so they can't drift.
- **Route:** `app/api/budget/transactions/route.ts` — `GET ?category=&month=`, `getAal2UserId()` guard, `runtime="nodejs"`; or a server action. Returns `{ items: {occurredOn, merchant, amount}[], total }`.
- **Client:** `app/lib/budget-client.ts` `fetchCategoryTransactions(category, month)` (try/catch `{ok}|{error}`); wire the amount-button + a `CategoryTransactions.tsx` panel into `BudgetClient.tsx` (lazy fetch on open; loading/error/empty; `category_drilldown_viewed` on first open).
- **Reuse:** the WLT-21 row structure, the money formatter, `@wealth/ui` `Banner`. **No schema, no category model, no new dependency.** Reads today's `transactions.category` (Plaid's) — forward-compatible with WLT-22-2's saved categories (same surface, resolved value later).
- **Funnel:** add `CATEGORY_DRILLDOWN_VIEWED: "category_drilldown_viewed"` to `packages/core/funnel.ts` (additive).

## PRs

_To be linked on build._

Tags:
- `regression: false`
- `e2e: true`

## Tests

_Engineer: unit (the read's month-window filter matches `computeMonthlySpending`'s debits → the total reconciles; `merchant` null → `description`), component (jsdom: tap the amount → fetches + lists items + Total == the row number; loading/error/empty; no affordance for a no-spend category; `category_drilldown_viewed` once). Codex: the real-path E2E (`e2e/budget.spec.ts` extended, `E2E_PASSKEY=1`-gated) — seed transactions in a category → open its drill-down → the listed items + Total match the budget number, through the real session→RLS→render path; a second user cannot read them._

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-17] [PM] **Drill-down ships first, alone, with no schema** — rationale: it fully answers the user's verification blocker, needs only a read + UI, and de-risks the bet by separating it from the saved-category model (WLT-22-2) — area: scope — reversibility: easy
- [2026-06-17] [PM] **Scope to the current month; defer the per-month (year-bar) drill** — rationale: "what's in rent THIS month" is the blocker; verifying a past month via a year-spread bar is a small fast-follow — area: scope — reversibility: easy
- [2026-06-17] [PM] **The Total must equal the row's number (reconcile)** — rationale: the entire value is trust; a mismatch would do the opposite — share the month-window filter with `computeMonthlySpending` — area: correctness/trust — reversibility: n/a

### Risks
- [2026-06-17] [PM] **Total ≠ sum of items (a drift between the drill read and the budget compute)** — likelihood: low — impact: high — mitigation: one shared month-window/debit filter; an explicit test that the drill total equals the budget row — area: correctness
- [2026-06-17] [PM] **Showing merchant feels like a privacy surprise** — likelihood: low — impact: low — mitigation: it's the user's OWN data on their OWN authed screen (same as Accounts); owner-scoped + AAL2-gated — area: privacy

### Issues
- [2026-06-17] [PM] **Merchant null handling** — severity: low — owner: Engineer — status: open — area: data — fall back to `description`; never blank.

_Story status: ready — Standard Experience Checklist has no empty category. The verification half of WLT-22; WLT-22-2 (saved categories + recategorization) follows._
