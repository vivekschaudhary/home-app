# Copy: WLT-23-1 — The Transactions ledger

UX Writer owns these strings. Use **verbatim** in `app/lib/copy.ts` (PM/Engineer do not paraphrase). `{merchant}`, `{amount}`, `{category}`, `{account}`, `{date}`, `{query}`, `{count}` are fill tokens.

## Nav label

Add to `COPY.nav`:

```
transactions: "Transactions"
```

## `COPY.transactions` (visible page copy)

```
transactions: {
  title: "Transactions",
  subtitle: "Everything across your accounts, newest first.",
  searchPlaceholder: "Search by merchant or description",
  loading: "Loading your transactions…",
  loadMore: "Load more",
  loadingMore: "Loading…",
  endOfList: "You're all caught up — that's everything.",
  resultCount: "Showing {count} transactions",
  pending: "Pending",
  // headers
  colDate: "Date",
  colMerchant: "Merchant",
  colAmount: "Amount",
  colCategory: "Category",
  colAccount: "Account",
  // empty states
  emptyNoAccountTitle: "No transactions yet",
  emptyNoAccountBody: "Connect an account and your activity will show up here.",
  emptyNoAccountCta: "Connect an account",
  emptyNoneTitle: "Nothing to show yet",
  emptyNoneBody: "We don't see any transactions yet — if you just connected, they may still be syncing.",
  emptySearch: "No transactions match “{query}”.",
  // error
  error: "We couldn't load your transactions just now — try again.",
  retry: "Try again",
},
```

## `COPY.transactionsA11y` (screen-reader / non-text labels)

```
transactionsA11y: {
  region: "Transactions",
  list: "Your transactions",
  search: "Search your transactions by merchant or description",
  resultCount: "Showing {count} transactions",
  loadMore: "Load more transactions",
  itemLabel: "{date}, {merchant}, {amount}, {category}, {account}",
  debitAmount: "{amount}",
  creditAmount: "{amount} credit",
  pending: "Pending — not yet settled",
  colDate: "Date",
  colMerchant: "Merchant",
  colAmount: "Amount",
  colCategory: "Category",
  colAccount: "Account",
},
```

## Notes

- **`emptyNoAccount*`** is the *real* empty case (no connected account) and carries the only call-to-action — it points at the existing accounts/connect entry; do not invent a new flow.
- **`emptyNone`** is "connected but no rows yet" — calm, names the likely cause (still syncing), no CTA.
- **`emptySearch`** keeps the search editable so the user can recover; uses curly quotes around the query.
- **Amount labels:** debits read as the bare amount; **credits** append "credit" so a screen reader never hears an ambiguous number. "Pending" is real text (never color-only).
- **`resultCount`** is announced politely (`aria-live`) as paging/searching changes the set — orienting, not interrupting.
- Tone matches the WLT-22 drill-down copy: calm, plain, honest; errors say "try again", never blame the user.
