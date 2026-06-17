# Copy: WLT-21-2 — The year-spread view

## Voice and tone

Plain and factual. We show real monthly numbers and mark what's still in progress; we never imply a trend or a verdict. Same supportive, non-scolding register as the rest of Budget & Spending.

## Strings

### Expand / collapse
- **viewYear:** `View the year`
- **hideYear:** `Hide`

### Chart
- **caption:** `Monthly {category} spend — last 12 months`
- **soFar:** `so far`
- **maxLabel:** `Most: {amount}`
- **capLegend:** `Your budget: {amount}/mo`
- **noHistory:** `Not enough history yet to show the year.`

### Accessibility labels
- **toggle:** `Show the last 12 months of {category} spend`
- **toggleCollapse:** `Hide the last 12 months of {category} spend`
- **seriesCaption:** `{category} — monthly spend, last 12 months`
- **monthAmount:** `{month}: {amount}`
- **currentMonth:** `{month} (this month so far): {amount}`

## Terminology consistency
- **"Monthly {category} spend"** — always "spend", matching the table's "This month so far".
- **Months** — full names in the screen-reader text ("January"); 3-letter ("Jan") on desktop bars; single initial ("J") on mobile bars.
- **"so far"** — the same suffix the table uses for the in-progress month, so the current bar reads consistently.
- Money via the app's currency formatter; a zero month is shown as a real `$0.00` in the screen-reader text (an empty bar visually), never blank/omitted.

## DRI Log

### Decisions
- [2026-06-16] [UX Writer] **"View the year" / "Hide"** (not "Expand/Collapse") — rationale: describes the value, not the mechanic; pairs with the budget surface's plain voice — area: copy — reversibility: easy
- [2026-06-16] [UX Writer] **The current bar says "so far"** in both the label and the screen-reader text — rationale: the in-progress month must read as partial everywhere, not just visually — area: copy/trust — reversibility: easy

### Risks
- _none_

### Issues
- _none_
