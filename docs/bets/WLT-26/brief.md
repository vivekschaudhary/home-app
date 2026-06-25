---
id: WLT-26
type: feature
status: approved
priority: P2
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-22, WLT-23, WLT-24, WLT-25]
parallel_with: []
architecture_required: true
architecture_status: pending
created: 2026-06-25
author: PM
sources:
  - docs/bets/WLT-26/research.md (researcher evidence — 6-category + 9-moat, 2026-06-25)
  - operator dogfooding (the WLT-23 ledger) — direct signal: "I can see the charges, but I can't tell if this month is weird or normal"
  - docs/foundation/product.md (north-star: WAWU; input metric: anomaly catch rate L38)
  - docs/foundation/research.md §1–6 (user pain, competitive, trends)
key_metric:
  name: Anomaly-surface engagement rate (dismiss or investigate, not passive view)
  baseline: 0 # new capability
  target: operator acts on (dismisses or clicks through to ledger) >=3 distinct anomalies within the window; AND >=1 category bar chart click to the ledger within the window
  source: funnel events (anomaly_dismissed, anomaly_investigated, category_bar_clicked)
guardrails:
  - name: Anomaly surface false-positive rate — no noise flood
    threshold: operator dismisses <50% of surfaced anomalies within the first 14 days (high dismiss rate = signal the detector is too noisy, not that the surface is engaging)
  - name: Dashboard page p95 load time
    threshold: full dashboard load (including category bar chart + anomaly panel) stays < 200ms p95 (architecture.md fitness function) — validated by EXPLAIN ANALYZE before shipping
  - name: readAllPaged discipline maintained
    threshold: anomaly query + category aggregation query are both bounded (rolling window + top-N cap) — no full-table scans on the transactions table
  - name: Anomaly detection gated on history depth
    threshold: anomaly surface does NOT render for users with < 2 months of transaction history — empty state shown instead
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [frontend, backend, data, spending, dashboard]
estimate:
  duration_weeks: 2
  confidence: low
  refined_by: brief-approval
  refined_at: 2026-06-25
---

# Dashboard Intelligence — Transaction Anomalies + Category Spend Insights

## Problem

The dashboard shows the user's financial data but leaves the most important question unanswered: **"Is this normal for me?"**

Two surfaces fail today:

1. **Transaction anomalies are invisible.** When a new merchant appears on the ledger or a category spends unusually high, the user must notice it manually — scrolling a raw list, comparing to memory. There is no "something looks off here" signal. And when a user _does_ notice something they already know about (a planned one-off, a gift for a family member), they have no way to acknowledge and dismiss it. The ledger fills with charges, and there is no distinction between expected noise and genuine signal.

2. **The category spend chart has no context.** The dashboard shows budget-vs-actual by category, but "you spent $340 on dining" carries no meaning without a baseline. Was that high? Low? Normal for this user? The user has no reference line — they're left doing mental arithmetic against a memory of past months.

The operator dogfooding the shipped app has surfaced this loop explicitly: _"I can see the charges, but I can't tell if this month is weird or normal."_ WLT-22/23 gave them the data; WLT-26 gives them the intelligence layer on top of it.

## User

The same user dogfooding the shipped app — connected accounts, a working ledger (WLT-23), categories corrected (WLT-22), subscriptions marked (WLT-24), follow-ups in progress (WLT-25). The job-to-be-done: **"When I open the dashboard, tell me if anything looks off and show me whether this month's category spending is normal compared to my own history."**

Generalizing: any user who has ≥2 months of transaction history and wants context on their spending, not just a raw ledger.

## Why this matters

WLT-22 through WLT-25 built the data infrastructure and overlay substrate. WLT-26 is the **first feature to deliver spending intelligence on top of that data** — not more data, but meaning layered on top of what's already there.

**Two features, one user anxiety ("is this normal?"), one shared Postgres substrate.** Both features compute from the same `transactions` table, group by the same category/month dimensions, and answer the same root question from complementary angles. Building them together is a coherent product unit; splitting them is artificial.

This bet is also directly load-bearing for the **WAWU north-star** (product.md L38): an anomaly the user investigates or dismisses, and a category bar the user clicks through to, are platform-prompted financial actions — exactly what WAWU counts. The "anomaly catch rate" is an explicit input metric in the north-star definition (product.md L38).

## Hypothesis (the bet)

If we surface **transaction anomalies (new merchant + category spend spike) with per-transaction dismiss** AND a **top-10 category bar chart with a 6-month rolling average line** on the dashboard, then a user who has been connecting their accounts will **act on the intelligence** — measured by: the operator dismisses or investigates ≥3 distinct anomalies AND clicks through ≥1 category bar to the ledger within 30 days of the surface going live.

**Wrong if:** with both surfaces live, the operator dismisses >50% of anomalies immediately (noise, not signal) OR never clicks a category bar (chart is decorative, not actionable) — indicating the intelligence isn't trustworthy enough to act on.

## Defensibility

**Primary moat impact (WLT-26):** Data / proprietary intelligence (row 3) + Switching costs (row 2) — both incremental.

The **dismissal event** is the load-bearing increment: each "I know about this charge" dismiss generates a proprietary suppression corpus — _which merchants and categories this user considers normal_. This corpus accumulates per-user and cannot be replicated by a competitor without the same per-transaction interaction history. At scale, aggregate dismissal patterns reveal which "new merchant" anomalies are actually broad adoption events vs. genuine outliers — a future capability no single-user view can surface.

The **6-month category baseline**, accumulated across users, is the data layer required for future opt-in peer benchmarking ("you spend 2× more on dining than similar users") — not a WLT-26 deliverable, but the data must be structured correctly from day one.

Per-user category baselines become more personalized the longer the user is on the platform — raising exit friction incrementally (switching costs, row 2).

**Moat impact (one line):** Incremental but load-bearing — dismissal events generate a proprietary behavioral corpus that compounds with user count (primary moat row 3 payoff).

## Scope

### In scope

**Sub-feature A: Transaction anomaly panel (dashboard)**

- **Anomaly types in scope this bet:**
  - _New-merchant anomaly:_ a transaction at a merchant with no prior history in the user's 4-month window. Detection: `LEFT JOIN` on transaction history grouped by merchant (Plaid `merchant_entity_id` or normalized `merchant_name`) where prior-period count = 0.
  - _Category spend-spike anomaly:_ current-month spend in a category is on pace to exceed **1.5–2× the rolling 4-month category average** (conservative threshold, operator-calibrated). Detection: `date_trunc('month', ...)` grouping on the existing `transactions` table.
- **Per-transaction dismiss:** a user can acknowledge and dismiss an anomaly. Dismissed anomalies are suppressed from the surface (not re-surfaced unless a new triggering transaction appears). The dismiss gesture must be one tap.
- **Anomaly surface gated on ≥2 months of transaction history** — users below the threshold see an informational empty state ("We'll surface anomalies as you build history."), not a noisy/wrong detector.
- **Dismissal persistence:** a new `anomaly_dismissals(user_id, dedup_key, anomaly_type, dismissed_at)` table — **not** the `transaction_flags` substrate (see scope note below). Suppression semantics: suppress for current month (anomaly re-evaluates next month). Owner: Architect to confirm at architecture pass.
- Funnel events: `anomaly_surfaced`, `anomaly_dismissed`, `anomaly_investigated` (click-through to ledger).

**Sub-feature B: Category spend bar chart with 6-month average line (dashboard)**

- **Top-10 categories by spend** for the current month, rendered as a bar chart.
- **6-month rolling average line** overlaid on each bar — computed server-side as a single-pass Postgres aggregation over `transactions` grouped by `(user_id, category, date_trunc('month', date))`, bounded to a rolling 6-month window. Query bounded by top-10 cap; must pass EXPLAIN ANALYZE at p95 < 200ms.
- **Graceful degradation:** when a user has < 6 months of history, the average line label reads "N-month avg (N months)" — not "6-month avg." The line is suppressed entirely if < 2 months of history.
- **Clickable bar → WLT-23 ledger** with `?category=<slug>&month=<YYYY-MM>` filter applied — reusing the existing ledger table and filter state. **Not a new page** (the user's stated intent is "see the transactions"; the ledger filter achieves this and reuses WLT-23 infrastructure). This resolves research open question #3 — confirmed here in the brief.
- **Chart library:** Recharts `ComposedChart` (bar + reference line overlay) — confirm with Architect.
- Funnel event: `category_bar_clicked`.

### Out of scope (this bet)

- **Amount-anomaly within a known merchant** (same merchant, unusual amount) — too noisy on short history; deferred to a fast-follow after calibration.
- **AI/ML-based anomaly detection** — Postgres-native computation only this bet.
- **Peer benchmarking** (aggregate spend vs. similar users) — future capability enabled by the data layer built here; not a WLT-26 deliverable.
- **Anomaly notifications / push alerts** — the dashboard surface is passive; notifications are a separate bet.
- **Spend-spike threshold configurability by the user** — operator-calibrated threshold at launch; user-facing tuning is a fast-follow.
- **Category bar chart beyond top 10** — pagination/drill-down into all categories deferred.
- **The `transaction_flags` substrate for anomaly dismissals** — anomaly dismissals have different semantics (ephemeral suppression, not a persistent overlay) and warrant a dedicated `anomaly_dismissals` table. The `transaction_flags` substrate is not extended here. Architect confirms at architecture pass.

## Architecture notes (for `/create-bet-architecture`)

- **New table:** `anomaly_dismissals(user_id, dedup_key, anomaly_type, dismissed_at)` — owner RLS (user sees own rows only); `unique(user_id, dedup_key, anomaly_type)`. The `dedup_key` links back to the `transactions` table.
- **Anomaly detection queries:** server-side, Postgres-native, bounded by rolling window + top-N. Must validate with EXPLAIN ANALYZE before launch; index on `(user_id, date, category)` expected to keep sub-50ms for typical corpus sizes.
- **Category aggregation:** single-pass query; rolling 6-month window; top-10 cap. Same index as above.
- **Dismissal semantics (Architect decision):** current-month suppression (re-evaluate next month) vs. permanent (never re-surface for same merchant/category). Research recommends monthly suppression; load-bearing call is Architect's.
- **Chart library:** Recharts `ComposedChart` — confirm with Architect.
- **Route:** category bar click uses existing ledger URL shape; no new route needed.

## Open questions (resolved in this brief)

| #   | Question                                                 | Resolution                                                                                                                                                                                                   |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3   | Clickable bar destination — "new page" vs ledger filter? | **Resolved → ledger filter** (`/transactions?category=<slug>&month=<YYYY-MM>`). The user's intent is "see the transactions"; the WLT-23 ledger with category+month filter achieves this without a new route. |

## Open questions (deferred to architecture or story)

| #   | Question                                                                                       | Owner        | Where resolved                                                            |
| --- | ---------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------- |
| 1   | Anomaly taxonomy: is "amount anomaly for a known merchant" in scope?                           | PM/Architect | Explicitly **out of scope this bet** — see scope above.                   |
| 2   | Dismissal suppression semantics: current-month vs. permanent?                                  | Architect    | `/create-bet-architecture WLT-26`                                         |
| 4   | 6-month baseline graceful degradation: "N-month avg" label vs. line suppressed until 6 months? | Designer     | Story — recommend "N-month avg" label (surfaced sooner, more informative) |
| 5   | Chart library selection: Recharts `ComposedChart` confirmed?                                   | Architect    | `/create-bet-architecture WLT-26`                                         |

## DRI Log

### Decisions

- [2026-06-25] [PM] **Both sub-features in one bet (WLT-26)** — rationale: they share one user anxiety ("is this normal?"), one Postgres aggregation substrate, and one dashboard surface; splitting is arbitrary churn and wastes the shared query optimization — alternatives: two separate bets (rejected — artificial split, each is too thin standalone); anomalies-only first (rejected — the category bar is the clearer, lower-risk sub-feature and validates the baseline data layer the anomaly detector depends on) — area: scope — reversibility: easy (can split before architecture if scope proves too wide)

- [2026-06-25] [PM] **New `anomaly_dismissals` table, NOT extending `transaction_flags`** — rationale: anomaly dismissal is ephemeral suppression (re-evaluates monthly) vs. `transaction_flags` persistent overlay semantics (subscription, follow-up); forcing them onto the same substrate couples unrelated concepts and would require the flag to track time-scoped suppression logic the substrate wasn't designed for — alternatives: extend `transaction_flags` with a new `flag_type='anomaly_dismiss'` (rejected — semantics mismatch; the WLT-24/25 orthogonality invariant depends on flags being persistent overlays) — area: data — reversibility: medium (table rename before first data)

- [2026-06-25] [PM] **Category bar click → WLT-23 ledger with filter (not a new page)** — rationale: the user's stated intent is "see the transactions behind this bar"; the WLT-23 ledger table with `?category=<slug>&month=<YYYY-MM>` query params achieves this, reuses existing infrastructure, and keeps the mental model consistent; a separate "category detail page" duplicates the ledger — alternatives: new `/spending/<category>/<month>` route (rejected — over-build, same content as filtered ledger) — area: UX/frontend — reversibility: easy

- [2026-06-25] [PM] **Anomaly detection threshold: 1.5–2× category rolling average (conservative)** — rationale: false positives destroy trust faster than false negatives on a short history; operator calibration is the right path to tighten the threshold post-launch — alternatives: 1.1× (rejected — too noisy on 4-month window), user-configurable threshold (rejected — premature complexity; fast-follow if demand) — area: product quality — reversibility: easy (config change)

- [2026-06-25] [PM] **Anomaly surface gated on ≥2 months of transaction history** — rationale: anomaly detection on < 2 months is statistically meaningless and erodes trust; empty state is better than a noise-filled surface — alternatives: gate at 1 month (rejected — too short for spend-spike baseline) — area: UX/data — reversibility: easy

- [2026-06-25] [PM] **`architecture_required: true`** — rationale: new table (`anomaly_dismissals`), new server-side aggregation queries, chart library selection, dismissal suppression semantics, and p95 performance validation all warrant an architecture pass — area: process — reversibility: n/a

- [2026-06-25] [PM] **Confluence/Jira mirror skipped** — neither MCP is on this host; no connector in `compass/config.yaml` is live. Logged per "no silent skips." — area: tooling — reversibility: high

### Risks

- [2026-06-25] [PM] **Anomaly false-positive rate inverts trust** — if the detector surfaces too many expected charges as anomalies, users dismiss everything, the surface becomes noise, and the brand/trust moat (row 5) is degraded rather than built — likelihood: medium (inherent at launch on short history) — impact: high — mitigation: conservative threshold (1.5–2×), ≥2-month data gate, per-transaction dismiss as self-calibration mechanism, guardrail on <50% dismiss rate — area: product quality

- [2026-06-25] [PM] **Query performance regression at dashboard load** — the category aggregation (6 months × top-10 categories × all users concurrently at page load) could push dashboard p95 past the 200ms fitness function if the query plan is not validated — likelihood: low (top-10 cap bounds it; indexes expected sub-50ms) — impact: high (architecture.md fitness function violation) — mitigation: EXPLAIN ANALYZE before launch; index on `(user_id, date, category)` required; result cached per user/session if needed — area: performance

- [2026-06-25] [PM] **Short transaction history at launch → empty anomaly surface** — most users at launch have < 4 months of Plaid history; the anomaly detector is gated (≥2 months), so a large fraction will see the empty state initially — likelihood: high (inherent at launch) — impact: medium — mitigation: gated empty state is intentional (avoids noise); the category bar chart (B) still renders for users with ≥1 month of data; user experience degrades gracefully — area: UX

- [2026-06-25] [PM] **Dismissal suppression semantics mismatch user expectation** — if "dismiss" is monthly (re-surfaces next month), users who dismiss a permanent fixture (e.g., a recurring annual subscription billed once as a "new merchant") will need to dismiss it repeatedly — likelihood: medium — impact: low — mitigation: Architect evaluates permanent-suppress-by-type vs. monthly-suppress; the UI label should set expectation ("Dismiss for this month" vs. "Got it, don't flag again") — area: UX/data

### Issues

- [2026-06-25] [PM] **Anomaly suppression semantics (monthly vs. permanent) unresolved** — severity: medium — owner: Architect (`/create-bet-architecture WLT-26`) — status: open — area: data — the load-bearing design call; lean monthly suppression (anomaly re-evaluates each month on fresh data) unless Architect identifies a reason for permanent suppress

- [2026-06-25] [PM] **Chart library for `ComposedChart` (bar + line) not confirmed** — severity: low — owner: Architect — status: open — Recharts is the natural fit with the existing React/Next.js stack; Architect confirms at architecture pass

- [2026-06-25] [PM] **Accumulate dismissal events as structured data from day one** — even if aggregate corpus analysis (moat row 3 long-run payoff) is not a WLT-26 deliverable, the `anomaly_dismissals` table schema must preserve the structured fields needed for future corpus analysis (`anomaly_type`, `dedup_key`, `dismissed_at`) — severity: medium — owner: Architect — status: open — area: data/strategy

---

_Status: proposed. Flip `status: proposed → status: approved` to proceed to `/create-bet-architecture WLT-26`._
