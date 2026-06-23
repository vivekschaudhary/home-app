# Copy: WLT-24-3 — One vendor, several subscriptions

## Voice and tone

Unchanged from WLT-24-1/2 — plain, calm, honest. This slice is almost entirely *correctness*, not new words: a multi-subscription vendor now shows as separate rows. No new user-facing strings are required; the only copy work is **wiring the existing per-row accessibility labels** (which already exist in `copy.ts` but aren't applied) so two same-named rows are distinguishable to a screen reader. We never invent a plan/tier name we can't justify from the data — the amount speaks for itself.

## Strings

### No new visible strings
- The list reuses every WLT-24-1/2 string: `colMerchant` / `colAmount` / `colCadence` / `colMonthly`, the cadence labels, the `detectedTag` + review-nudge copy, and the unmark control. Two rows for one vendor simply reuse these per series.

### Accessibility (reuse existing labels — now applied to the row)
- **rowA11y:** `{merchant}, {amount}, billed {cadence}, {monthly} per month` _(existing — wire onto the row so the two same-named rows differ by amount + cadence)_
- **rowDetectedA11y:** `{merchant}, {amount}, billed {cadence}, detected automatically` _(existing — the auto-detected variant)_
- **unmarkA11y (optional refinement):** `Remove {merchant} from subscriptions` — optionally `Remove {merchant} ({amount}) from subscriptions` so the control is unambiguous across the two rows.

## Terminology consistency
- **"Subscription"** stays one word per recurring price-series; a vendor with two series has two subscriptions — consistent with the per-row model.
- **No plan/tier names** — we surface the **amount**, never a fabricated "PS Plus"/"Premium" label (we don't have product names from the data; guessing one would break the honesty contract).
- **"Remove from subscriptions"** unchanged — now scoped to the one series (the other stays), but the word is the same; nothing is destroyed.
- Money via the app's currency formatter; cadence in plain language ("every month"), reused from WLT-24-1.

## DRI Log

### Decisions
- [2026-06-22] [UX Writer] **No new visible copy; reuse the existing strings per series** — rationale: the change is structural (rows per price), not lexical; inventing labels would add noise and risk fabrication — area: copy — reversibility: easy
- [2026-06-22] [UX Writer] **Disambiguate via amount, never an invented plan name** — rationale: we only have amounts; a guessed tier name could be wrong and breaks the honesty posture — area: copy/honesty — reversibility: easy
- [2026-06-22] [UX Writer] **Wire the existing `rowA11y` / `rowDetectedA11y` labels onto the row** — rationale: two same-named rows need distinct accessible names (amount + cadence); the labels already exist, they just weren't applied — area: a11y — reversibility: easy

### Risks
- _none_

### Issues
- _none_
