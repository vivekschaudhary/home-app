# Copy: WLT-24-2 — Auto-detect subscriptions (I stay in control)

## Voice and tone

Plain, helpful, never presumptuous. Detection is offered as a suggestion the user owns — "we found these, they look recurring" — not a claim ("you have 7 subscriptions"). No alarm, no judgment, no celebration. Honesty about confidence is structural, not verbal: we tag a row "detected" rather than narrate how sure we are. "Dismiss/Remove" never implies destruction — the charge stays in their history; we just stop calling it a subscription, **for good**. Same register as WLT-24-1 and Budget & Spending.

## Strings

### The "detected" tag (on an auto-marked row)
- **detectedTag:** `detected`
- **detectedTagA11y:** `detected automatically — review or remove`
- _(user-marked rows carry no tag; absence of the tag means "you marked this")_

### The review nudge (above the list, while un-acknowledged auto subs exist)
- **nudgeOne:** `We found 1 recurring charge — review it below.`
- **nudgeMany:** `We found {count} recurring charges — review them below.`
- **nudgeBody:** `We auto-marked these from your transaction history. Keep the ones that are right, remove any that aren't — your changes stick.`
- **nudgeDismiss:** `Got it`
- **nudgeDismissA11y:** `Dismiss this review note`

### Dismiss / remove (the existing WLT-24-1 unmark control — copy unchanged, behaviour now durable)
- **unmarkAction:** `Remove from subscriptions` _(reused)_
- **unmarkedToast:** `Removed from subscriptions` _(reused)_
- _(no new "are you sure?" — removal is one tap and, for a re-mark, fully reversible from the ledger)_

### Empty / no-candidates
- _(unchanged from WLT-24-1 — when nothing is marked or detected, the existing `emptyTitle` / `emptyBody` / `emptyCta` show; detection adds no new empty copy)_

### Accessibility labels
- **rowA11yDetected:** `{merchant}, {amount}, billed {cadence}, detected automatically`
- **nudgeRegionA11y:** `Subscription review`

## Terminology consistency
- **"detected"** — the one word for an auto-marked subscription, everywhere (the row tag, the a11y label, the nudge). Never "suggested", "guessed", "predicted", or "AI-found" — "detected" is plain and accurate (we observed a regular pattern in real history).
- **"We found …"** — the nudge frames detection as a helpful offer, first-person-plural, not an assertion about the user ("you have …").
- **"your changes stick" / durable removal** — the copy makes the load-bearing promise explicit: a removal is permanent (the detector won't re-add it). Never "delete" (nothing is destroyed).
- **"Remove from subscriptions"** — the same verb as WLT-24-1; detection changes the *behaviour* (durable), not the *word*.
- **No confidence language** — never "{n}% sure" / "high confidence" in user-facing copy; "detected" is the only confidence signal the user sees.
- Cadence language stays plain ("every month/week/year"), reused from WLT-24-1; money via the app's currency formatter; merchant names as shown elsewhere.

## DRI Log

### Decisions
- [2026-06-22] [UX Writer] **"detected", not "suggested"/"AI-found"/"predicted"** — rationale: plain and accurate (we observed a real recurring pattern), and it carries no anxious connotation; one consistent word across the tag, a11y, and nudge — area: copy — reversibility: easy
- [2026-06-22] [UX Writer] **The nudge promises durability ("your changes stick")** — rationale: the load-bearing trust property is that a removal is permanent; saying so out loud is what lets the user dismiss confidently — area: copy/trust — reversibility: easy
- [2026-06-22] [UX Writer] **No confidence percentage in any user string** — rationale: a calm utility shouldn't invite the user to argue with a number; "detected" + one-tap remove is the right level of agency — area: copy — reversibility: easy

### Risks
- _none_

### Issues
- _none_
