# Design: WLT-24-1 — Subscriptions (mark a recurring charge, see the monthly weight)

## Design intent

Make the **quiet weight of recurring spend visible** with the lightest possible touch. The user marks a charge they recognize as recurring from the place they already see their transactions (the WLT-23 ledger), and a dedicated surface adds it up — "here's what auto-bills you, and together it's $X/month." Honest by default: we only assert a cadence/total we can infer from real history; everything else is labelled plainly, never guessed. Same calm, in-control register as the rest of the app (carries the WLT-22/23 honesty contract — shown numbers are real, empty states say so).

## Surfaces & flow

Two surfaces:

1. **The mark affordance — on the WLT-23 ledger row.** The row's existing in-row popover (the reused `CategoryPicker` path) gains a **"Mark as subscription"** action; for an already-marked row it reads **"Unmark"** (★/removed). One tap, no new control, no new ceremony — the natural "I recognize this recurring merchant" moment. On success the row shows a subtle subscription indicator (a small ★/"Subscription" tag).

2. **The Subscriptions surface — `/subscriptions` (the nav placeholder → live).** A headline + a list:
   - **Headline:** "**$X / month** · $Y / year in subscriptions" — the normalized total of confidently-inferred subscriptions.
   - **List:** one row per subscription merchant — **merchant · typical amount · cadence · monthly-equivalent** — sorted by monthly-equivalent (desc). A `pending`/`irregular` row shows its amount + a muted "cadence pending" / "irregular" label and a note that it's not in the headline yet.
   - Each row can unmark (removing it live) and could drill to its underlying charges (reusing the ledger/drill pattern — optional this slice).

Flow: ledger → mark a recurring charge → it appears on /subscriptions with its cadence + amount → the headline total updates → the user reviews/curates (unmark mistakes).

## States (every state ships)

| State | Behavior |
|---|---|
| **Loading** | The Subscriptions view's standard load (no bespoke spinner ceremony). |
| **Empty (no marks)** | An honest nudge: "Nothing marked yet — mark a recurring charge from your transactions," linking to the ledger. Never fake rows. |
| **Resting (has subscriptions)** | Headline total + the sorted list; each row merchant · amount · cadence · monthly-equiv. |
| **Cadence pending / irregular** | The row renders with its amount + a muted "cadence pending" (1 occurrence) or "irregular" label; **excluded from the headline** with a one-line "not counted yet — needs another charge to confirm." |
| **Marking (saving)** | The ledger-row action shows `aria-busy`; the prior state holds until success (no optimistic revert). |
| **Mark / unmark success** | Toast: "Marked as a subscription" / "Removed from subscriptions"; the ledger row + the Subscriptions list reconcile. |
| **Mark error** | Discriminated (network / validation / server) inline message + Retry; the row stays in its prior state. |

## Layout & responsive

The Subscriptions list reuses the app's row/table layout (label · amount · meta), set under the headline. On narrow viewports it stacks (merchant + amount on top, cadence + monthly-equiv beneath). The headline is a simple prominent figure, not a chart (no new chart dep this slice). The mark affordance is an item in the existing ledger popover — no layout change to the ledger.

## The honesty contract (carried from WLT-22/23)

- The headline total counts **only** subscriptions with a confidently inferred cadence; pending/irregular ones are shown but plainly **not** in the number — the figure is never inflated by a guess.
- A subscription is **the user's own mark** — nothing is auto-added this slice (detection is the next story); the surface only ever reflects what the user marked.
- Marking is **reversible** (unmark) and **orthogonal** — it never moves the charge's category or its budget weight (it's still real spend).

## Accessibility

- The mark/unmark control has an explicit accessible name ("Mark {merchant} as a subscription" / "Remove {merchant} from subscriptions"), not a bare icon.
- Focus management is inherited from the reused WLT-23 popover (focus in on open, returns to trigger on close, Esc/click-away).
- The Subscriptions list is a semantic list/table; the headline total carries an accessible label ("$X per month, $Y per year, across N subscriptions"); cadence labels are text, not colour-only.

## Honest / reduced-design notes

- No new control, no modal, no confirm — marking is one reversible tap.
- No chart this slice — a prominent number + a list is enough; a spend-over-time chart can come with detection.
- No celebratory copy — this is a quiet utility ("here's your recurring spend"), not an achievement.
- Cadence/total are **derived, labelled, and conservative** — we'd rather say "cadence pending" than show a wrong monthly figure.

## DRI Log

### Decisions
- [2026-06-21] [Designer] **Mark from the ledger row's existing popover; no new control** — rationale: the lowest-friction path is the surface where the user already recognizes the merchant; reuse keeps the ledger uncluttered — area: ux — alternatives: a dedicated "add subscription" flow (rejected — heavier, off the recognition moment)
- [2026-06-21] [Designer] **Pending/irregular rows shown but visibly excluded from the headline** — rationale: completeness (the user sees everything they marked) without dishonesty (the number stays trustworthy) — area: design/trust — alternatives: hide pending rows (rejected — opaque), include them in the total (rejected — misleading)
- [2026-06-21] [Designer] **A prominent number + list, no chart this slice** — rationale: the headline weight is the value; a chart adds build + a dep for marginal slice-1 value — area: scope — alternatives: a spend-over-time chart (deferred to detection)

### Risks
- [2026-06-21] [Designer] **The subscription indicator clutters the dense ledger row** — likelihood: low — impact: low — mitigation: a small unobtrusive ★/tag, only on marked rows — area: design

### Issues
- _none_
