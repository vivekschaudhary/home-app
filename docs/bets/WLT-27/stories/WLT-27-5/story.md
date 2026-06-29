---
id: WLT-27-5
bet: WLT-27
type: story
status: ready
priority: P1
created: 2026-06-28
author: PM
design_link: n/a — switcher layout specified in architecture.md; no Figma for MVP dropdown
area_tags: [accounts, multi-currency, frontend, backend]
dependencies:
  - WLT-27-1
---

# Region Switcher UI (Per-Currency Spending Surfaces)

## Description

Users who have manual accounts in more than one currency (e.g., a USD checking account and a EUR account added after WLT-27-2 ships with `MULTI_CURRENCY_ACCOUNTS_ENABLED` on) currently have no way to view per-currency spending. Without isolation, switching between currencies would mix amounts and produce nonsense totals — WLT-27-1 adds the currency filter at the read layer; this story adds the `RegionSwitcher` UI component that lets users select which currency context to view, and wires the selected currency into the budget, dashboard, transaction ledger, and recap pages. No exchange rate conversion; no cross-currency totals — region isolation only. The switcher is invisible to users who have accounts in only one currency.

## Acceptance Criteria

- [ ] AC-1: `RegionSwitcher` (`app/(app)/accounts/RegionSwitcher.tsx`) is a `"use client"` component that renders a dropdown or toggle listing the distinct currencies present in the user's `financial_accounts` rows. It is hidden (not rendered) for users with only one distinct currency.
- [ ] AC-2: `RegionSwitcher` persists the selected currency as a URL search param `?currency=<ISO-4217-code>` (e.g., `?currency=EUR`). Navigation with the param set is bookmark-shareable and survives a page refresh.
- [ ] AC-3: `RegionSwitcher` is visible (and the `?currency=` param is read) only when `MULTI_CURRENCY_ACCOUNTS_ENABLED` is true. When the flag is off, `activeCurrency` is always `'USD'` and the switcher component is absent from the DOM.
- [ ] AC-4: The switcher is rendered in the page header of: budget page (`app/(app)/budget/page.tsx`), dashboard page (`app/(app)/dashboard/page.tsx`), transactions page (`app/(app)/transactions/page.tsx`), and recap page(s) (`app/(app)/recap/`). Each page reads `?currency=` from `searchParams` and passes `activeCurrency` (defaulting to `'USD'` when absent) to its RSC data read functions.
- [ ] AC-5: Budget page — when `activeCurrency = 'EUR'` is set, `readSpendingForBudgets` (WLT-27-1) returns only EUR transactions; the budget totals displayed reflect only EUR spending. No USD amounts appear in the budget when the EUR context is active.
- [ ] AC-6: Dashboard spend chart — when `activeCurrency = 'EUR'`, `readCategorySpendChart` (WLT-27-1) returns only EUR transactions; the chart bars reflect only EUR spending.
- [ ] AC-7: Transaction ledger — when `activeCurrency = 'EUR'`, the transaction list filters to transactions from accounts with `currency = 'EUR'`. Transactions from USD accounts do not appear in the EUR context.
- [ ] AC-8: Recap page — when `activeCurrency = 'EUR'`, the recap spending read (WLT-27-1) returns only EUR transactions; recap totals and anomaly surface reflect only EUR spending.
- [ ] AC-9: A user with only USD accounts (the default state for all existing users) sees no switcher and no `?currency=` param behavior — existing behavior is unchanged. This is verified by a regression test.
- [ ] AC-10: The `RegionSwitcher` dropdown is keyboard-navigable (Tab to reach the dropdown, arrow keys to navigate options, Enter to select). The currently active currency is indicated visually (checkmark or highlight) and programmatically (aria-selected or equivalent). Screen readers announce the active currency.
- [ ] AC-11: Switching currency via the `RegionSwitcher` triggers a navigation (Next.js `router.push` or `<Link>`) that updates the URL search param, causing the RSC to re-render with the new `activeCurrency`. No full page reload; the transition feels fast (RSC streaming).
- [ ] AC-12: If the `?currency=` param contains an unrecognized currency code, the page defaults to `'USD'` (no error; no crash). An unrecognized code that is not in the user's accounts list is silently ignored.
- [ ] AC-13: Regression test: a user with only USD accounts and no `?currency=` param sees identical budget totals, category-spend chart, transaction list, and recap figures before and after WLT-27-5 is deployed. Tagged `regression: true`.

## Standard Experience Checklist

- [ ] **Navigation** — covered by AC-2 (currency selection updates URL search param; back button in browser returns to prior currency context) and AC-11 (RSC re-render on param change without full reload). The switcher does not replace a page; it modifies the context of the current page.
- [ ] **States** — covered by: hidden/absent (AC-1 — single-currency users see no switcher, AC-3 — flag-off), active-selection (AC-1 dropdown), default/fallback (AC-12 — unrecognized code defaults to USD). Loading state: the RSC streaming transition is the loading state (Next.js default); no explicit skeleton needed for a param change.
- [ ] **Feedback** — covered by: AC-10 (active currency visually and programmatically indicated), AC-11 (fast RSC transition — no silent hang), AC-12 (unrecognized param silently defaults, no error banner). Destructive: n/a — the switcher is a read-only context selector; it does not mutate any data.
- [ ] **Accessibility** — covered by AC-10 (keyboard navigation, aria-selected, screen-reader announcement of active currency).
- [ ] **Edge cases** — covered by AC-9 (single-currency USD user sees no change), AC-12 (unrecognized currency code), AC-3 (flag-off → switcher absent). User has accounts in 3+ currencies: the dropdown lists all distinct currencies; no cap needed for MVP (multi-currency users are rare).
- [ ] **Cross-surface consistency** — n/a — single web surface; no mobile or native target.

## Tech notes

Architecture ref: `docs/bets/WLT-27/architecture.md` — "Sub-feature C — WLT-27-5" section and "Open questions for Engineer — `activeCurrency` surface" item.

Key files to create/edit:
- `app/(app)/accounts/RegionSwitcher.tsx` (new) — `"use client"` component; uses `useRouter` + `useSearchParams` from `next/navigation` to read and write `?currency=`.
- `app/(app)/budget/page.tsx` (edit) — read `searchParams.currency`, default `'USD'`, pass as `activeCurrency` to budget data read.
- `app/(app)/dashboard/page.tsx` (edit) — same pattern.
- `app/(app)/transactions/page.tsx` (edit) — same pattern; filter transaction query to accounts with `currency = activeCurrency`.
- `app/(app)/recap/` (edit) — same pattern for recap pages.

The `activeCurrency` param propagation from `searchParams` to the RSC data reads is the mechanism decided in the architecture open questions (option (a): URL search param — simple, shareable, consistent with existing `?month=` and `?category=` params). The RSC receives `searchParams` from the Next.js page props.

The `RegionSwitcher` must fetch the distinct currencies from the user's accounts. The cleanest approach: a server component parent queries `SELECT DISTINCT currency FROM financial_accounts WHERE user_id = $uid`, passes the list as a prop to the `"use client"` `RegionSwitcher`. This avoids a client-side fetch for the currency list.

**Dependency on WLT-27-1:** The `activeCurrency` param is passed to `readSpendingForBudgets`, `readCategorySpendChart`, and the recap read — all three gained the `.eq("currency", activeCurrency)` filter in WLT-27-1. This story wires the source of that parameter. WLT-27-1 must be merged before this story is deployed.

**Dependency note for non-USD accounts:** The `RegionSwitcher` is only useful when `MULTI_CURRENCY_ACCOUNTS_ENABLED` is on AND a user has created a non-USD manual account (WLT-27-2). The flag sequence is: WLT-27-1 regression suite passes → `MULTI_CURRENCY_ACCOUNTS_ENABLED` turned on → non-USD manual accounts become creatable → switcher becomes visible to those users.

## PRs

_Auto-populated as PRs open._

## Tests

- Component (tagged `e2e: false`): `RegionSwitcher` renders only for multi-currency users; hidden when `MULTI_CURRENCY_ACCOUNTS_ENABLED` is off; keyboard navigation; unknown currency param defaults to USD.
- Integration (tagged `regression: true`): AC-13 — USD-only user regression test across all four pages.
- Integration: AC-5, AC-6, AC-7, AC-8 — per-page currency isolation with a EUR account in the DB.

## Fixes (post-merge)

_None yet._

## DRI Log

### Decisions

- **[2026-06-28] [PM]** URL search param (`?currency=`) for active currency — consistent with existing `?month=` and `?category=` params on the ledger; shareable and survives page refresh; RSC receives it from `searchParams` without client-side state management. Rejected: session cookie (hides the active context from the URL; harder to link/share a specific currency view). Area: architecture. Reversibility: easy.
- **[2026-06-28] [PM]** Switcher hidden for single-currency users — the flag and the switcher are both required for the component to be useful; showing a one-item dropdown would be confusing noise for users who will never have multi-currency accounts. Area: UX. Reversibility: easy.

### Risks

- **[2026-06-28] [PM]** `MULTI_CURRENCY_ACCOUNTS_ENABLED` must not be flipped on until WLT-27-1 regression suite passes in production — if the suite is not run before the flag is enabled, USD-only users could see currency-filtered results that silently exclude their transactions (if any transaction row has a null or wrong `currency` value). The flag sequence in the Rollout section of the architecture is the gate. Area: data integrity.

### Issues

_None beyond bet-level issues._

---

_Story closed: pending. Brief: docs/bets/WLT-27/brief.md_
