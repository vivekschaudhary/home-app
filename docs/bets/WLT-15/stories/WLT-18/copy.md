---
bet: WLT-15
story: WLT-18
author: UX Writer
created: 2026-06-15
---

> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-18 — Anomalies ("something worth your attention")

## Voice and tone

Calm, plain, **never alarming**. An anomaly is *informational* — "worth a look," the user decides if it matters. No "Alert", "Warning", "Suspicious", no urgency language, no color-as-meaning. Amounts + humanized category + date only — **never the merchant or description** (no PII). Money locale-formatted via the shared formatter; copy carries the slot.

## Strings

| Location / ID | Final copy | Rationale |
|---|---|---|
| `anomaly.heading` | Worth a look | Informational, not an alarm |
| `anomaly.largeCharge` | A larger-than-usual charge: {amount} in {category} on {date}. | Plain statement; amount+category+date, no merchant |
| `anomaly.recurring` | A bill looks due soon: about {amount} for {category}. | Heads-up, not a demand |
| `anomaly.lowBalance` | One of your accounts is running low: {amount}. | Plain, no account name/number |
| `anomaly.reviewCta` | Review it | The one (WAWU) action — engaged decision |
| `anomaly.dismissCta` | Dismiss | The quiet escape; always available |
| `anomaly.reviewing` | Saving… | aria-live during the review/dismiss write |
| `anomaly.acked` | Thanks — noted. | Quiet confirmation after Review it (focus lands) |
| `anomaly.dismissed` | Dismissed. | Quiet confirmation after Dismiss |
| `anomalyErrors.network` | Connection lost — check your internet and try again. | Discriminated: network (reused) |
| `anomalyErrors.save` | Couldn't save that just now — try again. | Discriminated: save |
| `anomalyErrors.server` | Something went wrong on our side — your information is safe. Try again in a minute. | Discriminated: server (reused) |
| `anomalyA11y.callout` | Worth a look: {summary} | SR label for the callout |
| `anomalyA11y.acked` | Noted. We'll keep an eye out. | aria-live success |

## Terminology consistency

- **"Worth a look"** — the anomaly framing; never "Alert", "Warning", "Issue", "Problem".
- **"A larger-than-usual charge"** — relative to the user's own history; never "fraud", "suspicious", "unauthorized" (we don't make that claim).
- **"Review it" / "Dismiss"** — the two controls; review = engage, dismiss = quiet. Never "Resolve", "Acknowledge alert".
- Amounts + **humanized category** (the WLT-17 helper) + date only — never merchant/description/account number.

## DRI Log

### Decisions
- [2026-06-15] [UX Writer] **"Worth a look" not "Alert/Warning"** — rationale: precision-trust; a calm informational frame; the user judges relevance — area: tone
- [2026-06-15] [UX Writer] **No "fraud/suspicious/unauthorized" language** — rationale: we detect *unusual vs the user's own history*, not fraud; over-claiming would be dishonest + alarming — area: trust
- [2026-06-15] [UX Writer] **Amount + category + date only; no merchant** — rationale: no PII in the surface/event, consistent with the recap's data posture — area: security

### Risks
- [2026-06-15] [UX Writer] **{amount}/{date} interpolation** must be locale-formatted; category humanized — likelihood: low — impact: low — mitigation: shared formatter + the WLT-17 humanize helper — area: i18n

### Issues
- _none_
