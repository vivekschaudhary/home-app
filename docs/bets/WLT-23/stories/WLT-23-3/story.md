---
id: WLT-23-3
bet: WLT-23
type: story
status: in-review
priority: P2
created: 2026-06-18
author: PM
design_link: docs/bets/WLT-23/stories/WLT-23-3/design.md
copy_link: docs/bets/WLT-23/stories/WLT-23-3/copy.md
area_tags: [frontend, spending, data, security]
dependencies:
  - WLT-23-1 (the ledger — this adds correction to its rows; shipped)
  - WLT-23-2 (the filters — the reconcile must drop a row that no longer matches; shipped)
  - WLT-22 (the CategoryPicker + recategorize/create/rule routes — reused; shipped)
---

# WLT-23-3 — Recategorize from the ledger

## Description

Let a user **fix a transaction's category directly from the Transactions ledger** — reusing the **WLT-22 `CategoryPicker`** (move to a category · create a new one · "remember this merchant"), opened **as a popover off the row** (not an inline-expanding row). The correction is the **same saved-category model** as the budget drill-down (keyed to the stable `dedup_key`, read through the shared resolver), so it agrees everywhere. The only data change is exposing the row's `dedup_key` (the write target) on the ledger; the write reuses the shipped AAL2 + owner-scoped WLT-22 routes. **Closes the WLT-23 bet.**

## Acceptance Criteria

- [ ] **AC1 — Recategorize in the row (popover, reused picker).** Each ledger row's **category cell is the WLT-22 `CategoryPicker`** — the current resolved category as a button that opens the picker **popover**: the user's categories (current marked) + **"+ New category"** + (when the row has a merchant) the **"Always categorize {merchant} this way"** checkbox. Picking a category **saves** it to `transaction_categories` keyed to the row's **`dedup_key`** (the WLT-22 spine).
- [ ] **AC2 — Create a category inline.** From the picker, **create a custom category** (to split a lumped group) and assign it — reusing the WLT-22 create-form; empty / case-insensitive duplicate rejected with the existing discriminated errors.
- [ ] **AC3 — Remember the merchant.** When the row has a merchant, **"Always categorize {merchant} this way"** + pick → a **`category_rules`** mapping (WLT-22-3) that backfills past + applies at sync, with the **counted success** ("updated N transactions"). A `'user'` override still outranks a `'rule'`.
- [ ] **AC4 — Reconcile on success (no optimistic revert).** The trigger shows **saving / error** and keeps the prior category until success; on success the row's **resolved category updates**, a **single move** shows the "Moved to {category}" toast, and the ledger **reconciles** — if a **category filter** is active and the row no longer matches it the row **drops**, and a **remember-the-merchant rule** (many rows) **refetches the current page**.
- [ ] **AC5 — Owner-scoped (load-bearing security).** The write goes through the **AAL2 + owner-scoped** WLT-22 routes (`/api/categories`, `/api/categories/recategorize`); the ledger read exposes the row's `dedup_key` owner-scoped. A user can recategorize **only their own** transactions — proven by a **gated real-path E2E** (recategorize from the ledger reconciles through session→RLS→render; a second user can't recategorize or read user 1's rows).
- [ ] **AC6 — Accessibility + responsive.** Inherited from the `CategoryPicker` (keyboard-navigable `Menu`, focus into/out of the picker + create-form, `aria-busy` while saving, discriminated errors); the in-row trigger has an accessible name (`recatTrigger`). Clean on **phone ≤640** (picker + create-form + checkbox stack; ≥44px), tablet, desktop. WCAG AA.
- [ ] **AC7 — Instrumentation.** Reuses the existing server-side events — `transaction_recategorized`, `category_created`, `category_rule_created` (emitted by the WLT-22 routes). **No new event.**

## Standard Experience Checklist

- [ ] **Navigation** — the picker opens/closes as a popover in the row (no route change); coexists with search/filters/Load-more: **AC1** + design.
- [ ] **States** — resting · picker-open · creating · saving · success (move toast / counted rule) · discriminated error + retry — all from the reused `CategoryPicker`: **AC1–AC4**.
- [ ] **Feedback** — "Moved to {category}" (single) / counted rule success; discriminated network/validation/server error + retry; saving keeps the prior category (no optimistic revert): **AC4**.
- [ ] **Accessibility** — keyboard `Menu`, focus management, `aria-busy`, labelled trigger + remember checkbox: **AC6**.
- [ ] **Edge cases** — `merchant` null → no remember checkbox (`canRemember` false), trigger label uses the description; correcting a row out of the active category filter (drops on refetch); the "Other" (null) current category; a credit/income row is recategorizable: **AC1, AC3, AC4** + design.
- [ ] **Cross-surface consistency** — same `CategoryPicker` + saved-category model as the budget drill-down (one truth); `n/a — web-only at Phase 1` for native: **AC1**.

## Tech notes

`architecture_required: false` — no new schema, no new route; reuse WLT-22.

- **Expose the write target** — add `dedupKey` to `TransactionRowDTO` ([app/lib/transactions-client.ts](app/lib/transactions-client.ts)) + the read's `mapRow` ([app/lib/transactions.ts](app/lib/transactions.ts)) (the read already selects `dedup_key` for resolution; just surface it).
- **Reuse the picker** — render `CategoryPicker` ([app/(app)/budget/CategoryPicker.tsx](app/(app)/budget/CategoryPicker.tsx)) in the ledger row's category cell: `current = row.category`, `merchantLabel = row.merchant || row.description`, `amount = money(row.amount)`, `canRemember = !!row.merchant`, `categories` = the existing `categories` state ([TransactionsClient.tsx](app/(app)/transactions/TransactionsClient.tsx) already fetches it for the filter). (Consider relocating `CategoryPicker` to a shared spot if the budget↔transactions coupling grates — not required this slice.)
- **Wire the writes (reused client fns)** — `onPick(categoryId, applyToMerchant) → recategorizeTransaction({ dedupKey: row.dedupKey, categoryId, applyToMerchant })`; `onCreate → createCategory` ([app/lib/budget-client.ts](app/lib/budget-client.ts)). On a successful `onPick`: **refetch the current page** (`loadPage` with the active filters) so the row's category + any filtered membership reconcile; show the `recatSaved` toast for a single move (the picker shows the counted success for a rule).
- **Copy** — reuse the WLT-22 `budgetRecat` / `budgetRecatA11y` / `budgetRemember` blocks **verbatim** (the `CategoryPicker` reads them); add only `transactions.recatSaved` + `transactionsA11y.recatTrigger` from [copy.md](docs/bets/WLT-23/stories/WLT-23-3/copy.md).
- **No new route / event** — `/api/categories` + `/api/categories/recategorize` (AAL2, owner-scoped) already emit `transaction_recategorized` / `category_created` / `category_rule_created`.

## PRs

- PR #69 — implementation (the WLT-22 `CategoryPicker` in each ledger row + reconcile; `dedupKey` on the row; `recatSaved` copy; tests) — in-review (Codex owns the gated recategorize-from-the-ledger + isolation E2E)

## Tests

- **Engineer (this PR):** unit (`mapRow` exposes `dedupKey`); component jsdom (the row category cell opens the picker; pick → `recategorizeTransaction` with the **row's `dedupKey`** + the reconcile refetch; create inline; the remember checkbox shows only when the row has a merchant; single-move toast; discriminated error; a corrected row drops from an active category filter on refetch).
- **Codex (separate `test:` handoff):** the gated real-path E2E — recategorize from the ledger reconciles through session→RLS→render (the row's category updates; a rule moves matching rows); a **second user cannot recategorize or read** user 1's transactions.

Tags: `regression: true`, `e2e: true` (Codex E2E).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-18] [PM] **WLT-23-3 = recategorize-from-the-ledger; reuse the WLT-22 `CategoryPicker` as a popover; this closes the bet** — rationale: the second of the two approved fast-follows; maximal reuse (move/create/remember + routes + events already shipped); the only data change is exposing `dedupKey` — area: scope — reversibility: easy
- [2026-06-18] [PM] **Reconcile by refetching the current page on success** — rationale: a move can change a row's filtered membership and a rule moves many rows; a refetch reconciles the visible list honestly (the budget-drill pattern) — area: correctness — reversibility: easy
- [2026-06-18] [Designer] **Picker as a popover off the row; any row (incl. credits) correctable** — see design.md DRI — area: ux — reversibility: easy

### Risks
- [2026-06-18] [PM] **Coupling the budget `CategoryPicker` into the transactions surface** — likelihood: low — impact: low — mitigation: it's already a self-contained, reusable component; relocate to a shared spot only if the coupling grates — area: maintainability
- [2026-06-18] [PM] **Post-rule refetch shifts the visible rows** — likelihood: low — impact: low — mitigation: the counted success names the change; newest-first ordering preserved — area: ux

### Issues
- [2026-06-18] [PM] **Jira sub-ticket mirror** — severity: low — owner: PM — status: open — no Jira connector on host; create WLT-23-3 manually under the WLT-23 epic (per precedent).

---

_Story closed: <date>, brief link: docs/bets/WLT-23/brief.md_
