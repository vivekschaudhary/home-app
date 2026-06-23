---
id: WLT-24-4
bet: WLT-24
type: story
status: ready
priority: P2
created: 2026-06-23
author: PM
design_link: docs/bets/WLT-24/stories/WLT-24-4/design.md
area_tags: [frontend, backend, data, detection]
dependencies:
  - WLT-24-2   # the detector + cadence inference this slice extends
  - WLT-24-3   # the per-price-series clustering each cadence is inferred within
---

# Make subscriptions reflect reality — longer cadences + "last charged"

## Description

Two dogfooding gaps on the Subscriptions surface, both about it matching real billing. **(1) Longer cadences:** the detector only knows weekly / monthly / annual, so a charge billed **every 2–3 months** is classified `irregular` and dropped — the operator's real **Sony PlayStation $49.99 every ~91 days (quarterly)** never appears, even though WLT-24-3 correctly isolates it as its own price series. We add **monthly-multiple cadences** (every-2-months, quarterly, semi-annual; annual already exists), each normalized to a monthly figure, so any regular multi-month sub is detected and counted. **(2) "Last charged" + an inactive hint:** a subscription that quietly stopped charging still shows as if active. Each row gains a **last-charged date** and, when a charge is overdue versus its own cadence, a quiet **"may have ended"** tag — so the user can spot a dead subscription at a glance (and a likely-ended one drops out of the headline so the running total stays honest). No schema change; the orthogonality invariant is untouched. See [WLT-24 architecture](../../architecture.md).

## Acceptance Criteria

- [ ] **AC1 — monthly-multiple cadences (pure, `@wealth/core/subscriptions.ts`):** extend `cadenceFromInterval` + `SubscriptionCadence` with **bi-monthly (~60d), quarterly (~90d), semi-annual (~180d)** bands (monthly multiples ≈ 30×N days, tolerant; non-overlapping, with `irregular` gaps between). `monthlyEquivalent` normalizes each (`/2`, `/3`, `/6`; weekly ×4.333, monthly ×1, annual /12). The detector's clean-cadence gate (b) now **accepts** these (still rejects `irregular`), so the real **Sony $49.99 quarterly (91-day intervals → $16.66/mo)** is detected. **Calibrate the bands against the operator's real intervals at build** (the 91-day quarterly case is the anchor).
- [ ] **AC2 — last-charged date (pure → view):** `SubscriptionRow` gains `lastChargedOn` (the latest occurrence's `occurredOn`); the Subscriptions row shows **"Last charged {Mon D, YYYY}"**. Pure + unit-tested; no new read (the dates are already in the marked txns the summary receives).
- [ ] **AC3 — inactive hint + honest headline (pure):** `summarizeSubscriptions` takes an `asOf` date (passed from the read layer — keeps it pure/testable). A series is **likely-inactive** when `asOf − lastChargedOn > medianInterval × OVERDUE_FACTOR` (a named constant, ~1.5–2). An inactive row renders a muted **"may have ended — not charged since {date}"** tag and is **excluded from the monthly/annual headline** (it's not a current cost) — consistent with how `pending`/`irregular` are listed-but-not-counted. The headline stays "what's actively charging you."
- [ ] **AC4 — copy + a11y:** cadence labels for the new bands ("every 2 months" / "every 3 months" / "every 6 months"); "Last charged {date}"; the inactive tag; all wired into the existing per-row a11y label so a screen reader hears cadence + last-charged + inactive state. Verbatim from the copy doc.
- [ ] **AC5 — orthogonality + no-schema preserved:** the change is pure compute + display only — no `transaction_flags` schema change, no migration, no category/budget coupling (the guard stays green). Detection precision is preserved: the amount-stability (CV) + occurrence gates are unchanged, so a wider cadence set does not admit variable spend (a multi-month-but-variable-amount merchant still fails the CV gate).

## Standard Experience Checklist

- [x] **Navigation** — no new surface; the existing Subscriptions tab — `n/a — no nav change`.
- [x] **States** — a detected longer-cadence row; a `pending`/`irregular` row (unchanged); an **inactive** row (new tag, excluded from headline); the WLT-24-2 detected tag + WLT-24-3 per-series rows all compose — AC1, AC2, AC3.
- [x] **Feedback** — last-charged date + the "may have ended" tag are the at-a-glance "is this still charging?" signal; the headline excludes inactive so the total is trustworthy — AC2, AC3.
- [x] **Accessibility** — cadence, last-charged, and inactive state are in the row's accessible name (text, not colour-only) — AC4.
- [x] **Edge cases** — a quarterly sub with slight date drift still lands in-band (AC1, calibrated to the 91-day real case); a single occurrence stays `pending` (no inactive assessment without an interval); a sub overdue by just under the factor is still active (boundary-tested); a genuinely irregular multi-month merchant stays `irregular` — AC1, AC3.
- [x] **Cross-surface consistency** — single web surface: `n/a — web only`. Orthogonality invariant preserved (AC5).

## Tech notes

Build on WLT-24-2 (cadence inference) + WLT-24-3 (price clustering — cadence is inferred per cluster, so a vendor's monthly $13.99 and quarterly $49.99 are independent series). Reuse, don't rebuild:
- **Cadence** is the existing `cadenceFromInterval` + `monthlyEquivalent` + the bands block in `@wealth/core/subscriptions.ts`; this slice adds bands + normalization factors. The detector gate (b) currently rejects only `irregular`; the new bands are accepted automatically once `cadenceFromInterval` returns them.
- **Last-charged** is already computed (`sorted[sorted.length-1].occurredOn`) — just surface it on `SubscriptionRow`.
- **Inactive** needs an `asOf` reference date threaded from the read/RSC (pure compute can't read the clock); reuse the median-interval already computed for cadence.
- **No new read, no schema, no migration.** The marked-txn read already carries `occurred_on`.
- **Out of scope:** using Plaid's "Subscription" category label as a detection signal (a future provider-signal option — noted, not built; the custom detector stays history-based); a "cancel reminder" / notification on an inactive sub; weekly-multiple (fortnightly) cadences unless the data shows them.

## PRs

_Auto-populated as PRs open._

## Tests

- **Engineer:** pure (`cadenceFromInterval` returns bi-monthly/quarterly/semi-annual at the band centers + boundaries + the `irregular` gaps; `monthlyEquivalent` normalization per cadence; **the real Sony case** — $49.99 at 91-day intervals → quarterly → $16.66/mo, detected; `summarizeSubscriptions` surfaces `lastChargedOn`; an overdue series is flagged inactive + excluded from the headline, a recent one is not; boundary at `OVERDUE_FACTOR`); component (a row shows the cadence + last-charged + the inactive tag; a11y name carries them); the orthogonality guard stays green.
- **Codex (separate handoff):** confirm **no RLS delta** (no schema change) + extend the gated E2E (a seeded quarterly merchant is detected with the right monthly-equivalent + last-charged date; a stale/overdue merchant shows the inactive tag and is excluded from the headline).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-23] [PM/operator] **Add monthly-multiple cadences (2/3/6 months) + keep annual** — rationale: dogfooding found a real quarterly Sony $49.99 dropped as `irregular`; covering the common multi-month billing cycles makes detection match real life without opening the door to variable spend (the CV gate still guards) — area: product/data — alternatives: just quarterly (misses bi-monthly/semi-annual), a fully-flexible "every N months" (higher false-positive risk) — reversibility: easy
- [2026-06-23] [PM/operator] **Last-charged date + an "inactive" hint; inactive excluded from the headline** — rationale: the stated need is "identify an old one that is no longer charging"; showing the date + auto-flagging an overdue series answers it directly, and excluding it keeps the running total honest (a dead sub isn't a current cost) — area: product/ux — alternatives: date only (user does the math), keep inactive in the total (inflates it) — reversibility: easy
- [2026-06-23] [Engineer] **`asOf` threaded into the pure summary for the inactive check** — rationale: the compute must stay pure/deterministic (no clock read in core); the read layer passes "today" — area: architecture — reversibility: easy

### Risks
- [2026-06-23] [Engineer] **A multi-month band mis-fires on a slightly-irregular merchant** — likelihood: low — impact: low — mitigation: tolerant but non-overlapping bands with `irregular` gaps + the unchanged amount-CV gate; calibrated against the real 91-day Sony intervals at build — area: data
- [2026-06-23] [Engineer] **The inactive threshold flags a sub that's merely late** — likelihood: medium — impact: low — mitigation: `OVERDUE_FACTOR` gives grace (~1.5–2× the interval); the tag is soft ("may have ended"), never a deletion; the row stays visible — area: ux

### Issues
- [2026-06-23] [Engineer] **Plaid's "Subscription" category label is an unused detection signal** — severity: low — owner: Engineer — status: open — area: detection — the ledger shows Plaid's "Subscription" tag; the custom detector ignores it. Could become a future signal (provider-signal-human-decides) to catch subs with too-thin history for cadence inference. Not this slice.

---

_Story under bet: docs/bets/WLT-24/brief.md_
