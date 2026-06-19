# Copy: WLT-23-3 — Recategorize from the ledger

This slice **reuses the WLT-22 copy verbatim** — the `CategoryPicker` carries `COPY.budgetRecat`, `COPY.budgetRecatA11y`, and `COPY.budgetRemember` (move / create-category / "remember this merchant" / saving / success / errors). **Do not fork or duplicate those blocks.**

## Only-new strings — add to `COPY.transactions` / `COPY.transactionsA11y`

```
// COPY.transactions
recatSaved: "Moved to {category}",

// COPY.transactionsA11y
recatTrigger: "Change the category for {merchant} (currently {category})",
```

## Notes

- **`recatSaved`** is the single-move acknowledgment toast on the ledger (mirrors the budget drill's "Moved to {category}"). A **"remember the merchant"** correction shows the picker's own counted success (`COPY.budgetRemember.successOne/successMany`) — no extra toast, to avoid double feedback.
- **`recatTrigger`** is the accessible name for the in-row category button that opens the picker (`{merchant}` = the merchant or description; `{category}` = the current resolved category, humanized).
- All other copy — the category list, "+ New category", the create-form, the remember checkbox + hints, every error string — comes **verbatim from the WLT-22 blocks** the `CategoryPicker` already reads.
