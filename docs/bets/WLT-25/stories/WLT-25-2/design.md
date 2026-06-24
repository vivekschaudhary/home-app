# Design: WLT-25-2 — Done follow-ups + re-open

## Design intent

Close the loop the user started in WLT-25-1: they flagged charges to deal with, handled some, and now want to **see what they've handled** — and **undo** a "Done" if it turns out it still needs them. Same calm register: a follow-up is a personal bookmark; "Done" is just the bookmark resolved, kept quietly in case you need it back. Nothing destructive, nothing orthogonality-breaking.

## Surfaces & flow

No new surface — two additions to the WLT-25-1 ledger:

1. **An Open / Done toggle on the "Follow-ups" filter.** When the Follow-ups filter is on, a small segmented **Open | Done** control appears (default **Open**, the WLT-25-1 behavior). **Done** filters the ledger to the follow-ups you've resolved — your handled history.
2. **Re-open from a Done row.** A resolved row's popover offers **"Re-open"** → the charge returns to Open (and drops out of the Done list). Re-open is the same one-tap gesture as flagging; it just clears the resolution.

Flow: flag charges (25-1) → handle them, mark Done → switch the toggle to **Done** to review what you've handled → if one resurfaces, **Re-open** it and it's back in your Open list.

## States (every state ships)

| State | Behavior |
|---|---|
| **Open (default)** | The WLT-25-1 behavior — open follow-ups, amber ⚑ indicator, "Done" action. |
| **Done** | The resolved follow-ups, shown with a muted "Done" treatment (not the active amber ⚑); each row's popover offers **"Re-open"**. |
| **Empty Done** | "Nothing resolved yet — follow-ups you mark done will show here." Never fake rows. |
| **Re-open (saving / success / error)** | `aria-busy` on the action → "Re-opened" toast → the row leaves the Done list (it's Open now); discriminated error + retry; no optimistic revert. |

## The honesty / orthogonality contract (carried)

- **Done is opt-in and non-destructive** — resolving a follow-up keeps it (soft-delete); the Done view is just that history, and re-open restores it. Nothing is ever deleted.
- **Still orthogonal** — the Done read and re-open touch only the follow-up flag; a charge's category, budget, spend, and subscription state are untouched.
- **Per-charge** — re-open affects the one charge, never the merchant.

## Accessibility

- The **Open / Done** toggle is a labelled segmented control (e.g. `role="group"` with two pressed-state buttons, or a select) with a clear current selection announced.
- The **Re-open** control has an explicit accessible name ("Re-open {merchant} follow-up"); focus management inherited from the reused WLT-23 popover.
- The done indicator/treatment is text/labelled ("Done"), not colour-only.

## Honest / reduced-design notes

- No new nav surface — a toggle on the existing filter keeps the whole follow-up loop in one place.
- No bulk re-open / clear-all-done this slice — per-row is enough at the operator's scale; a "clear done" is a clean fast-follow.
- The Done treatment is muted (resolved, in the background) vs the active amber ⚑ — so Open vs Done reads at a glance without shouting.

## DRI Log

### Decisions
- [2026-06-23] [Designer] **An Open/Done segmented toggle on the existing filter** — rationale: the resolved set is the same ledger filtered differently; a toggle is the lightest way to give "what have I handled" without a new surface — area: ux — alternatives: a dedicated Done page (deferred) — reversibility: easy
- [2026-06-23] [Designer] **Muted "Done" treatment vs the active amber ⚑** — rationale: resolved items should recede, not compete with open ones; the contrast reads Open-vs-Done at a glance — area: design — reversibility: easy

### Risks
- [2026-06-23] [Designer] **A user can't tell Open from Done at a glance** — likelihood: low — impact: low — mitigation: the toggle names the current set + the muted vs amber treatment + the "Done"/"Re-open" action wording — area: design

### Issues
- _none_
