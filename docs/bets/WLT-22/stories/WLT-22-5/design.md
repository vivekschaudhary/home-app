# Design: WLT-22-5 — Transfers & payments don't count as spending

## Design intent

Make the budget **honest by default** without making the user work for it. Transfers and card payments are set aside automatically into one **visible, trustworthy** bucket — the user can see exactly what was excluded and why, and correct it in one tap. The opposite of a hidden flag: nothing about the user's money disappears silently. Same plain, in-control register as the rest of Budget & Spending (carries the WLT-22-1/2 honesty contract: what's shown reconciles to what's counted).

## Surfaces & flow

Single surface — the existing **/budget** view. Three additions:

1. **The "Transfers & Payments" group** — a distinct, clearly-labelled block, **visually separated below the budgetable category rows** (a divider + a muted "Not counted as spending" caption). It shows the group's total (so the user sees the magnitude that was set aside) but the total is **excluded** from every spend number above it. It drills (reusing the WLT-22-1 drill-down) to its line items.
2. **The review nudge** — a dismissible inline banner at the top of the budget view the first time transfers are set aside: "We set aside N transfers & payments so they don't inflate your spending." With a "Review" affordance that scrolls to / opens the group, and a dismiss (×).
3. **The move control** — on any line item (in the drill-down), the existing WLT-22-2 category picker gains the protected category as an explicit destination ("Move to Transfers & Payments — exclude from spending"), and items already in the group offer "This is spending → move to a category." A `'user'` move wins permanently.

Flow: load /budget → (first time) transfers auto-set-aside silently + nudge appears → user optionally reviews the group, drills it, and moves any mis-sorted item in/out → the spend numbers above reconcile live.

## States (every state ships)

| State | Behavior |
|---|---|
| **No transfers** | The protected group and the nudge **do not render** — an untouched/transfer-free user sees exactly today's budget view. |
| **Auto-seeding / assigning** | Idempotent + silent on load; no spinner of its own (rides the budget view's existing load). Never blocks render. |
| **Transfers set aside (resting)** | The "Transfers & Payments" group renders below the rows with its total + "Not counted as spending" caption; nudge shown until dismissed. |
| **Nudge dismissed** | Nudge gone; the (correct) exclusion + the group remain. Dismissal is sticky (doesn't re-nag every load). |
| **Moving an item (saving)** | The picker shows `Saving…`, `aria-busy`; prior state held until success (no optimistic revert). |
| **Move success** | Toast: "Moved to {category} — counts as spending again" / "Moved to Transfers & Payments — excluded from spending"; budget rows + group totals refetch and reconcile. |
| **Move error** | Discriminated (network / validation / server) inline message + Retry; the item stays where it was. |
| **Drill (group line items)** | Same drill-down list as a category row; Total = the group's set-aside sum. |

## Layout & responsive

The protected group reuses the budget-row layout (label · amount), set off by a divider and a muted caption — no new component shape. On narrow viewports it stacks like the existing rows. The nudge is a full-width inline banner above the table (not a modal — non-blocking), matching the app shell's banner treatment.

## The honesty contract (carried from WLT-22-1/2, extended)

- The numbers shown above the divider **count only spending**; the group below shows what was excluded and its sum — the two together account for **every** debit (nothing is hidden, nothing is fabricated).
- A drill total always equals its row/group total. Moving an item in/out shifts both sides live so they keep reconciling.
- Auto-assignment **never** overwrites a user's own choice — a transaction the user already categorized as spending is left counting.

## Accessibility

- The protected group has an accessible heading "Transfers & Payments, not counted as spending"; the caption is associated so screen readers announce the exclusion, not just the number.
- The move-picker reuses WLT-22-2's focus management: focus moves into the picker on open and returns to the trigger on close; Esc closes; Enter selects; options carry "(current)".
- The exclude/include action names state the effect ("exclude from spending" / "counts as spending again"), never a bare "Move".
- The nudge is keyboard-reachable, its Review + Dismiss are buttons (Enter/Space), and dismiss returns focus to a sensible anchor (the budget heading).

## Honest / reduced-design notes

- No modal, no blocking gate, no "are you sure?" — the change is reversible and the default is already correct; friction would be dishonest about how confident we are.
- No celebration/affirmation copy — this is a quiet correctness feature, not an achievement.
- We do **not** invent a new visual language for "excluded" — a divider + muted caption is enough; over-styling would imply these are scary/error rows when they're just not-spending.

## DRI Log

### Decisions
- [2026-06-20] [Designer] **The excluded total is shown, not hidden** — rationale: trust comes from the user seeing what was set aside and being able to drill it; a silent exclusion would feel like the app is fudging numbers — area: design/trust — alternatives: hide transfers entirely (rejected — opaque, can't audit)
- [2026-06-20] [Designer] **Below-the-rows group + divider, not a separate tab/page** — rationale: keeps the reconcile visible on one screen (spend above, excluded below = all debits) and reuses the row layout — area: design — alternatives: a separate "Excluded" page (rejected — hides the reconcile, adds navigation)
- [2026-06-20] [Designer] **Non-blocking dismissible nudge, sticky dismissal** — rationale: inform once, don't nag; the default is correct so the user never *must* act — area: ux — alternatives: a setup step before showing the budget (rejected — friction on a correct default, violates [[user-first-intent-first]])

### Risks
- [2026-06-20] [Designer] **The group could read as "errors" if over-styled** — likelihood: low — impact: low — mitigation: muted/neutral treatment, plain caption — area: design

### Issues
- _none_
