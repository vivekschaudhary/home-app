---
id: WLT-27-5-design
story: WLT-27-5
status: draft
type: design-spec
created: 2026-06-28
author: Designer
---

# Design Spec — Region Switcher UI (Per-Currency Spending Surfaces)

## Summary

`RegionSwitcher` is a single-select dropdown that appears in the page header of the budget, dashboard, transactions, and recap pages. It is visible only when `MULTI_CURRENCY_ACCOUNTS_ENABLED` is true AND the user has accounts in more than one distinct currency. Selecting a currency updates the URL search param (`?currency=EUR`), triggering an RSC re-render that filters all spending surfaces to the selected currency. No exchange rate conversion. Single-currency users see no change to any page.

## Flows

### Flow A — Multi-currency user switches from USD to EUR

```
Budget / Dashboard / Transactions / Recap page
  → RegionSwitcher visible in page header (MULTI_CURRENCY_ACCOUNTS_ENABLED = true, ≥2 currencies)
  → current URL: /budget (no ?currency= → defaults to USD)
  → user opens dropdown
  → user selects "EUR"
  → URL updates to /budget?currency=EUR (Next.js router.push)
  → RSC re-renders: budget totals, chart, ledger, recap all show EUR data only
  → RegionSwitcher shows EUR as active (visual highlight + aria-selected)
```

### Flow B — User navigates back (browser back button)

```
/budget?currency=EUR
  → browser back
  → /budget (USD default, no param)
  → spending surfaces revert to USD
```

### Flow C — Unrecognized currency param

```
User manually types /budget?currency=XYZ
  → XYZ not in user's account list
  → page silently defaults to USD (no error banner)
  → RegionSwitcher shows USD as active
```

### Flow D — Single-currency user (default state for all existing users)

```
Budget / Dashboard / Transactions / Recap page
  → MULTI_CURRENCY_ACCOUNTS_ENABLED = false OR user has only 1 distinct currency
  → RegionSwitcher is absent from the DOM
  → page behavior is identical to pre-WLT-27
```

### Flow E — Flag-off (existing users during rollout)

```
MULTI_CURRENCY_ACCOUNTS_ENABLED = false
  → RegionSwitcher is not rendered at all
  → activeCurrency = 'USD' everywhere (hardcoded default at the data-read layer)
  → no URL param handling; existing URL structure unchanged
```

## Screens & States

### RegionSwitcher component

| State | Description | Key elements |
|-------|-------------|--------------|
| Absent | Flag off OR single-currency user | Component not rendered; no DOM presence |
| Closed | Flag on + multi-currency; no selection in progress | Dropdown trigger visible; active currency shown; `aria-expanded="false"` |
| Open | User clicked/focused trigger | Options list visible; `aria-expanded="true"` |
| Option highlighted | User navigating with arrows | Focused option visually highlighted |
| Selected | User chose a currency | Trigger updates to show new currency; URL param changes; `aria-selected="true"` on selected option |

### Pages that host RegionSwitcher (budget, dashboard, transactions, recap)

Each page follows this pattern:

| Context | Behavior |
|---------|----------|
| No `?currency=` (or MULTI_CURRENCY_ACCOUNTS_ENABLED = false) | `activeCurrency = 'USD'`; all spending reads return USD rows only |
| `?currency=EUR` (flag on, EUR account exists) | `activeCurrency = 'EUR'`; all spending reads return EUR rows only |
| `?currency=XYZ` (unrecognized) | `activeCurrency = 'USD'` (silent fallback) |

**Budget page specifics:**
- Switcher in the `<h1>` heading area or directly below it (same horizontal row as existing controls)
- Budget totals and category bars reflect only the active currency's transactions

**Dashboard page specifics:**
- Switcher alongside the existing month/time-range selector (consistent with `?month=` pattern)
- Category spend chart bars reflect only the active currency

**Transactions page specifics:**
- Switcher alongside existing `?category=` filter
- Transaction list shows only transactions from accounts with `currency = activeCurrency`

**Recap page specifics:**
- Switcher in the recap page header
- Spending totals and anomaly count reflect only the active currency

## Interactions

### Opening the dropdown

Component: native `<select>` element for MVP (see DRI Decisions). User opens via click or keyboard (Space/Enter on focused select). Native browser dropdown behavior for keyboard navigation.

### Selecting a currency

On change event: `router.push(currentPath + '?currency=' + selectedCode)`. Next.js router handles the URL update without a full page reload (RSC streaming transition).

### Keyboard navigation

| Keyboard | Behavior |
|----------|----------|
| `Tab` | Moves focus to/from the switcher within the page header tab order |
| `Space` / `Enter` (on select) | Opens native select dropdown |
| `Arrow keys` (within open select) | Navigate currency options |
| `Enter` / `Space` (on option) | Selects option; fires change event |
| `Escape` (within open select) | Closes without changing selection (native behavior) |

### Active currency indicator

In the closed state: the selected option text is the visible currency label (native `<select>` default behavior). A `✓` checkmark preceding the active option in the options list is handled by the native select's selected option visual styling.

### RSC re-render transition

Next.js App Router: navigating to `?currency=EUR` triggers an RSC fetch for the new props. The page heading and switcher persist (they are in the layout or are client components); the spending data sections re-render with new data. No explicit loading skeleton is required — Next.js streaming provides the transition. If the RSC fetch takes > 1 s, Next.js shows a loading UI if `loading.tsx` is present; no new loading state needs to be designed.

## Copy Needs (flag for UX Writer)

| Key | Context |
|-----|---------|
| `[copy: region-switcher-label]` | Visible label above or beside the `<select>`; e.g., "Currency" |
| `[copy: region-switcher-aria-label]` | Screen-reader label for the select element; e.g., "Select currency to view spending" |
| `[copy: region-switcher-option-{code}]` | Per-currency option label pattern; e.g., "US Dollar (USD)", "Euro (EUR)". UX Writer should define the display format (full name + code vs code only). |
| `[copy: region-switcher-option-default]` | Generic pattern for unlisted currencies: "{name} ({code})" — can be generated from Intl.DisplayNames if browser API is available |

Note: all other page copy (budget title, transaction heading, recap title) is unchanged by this story. The only new copy surface is the switcher itself.

## Accessibility

- **Label:** `<label htmlFor="region-switcher">` with text [copy: region-switcher-label]; associates visually and programmatically with the `<select id="region-switcher">`
- **ARIA label:** `aria-label={[copy: region-switcher-aria-label]}` on the `<select>` provides a more descriptive label for screen readers beyond the visible label text
- **Active currency:** native `<select>` renders the selected option in the closed state; the selected `<option>` has the `selected` attribute, which screen readers announce as the current value
- **Change announcement:** when the user selects a new currency and the page re-renders, the new page heading or content change is read by the screen reader naturally (RSC re-render updates DOM). No explicit live region is needed for the page-level data change.
- **Selected option in list:** native `<select>` already marks the selected `<option>` visually (OS-native rendering); no additional `aria-selected` attribute needed on native `<option>` elements
- **Focus visibility:** the `<select>` must have a visible focus ring matching the site's focus-visible style (Tailwind `focus-visible:ring-2`)

## Standard Experience Checklist

- **Navigation:** currency selection updates URL search param (AC-2); browser back returns to prior context (AC-2); RSC re-render on param change (AC-11); unrecognized param silently defaults to USD (AC-12)
- **States:** absent (single-currency or flag off) (AC-1, AC-3); closed (multi-currency) (AC-1); open (user selecting) (AC-1); selected (AC-1); fallback to USD (AC-12); USD-only regression (AC-9)
- **Feedback:** active currency shown in switcher closed state (AC-10); fast RSC transition (AC-11); no error state for unrecognized code (AC-12)
- **Accessibility:** keyboard navigation (AC-10); active currency programmatically indicated via native select selected state (AC-10); screen reader announces active currency (AC-10)
- **Edge cases:** single-currency user sees no switcher (AC-9); flag off → switcher absent + activeCurrency='USD' (AC-3); 3+ currencies: all listed in dropdown, no cap (AC-1)
- **Cross-surface consistency:** n/a — single web surface

## Figma

No Figma file created — switcher is a native `<select>` with a `<label>`, following existing filter patterns (`?month=`, `?category=`). Logged as DRI Decision below.

## DRI Decisions

- **[2026-06-28] [Designer] RegionSwitcher implemented as a native `<select>`, not a custom combobox** — a native `<select>` provides the best cross-browser keyboard accessibility and OS-native rendering without any custom ARIA implementation. The currency list is short (typically 2–3 options for MVP users). A custom combobox would add implementation complexity for no user-facing benefit at this scale. If the design system later introduces a styled `<Select>` component, it can replace the native element with no behavioral change. Area: implementation/components. Reversibility: easy.
- **[2026-06-28] [Designer] Switcher placed in the page heading area, not in a sidebar or filter panel** — the `?currency=` param is a page-level context selector analogous to `?month=` and `?category=`. On the ledger, those filters live above the data (not in a sidebar). The switcher belongs at the same altitude — in or immediately below the `<h1>` heading row — so users can find it at the same interaction point across all four pages. A sidebar placement would create inconsistency with the existing filter UX. Area: UX/layout. Reversibility: easy.
- **[2026-06-28] [Designer] Figma skip — switcher is a native select following established filter patterns** — no new component pattern, layout section, or visual treatment is introduced. Engineering can build from this spec and the existing `?month=` and `?category=` filter patterns in the codebase. Area: tooling. Reversibility: n/a.

## AC Coverage for PM

| This spec covers | Story AC |
|-----------------|----------|
| Switcher renders only for multi-currency users; absent for single-currency | AC-1 |
| Selected currency persists as URL search param; survives refresh | AC-2 |
| Switcher absent and activeCurrency='USD' when flag off | AC-3 |
| Switcher in page header of budget, dashboard, transactions, recap | AC-4 |
| Budget page: only selected-currency transactions in totals | AC-5 |
| Dashboard spend chart: only selected-currency bars | AC-6 |
| Transaction ledger: only selected-currency accounts' transactions | AC-7 |
| Recap page: only selected-currency spending + anomaly count | AC-8 |
| USD-only user sees no change (regression) | AC-9 |
| Active currency visible + programmatically indicated; keyboard nav | AC-10 |
| Switching triggers RSC re-render via router.push | AC-11 |
| Unrecognized currency code → silent fallback to USD | AC-12 |
| Regression test: USD-only user behavior identical before and after WLT-27-5 | AC-13 |

**PM: confirm AC-9 regression test is explicitly tagged `regression: true` in the test suite. This is the safety net for existing users.**
