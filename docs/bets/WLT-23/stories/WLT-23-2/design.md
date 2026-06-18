# Design: WLT-23-2 — Filter the ledger (account + category)

## Design intent

WLT-23-1 shipped the searchable all-accounts ledger. This slice finishes the **"find it"** story: let the user **narrow** the list to one **account** ("just my credit card") and/or one **category** ("all my dining") — the competitive norm (search + filters) — without rebuilding anything. Filters **compose** with the shipped search + keyset pagination; the category filter operates on the **resolved** category, so it agrees with the budget and with the ledger's own category column.

## Surfaces & flow

On the existing `/transactions` page, beside the search box:

1. An **Account** filter — a labelled `<select>`: **All accounts** (default) + one option per connected account (name).
2. A **Category** filter — a labelled `<select>`: **All categories** (default) + one option per the user's categories (resolved names, humanized).
3. A **Clear** affordance — visible when any filter (or search) is active; resets to All / All / empty search.
4. Changing **any** of {account, category, search} **resets to page 1** (a fresh keyset scan) and refetches; the three apply together (AND). **Load more** continues within the active filter set.
5. The result count (already announced politely) reflects the filtered set.

## States (every state ships)

| State | What renders |
|---|---|
| **Default** | All accounts · All categories · the full ledger (WLT-23-1 behavior, unchanged). |
| **Filtered — populated** | The narrowed list + Load-more while more matches remain, within the filter. |
| **Loading** | The calm loading placeholder (reused), `aria-busy`, on any filter/search change. |
| **Empty — no match** | "No transactions match these filters." — the filters + search **stay set and editable** so the user can widen; a one-tap **Clear** is offered. |
| **Error** | The calm inline error + retry (reused); a failed filtered read never shows a silent blank. |

## The category filter is on the RESOLVED category (load-bearing)

Selecting category **C** shows transactions whose **resolved** category (`saved ?? Plaid`) is C — the same value the column shows and the budget uses. A transaction the user **moved into** C appears; one **moved out** of C drops. This must be computed **keyset-safely** (in the query, not by post-filtering a page — that would break page sizes); see tech notes.

## Filter options come from the user's own data

- **Accounts:** the user's connected accounts (name) — returned with the ledger payload (the read already builds the account map).
- **Categories:** the user's category set (the same `/api/categories` the WLT-22 picker uses), humanized for display, "Other" for the null-category bucket if present.
- Both owner-scoped; a second user's accounts/categories never appear (AC5).

## Layout & responsive

- **Desktop/tablet:** search + the two selects on one row (search grows, selects auto-width); Clear as a text-link at the end.
- **Phone ≤640:** search full-width on top; the two selects stack (or sit side-by-side at 50%); Clear beneath. ≥44px targets; no horizontal scroll.

## Accessibility

- Each `<select>` has a visible/`aria` label ("Filter by account" / "Filter by category"); native selects = full keyboard + screen-reader support.
- The polite result-count (`aria-live`, from WLT-23-1) announces the new total when filters change — orienting, not interrupting.
- Clear is a real `<button>`; focus stays sensible after a filter change (list re-renders in place).

## Honest / reduced-design notes (don't over-build)

- **Two filters only** (account, category) + the shipped search. **No** date-range, amount-range, multi-select, or saved views (later if asked).
- **Reuses** the WLT-23-1 read/keyset/states and the `/api/categories` set — no new surfaces.
- **Recategorize-in-the-list is NOT here** — that's WLT-23-3 (the next slice).

## DRI Log

### Decisions
- [2026-06-18] [Designer] **Native `<select>` dropdowns for both filters** — rationale: accessible + keyboard/SR-complete with zero new deps; the simplest control that fits two single-select filters — area: ux/a11y — alternatives: a custom popover (rejected — heavier, no value for single-select) — reversibility: easy
- [2026-06-18] [Designer] **The category filter targets the RESOLVED category** — rationale: it must agree with the ledger column + the budget; filtering raw `transactions.category` would disagree with what the user sees — area: correctness — reversibility: easy
- [2026-06-18] [Designer] **Changing any filter resets to page 1; filters AND together; a Clear resets all** — rationale: predictable, matches every ledger product; keyset paging continues within the active filter — area: ux — reversibility: easy
- [2026-06-18] [Designer] **Filters are popovers (native selects), no inline-table expansion** — per the project preference ([[prefer-popovers-over-inline-table-expansion]]): the ledger table holds only data; controls/detail open as popovers/dropdowns, never a panel expanded inside the table. (WLT-23-3's recategorize picker follows the same — a popover off the row.) — area: ux — reversibility: easy

### Risks
- [2026-06-18] [Designer] **A selective filter feels slow if the keyset scan reads many rows to fill a page** — likelihood: low — impact: medium — mitigation: the resolved-category filter is pushed into the query (keyset-safe), not post-filtered; bounded per request — area: perf (see tech notes)

### Issues
- [2026-06-18] [Designer] **Category options source** — severity: low — owner: Engineer — status: open — reuse `/api/categories` (the user's set); if it omits a Plaid-only category present in transactions, fall back to including the distinct resolved categories present. Decide at build.
