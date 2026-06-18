# Copy: WLT-22-3 — Remember the merchant

## Voice and tone

Plain, in-control, transparent about breadth. This action changes **many** transactions (past + future), so the copy is explicit about what "remember" does and how many it touched — never a silent bulk edit. Same register as the rest of Budget & Spending. No alarm, no "are you sure?" (it's reversible via per-transaction overrides), but always honest about scope.

## Strings

### The "remember the merchant" affordance (in the recategorize picker)
- **rememberLabel:** `Always categorize {merchant} this way`
- **rememberHint:** _(optional helper under the checkbox)_ `Applies to your past and future {merchant} transactions.`
- **applying:** `Applying…`
- **successOne:** `Now categorizing {merchant} as {category} — updated 1 transaction`
- **successMany:** `Now categorizing {merchant} as {category} — updated {count} transactions`
- **error:** `We couldn't apply that just now — try again.`
- **errorNetwork:** `You appear to be offline — try again when you're back.`
- **retry:** `Try again`

### Accessibility labels
- **rememberCheckbox:** `Always categorize {merchant} as {category} — applies to past and future transactions`

## Terminology consistency
- **"Always categorize {merchant} this way"** — the word "always" signals the past-and-future breadth; "this way" binds it to the category the user is choosing in the same gesture.
- **"updated {count} transactions"** — names the breadth of the change; the count is the number of rows the rule actually wrote (matching transactions without a user override).
- **Merchant** — the transaction's `merchant` (never `description`); the checkbox is absent when there's no merchant, so this copy never renders for a description-only row.
- **No "rule" jargon in the UI** — the user thinks "remember this merchant," not "create a category rule." (The data model calls it a rule; the copy never does.)
- Reuses WLT-22-2's `Moved to {category}` for the single-transaction (unchecked) path; this slice's copy is only for the **remember/bulk** path.

## DRI Log

### Decisions
- [2026-06-17] [UX Writer] **"Always categorize {merchant} this way" (not "Create a rule for {merchant}")** — rationale: speaks the user's mental model ("remember this") instead of the implementation's ("rule"); "always" carries the past+future meaning without jargon — area: copy — reversibility: easy
- [2026-06-17] [UX Writer] **Success copy names the count + the going-forward behaviour** ("Now categorizing… — updated N transactions") — rationale: a bulk + future-affecting edit must be transparent about scope so the user isn't surprised — area: copy/trust — reversibility: easy
- [2026-06-17] [UX Writer] **Singular/plural split (successOne / successMany)** — rationale: "updated 1 transactions" reads as broken; honest counting is part of the trust posture — area: copy — reversibility: easy

### Risks
- _none_

### Issues
- [2026-06-17] [UX Writer] **Merchant display in the copy** — severity: low — owner: Engineer — status: open — area: copy/data — show the transaction's `merchant` verbatim (the matched value), not the normalized key, so "Starbucks #123" reads naturally even though the rule matches on the normalized form.
