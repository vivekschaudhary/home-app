# Copy: WLT-25-2 — Done follow-ups + re-open

## Voice and tone

Unchanged — plain, calm, in-control. "Open" and "Done" are the two states of the user's own follow-ups; "Re-open" undoes a "Done" without fuss or destruction. Never imply anything was deleted or acted on — the charge stays; only the flag's state changes.

## Strings

### The Open / Done toggle (on the Follow-ups filter)
- **toggleOpen:** `Open`
- **toggleDone:** `Done`

### The Done state
- **doneIndicator:** `Done` _(the muted tag on a resolved row in the Done view)_
- **reopenAction:** `Re-open` _(the row popover action on a Done row)_
- **reopenedToast:** `Re-opened`
- **emptyDoneTitle:** `Nothing resolved yet`
- **emptyDoneBody:** `Follow-ups you mark done will show here — so you can look back, or re-open one if it still needs you.`

### Errors (reuse WLT-25-1)
- **error / errorNetwork / errorInvalid / retry / saving** — reuse the `followups` strings from WLT-25-1.

### Accessibility labels
- **toggleA11y:** `Show open or done follow-ups`
- **reopenA11y:** `Re-open {merchant} follow-up`
- **doneIndicatorA11y:** `Follow-up resolved`

## Terminology consistency
- **"Open" / "Done"** — the two states, used on the toggle, the indicator, and the empty copy; consistent with the WLT-25-1 "Done" action that resolves a follow-up.
- **"Re-open"** — undo a resolution (back to Open); not "restore"/"undelete" (nothing was deleted) — the follow-up was only resolved.
- **"Follow-up"** — the same noun throughout (open or done); the charge is never called anything new.
- Money + merchant names via the ledger's existing formatters.

## DRI Log

### Decisions
- [2026-06-23] [UX Writer] **"Open / Done" + "Re-open"** — rationale: the plainest two-state vocabulary; "Re-open" reads as the natural inverse of "Done" and signals reversibility without implying deletion — area: copy — reversibility: easy

### Risks
- _none_

### Issues
- _none_
