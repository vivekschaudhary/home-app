# Copy: WLT-23-3 — Recategorize from the ledger

This slice **reuses the WLT-22 copy verbatim** — the `CategoryPicker` carries `COPY.budgetRecat`, `COPY.budgetRecatA11y`, and `COPY.budgetRemember` (move / create-category / "remember this merchant" / saving / success / errors). **Do not fork or duplicate those blocks.**

## Only-new string — add to `COPY.transactions`

```
// COPY.transactions
recatSaved: "Moved to {category}",
```

## Notes

- **`recatSaved`** is the single-move acknowledgment toast on the ledger (mirrors the budget drill's "Moved to {category}"). A **"remember the merchant"** correction shows the picker's own counted success (`COPY.budgetRemember.successOne/successMany`) — no extra toast, to avoid double feedback.
- **No new trigger label needed** — the `CategoryPicker` already self-labels its trigger via `COPY.budgetRecatA11y.openPicker` ("Change the category of {merchant} ({amount}) — now {category}"), which reads correctly on the ledger. (Originally scoped a `recatTrigger`; the reused label makes it redundant.)
- All other copy — the category list, "+ New category", the create-form, the remember checkbox + hints, every error string — comes **verbatim from the WLT-22 blocks** the `CategoryPicker` already reads.
