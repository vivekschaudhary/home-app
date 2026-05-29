---
id: FOUNDATION-PRODUCT
type: foundational-product
version: 1
status: proposed
created: YYYY-MM-DD
author: PM
sources:
  - <link to Confluence / GDrive / etc.>
parent: null
key_metric:
  name: <north-star metric name>
  baseline: <current>
  target: <target>
  source: <where data lives>
measurement_window_months: 12
check_in_cadence: quarterly
---

# Foundational Product Bet

> The product mission, as a measurable wager.

## Vision

<One paragraph: what we're building, who it serves, what the world looks like if we succeed.>

## Target users / personas

<Who specifically. Not "users" — segments, roles, or job-to-be-done.>

## Access & Data Posture

Three foundational decisions that constrain all downstream auth / data / compliance work. **Don't defer to architecture** — these are product decisions that `/setup-foundation-architecture` derives from.

- **Auth posture:** anonymous · registered · authenticated · MFA-required · regulated-identity
- **Data sensitivity:** none · public · PII · sensitive (financial / health / private content) · regulated (subject to a regime — name under Regulatory regime)
- **Regulatory regime:** none · GDPR · HIPAA · SOC 2 · PCI DSS · sector-specific (FERPA / GLBA / etc., name it) · combination (name each)

Mandatory. `n/a — <reason>` valid only for genuinely non-applicable cases (e.g., internal build tooling with no users / no data / no regulatory exposure). Per Principle #15 — empty fields fail; unjustified `n/a` fails.

## Market positioning

<Where we sit. Who we compete with. What's distinctive.>

## North-star metric

<The single most important number. Why it.>

## Strategic OKRs

### Annual
- Objective: <description>
  - KR 1: <measurable>
  - KR 2: <measurable>

### Current quarter
- Objective: <description>
  - KR 1: <measurable>
  - KR 2: <measurable>

## Hypothesis (the bet)

<If we build <this>, then <these users> will achieve <this outcome>, measured by <this metric> hitting <target> within <window>.>

## Defensibility / Moat

If this bet wins, what stops competitors from catching up?

Evaluate each moat type. Two lines each is fine; "not applicable" is a valid answer if honest.

| Moat type | Applies? | Evidence / rationale |
|-----------|---------|---------------------|
| Network effects | yes / no / partial | |
| Switching costs | | |
| Data / proprietary intelligence | | |
| Scale economics | | |
| Brand / trust | | |
| Regulatory / certification | | |
| Distribution / channel | | |
| Talent / domain expertise | | |
| Speed / iteration velocity | | |

**Primary moat(s) we're betting on:**

**Defensibility proxy metrics (where applicable):**
- Retention rate (proxy for switching costs)
- DAU/MAU ratio (proxy for habituation)
- Time-to-replicate (estimated months for a well-resourced competitor)

## Guardrail metrics

What must NOT degrade for this bet to count as won:
- <metric>: stays above/below <threshold>

## Scope

### In scope
-
-

### Out of scope (never)
-
-

## Check-in log

_Populated automatically by `/measure` cron._

## DRI Log

### Decisions
- [YYYY-MM-DD] [PM] Decision summary — rationale: <why> — area: <tag> — alternatives: <what was considered> — reversibility: <easy|medium|hard|one-way>

### Risks
- [YYYY-MM-DD] [PM] Risk summary — likelihood: <low|med|high> — impact: <low|med|high> — mitigation: <plan> — area: <tag>

### Issues
- [YYYY-MM-DD] [PM] Issue summary — severity: <P0|P1|P2|P3> — owner: <role> — status: <open|in-progress|resolved> — area: <tag>

---

_Approved by: <name> on <date>_
