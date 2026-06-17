# Copy: WLT-22-2 — Recategorize a transaction

## Voice and tone

Plain, factual, in-the-user's-control. These are the user's own corrections to their own data — no judgment, no "are you sure?" hand-wringing (the change is reversible). Same register as the rest of Budget & Spending. Never imply automation we don't do this slice (no "applied to all future" — that's WLT-22-3).

## Strings

### The recategorize control + picker
- **categoryControl:** _(no visible label — the control shows the transaction's current category name; tapping it opens the picker)_
- **pickerHeading:** `Category`
- **pickerCurrentHint:** `Now: {category}`
- **saving:** `Saving…`
- **saved:** `Moved to {category}`
- **error:** `We couldn't save that just now — try again.`
- **errorNetwork:** `You appear to be offline — try again when you're back.`
- **errorInvalid:** `That didn't go through — give it another try.`
- **retry:** `Try again`

### Create a category (inline)
- **newCategory:** `+ New category`
- **newCategoryNameLabel:** `Category name`
- **newCategoryNamePlaceholder:** `e.g. Rent`
- **kindLabel:** `Type`
- **kindEssential:** `Essential`
- **kindDiscretionary:** `Discretionary`
- **createSave:** `Create`
- **createCancel:** `Cancel`
- **createSaving:** `Creating…`
- **errorNameEmpty:** `Give the category a name.`
- **errorNameDuplicate:** `You already have a category called "{name}".`
- **errorCreate:** `We couldn't create that just now — try again.`

### Accessibility labels
- **openPicker:** `Change the category of {merchant} ({amount}) — now {category}`
- **pickerList:** `Choose a category for {merchant}`
- **categoryOption:** `{category}{isCurrent, select, true { (current)} other {}}`
- **createForm:** `Create a new category`

## Terminology consistency
- **"Category"** — the same word the budget table uses for its rows; a recategorization moves a transaction between those rows.
- **"Move" / "Moved to {category}"** — the mental model is moving a transaction from one bucket to another (not "tagging"/"labelling"), matching the visible effect (one row drops, another rises).
- **Essential / Discretionary** — the exact two kinds WLT-21 uses for its recommendation logic; reused verbatim so a user-created category carries the same meaning the recommendation engine reads.
- **No "remember"/"always"/"future" language** here — that belongs to merchant rules (WLT-22-3). This slice's copy is strictly about the one transaction in front of the user.
- Money via the app's currency formatter; category names shown as the user entered them (Plaid-seeded names via `humanizeCategory`).

## DRI Log

### Decisions
- [2026-06-17] [UX Writer] **"Moved to {category}" as the success acknowledgment** (not "Saved" / "Updated") — rationale: names the visible effect — the transaction moved buckets and the numbers shifted — so the acknowledgment matches what the user just saw happen — area: copy/ux — reversibility: easy
- [2026-06-17] [UX Writer] **"Now: {category}" current-state hint + current-category in the control's accessible name** — rationale: the user must always know what a transaction is tagged as *before* changing it; never make them guess the starting state — area: copy/a11y — reversibility: easy
- [2026-06-17] [UX Writer] **No confirmation prompt; errors discriminate type** — rationale: recategorizing is reversible (re-pick), so a confirm is friction; but a failed save must say *why* (offline vs. server vs. invalid) so the user knows whether to retry now — area: copy/ux — reversibility: easy
- [2026-06-17] [UX Writer] **"Rent" as the create-name placeholder** — rationale: gently points at the headline job (split Rent out of "Rent & Utilities") without prescribing — area: copy — reversibility: easy

### Risks
- _none_

### Issues
- [2026-06-17] [UX Writer] **Seeded category display names** — severity: low — owner: Engineer — status: open — area: copy/data — seeded categories carry Plaid's primary names; render through `humanizeCategory` so "FOOD_AND_DRINK" shows as "Food And Drink", consistent with the table.
