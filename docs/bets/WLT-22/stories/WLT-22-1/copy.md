# Copy: WLT-22-1 — Drill into a category

## Voice and tone

Plain and factual — these are the user's own receipts. No interpretation, no judgment. Same register as the rest of Budget & Spending.

## Strings

### The drill affordance + panel
- **viewItems:** _(no label — the "This month so far" amount itself is the button; its accessible name describes the action)_
- **panelHeading:** `What's in {category} this month`
- **totalLabel:** `Total`
- **loading:** `Loading your transactions…`
- **empty:** `No transactions in {category} this month.`
- **error:** `We couldn't load these just now — try again.`
- **retry:** `Try again`

### Line item
- **noMerchant:** _(when merchant is null, show the transaction `description` instead — never blank)_

### Accessibility labels
- **openItems:** `Show the transactions in {category} this month ({amount})`
- **closeItems:** `Hide the transactions in {category} this month`
- **list:** `Transactions in {category} this month`
- **itemLabel:** `{date}, {merchant}, {amount}`

## Terminology consistency
- **"this month"** — matches the table's "This month so far"; the drill shows the same window as the number it sits under.
- **Merchant** — the transaction's `merchant`, or its `description` when merchant is null; never a fabricated/placeholder name.
- Money via the app's currency formatter; dates short + locale-friendly (e.g. "Jun 14").
- The **Total** shown equals the row's "This month so far" figure — they must reconcile exactly.

## DRI Log

### Decisions
- [2026-06-17] [UX Writer] **The number is the button; no separate "view transactions" label** — rationale: the affordance is the figure the user wants to verify; the accessible name carries the action — area: copy/ux — reversibility: easy
- [2026-06-17] [UX Writer] **"What's in {category} this month" as the panel heading** — rationale: answers the user's literal question ("what got counted as rent?") — area: copy — reversibility: easy

### Risks
- _none_

### Issues
- _none_
