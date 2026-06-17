# Design: WLT-22-1 — Drill into a category (verify the number)

## Design intent

Answer the question that blocked the user on shipped WLT-21: **"what got counted as this?"** Tapping a category's number reveals the **actual transactions** behind it — date, merchant, amount — and they **sum to exactly the number shown**. No interpretation, no rounding, no fabrication: the receipts, on demand. This is the trust move — the budget stops being a black box.

## Surfaces & flow

Builds on the WLT-21 budget row (which already expands to the year chart):

1. The row's **"This month so far" amount becomes a button** ("tap the number to see what's in it") — the most intuitive entry. Keyboard-operable, `aria-expanded`/`aria-controls`.
2. Tapping it opens an **inline panel beneath the row** that lists this month's transactions for that category: **date · merchant · amount**, newest first, with a **"Total: $X" footer that equals the row's number**.
3. The list **lazy-loads on open** (a brief loading state) — it's the user's own data, fetched on demand, not shipped with every page.
4. A category with **no spend this month** has no drill affordance (nothing to verify) — honest, no empty panel.
5. Collapsing returns focus to the amount button. Independent per-row (multiple can be open; coexists with the year panel).

## States (every state ships)

| State | What renders |
|---|---|
| **Closed** | The row as in WLT-21 + the amount rendered as a button affordance. |
| **Loading** | The panel open with a calm "Loading your transactions…" placeholder (`aria-busy`). |
| **Populated** | The line items (date · merchant · amount) + the **Total** footer == the row number. |
| **Empty (in-window)** | If, on load, the category has no transactions this month (edge — shouldn't happen since the affordance only shows when there's spend), an honest "No transactions this month." |
| **Error** | A calm inline message + a retry; never a silent blank. |

## Layout & responsive

- **Desktop/tablet:** a compact three-column list (date · merchant · amount) under the row; amounts right-aligned; the Total footer bold.
- **Phone ≤640:** each item stacks (merchant as the line, date + amount beneath); full-width; ≥44px tap targets. No horizontal scroll.

## The honesty contract (load-bearing)

- **The line items SUM to the displayed total.** The footer total is computed from the same rows; if they ever differ it's a bug, not a rounding artifact. This is the whole point — the user must be able to reconcile.
- **Real data only** — the user's own `merchant` (or `description` when merchant is null), real `amount`, real `date`. No placeholder/sample rows. Same high-trust posture as the Accounts screen (their own bank data on their own screen).
- **Newest first**, so the most recent (most memorable) charges are at the top.

## Accessibility

- The amount is a real `<button>` with `aria-expanded` + `aria-controls`; the panel is a labelled region.
- The list is a semantic structure (a `<table>` with `<th scope>` or a definition list) so each amount is associated with its date + merchant.
- `aria-busy` during load; focus returns to the trigger on close; WCAG AA; transitions `motion-safe`.

## Honest / reduced-design notes

- **Scope is this-month verification.** Verifying a *past* month (tap a bar in the year-spread → that month's line items) is a fast-follow, not this slice — keeps WLT-22-1 small + ships the core "is this month's number right?" win.
- **No recategorization here.** Editing a transaction's category is WLT-22-2 (the saved-category model). This slice is read-only transparency.
- **Reads today's category value** (Plaid's). Once WLT-22-2 ships the saved model, the same panel reflects the user's resolved categories with no redesign — forward-compatible.

## DRI Log

### Decisions
- [2026-06-17] [Designer] **Tap the number to reveal its line items** (not a separate "view transactions" link) — rationale: the number is the thing the user distrusts; making it the affordance is the most direct "show me what's in this" — area: ux — reversibility: easy
- [2026-06-17] [Designer] **Lazy-load the line items on open** — rationale: it's the user's own per-category detail; fetching on demand keeps the page light + the data off the client until asked — area: ux/perf — reversibility: easy
- [2026-06-17] [Designer] **Scope to the current month; defer the per-month (year-bar) drill** — rationale: the current-month drill fully answers the user's blocker ("what's in rent this month?"); the past-month drill is a small follow — area: scope — reversibility: easy

### Risks
- [2026-06-17] [Designer] **Total ≠ sum of items would destroy the trust this is meant to build** — likelihood: low — impact: high — mitigation: compute the footer from the same rows; an explicit test that the sum equals the row total — area: correctness/trust

### Issues
- [2026-06-17] [Designer] **Merchant can be null** — severity: low — owner: Engineer — status: open — area: data — fall back to `description`; never blank.
