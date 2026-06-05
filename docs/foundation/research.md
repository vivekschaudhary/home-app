---
type: research
status: approved
approved_date: 2026-06-05
primary: gdrive://1PqhTQAfer6lRqNVfk8-bG3tWDa2nLS9Ez54-wnsZrO4
last_synced: 2026-06-05
---

> **Primary artifact (stakeholders read here):** https://docs.google.com/document/d/1PqhTQAfer6lRqNVfk8-bG3tWDa2nLS9Ez54-wnsZrO4/edit
> This repo file is a slim pointer + inline cache for AI consumption. Edit the Google Doc; re-sync this cache.

# Foundation Research — Wealth at Your Fingertips

Agent: `researcher.cite-evidence-6-category-9-moat` · Status: `proposed`

Evidence is separated from recommendation. Every claim is cited or marked `n/a — <reason>`. Market-size figures are treated as directional only (see Limitations + DRI).

## 6-category evidence

### 1. User pain — cited
- ~62% of U.S. adults report living paycheck to paycheck in 2025 (range 53–67% across surveys); 44% of >$100k earners say little/nothing is left after monthly expenses. [Step; PYMNTS; LendEDU; Fortune/Bankrate 2025]
- Federal Reserve: 37% could not cover a $400 emergency without borrowing/selling; 27% report no emergency savings (Bankrate). [JPMorganChase Institute; Federal Reserve; Bankrate 2025]
- Mint shutdown (≈3.6M active users, wound down by Mar 2024) left budgeters without a home; Credit Karma dropped budgeting, MoM spend trends, and detailed categorization. [CNBC 2023; Monarch; Bloomberg 2023]
- Bank-linking is itself a trust/friction barrier even for loyal users. [Experian; Amppfy]
- *Evidence reading:* the gap is orchestration + trust, not information; the Mint exit created an unusually large, motivated switching cohort.

### 2. Competitive — cited
| Player | Price | Gap vs. this platform |
|---|---|---|
| YNAB | $109/yr | Manual discipline; steep learning curve; no investment/wealth layer [Era; WalletGrower 2026] |
| Monarch | Core $99.99 / Plus $199 (May 2026) | No workflow engine/marketplace; 13k+ institutions [WalletGrower; CostBench] |
| Copilot | $95/yr | Apple-only; fixed feature set [PennyHoarder; Era] |
| Advisory (disrupted) | $300/hr median; AUM 0.5–2%; plan $2.5–5k; retainer ~$4.5k/yr (2024) | Episodic, not real-time; inaccessible to most [Harness 2025; NerdWallet 2026] |

*Evidence reading:* incumbents confirm ~$95–$199/yr willingness-to-pay for tracking; advisory pricing confirms the value gap. None span the full stack.

### 3. Moat / defensibility — cited (full table below)
Helmer 7 Powers + NFX taxonomy: network economies trend winner-take-all past a tipping point; switching costs accumulate via connection graphs + learned workflows; data network effects compound with scale. Caution: Plaid's defensibility came from fixed build costs, not durable network effects. [NFX; productstrategy.co; platformchronicles]

### 4. Technical — cited
- Aggregation mature but uneven: Plaid covers 12k–16k+ institutions, excludes Fidelity + some credit unions/regional banks. [OpenBankingTracker 2026]
- Cost shifting against aggregators: Plaid agreed in 2025 to **pay** JPMorgan for previously-free data access — a variable cost that scales with users. [Bloomberg Law 2025; Payments Dive 2025]
- Liability precedent: Plaid paid $58M (2021) to settle a data-practices class action. [OpenBankingTracker; Fintech Review]
- *Evidence reading:* multi-provider + CSV fallback is well-targeted; aggregation cost is a margin risk, not a feasibility risk.

### 5. Quantitative — cited, low confidence on TAM
- Robo-advisory: ~$14.29B (2025) → $54.73B (2030), CAGR ~30.8%; >$1.0T AUM by 2025. [Mordor; Coinlaw]
- PFM-app market estimates diverge by ~2 orders of magnitude ($1.57B / $31.7B / $165.9B for 2025) — unreliable for sizing. [ResearchNester; VerifiedMarketResearch]
- Users skew Millennial (~45%), Gen Z (~25%), Gen X (~20%). [Coinlaw]

### 6. Trends — cited
- Hyper-personalization is the defining 2025 trend (real-time, user-level guidance) — matches the intent-first thesis. [MarketBusinessInsights; Mordor]
- Hybrid models took 60.7% of 2024 robo revenue; 41% of under-40s comfortable delegating to AI (vs 14% of Boomers); generational wealth transfer favors tech-native cohorts. [Mordor]
- Recent: BlackRock "Asimov" (Jun 2025); Betterment bought Ellevest robo arm (Feb 2025); Revolut robo at $100 min (Jan 2025). [Mordor]

## 9-moat evaluation

| # | Moat | Verdict | Rationale |
|---|---|---|---|
| 1 | Network effects | **partial** | Marketplace is a real two-sided network; core single-player utility needs no other users — a layer, not the foundation. |
| 2 | Switching costs | **yes** | 3–4 linked accounts + custom workflows + multi-year history = high exit friction. Strongest near-term moat. |
| 3 | Data / proprietary intelligence | **yes** | Aggregated anonymized behavior powers anomaly detection + benchmarks no entrant can replicate; compounds with scale. **Primary bet.** |
| 4 | Scale economics | **partial** | Infra amortizes, but rising per-user data-access fees (Plaid→JPMorgan) keep cost partly variable. |
| 5 | Brand / trust | **partial** | Load-bearing in finance but must be earned; does not exist pre-launch. Prerequisite, not a claim. |
| 6 | Regulatory / certification | **partial** | SOC 2 / PCI / GDPR is a floor incumbents also clear; "not advice" positioning is a modest counter-position. |
| 7 | Distribution / channel | **no** | No exclusive/embedded channel yet; Mint cohort is an opportunity, not a moat. |
| 8 | Talent / domain expertise | **no** | Valuable but hireable, non-compounding; "great team" ≠ defended. |
| 9 | Speed / iteration velocity | **partial** | Marketplace = velocity-via-ecosystem, but rarely durable alone; overlaps row 1. |

**Primary moat(s) bet on:** (1) Data / proprietary intelligence, (2) Switching costs, reinforced by (3) Workflow-marketplace network effects. Brand/trust + regulatory are prerequisites to earn.

## Recommendations (separated from evidence)
- Anchor TAM on robo-advisory + advisory-displacement economics, not divergent PFM-app estimates.
- Lead acquisition with the time-boxed Mint-refugee cohort.
- Model aggregation data-access fees as a first-order margin risk.
- Sequence moat investment: switching costs + data first, marketplace next, brand/trust earned continuously.

## Limitations
- TAM low-confidence (PFM estimates span $1.57B–$165.9B for 2025).
- Geographic bias: user-pain quant is US-centric; brief references UK (ISA, Nutmeg, Emma) — UK data uncited.
- No first-party telemetry pre-launch.

## Researcher DRI log
- **Decision (source-trust):** Treat conflicting PFM market-size figures as directional only; anchor on robo-advisory data (Mordor) + advisory displacement. Area: market-sizing. Alt rejected: averaging estimates (launders noise). Reversibility: high.
- **Risk:** Sample/recency + geographic bias — evidence US-centric, product targets US+UK. Likelihood med / impact med. Mitigation: commission UK (PSD2) research before UK launch; mark UK demand unvalidated. Area: research-coverage.
- **Issue:** First-party telemetry unavailable pre-launch. Severity low. Owner PM/Researcher. Revisit moat sizing once usage data exists.
