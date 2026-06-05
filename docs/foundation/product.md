---
type: foundational-product
status: approved
approved_date: 2026-06-05
primary: gdrive://1Xqe3Ij9zh1O9sIqLQGe6joqIifqBblhBHEqwG8E1VbQ
last_synced: 2026-06-05
research: gdrive://1PqhTQAfer6lRqNVfk8-bG3tWDa2nLS9Ez54-wnsZrO4
source: gdrive://19PB3bcm5xj9m1GCPnPmg3otQ3HtV2v9Q1MmF5oBDkXk
---

> **Primary artifact (stakeholders read here):** https://docs.google.com/document/d/1Xqe3Ij9zh1O9sIqLQGe6joqIifqBblhBHEqwG8E1VbQ/edit
> This repo file is a slim pointer + inline cache for AI consumption. Edit the Google Doc; re-sync this cache. To approve: flip `status: proposed → approved` here AND prefix the Doc title `[PROPOSED]` → `[APPROVED]`.

# Foundational Product Bet — Wealth at Your Fingertips

Agent: `pm.setup-product-foundation` · `type: foundational-product` · `status: proposed` (PM does not self-approve)
Research: `docs/foundation/research.md` · Source: PRODUCT BRIEF (GDrive)

## Vision / mission
Give every person — regardless of income, net worth, or financial literacy — the financial intelligence, planning, and protection once reserved for the wealthy, by automating the **orchestration** layer of private wealth management (watching, flagging, planning, acting) rather than replacing human judgment. The platform is infrastructure: an intent-first engine + a composable library of financial primitives + a creator marketplace, on top of the user's real aggregated financial data.

## Target users / personas
- **Consumer (~80%)** — connects accounts, runs pre-built/marketplace workflows, builds nothing. Success = control + consistent progress. **Primary persona.**
- **Builder (~15%)** — composes + publishes workflows; disproportionate value; top-builder retention is strategic.
- **Developer (~5%)** — API/SDK for blocks, niche integrations, B2B packages.
- **Beachhead:** Mint-refugee cohort (≈3.6M displaced) + financially-anxious wage earners (62% paycheck-to-paycheck) who can't afford a $300/hr advisor.

## Access & Data Posture (user-elicited, verbatim)
- **Auth posture:** MFA-required
- **Data sensitivity:** Sensitive
- **Regulatory regime:** PCI DSS, SOC 2, GDPR
- **Open item (escalated, not auto-filled):** user did NOT select open banking / PSD2, but the brief targets UK + aggregation. PSD2 applicability flagged for `/setup-foundation-architecture` + UK-launch (see DRI Risk).

## Market positioning
The OS underneath a user's entire financial life — the "Roblox of personal finance": we provide the engine, primitives, and marketplace, not prescribed workflows. White space = the only product unifying daily cash flow + aggregation + composable workflows + marketplace + investment + long-range planning behind an intent-first front door. Point solutions (YNAB $109, Monarch $99.99–$199, Copilot $95) each win one category; advisory ($300/hr) is inaccessible.

## North-star metric
**Weekly Active Wealth-Building Users (WAWU)** — users taking ≥1 platform-prompted financial action (run/adjust workflow, hit a savings rule, act on an anomaly/alert) per 7-day window. Captures the compounding-action thesis; resists vanity gaming. Input metrics: TTFV, Day-30 retention, accounts connected, plan-adherence, anomaly catch rate.

## Strategic OKRs
**Annual (2026) — Objective:** Prove automated orchestration drives durable financial-habit formation for non-wealthy users.

- KR1: TTFV < 3 min for ≥80% of new accounts
- KR2: Day-30 retention ≥ 60%
- KR3: ≥ 3 connected accounts per active Pro user within 90 days
- KR4: ≥ 70% of users within 10% of monthly budget plan
- KR5: Establish WAWU baseline + grow MoM through Phase 1

**Current quarter (Q2 2026 — Phase 1 Foundation) — Objective:** Validate the intent-first front door converts intent → running workflow.

- KR1: Ship intent onboarding + 5 pre-built workflows across all 6 intent clusters (Fear, Goal, Confusion, Control, Habit, Aspiration)
- KR2: 2 aggregation providers live + CSV-import fallback
- KR3: 10,000 users; baseline intent→workflow conversion
- KR4: TTFV instrumentation live vs <3-min target

## Out of scope (NOT building)
Regulated financial advice / specific investment recommendations · brokerage/custody/money movement as a regulated entity · tax filing/submission · insurance brokering · lending/credit products · crypto trade execution · storing bank credentials (OAuth/zero-knowledge only).

## Hypothesis (falsifiable)
If we replace the blank-canvas/manual-discipline model with an intent-first front door that auto-assembles a running, personalized workflow from a user's goals on top of real aggregated data, then non-wealthy users will form a continuous habit (≥3–5 active days/week) and stay (Day-30 ≥60%) — because the core failure of existing tools is orchestration + trust, not information. **Wrong if:** with intent onboarding live, Day-30 retention stays below ~40% or TTFV can't get under ~3 min for most users.

## Defensibility / moat (9 types; primary named)

| # | Moat | Verdict | Rationale |
|---|---|---|---|
| 1 | Network effects | partial | Marketplace is a real network; core utility is single-player |
| 2 | Switching costs | **yes** | Linked accounts + workflows + history = high exit friction |
| 3 | Data / proprietary intelligence | **yes** | Aggregated behavior → unreplicable anomaly detection + benchmarks. **PRIMARY** |
| 4 | Scale economics | partial | Infra amortizes; rising per-user data fees keep cost partly variable |
| 5 | Brand / trust | partial | Load-bearing in finance but must be earned; none pre-launch |
| 6 | Regulatory / certification | partial | SOC 2/PCI/GDPR is a floor incumbents clear; "not advice" is a counter-position |
| 7 | Distribution / channel | no | No exclusive channel yet; Mint cohort is opportunity not moat |
| 8 | Talent / domain expertise | no | Valuable but hireable, non-compounding |
| 9 | Speed / iteration velocity | partial | Marketplace velocity-via-ecosystem; overlaps row 1 |

**Primary moat(s):** Data / proprietary intelligence + Switching costs, reinforced by Workflow-marketplace network effects. Brand/trust + regulatory are prerequisites to earn.

## Measurement window & cadence
- **Window:** annual outcome, with Phase checkpoints at month 6 (Phase 1) and month 12 (Phase 2).
- **Cadence:** quarterly OKR review; monthly north-star (WAWU) + Phase-1 input review.

## PM DRI log
- **Decision:** North-star = WAWU (action-based), not logins/AUM. Area: metrics. Alt rejected: "daily net worth delta" (display, not behavior), MAU (vanity). Reversibility: medium.
- **Decision:** Confluence/Jira mirror **skipped** — config sets confluence/jira but neither MCP is on this host; GDrive Doc is the primary artifact. Area: tooling. Reversibility: high (re-run when MCP connected). *(Logged per "no silent skips".)*
- **Risk:** PSD2/open-banking scope gap — regime omits it but aggregation + UK targeting imply applicability. Likelihood med / impact high. Mitigation: resolve in `/setup-foundation-architecture` + pre-UK-launch; don't widen here. Area: regulatory.
- **Risk:** Aggregation reliability + cost — coverage gaps (Fidelity excluded) + rising data-access fees. Likelihood med-high / impact high. Mitigation: multi-provider + CSV fallback + connection-health dashboard; model fees as first-order cost. Area: technical/financial.
- **Issue:** TAM low-confidence (PFM estimates $1.57B–$165.9B). Severity low. Owner PM/Researcher. Anchor on robo-advisory + advisory-displacement.
