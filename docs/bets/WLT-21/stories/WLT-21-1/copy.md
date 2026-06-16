# Copy: WLT-21-1 — The Budget & Spending table

## Voice and tone

Plain, supportive, never scolding. We state facts and offer a sensible suggestion; the user decides. We never imply judgment ("you overspent!"), never fake a number, and never alarm ("fraud"/red-scare). Money is shown as real figures; absence is "—".

## Strings

### Page chrome
- **title:** `Budget & Spending`
- **subtitle:** `Set a monthly limit per category and see how this month is tracking.`

### Table headers
- **colCategory:** `Category`
- **colRecommended:** `Recommended`
- **colActual:** `This month so far`
- **colBudget:** `Your budget`

### Recommended cell
- **useThis:** `Use this`
- **coldStartDash:** `—`
- **coldStartNote:** `We need about a month of history to suggest a number.`

### Budget editor (inline)
- **toggleAmount:** `$`
- **togglePercent:** `%`
- **amountLabel:** `Monthly limit`
- **amountPlaceholder:** `0.00`
- **percentLabel:** `Percent of your typical monthly spending`
- **percentHelper:** `{percent}% of your typical monthly spending ≈ {amount}/mo`
- **percentNeedsHistory:** `Set a dollar amount for now — we'll have a percent once we've seen about a month.`
- **setCta:** `Set budget`
- **saveCta:** `Save`
- **savingCta:** `Saving…`
- **editCta:** `Edit`
- **clearCta:** `Clear`
- **savedToast:** `Budget saved.`
- **clearedToast:** `Budget cleared.`

### Status (under / over)
- **left:** `{amount} left`
- **over:** `{amount} over`
- **noBudget:** `No budget set`

### Add a category
- **addCta:** `+ Add a category`
- **pickerTitle:** `Add a category to budget`
- **pickerHint:** `Pick a category to set a budget — even one you haven't spent in yet.`
- **pickerEmpty:** `You're already budgeting every category we see.`
- **pickerCancel:** `Cancel`

### Empty state (no connected account / no transactions)
- **emptyTitle:** `Nothing to budget yet`
- **emptyBody:** `Connect an account and we'll show your spending by category so you can set budgets.`
- **emptyCta:** `Connect an account`

### Errors / validation
- **saveFailed:** `We couldn't save that. Your entry is still here — try again.`
- **invalidAmount:** `Enter an amount greater than 0.`
- **invalidPercent:** `Enter a percent between 1 and 100.`
- **network:** `You appear to be offline. Check your connection and try again.`

### Other / unknown category
- **otherCategory:** `Other`

### Accessibility labels
- **tableLabel:** `Your budgets by category`
- **budgetInput:** `Monthly budget for {category}`
- **budgetTypeToggle:** `Budget as a dollar amount or a percent`
- **statusOver:** `Over budget by {amount}`
- **statusUnder:** `{amount} left this month`
- **addCategory:** `Add a category to budget`
- **saveStatus:** `Budget saving status`

## Terminology consistency
- **"This month so far"** — always (never "spent" alone) so the in-progress month reads clearly.
- **"Recommended"** — the own-history suggestion; never "ideal" or "target" (those imply an external benchmark we don't have).
- **"Your budget"** — the user's own cap; the limit is theirs, the recommendation is ours.
- **Category names** — the humanized Plaid-primary label (e.g. "Food And Drink", "Rent And Utilities"); `null` → "Other".
- Money formatted via the app's existing currency formatter; "—" for genuinely-absent values.

## DRI Log

### Decisions
- [2026-06-16] [UX Writer] **"This month so far" (not "Spent")** — rationale: the actual is a partial, in-progress month; "so far" prevents reading it as a final figure — area: copy — reversibility: easy
- [2026-06-16] [UX Writer] **"Recommended", never "ideal/target"** — rationale: it's drawn from the user's own history, not an external standard; "ideal" would over-claim — area: copy/honesty — reversibility: easy
- [2026-06-16] [UX Writer] **Percent always resolves to "≈ $X/mo" inline** — rationale: resolves the "percent of what?" ambiguity at the point of entry; falls back to a dollar prompt when there's no history to resolve against — area: copy — reversibility: easy

### Risks
- [2026-06-16] [UX Writer] **Over-budget copy reading as a scold** — likelihood: low — impact: medium — mitigation: "{amount} over" is factual, paired with a calm indicator; no exclamation, no color-scare — area: tone

### Issues
- _none_
