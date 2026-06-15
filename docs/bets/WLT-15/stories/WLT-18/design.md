---
bet: WLT-15
story: WLT-18
author: Designer
created: 2026-06-15
---

# Design: WLT-18 — Anomalies ("something worth your attention")

## Design intent

The recap's fourth and final signal — and the one with the highest trust stakes. It surfaces a **high-precision, dismissible** "something worth your attention" (an unusually large charge, a likely upcoming bill, a low balance) and turns it into the visit's **one prompted action** ("review it"). On a financial app a *wrong* alert is worse than no alert — so the bar is **precision over recall**: surface only what we're confident about, always let the user dismiss, never alarm. Tone stays calm and plain; an anomaly is *informational*, framed as "worth a look," never "WARNING."

## Where it sits in the recap

The anomaly becomes the **top of the one-action ranking** when one is open — it outranks the target action (an unusual charge is more time-sensitive than "aim higher"). So the recap's single action becomes:

```
1. open anomaly        → "Review it"            (review/dismiss — the WAWU action)
2. behind target       → "Adjust your target"   (WLT-16)
3. on-track / ahead     → "Aim higher?"          (WLT-16)
```

The anomaly shows as a short, plain **callout at the top of the recap card** (above movement), with the one action attached:

```
┌ Since last time ───────────────────────────┐
│  ⚐ Worth a look                             │  ← the open anomaly (plain, not alarming)
│  A larger-than-usual charge: $480 at        │  ← amount + category, NO merchant string
│  Groceries on Jun 14.                        │
│  [ Review it ]   [ Dismiss ]                 │  ← review = the one action (WAWU); dismiss = quiet
│  ───────────────────────────                │
│  Up $420 since last week …                  │  ← movement / spending / progress below
└─────────────────────────────────────────────┘
```

When no anomaly is open, the card is exactly the WLT-16/17 surface (no empty "all clear" banner — silence is the absence of a problem).

## States (every state ships)

| State | Trigger | What shows |
|---|---|---|
| **open anomaly** | ≥1 anomaly with `status='open'` | the highest-severity one as a plain callout + **Review it** (the one action) + **Dismiss** |
| **reviewed / acted** | user taps Review it | anomaly → `acted`; a quiet "Thanks — noted" confirmation; recap remains; focus moves to it; **action_completed (WAWU)** |
| **dismissed** | user taps Dismiss | anomaly → `dismissed`; it disappears with no fuss; the next-highest open anomaly (if any) takes its place, else the card reverts to the target action |
| **none open** | no open anomalies | the WLT-16/17 recap exactly — no "all clear" noise |
| **cold-start** | scan hasn't run / no history | no anomaly section (the daily scan needs transaction history) |
| **error** | review/dismiss POST fails | discriminated banner on the callout; the action stays retryable; the anomaly stays open |

## Layout & tone notes

- **Plain, not alarming.** Heading "Worth a look" (not "Alert"/"Warning"); no red, no ⚠️; a muted marker at most. The user decides if it matters.
- **Amount + category + date only** — **never the merchant or description** (no PII in the surface, the event, or the anomaly row). "A larger-than-usual charge: $480 in Groceries on Jun 14."
- **Two actions, but still one *prompted* action.** "Review it" is the ranked WAWU action (a genuine engaged decision → an immutable run). "Dismiss" is a quiet status change (not a WAWU action — dismissing isn't "taking a financial action"). This keeps the at-most-one-*prompted*-action guardrail honest.
- **High-precision rules only** (engine, not UI): large-charge vs the user's own category baseline, likely-recurring/bill-due, low-balance. Conservative thresholds — under-surfacing is acceptable, false-positives are not.

## Accessibility

- The callout is a labelled region with an SR summary ("Worth a look: a larger-than-usual charge, $480 in Groceries on June 14"). Direction/severity in **words**, never color alone.
- **Review it** / **Dismiss** are keyboard-operable; on review, focus moves to the "noted" confirmation (`tabIndex=-1`); async via `aria-live="polite"`. WCAG AA; reduced-motion safe (static text). Dismiss does **not** require a confirm dialog (it's reversible-by-nature — the anomaly can resurface on a future scan if still true), but it announces "Dismissed."

## Honest / reduced-design notes

- **Real or absent.** Anomalies come only from the user's real transactions; if the scan finds nothing, nothing shows. No manufactured "insight."
- **Dismissible always.** The trust contract: the user can always make it go away, and we never nag.
- **Reconcile-on-load** (#36 lesson): open anomalies read live each visit; status changes persist via the route handler, never in RSC render.

## DRI Log

### Decisions
- [2026-06-15] [Designer] **Anomaly outranks the target action when open** — rationale: a time-sensitive "worth a look" matters more this visit than "aim higher"; still exactly one prompted action — area: UX — reversibility: easy
- [2026-06-15] [Designer] **"Review it" is the WAWU action; "Dismiss" is a quiet status change** — rationale: engaging with an anomaly is a real financial action; dismissing isn't — keeps WAWU honest + the guardrail intact — area: UX/metrics — reversibility: medium
- [2026-06-15] [Designer] **Plain "Worth a look", no alarm styling, amount+category+date only (no merchant)** — rationale: precision-trust + no-PII; a wrong/loud alert erodes the moat — area: trust/security — reversibility: easy

### Risks
- [2026-06-15] [Designer] **A false-positive anomaly erodes trust badly** — likelihood: medium — impact: high — mitigation: high-precision rules + conservative thresholds + always-dismissible + plain framing; the engine, not the UI, owns precision — area: trust

### Issues
- _none_
