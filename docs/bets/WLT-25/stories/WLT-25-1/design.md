# Design: WLT-25-1 — Flag a charge to follow up on

## Design intent

Give the user a frictionless place to **park a charge they need to deal with later** — right where they see it, with one tap, and a simple way to come back to everything they've flagged. The register is the same calm, in-control utility as the rest of the ledger: a follow-up is a quiet personal bookmark on a transaction, not an alarm. Honest and reversible — flag it, see it under "Follow-ups," mark it done when handled. Nothing about the charge itself changes (its category, its budget weight, whether it's a subscription) — a follow-up is purely *your note to self* on top.

## Surfaces & flow

Two touch-points, both on the existing **Transactions ledger** (no new nav surface):

1. **The flag affordance — on the WLT-23 ledger row popover.** The row's existing in-row popover (the reused `CategoryPicker` `extraActions` slot — the same slot the subscription mark uses) gains a **"Follow up"** action; for an already-flagged row it reads **"Done"**. One tap, no new control. On success the row shows a small **"Follow up" indicator** (a tag/dot, visually distinct from the subscription ★ so the two overlays don't read as the same thing).
2. **The "Follow-ups" filter — on the ledger.** Beside the existing account/category filters (WLT-23-2), a **"Follow-ups"** toggle filters the ledger to the user's **open** flagged charges — "here's everything I still need to deal with." Composes with search + the other filters. (The **Done** list + re-open is the next slice.)

Flow: ledger → flag a charge → it gets the indicator → switch on the **Follow-ups** filter to see all open ones → handle one → mark **Done** → it drops from the open list. A follow-up is per-charge (not the merchant), so flagging one Netflix charge flags only that charge.

## States (every state ships)

| State | Behavior |
|---|---|
| **Loading** | The ledger's standard load (no bespoke spinner). |
| **Empty (Follow-ups filter, none open)** | An honest line: "Nothing to follow up on — flag a charge from your transactions." Never fake rows. |
| **Resting (has open follow-ups)** | The filtered ledger lists the open flagged charges; each row carries the "Follow up" indicator. |
| **Flagging / resolving (saving)** | The row action shows `aria-busy`; the prior state holds until success (no optimistic revert). |
| **Flag / Done success** | Toast: "Flagged to follow up" / "Marked done"; the row indicator + the Follow-ups list reconcile (a resolved row drops from the Open filter). |
| **Error** | Discriminated (network / validation / server) inline message + Retry; the row stays in its prior state. |

## Layout & responsive

The flag affordance is an item in the existing ledger popover — no layout change to the row. The indicator is a small tag/dot in the row (consistent placement with the subscription ★, distinct styling). The "Follow-ups" filter is a control in the existing filter row; on narrow viewports it stacks with the other filters as today.

## The honesty / orthogonality contract (carried from WLT-22/23/24)

- A follow-up is **the user's own bookmark** — nothing is auto-flagged; the surface only ever reflects what the user flagged.
- Flagging is **reversible** ("Done") and **orthogonal** — it never moves the charge's category, its budget weight, or its subscription state. A charge can be a subscription, categorized, and flagged to follow up, all at once, with no interaction between them.
- "Done" doesn't destroy anything — it resolves the flag (kept as history for the next slice's Done view).

## Accessibility

- The flag/resolve control has an explicit accessible name ("Flag {merchant} to follow up" / "Mark {merchant} follow-up done"), not a bare icon.
- Focus management is inherited from the reused WLT-23 popover (focus in on open, returns to trigger on close, Esc/click-away).
- The row indicator is text/labelled (e.g. an accessible "Follow up" label), not colour-only; the "Follow-ups" filter is a labelled toggle with a clear pressed state.

## Honest / reduced-design notes

- No new control, no modal, no confirm — flagging is one reversible tap, like marking a subscription.
- No new nav surface this slice — a filter on the ledger keeps the flag in context and reuses shipped plumbing.
- The indicator is **visually distinct from the subscription ★** so the two overlays are never confused (different icon/shape + label), but in the same quiet register.
- No due-date, no note, no reminder — a flag is a flag (those are explicit bet out-of-scope; fast-follows if demand shows).

## DRI Log

### Decisions
- [2026-06-23] [Designer] **Flag from the ledger row's existing popover; no new control** — rationale: the lowest-friction path is the surface where the user is already looking at the charge; reuse keeps the ledger uncluttered (the `extraActions` slot already carries the subscription mark) — area: ux — alternatives: a dedicated flag button/column (rejected — more chrome) — reversibility: easy
- [2026-06-23] [Designer] **A distinct indicator from the subscription ★** — rationale: two overlays on one row must be visually separable so neither is mistaken for the other; same calm register, different mark — area: design — alternatives: reuse the ★ (rejected — conflates two axes) — reversibility: easy
- [2026-06-23] [Designer] **"See all" as a ledger filter, not a new surface (this slice)** — rationale: keeps follow-ups in the ledger context + reuses WLT-23-2; a dedicated surface can come later — area: ux — alternatives: a dedicated Follow-ups page (deferred) — reversibility: easy

### Risks
- [2026-06-23] [Designer] **Two indicators (★ + follow-up) crowd a dense row** — likelihood: low — impact: low — mitigation: small, distinct marks, only shown when present; consistent placement — area: design

### Issues
- _none_
