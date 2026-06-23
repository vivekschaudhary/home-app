# Copy: WLT-24-4 — Longer cadences + "last charged"

## Voice and tone

Unchanged — plain, calm, honest. Cadence in human terms ("every 3 months", never "91 days"). The inactive hint is gentle and non-committal ("may have ended"), never an accusation or an instruction; the user decides. No alarm about a quarterly charge being "found"; it just shows up correctly.

## Strings

### Cadence labels (new — extend the WLT-24-1 set)
- **cadenceBiMonthly:** `every 2 months`
- **cadenceQuarterly:** `every 3 months`
- **cadenceSemiAnnual:** `every 6 months`
- _(existing, reused: `every week` / `every month` / `every year` / `irregular` / `cadence pending`)_

### Last charged + inactive
- **lastCharged:** `Last charged {date}` _(date = "Mon D, YYYY", e.g. "Jun 1, 2026")_
- **inactiveTag:** `May have ended`
- **inactiveNote:** `Not charged since {date} — may have ended.`

### Accessibility
- **rowA11y (existing — now also carries cadence + last-charged):** `{merchant}, {amount}, billed {cadence}, {monthly} per month, last charged {date}`
- **rowDetectedA11y (existing — auto rows):** `{merchant}, {amount}, billed {cadence}, detected automatically, last charged {date}`
- **rowInactiveA11y:** `{merchant}, {amount}, billed {cadence}, may have ended, not charged since {date}`

## Terminology consistency
- **"every 2 / 3 / 6 months"** — the same "every {period}" frame as the existing weekly/monthly/yearly labels; never raw day counts or "quarterly/bi-monthly" jargon in user copy.
- **"Last charged {date}"** — one phrase, on every row; plain date format consistent with the ledger.
- **"May have ended"** — soft + reversible language (not "expired"/"cancelled"/"inactive subscription" as a hard claim); pairs with "not charged since {date}" so the user sees the evidence.
- **"per month"** figures continue to drive the headline; a longer-cadence sub contributes its normalized monthly-equivalent (e.g. $49.99 every 3 months → ~$16.66/month), consistent with how weekly/annual already normalize.
- Money via the app's currency formatter; dates via the app's date format.

## DRI Log

### Decisions
- [2026-06-23] [UX Writer] **"every 3 months" not "quarterly"/"91 days"** — rationale: matches the existing plain "every {period}" cadence language; jargon and raw day-counts both read as machine output — area: copy — reversibility: easy
- [2026-06-23] [UX Writer] **"May have ended" + "not charged since {date}"** — rationale: soft, evidence-based, reversible — it informs without alarming or asserting a cancellation we can't confirm — area: copy/trust — reversibility: easy

### Risks
- _none_

### Issues
- _none_
