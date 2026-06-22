# Design: WLT-24-2 — Auto-detect subscriptions (I stay in control)

## Design intent

Turn the manual-first surface into a **self-populating** one without losing the user's sense of control. They open Subscriptions and their recurring charges are **already found** — but every auto-mark is **legible as a suggestion**, not a silent fact, and **one tap away from "no."** The register is the same calm utility as WLT-24-1: no alarm, no "we found waste!", no celebration — just "here's what looks recurring; correct us if we're wrong." The detector is deliberately **conservative**: it would rather miss a subscription than wrongly assert one (a false positive is the trust-killer). The inverse of the empty-panel scare — a row the user didn't mark must never look like a bug; the **"detected" tag** is what makes it read as intentional.

## Surfaces & flow

No new surface — detection enriches the two WLT-24-1 surfaces:

1. **The Subscriptions surface (`/subscriptions`).** Auto-detected subscriptions appear in the same list as user-marked ones, each carrying a **subtle "detected" tag** (a muted affix next to the cadence, in the register of the existing "cadence pending" note). Above the list, when there are auto-detected subscriptions the user hasn't acknowledged, a **quiet, dismissible review nudge**: "We found N recurring charges — review them below." It is a single calm line (not a modal, not a blocking step) that simply draws the eye to the new rows. Acknowledging/dismissing the nudge is local; **dismissing a subscription** is the existing per-row unmark — now durable (the detector won't bring it back).

2. **The ledger ★ (optional, consistency).** A detected charge carries the same ★ a marked one does; for parity it may show the same "detected" affix in its popover. The mark/unmark control is unchanged.

Flow: sync (or first visit) detects recurring merchants → they appear on /subscriptions tagged "detected" with the review nudge → the user skims, keeps the right ones, **dismisses the wrong ones (durably)** → the headline total reflects their curated set. A dismissed merchant never returns; a kept one behaves exactly like a hand-marked subscription.

## States (every state ships)

| State | Behavior |
|---|---|
| **Detecting** | The page-RSC detect run is a normal server read — no bespoke spinner; the list renders with whatever was detected. The sync-step run is invisible (background). |
| **No candidates** | A clean no-op — the WLT-24-1 empty state ("No subscriptions marked yet") is unchanged; no nudge, no fake rows. |
| **Detected rows present** | Auto rows render in the list with a muted **"detected"** tag; user-marked rows are untagged. Sorting/headline rules are unchanged (only confidently-inferred cadences count). |
| **Review nudge (present)** | A single quiet line above the list: "We found N recurring charges — review them below," with a dismiss control. Shown only while un-acknowledged auto subs exist. |
| **Review nudge (dismissed)** | The line is gone; the detected rows remain (acknowledging the nudge ≠ dismissing the subscriptions). |
| **Dismiss a subscription (saving / success / error)** | The existing WLT-24-1 unmark control: `aria-busy` → "Removed from subscriptions" toast → the row leaves the list; discriminated error + retry. Now a **soft-delete** under the hood (durable), but the user-visible behaviour is identical. |
| **Re-mark a dismissed merchant** | Marking it again (from the ledger) restores it as a user subscription; it survives subsequent detect runs (the user's choice wins). |

## The honesty / control contract (carried + extended)

- **Detection is a suggestion, shown as one.** Every auto-mark is tagged "detected" — the user always knows what they marked vs. what we inferred. Nothing is hidden and nothing is asserted silently.
- **"No" is durable.** Dismissing an auto-detected subscription is permanent — the detector never re-adds it. This is the load-bearing trust property (the [providers-signal-human-decides] posture: the signal defaults, the human decides, the decision sticks).
- **Conservative by construction.** Only merchants with enough regular, stable charges are detected; a variable or sparse merchant is left alone. We under-detect on purpose.
- **Still orthogonal.** Auto-detection never moves a charge's category or its budget weight — a detected subscription is still real spend, counted there independently.

## Accessibility

- The **"detected" tag** is text (not colour-only); it reads as part of the row's accessible name (e.g. "{merchant}, {amount}, billed monthly, detected").
- The **review nudge** is a polite live region (announced when it appears), with a clearly-labelled dismiss control; dismissing returns focus sensibly to the list.
- The unmark/dismiss control keeps its WLT-24-1 accessible name ("Remove {merchant} from subscriptions") and focus management.

## Honest / reduced-design notes

- No modal, no onboarding tour, no "review wizard" — the nudge is one line and the rows are self-explanatory with their tag.
- No "confidence %" shown to the user — the confidence score is an internal gate; surfacing it would invite second-guessing a calm utility. (The tag says "detected," not "73% sure.")
- No bulk "accept all / reject all" this slice — per-row dismiss is enough at the operator's scale; revisit if detected counts are large.
- The tag and nudge are quiet by default — detection should feel like the surface was simply *helpful*, not like a notification center.

## DRI Log

### Decisions
- [2026-06-22] [Designer] **A "detected" tag on every auto-marked row, not silent insertion** — rationale: a row the user didn't mark must read as an intentional suggestion, never a bug (the inverse of the empty-panel scare); legibility is the trust mechanism — area: design/trust — alternatives: insert auto rows indistinguishably (rejected — looks like a glitch, invites "why is this here?") — reversibility: easy
- [2026-06-22] [Designer] **A single quiet, dismissible review nudge — not a modal or a wizard** — rationale: draw the eye to new detections without a blocking ceremony; matches the WLT-22-5 nudge register — area: ux — alternatives: a review modal (rejected — heavy, alarming), no nudge (rejected — detections could go unnoticed) — reversibility: easy
- [2026-06-22] [Designer] **Don't surface the confidence score to the user** — rationale: a calm utility shouldn't invite the user to litigate a percentage; "detected" + one-tap dismiss is the right level of agency — area: design — alternatives: show "73% sure" (rejected — anxious, over-explained) — reversibility: easy

### Risks
- [2026-06-22] [Designer] **The "detected" tag clutters an already-dense row** — likelihood: low — impact: low — mitigation: a small muted affix in the existing cadence/meta slot, only on auto rows — area: design

### Issues
- _none_
