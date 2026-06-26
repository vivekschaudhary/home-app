---
bet: WLT-26
author: Researcher
created: 2026-06-25
task: cite-evidence-6-category-9-moat
sources:
  - docs/foundation/research.md (foundation research, approved 2026-06-05)
  - docs/foundation/product.md (foundational product bet, approved 2026-06-05)
  - docs/bets/WLT-22/brief.md (categories + budgets bet)
  - docs/bets/WLT-23/brief.md (ledger bet)
  - docs/bets/WLT-24/brief.md (subscriptions overlay)
  - docs/bets/WLT-25/brief.md (follow-up overlay)
  - operator dogfooding signals (persistent, in brief DRI logs)
  - "n/a — host lacks web_search: real-time competitor changelogs, live survey data"
---

# Research — Dashboard Intelligence: Transaction Anomalies + Category Spend Insights (WLT-26)

**TL;DR (3 lines)**
Evidence confirms both features address acute, well-documented user pain: users cannot distinguish signal from noise in their spending stream, and category spend context is table-stakes for PFM retention. Competitive landscape has implemented each in isolation; none combine dismissible anomaly surfacing + historical-average overlay in one intent-first dashboard. Moat impact is incremental but load-bearing: both features deepen the Data/proprietary-intelligence moat (primary, foundation row 3) by accumulating behavioral baselines no entrant can replicate; dismissal signals add a proprietary suppression corpus.

Evidence is separated from recommendations. Every claim is cited or marked `n/a — <reason>`. Web-search-dependent claims are marked where the host lacked live search.

---

## Open questions addressed

1. Is there validated user pain for spending anomaly detection on a personal finance dashboard — and is dismissal (acknowledge / remove) a meaningfully different behavior from simple notifications?
2. Do competing PFM tools already solve this well enough that building it is competitive parity rather than differentiation?
3. What constitutes a detectable "anomaly" given 4 months of transaction history, and is that horizon technically sufficient for the detection approaches in scope?
4. Does the 6-month average line in the category bar chart require data we don't yet have, and is the Postgres-native computation feasible at the page-load latency bar (<200ms p95)?
5. What moat, if any, do these features build — or do they erode quickly to parity?

---

## 6-Category Evidence

### 1. User Pain — cited

**Pain: spending surprise and lack of context are the primary drivers of PFM tool switching and abandonment.**

- 62% of U.S. adults lived paycheck-to-paycheck in 2025 (range 53–67% across surveys); 44% of >$100k earners report little-to-nothing remaining after monthly expenses. [foundation research §1, citing Step/PYMNTS/LendEDU/Fortune/Bankrate 2025]
- 37% of U.S. adults could not cover a $400 emergency without borrowing/selling; 27% report no emergency savings. [foundation research §1, citing Federal Reserve/Bankrate 2025]
- The dominant failure mode of existing tools is **orchestration + trust, not information**: users have access to transaction data but cannot distinguish normal drift from real anomalies without manual scan. [foundation research §1, evidence reading]
- Mint's shutdown left ≈3.6M active budgeters without a home — the single most common complaint in the Mint-refugee cohort was **loss of "spending trends" and "unusual activity" alerts**. [foundation research §1, citing CNBC/Bloomberg 2023; competitor Reddit threads — n/a direct citation, directional from operator research]
- **Operator dogfooding signal (direct):** the operator building on WLT-22/23/24/25 has consistently surfaced the same loop: "I can see the charges, but I can't tell if this month is weird or normal." The ledger (WLT-23) shows charges; it doesn't answer "is this unusual?" [WLT-22 brief DRI; WLT-23 brief operator source; WLT-24 brief operator source]
- **Anomaly-dismissal specifically:** the "dismiss if aware" affordance maps to a documented behavioral pattern in security/fraud contexts — users who can acknowledge known anomalies trust the alert surface more than those who cannot, because unacknowledged noise causes alert fatigue and suppresses response to real signals. [n/a — primary PFM-specific citation unavailable without web_search; reasoning from security alert-fatigue literature, directional]

**Pain: category spend comparisons are table-stakes for financial clarity.**

- The core question a PFM user asks is not "how much did I spend?" but "is this normal for me?" — a bar chart without a historical reference line answers the former but not the latter. [operator dogfooding, WLT-22 brief; consistent with foundation research evidence reading §1]
- YNAB's steep-curve critique (foundation research §2) centers on users needing to build a budget from scratch — the missing piece is a behavioral baseline they can compare against. The 6-month average line provides that baseline without requiring the user to set it manually. [foundation research §2, citing Era/WalletGrower 2026]

**Confidence: HIGH** for category-spend pain; **MEDIUM** for anomaly-dismissal specifically (strong directional evidence, limited primary PFM-specific citation available on this host).

---

### 2. Competitive — cited

| Product | Anomaly detection | Category spend bar chart | Historical average overlay | Dismissal / acknowledge |
|---|---|---|---|---|
| **Mint (defunct)** | Yes — "unusual spending" alerts by category and merchant, email + in-app [foundation research §2; CNBC 2023] | Yes — category trends over time | Yes — month-over-month comparison | Partial — dismiss-by-category, not per-transaction [n/a direct source; directional] |
| **Monarch** | Limited — alerts on large transactions only; no new-merchant detection as of foundation research date | Yes — category spend trends | Month-over-month, not 6-month avg | No explicit dismiss/acknowledge affordance [foundation research §2; WalletGrower] |
| **YNAB** | No — budget-variance only (budget → actual); no anomaly detection | Budget vs. actual, not free-form category spend | No historical baseline | n/a [foundation research §2; Era] |
| **Copilot** | Yes — "insights" surface flags unusual charges; iOS-only widget | Yes — category summaries | Unclear — n/a without web_search | Unknown — n/a without web_search |
| **This platform (WLT-26)** | **New-merchant flag + spend spike per category, 4-month window, per-transaction dismiss** | **Top-10 categories, clickable → ledger filter** | **6-month rolling avg line, automatically computed** | **Yes — per-transaction dismissal with suppression** |

**Evidence reading (separated):** The competitive gap is the **combination** — anomaly detection + per-transaction dismissal + category bar chart + historical baseline in one intent-first dashboard surface. Mint came closest but is gone. Monarch and YNAB each own one dimension. The per-transaction dismiss with suppression (not just category-level) is unmatched in the market based on available evidence.

**Confidence: MEDIUM-HIGH** for Mint/YNAB/Monarch (cited); **LOW** for Copilot detail (Apple-only, limited secondary citation).

---

### 3. Technical — cited

**Anomaly detection on 4 months of history**

The user specified "4 months of historic data." Two anomaly classes are implied by the feature description:

1. **New-merchant anomaly:** a transaction at a merchant the user has no prior history with. Detection: `LEFT JOIN` on transaction history grouped by `merchant_name` (or Plaid's `merchant_entity_id`) where count within the 4-month window = 0. Technically trivial with the existing `transactions` table (Plaid CDC ingested, WLT-22+). 4 months is sufficient — the detection criterion is "first occurrence," not statistical rarity.

2. **Spend-spike anomaly (category level):** current-month category spend exceeds N× the 4-month rolling average. Standard approach: compute per-category monthly averages over the 4-month window, flag months where the current period's partial spend is on pace to exceed 1.5–2× that average. Requires `date_trunc('month', ...)` grouping in Postgres — feasible within the existing schema. 4 months is a minimum viable window (3-point mean with the current month in flight); 6 months would tighten confidence. **Risk: 4 months may have too few users with full history post-launch; gating the feature on ≥2 months of data is advisable.**

**Category bar chart + 6-month average line**

- The 6-month average line requires a Postgres aggregation over `transactions` grouped by category + month, computed as a server-side query. Given the `readAllPaged` discipline from FIX-2026-06-20c (WLT-22/WLT-24), this must be a bounded, paginated or limit-capped query. The top-10 category restriction bounds the computation.
- **Clickable bar → transaction list:** route is `/transactions?category=<slug>&month=<YYYY-MM>`. The WLT-23 ledger already renders the full transaction table with the same fields; the routing is additive (pass category + month as query params to the existing filter state). No new data model needed.
- **Chart library:** Recharts is the de-facto choice for React/Next.js App Router (lightweight, SSR-compatible, compositional). The `ComposedChart` component supports bar + line overlay natively. [n/a primary citation; standard React ecosystem recommendation, directional]
- **p95 < 200ms fitness function (architecture.md):** a single-pass Postgres query grouping 6 months × top-10 categories per user is expected to be sub-50ms with standard indexes on `(user_id, date, category)` — well within the 200ms threshold. **Risk: if the transaction corpus is large (>50k rows/user), query plan should be validated with EXPLAIN ANALYZE before launch.**

**Confidence: HIGH** for technical feasibility (Postgres aggregation, routing, chart composition); **MEDIUM** for anomaly detection accuracy on short history (4-month window is sufficient for new-merchant detection, minimum-viable for spend-spike).

---

### 4. Quantitative — cited where available

- Users who see a visual spending summary (category breakdown) are 2–3× more likely to take a budget-correcting action than those who only see a raw transaction list. [n/a — specific citation unavailable on this host without web_search; directional from behavioral finance literature; mark as LOW confidence]
- Anomaly/alert features are consistently cited as the #1 feature Mint refugees missed after the shutdown. [directional — foundation research §1; Reddit/community sentiment; LOW confidence on specific ranking]
- The 6-month rolling average requires 6 months of per-user data; at platform launch, most users will have < 6 months of history. **Implication:** the chart must gracefully degrade to "available months average (N months)" rather than hard-requiring 6 months. This is a UX/engineering constraint, not a research gap.
- **Dashboard engagement:** n/a — no internal analytics baseline exists yet (pre-launch). The WAWU north-star metric (product.md) will capture dashboard interaction once launched; the anomaly catch rate is an explicit input metric (product.md L38).

**Confidence: LOW** for quantitative behavioral claims (no primary PFM-specific study cited on this host); included as directional only.

---

### 5. Trends — cited

- **Hyper-personalization** is the defining 2025 PFM trend — real-time, user-level guidance matches both the anomaly surface (personalized to your history) and the category comparison (your average, not a peer benchmark). [foundation research §6, citing MarketBusinessInsights/Mordor]
- **AI-assisted anomaly detection** is table-stakes in banking (credit card fraud alerts are ubiquitous) — consumer expectation of "tell me when something looks weird" has been set by banks, not PFM apps. PFM apps that lag this expectation lose trust quickly. [directional — n/a primary citation without web_search]
- **Dashboard as the product front door:** generational wealth transfer + tech-native under-40 cohorts (41% comfortable delegating to AI vs 14% Boomers) expect an analytics-first, visually-rich dashboard as the default app state. [foundation research §6, citing Mordor]

**Confidence: MEDIUM** (foundation research cited; trend extrapolation is directional).

---

### 6. Moat / Defensibility — mandatory evaluation (all 9 rows)

**This is a feature bet, not a foundational bet.** Moat rows reference the foundation moat table (`docs/foundation/product.md` L64–76 and `docs/foundation/research.md` §9-moat) as baseline. Each row evaluates whether WLT-26 **increments, holds, or degrades** the established moat position.

| # | Moat type | Foundation verdict | WLT-26 impact | Rationale |
|---|---|---|---|---|
| 1 | Network effects | partial | **holds** | Dashboard intelligence is single-player; no network externality added. Marketplace moat unaffected. |
| 2 | Switching costs | **yes** (primary) | **increments** | Dismissal history (which anomalies the user has acknowledged) is user-specific behavioral data that doesn't export. Per-user category baselines (6-month averages) are computed from account-linked history — the longer the user is on the platform, the more personalized the baselines become, raising exit friction incrementally. |
| 3 | Data / proprietary intelligence | **yes** (primary) | **increments (load-bearing)** | Anomaly dismissal events generate a proprietary suppression corpus: *which merchants/categories this user considers normal*. At scale, aggregate dismissal patterns reveal which "new merchant" anomalies are actually broad adoption events (e.g., a new food chain) vs. genuine outliers — a signal no single-user view can surface. This compounds with user count. The 6-month category baseline, accumulated across users, enables opt-in peer benchmarking ("you spend 2× more on dining than similar users") — a future capability that requires exactly this data layer. **This is the primary moat impact of WLT-26.** |
| 4 | Scale economics | partial | **holds** | Anomaly computation is Postgres-native (no external ML service cost). Marginal compute cost per user is low and amortizes with scale. No change to the partial verdict. |
| 5 | Brand / trust | partial | **increments** | A well-tuned anomaly surface that catches real things builds trust faster than any onboarding copy. False positives or noisy alerts (dismissed immediately, always) erode it. The per-transaction dismiss affordance is specifically designed to let the user calibrate the signal — which protects the brand/trust increment. Risk: if anomaly detection is poorly tuned at launch, it degrades trust (see DRI Risks below). |
| 6 | Regulatory / certification | partial | **holds** | No new regulatory surface introduced. Anomaly data is the user's own transaction data (already held under existing posture). Dismissal events are behavioral metadata, not financial data requiring additional regulatory handling. |
| 7 | Distribution / channel | no | **holds** | No channel implications. |
| 8 | Talent / domain expertise | no | **holds** | Postgres-native anomaly detection doesn't require specialized ML talent. |
| 9 | Speed / iteration velocity | partial | **holds** | WLT-26 reuses existing infrastructure (Plaid CDC, Postgres, WLT-23 ledger routing, WLT-24/25 overlay patterns). Fast to ship; no special velocity signal. |

**Primary moat impact of WLT-26:** Reinforces foundation moat rows 2 (switching costs) and 3 (data/proprietary intelligence) — the two primary bets. Row 3 is the load-bearing increment: dismissal events generate a proprietary behavioral corpus no competitor can replicate without the same user base and per-transaction interaction history.

**Named primary moat(s) for WLT-26:** Data/proprietary intelligence (row 3), switching costs (row 2). Feature-level, incremental — not a standalone moat play.

---

## Synthesis — patterns across categories (evidence → patterns, recommendations separate)

**Pattern 1: Both features answer the same question ("is this normal?") from two different angles.**
Anomaly detection answers: "is this transaction normal for me?" Category bar chart + 6-month average answers: "is this month's spend in this category normal for me?" They share one underlying user anxiety (spending surprise) and one data substrate (transaction history). Building them together on one dashboard surface is a coherent product unit, not two disconnected features.
*Source: competitive analysis (gap), user pain §1 (operator dogfooding), technical §3 (shared Postgres aggregation substrate)*

**Pattern 2: Dismissal is the trust mechanism, not just a UX convenience.**
The value of anomaly detection degrades unless users can close the loop on known-and-expected items. A dismissed anomaly is a training signal for the suppression corpus (moat row 3). A non-dismissible anomaly surface becomes noise, destroys alert trust, and users stop looking. The dismiss affordance is load-bearing.
*Source: directional from security alert-fatigue literature (§1), moat analysis §6 row 3*

**Pattern 3: 4-month history is sufficient for new-merchant anomalies, borderline for spend-spike.**
New-merchant detection is a boolean (first occurrence) — 4 months of history is more than enough. Spend-spike detection using a 3–4 point rolling average is statistically noisy; the product should tune the sensitivity threshold conservatively at launch (1.5–2× average, not 1.1×) and let operator dogfooding calibrate it.
*Source: technical §3*

**Pattern 4: Clickable chart → ledger is the correct interaction model (not a new page).**
Routing to `/transactions?category=<slug>&month=<YYYY-MM>` reuses the WLT-23 ledger table — same fields, same columns, consistent mental model. A separate "category detail page" is over-build; the ledger filter achieves the same outcome. The user requested "new page" but the intent is clearly "see the transactions" — ledger filter accomplishes that and reuses existing infrastructure.
*Source: technical §3 (WLT-23 ledger routing), operator intent interpretation*

---

## Limitations

1. **No live user analytics to baseline against** (platform pre-launch for external users; operator only). All user-pain quantitative claims are from foundation research and directional inference.
2. **Anomaly detection quality is unknown until calibrated.** False-positive rate on 4-month history is not estimable without data; conservative threshold + operator dogfooding is the right calibration path.
3. **Competitor feature detail (Copilot) is unverifiable** on this host (Apple-only, web_search unavailable). Copilot dismiss behavior marked `n/a — host lacks web_search`.
4. **6-month baseline requires ≥2–3 months of per-user data** to be meaningful. At launch, many users will have <6 months; the UX must handle graceful degradation.
5. **Peer benchmarking (aggregate anomaly corpus)** is a future capability dependent on user scale — noted as the long-run moat payoff, not a WLT-26 deliverable.

---

## Recommendations (separated from evidence)

1. **Build both features as one coherent dashboard bet** — they share one user anxiety, one data substrate, and one technical pattern. Splitting them would be arbitrary churn.
2. **Ship new-merchant anomaly detection first within the bet** (technically simplest, highest confidence) and validate dismissal loop before the spend-spike detector.
3. **Tune spend-spike threshold conservatively** at 1.5–2× category average. False positives destroy trust faster than false negatives.
4. **Gate the anomaly surface on ≥2 months of transaction history** to avoid surfacing meaningless "anomalies" for users who just connected their accounts.
5. **Route category bar chart clicks to the WLT-23 ledger with category + month filter** — not a new page. The request says "new page" but the underlying intent is "see the transactions"; the ledger filter achieves this and reuses existing infrastructure.
6. **Accumulate dismissal events** as structured data from day one — `anomaly_dismissals(user_id, dedup_key, anomaly_type, dismissed_at)` — even if not acted on immediately. This builds the proprietary corpus (moat row 3 payoff) incrementally.
7. **Show "N months avg" not "6-month avg"** in the chart label to handle users with shorter history gracefully.

---

## DRI Log

### Decisions

- [2026-06-25] [Researcher] **Assigned bet ID WLT-26** — next sequential after WLT-25 (follow-up overlay). Area: process. Reversibility: easy (PM can re-ID before brief approval).
- [2026-06-25] [Researcher] **Moat evaluated as feature-level increment** (not foundational re-evaluation) — rationale: feature adds to foundation rows 2 and 3 but does not change the primary moat structure; foundation moat table remains authoritative. Area: strategy. Reversibility: n/a.

### Risks

- [2026-06-25] [Researcher] **Anomaly false-positive rate at launch** — if threshold is too sensitive, the surface fills with noise, users dismiss everything, and the trust-building value is inverted. Likelihood: medium. Impact: high (brand/trust moat row 5 degraded). Mitigation: conservative threshold (1.5–2×), operator dogfooding calibration before external launch, per-transaction dismiss to let users self-calibrate. Area: product quality.
- [2026-06-25] [Researcher] **Short transaction history at launch** — users who connected accounts recently have <4 months of Plaid history; anomaly detection is meaningless for them. Likelihood: high (inherent at launch). Impact: medium. Mitigation: gate surface on ≥2 months of data; show empty state with "we'll surface anomalies as you build history" rather than a noisy surface. Area: UX/data.
- [2026-06-25] [Researcher] **6-month average query performance under large transaction volume** — a full-scan aggregation over unbounded history violates the `readAllPaged` discipline. Likelihood: low (top-10 categories bounds it). Impact: medium (p95 regression vs. fitness function). Mitigation: cap aggregation to rolling 6-month window + EXPLAIN ANALYZE before shipping. Area: performance.

### Issues

- [2026-06-25] [Researcher] **Anomaly detection algorithm scope unresolved** — the brief names "new merchant" and implies spend-spike; the exact anomaly taxonomy (how many types, whether amount-anomaly within a known merchant is in scope) is a story-level decision. Severity: medium. Owner: PM (`/create-brief WLT-26`). Status: open. Area: scope.
- [2026-06-25] [Researcher] **Dismissal data model not yet specified** — whether dismissals live in `transaction_flags` (extending WLT-24/25 substrate) or a separate `anomaly_dismissals` table is unresolved. The WLT-24/25 `flag_type` pattern is a candidate but anomaly dismissal semantics differ (ephemeral suppression vs. persistent overlay). Owner: Architect. Status: open. Area: data.

---

## Open questions unresolved

1. **Anomaly taxonomy:** is "amount anomaly for a known merchant" (same merchant, unusual amount) in scope, or only "new merchant" + "category spend spike"? [Owner: PM — resolve in brief]
2. **Dismissal persistence:** should a dismissed anomaly be suppressed permanently (never surface again for that merchant), for the current month only, or for N days? [Owner: PM + Architect]
3. **Clickable bar destination — confirm "new page" interpretation:** the user's request says "a new page" — should this be a `/transactions?category=X&month=Y` filter on the WLT-23 ledger, or a genuinely new route? [Owner: PM — recommendation: ledger filter; confirm in brief]
4. **6-month baseline at launch:** how to handle users with <6 months of history — "N-month average (N months)" label, or suppress the line until 6 months available? [Owner: Designer — resolve in story]
5. **Chart library selection:** Recharts (`ComposedChart`) is the natural fit with the existing stack — confirm with Architect. [Owner: Architect]
