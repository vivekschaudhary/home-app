---
id: WLT-27-2-design
story: WLT-27-2
status: draft
type: design-spec
created: 2026-06-28
author: Designer
---

# Design Spec — Manual Account Entry API + UI

## Summary

Adds a `ManualAccountForm` modal dialog on the Accounts page that lets users create a manual financial account (no Plaid connection). Gated behind `MANUAL_ACCOUNTS_ENABLED`. Currency picker is present but locked to USD until `MULTI_CURRENCY_ACCOUNTS_ENABLED` is on. On success, the accounts list revalidates and shows the new account.

## Flows

### Flow A — Create a USD manual account (happy path)

```
Accounts page
  → user clicks [copy: accounts-add-manual-cta]
  → ManualAccountForm dialog opens (focus → account name field)
  → user fills: account name (required), institution name (optional)
  → user selects kind (checking / savings / credit / investment / other)
  → currency picker shows USD (locked, disabled)
  → user clicks [copy: manual-account-submit-cta]
  → loading state (button disabled, spinner)
  → success: [copy: manual-account-success] shown
  → accounts list revalidates
  → dialog closes / user sees new account in list
```

### Flow B — Cancel / Escape

```
ManualAccountForm dialog open (any state before submit)
  → user clicks [copy: manual-account-cancel] OR presses Escape
  → dialog closes without saving
  → focus returns to [copy: accounts-add-manual-cta] trigger button
```

### Flow C — Non-USD account (multi-currency flag on, future)

```
Accounts page (MULTI_CURRENCY_ACCOUNTS_ENABLED = true)
  → user clicks [copy: accounts-add-manual-cta]
  → ManualAccountForm dialog opens
  → currency picker is enabled
  → user selects a non-USD ISO 4217 currency
  → submits → creates EUR (or other) account
  → success message → accounts list revalidates
```

### Flow D — Error paths

```
API returns MANUAL_ACCOUNTS_DISABLED (flag off at API level)
  → [copy: manual-account-error-disabled] shown as form-level banner

API returns 400 currency rejection (non-USD when flag off)
  → [copy: manual-account-error-currency] shown as form-level banner
    (in practice this cannot happen in Flow A since the picker is disabled;
     this error is a server-side safety net only)

Validation error (e.g., blank name submitted)
  → inline field-level error below the name input
  → [copy: manual-account-error-name-required]

Network error
  → form-level banner: [copy: manual-account-error-network]
```

## Screens & States

### ManualAccountForm (dialog)

| State | Description | Key elements |
|-------|-------------|--------------|
| Default | Dialog open; MANUAL_ACCOUNTS_ENABLED = true | All fields empty; currency picker disabled + locked to USD; submit enabled |
| Loading | Form submitted; request in-flight | Submit button disabled; `loading={true}` prop on `<Button>` |
| Success | API returned 200 | [copy: manual-account-success] message; form resets or dialog auto-closes |
| Error — flag off | API returned MANUAL_ACCOUNTS_DISABLED | `<Banner variant="error">` at top of form |
| Error — currency | API returned 400 (non-USD, flag off) | `<Banner variant="error">` at top of form |
| Error — validation | Missing required field (name) | Inline error below name field; `aria-describedby` points to error |
| Error — network | Fetch failed | `<Banner variant="error">` at top of form |
| Multi-currency enabled | MULTI_CURRENCY_ACCOUNTS_ENABLED = true | Currency picker enabled; full ISO 4217 allowlist available |
| Flag off (entire form) | MANUAL_ACCOUNTS_ENABLED = false | Form not rendered in the DOM; trigger button hidden or absent |

### Accounts page (trigger entry point)

| State | Description |
|-------|-------------|
| Flag off | No "Add manually" button present in the DOM |
| Flag on, no manual accounts yet | "Add manually" button visible alongside "Connect a bank" button |
| Flag on, has accounts | "Add manually" button visible; list of AccountCards shows existing accounts (Plaid + manual); manual accounts show no institution logo, no mask |

## Interactions

### Tab order within the dialog

```
1. Account name (TextField, required, autofocus on open)
2. Institution name (TextField, optional)
3. Kind picker (radio group: checking / savings / credit / investment / other)
4. Currency picker (select, disabled when MULTI_CURRENCY_ACCOUNTS_ENABLED = false)
5. Submit button ([copy: manual-account-submit-cta])
6. Cancel button ([copy: manual-account-cancel])
```

### Kind picker

Component: radio group (`<fieldset>` + `<legend>` + `<input type="radio">` per option). Options:
- Checking
- Savings
- Credit
- Investment
- Other

Default selection: none (required; user must pick). Keyboard: arrow keys navigate between options.

### Currency picker (MULTI_CURRENCY_ACCOUNTS_ENABLED = false)

Component: `<select>` with a single visible option "USD — US Dollar". Attribute: `disabled`. A hint text reads `[copy: manual-account-currency-locked-hint]` below the picker.

### Currency picker (MULTI_CURRENCY_ACCOUNTS_ENABLED = true)

Component: `<select>` listing the supported ISO 4217 allowlist. Default: USD pre-selected.

### Submit

On click: validates required fields client-side first (name non-empty, kind selected). If valid: fires `fetch('/api/accounts', { method: 'POST', ... })`, enters loading state. On success: shows success message, triggers accounts list revalidation. On error: shows discriminated error as described.

### Cancel / Escape

Closes dialog without saving. No confirmation required (form is not destructive).

### Focus management

- On dialog open: focus moves to account name field (first interactive element)
- On dialog close (success or cancel): focus returns to the trigger button that opened the dialog

## Copy Needs (flag for UX Writer)

| Key | Context |
|-----|---------|
| `[copy: accounts-add-manual-cta]` | Button on Accounts page to open the form; appears alongside "Connect a bank" |
| `[copy: manual-account-form-title]` | Dialog heading; e.g., "Add account manually" |
| `[copy: manual-account-name-label]` | Label for account name field |
| `[copy: manual-account-name-placeholder]` | Placeholder inside name field; e.g., "My Apple Card" |
| `[copy: manual-account-institution-label]` | Label for institution name field (optional) |
| `[copy: manual-account-kind-legend]` | Legend for the kind radio group; e.g., "Account type" |
| `[copy: manual-account-currency-label]` | Label for currency picker |
| `[copy: manual-account-currency-locked-hint]` | Hint below locked currency picker; e.g., "Only USD is supported right now" |
| `[copy: manual-account-submit-cta]` | Primary action button; e.g., "Create account" |
| `[copy: manual-account-cancel]` | Secondary button; e.g., "Cancel" |
| `[copy: manual-account-success]` | Success message after creation; e.g., "Account created" |
| `[copy: manual-account-error-disabled]` | Banner when flag is off at API: "Manual accounts are not available yet" |
| `[copy: manual-account-error-currency]` | Banner when non-USD rejected: "Multi-currency accounts are not available yet" |
| `[copy: manual-account-error-name-required]` | Inline field error for blank name |
| `[copy: manual-account-error-network]` | Banner for network/server error: "Something went wrong — please try again" |

## Accessibility

- **Dialog:** `role="dialog"` `aria-modal="true"` `aria-labelledby={title-id}` (title id matches the dialog heading element)
- **Focus on open:** `autoFocus` or `ref.current?.focus()` on account name field; same pattern as existing `ConsentDialog` in `AccountsClient.tsx`
- **Focus on close:** `focus()` called on the trigger button that opened the dialog
- **Kind picker:** `<fieldset>` with `<legend>[copy: manual-account-kind-legend]</legend>` wraps all radio inputs; each `<input type="radio">` has an associated `<label>`
- **Currency picker:** `<label htmlFor="currency-select">` paired with `<select id="currency-select">`; when disabled, also `aria-disabled="true"` and hint text id referenced via `aria-describedby`
- **Error banners:** `role="alert"` on `<Banner variant="error">` ensures screen readers announce errors immediately
- **Inline field errors:** each error message has a unique `id`; the associated field references it via `aria-describedby="<error-id>"` and `aria-invalid="true"`
- **Loading state:** submit button uses `aria-busy="true"` when in-flight; `<Button loading={true} loadingLabel="Creating…">` pattern per existing `Button` component
- **Escape key:** `document.addEventListener('keydown', ...)` closes dialog on Escape; same pattern as `ConsentDialog`

## Standard Experience Checklist

- **Navigation:** dialog opened by trigger button; Cancel/Escape closes without save; success closes dialog and returns focus to trigger; accounts list revalidates automatically on success (AC-11)
- **States:** default (AC-9), loading (AC-10), success (AC-11), error × 4 types (AC-12), flag-off (AC-8), currency-locked (AC-9 currency picker disabled)
- **Feedback:** in-flight loading state (AC-10), success acknowledgment (AC-11), discriminated error messages for each failure mode (AC-12)
- **Accessibility:** keyboard Tab order (AC-13), kind and currency pickers operable via keyboard (AC-13), focus on open (AC-13), dialog ARIA roles and labels
- **Edge cases:** second manual account allowed (AC-7 — no UX change needed, just works), flag-off form absent from DOM (AC-8), non-USD locked when flag off (AC-9)
- **Cross-surface consistency:** n/a — single web surface; no mobile target

## Figma

No Figma file created. The dialog pattern is already established in `AccountsClient.tsx` (`ConsentDialog`); the `ManualAccountForm` follows the same structural pattern. Logged as DRI Decision below.

## DRI Decisions

- **[2026-06-28] [Designer] ManualAccountForm renders as a modal dialog (not inline or popover)** — the Accounts page presents a list of `AccountCard` rows. An inline-expanding form inside the list would break the visual rhythm. An anchored popover is excluded by the project's "prefer popovers over inline-table expansion" convention (which covers controls anchored to table rows, not page-level creation forms). A full-screen modal dialog is the correct pattern for a multi-field creation form that blocks the user until completion or cancellation. The existing `ConsentDialog` in `AccountsClient.tsx` provides the exact same structural pattern; `ManualAccountForm` re-uses it. Area: UX/components. Reversibility: easy (modal can later be replaced with a slide-over if visual design evolves).
- **[2026-06-28] [Designer] Kind picker implemented as a radio group, not a select dropdown** — checking, savings, credit, investment, and other are five mutually exclusive options with meaningful semantic differences. A radio group makes all options visible simultaneously, reducing cognitive load for first-time users who may not know which type to pick. A select dropdown would hide the options until clicked. Five options fit comfortably in a form without scrolling. Area: UX. Reversibility: easy.
- **[2026-06-28] [Designer] Figma skip — pattern established by ConsentDialog** — the `ManualAccountForm` reuses the existing modal dialog component pattern from `AccountsClient.tsx`. No net-new component or layout pattern is introduced that requires a Figma frame. Engineering can proceed from this spec and the existing dialog implementation. Area: tooling. Reversibility: n/a.

## AC Coverage for PM

| This spec covers | Story AC |
|-----------------|----------|
| Form visible only when flag on; absent from DOM when off | AC-8 |
| All form fields, kind picker options, currency picker | AC-9 |
| Loading state (button disabled) | AC-10 |
| Success message + list revalidation | AC-11 |
| Discriminated error messages × 4 | AC-12 |
| Keyboard Tab order, picker keyboard operability, focus on open | AC-13 |

**PM: confirm that the Standard Experience Checklist items above are reflected in the story's ACs before marking WLT-27-2 shipped.**
