# Design: WLT-23-3 — Recategorize from the ledger

## Design intent

Close the loop the ledger opened: a user scanning their transactions spots a mis-tagged one and **fixes its category right there** — without bouncing to the budget drill-down. It's the **same correction the user already knows** from WLT-22 (move to a category · create a new one · "remember this merchant"), surfaced on the broader all-activity surface. Reuse, don't rebuild — and per the popover preference, the picker opens **as a popover off the row**, never an inline-expanding row.

## Surfaces & flow

On the shipped `/transactions` ledger, the **category cell becomes the WLT-22 `CategoryPicker`** (the same component the budget drill-down uses):

1. The cell renders the row's **current resolved category as a button** (the picker trigger).
2. Tapping it opens the picker **popover** (Headless UI `Menu`, portal-anchored): the user's categories (the current one marked), a **"+ New category"** inline create-form, and — when the row has a merchant — the **"Always categorize {merchant} this way"** checkbox.
3. Picking a category **saves** it (`transaction_categories`, keyed to the row's stable `dedup_key`); with the checkbox it becomes a **merchant rule** that backfills past + applies at sync (WLT-22-3), with the counted success ("updated N transactions").
4. The trigger shows **saving / error** and keeps the prior category until success (no optimistic revert); on success the row's category updates and the ledger **reconciles**.

## Reconcile (what changes after a correction)

- The corrected row's **resolved category updates** in place.
- If a **category filter is active** and the row no longer matches it, the row **drops** from the filtered view; a **"remember the merchant" rule** can move *many* rows → **refetch the current page** so the visible list reconciles (the same pattern as the budget drill's post-recategorize refetch).
- Read-only otherwise: amount / date / merchant are never editable (Plaid owns them).

## Any row is correctable

The ledger shows **both directions**; a saved category applies to any transaction (the budget simply ignores credits). So a credit/income row can be recategorized too — the saved value is general. No special-casing.

## States (all reused from WLT-22's `CategoryPicker`)

resting · picker-open · creating (inline create-form) · saving (`aria-busy`) · success ("Moved to {category}" / the counted rule success) · discriminated error (network / validation / server) + retry · the "remember" counted success. No new state machine — the component already ships them.

## Layout & responsive

- The category cell hosts the trigger; the picker popover anchors to it (portal-anchored, no table clipping — same as the budget popover retrofit).
- **Phone ≤640:** the picker is full-width-ish; ≥44px targets; the create-form + checkbox stack (as in WLT-22).

## Accessibility

Inherited from the WLT-22 `CategoryPicker`: keyboard-navigable `Menu`, focus into/out of the picker + the create-form, `aria-busy` while saving, discriminated error messaging, the remember checkbox labelled. No new a11y surface.

## Honest / reduced-design notes (don't over-build)

- **Reuse the WLT-22 `CategoryPicker` verbatim** — move + create + remember. No new picker, no new copy beyond a row-scoped trigger label + acknowledgment.
- **No bulk / multi-select / split** — one transaction at a time (a rule is the "many" path, and it's the existing WLT-22 mechanism).
- **The write needs the row's `dedup_key`** — the only data change: expose `dedupKey` on the ledger row (the read already selects it for category resolution).

## DRI Log

### Decisions
- [2026-06-18] [Designer] **Reuse the WLT-22 `CategoryPicker` as the in-row control, opened as a popover** — rationale: identical mental model to the budget correction; the component already handles move/create/remember + all states + a11y; the popover honors the no-inline-expansion preference — area: ux — alternatives: a bespoke ledger editor (rejected — rebuild) — reversibility: easy
- [2026-06-18] [Designer] **Refetch the current page on a successful correction (esp. a rule)** — rationale: a move can change the row's filtered membership and a rule can move many rows; refetching reconciles the visible list honestly — area: correctness — reversibility: easy
- [2026-06-18] [Designer] **Any row (incl. credits) is recategorizable** — rationale: the saved category is general; the ledger is "everything" — area: scope — reversibility: easy

### Risks
- [2026-06-18] [Designer] **A per-row picker on a long list feels heavy** — likelihood: low — impact: low — mitigation: the `Menu` only renders its panel when open; one open at a time (Headless UI) — area: perf
- [2026-06-18] [Designer] **Post-rule refetch could disorient (rows shifting)** — likelihood: low — impact: low — mitigation: the counted success names what changed; the refetch keeps newest-first ordering — area: ux

### Issues
- [2026-06-18] [Designer] **Filtered-view edge: correcting a row out of the active category filter** — severity: low — owner: Engineer — status: open — after a move that no longer matches the category filter, the row should drop on refetch; confirm the reconcile handles it (don't leave a stale row).
