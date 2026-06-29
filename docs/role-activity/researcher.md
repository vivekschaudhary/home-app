---
id: ROLE-ACTIVITY-LOG-researcher
type: role-activity-log
status: living
altitude: role
role: researcher
parent_artifact: null
created: 2026-06-28
last_appended: 2026-06-28
---

# Role Activity Log — Researcher

> **Rolling, append-only.** Status: `living`. Never edited after publication — new patterns get NEW entries, never revisions to old ones. A future `/retro --altitude=role --role=researcher` reads this log and synthesizes patterns into an archived retro at `docs/retros/role-researcher-<NNN>.md`.

## Purpose

Captures **patterns the `researcher` agent surfaces mid-task** — friction, repeated decisions, recurring drift, novel constraints learned. Cadence: ad-hoc append per `[fractal-retro]`.

## Entries

### 2026-06-28T00:00 — `[first-party-demand-signal-missing]` on new product bets

**Context:** WLT-27 `cite-evidence-6-category-9-moat` — researching manual account entry, CSV import, multi-currency. All quantitative evidence for demand was external (Apple MAU counts, expat population, Wise/Revolut customer counts). Zero production telemetry, zero user interviews on record for this bet.

**Pattern surfaced:** `[first-party-demand-signal-missing]` — at the brief stage for new product bets, the research framework will reliably reach an "n/a — no production telemetry yet" wall on multiple quantitative sub-questions: (a) how many of our users are hitting the coverage gap, (b) how many have multi-currency accounts. External population sizes (9M Americans abroad; 56M Cash App MAU) are available but are upper-bound proxies, not cohort evidence.

**Evidence:** `docs/bets/WLT-27/research.md` § "What we couldn't answer" — five items flagged unanswerable; four of the five trace to missing first-party signal.

**Instance count (in this log):** 1 (first occurrence; watch for same pattern in WLT-28+ bets).

**Recommended action:** Surface at next role-altitude Researcher retro — consider adding a standing "first-party instrumentation gaps" check to the researcher task prompt so the DRI Issue (instrument Plaid link-error events) is seeded automatically for bets where production telemetry doesn't yet exist.

---

### 2026-06-28T00:01 — `[community-signal-directional-only-discipline]` applied correctly on WLT-27

**Context:** WLT-27 research — Reddit threads on Plaid trust concerns (r/personalfinance, r/ynab) were available and relevant. Researcher correctly labeled these "directional only; not treated as consensus evidence" and did not use them to support any quantitative claim.

**Pattern surfaced:** `[community-signal-directional-only-discipline]` — successfully applied the source quality hierarchy (community sentiment = directional; requires corroboration). No synthetic-evidence drift occurred; primary/institutional sources were found for all high-stakes claims.

**Evidence:** `docs/bets/WLT-27/research.md` Finding 2 — explicit "Directional only; not treated as consensus" label on Reddit signals.

**Instance count (in this log):** 1 (positive confirmation — note for future retros to verify discipline holds when primary sources are harder to find).

**Recommended action:** None. Log as a confirmed-correct application of the source hierarchy.

---

_Append new entries above this line. Run `/retro --altitude=role --role=researcher` periodically to synthesize patterns into an archived retro._
