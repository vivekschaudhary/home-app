# Copy: WLT-25-1 — Flag a charge to follow up on

## Voice and tone

Plain, useful, quietly in-control. A follow-up is the user's own bookmark on a charge — no alarm, no judgment. "Follow up" (verb the user thinks in) and "Done" (handled). Never imply we act on the charge, dispute it, or move money — we only flag + resolve. Same register as the Transactions ledger and Subscriptions. "Done" / "Remove" never implies destruction — the charge stays in their history; we just clear the flag.

## Strings

### The flag / resolve action (in the WLT-23 ledger row popover)
- **flagAction:** `Follow up`
- **resolveAction:** `Done`
- **indicator:** `Follow up` _(the small tag on a flagged ledger row)_
- **saving:** `Saving…`
- **flaggedToast:** `Flagged to follow up`
- **resolvedToast:** `Marked done`
- **error:** `We couldn't save that just now — try again.`
- **errorNetwork:** `You appear to be offline — try again when you're back.`
- **errorInvalid:** `That didn't go through — give it another try.`
- **retry:** `Try again`

### The "Follow-ups" filter (on the ledger)
- **filterLabel:** `Follow-ups`
- **filterHint:** `Charges you've flagged to come back to`
- **emptyTitle:** `Nothing to follow up on`
- **emptyBody:** `Spot a charge you need to deal with — one you don't recognize, a possible double, something to return — and flag it to follow up. It'll show here.`

### Accessibility labels
- **flagA11y:** `Flag {merchant} to follow up`
- **resolveA11y:** `Mark {merchant} follow-up done`
- **indicatorA11y:** `Flagged to follow up`
- **filterA11y:** `Show only charges flagged to follow up`

## Terminology consistency
- **"Follow up"** — the verb everywhere (the action, the indicator, the filter); the user's mental action is "I'll come back to this." Not "flag"/"bookmark"/"tag" in user-facing copy (flagging is the internal model).
- **"Done"** — resolving a follow-up (handled); not "delete"/"remove" — the charge stays, the flag is cleared. (The Done/history list is the next slice; this slice's "Done" just clears it from Open.)
- **"Follow-ups"** — the noun for the set; the filter and any future view use the same word.
- Money via the app's currency formatter; merchant names as shown elsewhere in the ledger.

## DRI Log

### Decisions
- [2026-06-23] [UX Writer] **"Follow up" / "Done", not "flag"/"delete"** — rationale: "follow up" matches the user's intent ("come back to this"); "done" signals handled + reversible (nothing destroyed) — area: copy — reversibility: easy
- [2026-06-23] [UX Writer] **No language implying we act on the charge** — rationale: we only let the user bookmark + resolve; implying dispute/cancellation would over-promise — area: copy/trust — reversibility: easy

### Risks
- _none_

### Issues
- _none_
