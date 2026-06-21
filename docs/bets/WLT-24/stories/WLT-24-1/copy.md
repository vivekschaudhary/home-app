# Copy: WLT-24-1 — Subscriptions (mark a recurring charge, see the monthly weight)

## Voice and tone

Plain, useful, quietly reassuring. This is a utility that makes recurring spend visible — no alarm ("you're wasting money!"), no judgment, no celebration. Name things honestly: a derived cadence is "every month"; an unconfirmed one is "cadence pending," not a fake number. Same register as Budget & Spending and the Transactions ledger. Never imply we cancel anything or moved the user's money — we only mark + total.

## Strings

### Nav + page
- **navLabel:** `Subscriptions` _(already in nav; the "Coming soon" tag is removed)_
- **title:** `Subscriptions`
- **subtitle:** `The recurring charges you've marked — and what they add up to.`

### The headline total
- **headline:** `{monthly} / month · {annual} / year`
- **headlineA11y:** `{monthly} per month, {annual} per year, across {count} subscriptions`
- **headlineEmpty:** _(no headline shown in the empty state)_

### The list
- **colMerchant:** `Subscription`
- **colAmount:** `Typical amount`
- **colCadence:** `Billed`
- **colMonthly:** `Per month`
- **cadenceMonthly:** `every month`
- **cadenceWeekly:** `every week`
- **cadenceAnnual:** `every year`
- **cadenceIrregular:** `irregular`
- **cadencePending:** `cadence pending`
- **pendingNote:** `Not counted yet — needs another charge to confirm.`

### Mark / unmark (in the WLT-23 ledger row popover)
- **markAction:** `Mark as a subscription`
- **unmarkAction:** `Remove from subscriptions`
- **markIndicator:** `Subscription` _(the small tag/★ on a marked ledger row)_
- **saving:** `Saving…`
- **markedToast:** `Marked as a subscription`
- **unmarkedToast:** `Removed from subscriptions`
- **error:** `We couldn't save that just now — try again.`
- **errorNetwork:** `You appear to be offline — try again when you're back.`
- **errorInvalid:** `That didn't go through — give it another try.`
- **retry:** `Try again`

### Empty state
- **emptyTitle:** `No subscriptions marked yet`
- **emptyBody:** `Spot a recurring charge in your transactions — a streaming service, a gym, a SaaS tool — and mark it as a subscription to see what it all adds up to.`
- **emptyCta:** `Go to transactions`

### Accessibility labels
- **markA11y:** `Mark {merchant} as a subscription`
- **unmarkA11y:** `Remove {merchant} from subscriptions`
- **listA11y:** `Your subscriptions`
- **rowA11y:** `{merchant}, {amount}, billed {cadence}, {monthly} per month`

## Terminology consistency
- **"Subscription"** — one word for any recurring charge the user marks; the same word in the nav, the page, the mark action, and the row tag.
- **"Mark / Remove from subscriptions"** — the action verbs; "mark" (not "tag"/"flag" in user-facing copy) — flagging is the internal model, "mark" is the user's mental action. "Remove from subscriptions" (not "delete") — it's reversible and nothing is destroyed.
- **"Billed every month/week/year"** — plain cadence language, never "MONTHLY" enum strings; **"cadence pending"** for an unconfirmed one (honest, not a guess).
- **"Per month / per year"** — the normalized figures; the headline always shows both so the annual weight (the surprising number) is visible.
- Money via the app's currency formatter; merchant names as shown elsewhere (`humanizeCategory`-style for any provider strings, but subscriptions key off the real merchant name).

## DRI Log

### Decisions
- [2026-06-21] [UX Writer] **"cadence pending" + an explicit "not counted yet" note, never a guessed number** — rationale: the headline must stay trustworthy; honesty about what we don't yet know is the whole product's posture — area: copy/trust — reversibility: easy
- [2026-06-21] [UX Writer] **"Mark / Remove from subscriptions" (not "tag"/"delete")** — rationale: "mark" matches the user's mental action and "remove" signals reversibility (nothing is destroyed; the charge stays in their history) — area: copy — reversibility: easy
- [2026-06-21] [UX Writer] **Headline always shows BOTH per-month and per-year** — rationale: the annualized figure is the surprising, behaviour-changing number ("$14/mo" feels small; "$168/yr" lands) — area: copy/ux — reversibility: easy

### Risks
- _none_

### Issues
- _none_
