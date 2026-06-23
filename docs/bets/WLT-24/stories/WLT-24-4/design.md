# Design: WLT-24-4 — Longer cadences + "last charged"

## Design intent

Make the Subscriptions list tell the truth about *real* billing — not just the tidy weekly/monthly/yearly cases. Two quiet additions: recognize the multi-month cycles people actually get billed on (so a quarterly charge stops vanishing), and show **when each subscription last charged** plus a soft nudge when one looks like it stopped — so the user can spot a dead subscription without hunting through transactions. Same calm register; everything is derived, labelled honestly, and never alarming.

## Surfaces & flow

No new surface — two row-level additions on `/subscriptions`:

1. **Longer cadences.** A series billed every ~2 / 3 / 6 months now reads "Billed **every 3 months**" (etc.) with a correct monthly-equivalent ($49.99 / 3 ≈ $16.66/mo) that counts toward the headline — instead of being dropped as irregular. The cadence column already exists; it just speaks more languages.
2. **Last charged + inactive hint.** Each row shows **"Last charged {Mon D, YYYY}"**. When a series is overdue versus its own cadence (e.g. a monthly sub not seen for 2+ months), it carries a muted **"may have ended"** tag and is **dropped from the headline total** (it's not currently charging) — but stays listed so the user can confirm/curate.

Flow: the user opens Subscriptions → sees every real recurring charge (including quarterly), each with its last-charged date → an overdue one is visibly flagged "may have ended" and not inflating the total → the user knows at a glance which subs are live and which to cancel/clean up.

## States (every state ships)

| State | Behavior |
|---|---|
| **Longer-cadence series (resting)** | "Billed every 2/3/6 months" with the normalized monthly figure; counts in the headline like any confidently-inferred cadence. |
| **Active series** | "Last charged {date}" in a muted meta line; no inactive tag; counts in the headline. |
| **Inactive / may-have-ended** | The muted **"may have ended — not charged since {date}"** tag; **excluded from the headline**; row stays visible (never auto-removed). |
| **Pending (1 occurrence)** | Unchanged — `pending`, no cadence + no inactive assessment (no interval to judge). |
| **Irregular** | Unchanged — a genuinely irregular multi-month merchant stays `irregular`, excluded from the headline. |

## The honesty contract (carried + extended)

- **We only assert a cadence we can infer** — the new bands are tolerant but bounded; an interval that doesn't fit a clean multiple stays `irregular`, not force-fit to "quarterly."
- **The headline = what's actively charging you** — a likely-ended subscription is shown (so you can act) but not counted, so the running total never includes money you may no longer be paying.
- **"May have ended" is a soft hint, never a verdict** — it's based on being overdue vs. the sub's own rhythm, with grace; nothing is removed or hidden, and a late-but-alive sub simply un-flags when its next charge lands.

## Accessibility

- The cadence label, the last-charged date, and the inactive state are **text** (not colour-only) and folded into the row's existing accessible name — e.g. "Sony PlayStation, $49.99, billed every 3 months, last charged June 1 2026" / "…, may have ended, not charged since January 2026".
- The "may have ended" tag is part of the row's accessible name, not a bare icon.

## Honest / reduced-design notes

- **No new column** — last-charged + the inactive tag live in the existing cadence/meta cell (muted), keeping the row uncluttered.
- **No cancel button / reminder this slice** — we surface "looks ended"; acting on it (cancel flows, notifications) is out of scope.
- **No invented precision** — "every 3 months", not "every 91 days"; the human-scale cadence is what matters.
- The inactive grace factor is an internal constant, never user-facing copy.

## DRI Log

### Decisions
- [2026-06-23] [Designer] **Last-charged + inactive tag in the muted meta line, not a new column** — rationale: keeps the dense row calm; the date/tag are secondary signals, not primary data — area: design — alternatives: a dedicated "Last charged" column (more width, more chrome) — reversibility: easy
- [2026-06-23] [Designer] **Inactive rows shown but excluded from the headline** — rationale: completeness (the user sees the maybe-dead sub to act on it) without dishonesty (a sub that stopped charging isn't a current cost) — area: design/trust — alternatives: hide inactive (opaque), keep in total (inflates) — reversibility: easy
- [2026-06-23] [Designer] **Human-scale cadence copy ("every 3 months")** — rationale: matches the existing "every month/week/year" register; "every 91 days" is machine-speak — area: copy/ux — reversibility: easy

### Risks
- [2026-06-23] [Designer] **The "may have ended" tag worries a user whose sub is merely late** — likelihood: low — impact: low — mitigation: soft wording + grace in the threshold + the row stays and un-flags on the next charge — area: design

### Issues
- _none_
