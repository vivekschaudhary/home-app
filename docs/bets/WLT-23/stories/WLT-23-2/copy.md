# Copy: WLT-23-2 — Filter the ledger

UX Writer owns these strings. Use **verbatim** in `app/lib/copy.ts` (extend the existing `transactions` / `transactionsA11y` blocks — do not create a parallel block). `{query}` is a fill token.

## Additions to `COPY.transactions`

```
// WLT-23-2 — filters
allAccounts: "All accounts",
allCategories: "All categories",
clearFilters: "Clear filters",
emptyFiltered: "No transactions match these filters.",
```

(`emptySearch` from WLT-23-1 — _"No transactions match “{query}”."_ — still covers the search-only no-match; `emptyFiltered` covers an account/category filter with no matches.)

## Additions to `COPY.transactionsA11y`

```
// WLT-23-2 — filters
accountFilter: "Filter by account",
categoryFilter: "Filter by category",
clearFilters: "Clear all filters",
```

## Notes

- **`allAccounts` / `allCategories`** are the default (unfiltered) option in each dropdown — selecting them widens that dimension back to everything.
- **`emptyFiltered`** is shown when a filter combination returns nothing; the filters stay set so the user can adjust, and **`clearFilters`** offers a one-tap reset. Tone matches WLT-23-1: calm, plain, no blame.
- The filter labels (`accountFilter` / `categoryFilter`) are the accessible names for the two `<select>` controls — they don't need to be visually prominent, just present.
