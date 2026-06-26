---
id: WLT-26-1
bet: WLT-26
type: story
status: ready
priority: P2
created: 2026-06-25
author: PM
design_link: docs/bets/WLT-26/architecture.md
area_tags: [frontend, backend, data, spending, dashboard]
dependencies:
  - WLT-22     # effectiveCategory + countsAsSpending + normalizeMerchant (category resolver)
  - WLT-23     # readTransactionsPage category filter (this slice extends it with ?month=)
---

# Category spend bar chart with 6-month rolling average

## Description

The user opens their dashboard and sees a **top-10 category bar chart** showing what they spent this month, each bar overlaid with a **dashed average reference line** computed from their own 6-month rolling history. The chart tells them at a glance whether this month is normal — the root question behind the WLT-26 bet. Clicking any bar navigates to their WLT-23 ledger pre-filtered to that category and month, so they can drill into the actual transactions. The chart is honest: it only shows the average line when ≥ 2 months of history exist, and gracefully labels it "N-month avg (N months)" when fewer than 6 complete months are on file. This slice is fully independent of the anomaly panel (WLT-26-2) — it delivers the "context on spend" sub-feature first, which validates the aggregation query and the index before the more complex anomaly detector lands. Gated by `DASHBOARD_INTELLIGENCE_ENABLED`.

## Acceptance Criteria

- [ ] **AC1 — pure compute (`packages/core/dashboard-spend.ts`):** export `buildCategorySpendChart(txns: AnomalyTxn[], asOf: Date): CategorySpendChart` where `CategorySpendChart = { bars: CategoryBar[], monthsOfHistory: number }` and `CategoryBar = { category: string, label: string, currentMonth: number, average: number | null }`. Rules: (a) drop transfers/payments via `countsAsSpending` (WLT-22-5 discipline — same as the budget compute); (b) group by resolved category + calendar month; (c) average = **median** of prior complete months in the rolling 6-month window (reuse `median` / `trailingMonths` from `@wealth/core/budget.ts` — the Architect's lean: median is robust to a one-off spike inflating its own baseline); (d) `average = null` when `monthsOfHistory < 2`; (e) top-10 by current-month spend (ties broken alphabetically by category); (f) `monthsOfHistory` = count of distinct calendar months with ≥ 1 spending transaction for this user. Unit tests: top-10 selection, correct median across prior months, ties broken alphabetically, `average = null` when `< 2` months, labeled "N-month avg" at `< 6` months (see AC5), transfers excluded.

- [ ] **AC2 — data read (`app/lib/dashboard-spend.ts`):** `readCategorySpendChart(userId: string)` performs an owner-scoped `readAllPaged` on `transactions` bounded to a **rolling 6-month window** (from the start of the month 5 calendar months before `now()` through today), resolves each transaction's category via `effectiveCategory` (WLT-22 discipline), feeds the result to `buildCategorySpendChart`, and returns the structured `CategorySpendChart`. Uses the `(user_id, occurred_on, category)` index — performance validated by EXPLAIN ANALYZE before launch (see performance note below). No public API endpoint; consumed by the dashboard RSC.

- [ ] **AC3 — ledger month filter (additive, `app/lib/transactions.ts` + `app/(app)/transactions/page.tsx`):** `readTransactionsPage` gains an optional `month?: string` (YYYY-MM) parameter that bounds `occurred_on >= first-day-of-month` AND `occurred_on <= last-day-of-month`, composing with the existing `category` + `account` filters via the bounded keyset scan. `transactions/page.tsx` reads `searchParams.month` and passes it to the read. No `month` param = the existing all-dates behavior (backwards-compatible, no existing callers change). An invalid or malformed `month` value is ignored (treated as absent).

- [ ] **AC4 — `CategorySpendChart` component (`app/(app)/dashboard/CategorySpendChart.tsx`):** custom SVG bar chart following the `YearSpread.tsx` idiom — **no charting dependency** (architecture decision, Architect confirmed). Renders up to 10 bars (current-month spend per category). When `average !== null`, draws a **dashed horizontal reference line** at the average value per the `YearSpread` `cap`-line precedent (`strokeDasharray="3 3"`). Each bar is an anchor link to `/transactions?category=<resolved>&month=<YYYY-MM>` (resolved category name matching the `readTransactionsPage` `category` opt). The SVG is `aria-hidden="true"`. An `sr-only` `<table>` mirrors the bar data (category, current spend, average) for screen readers — a11y parity with `YearSpread`. Bar charts render only when `bars.length > 0`; otherwise AC6 empty state is shown.

- [ ] **AC5 — N-month avg graceful degradation:** the reference line legend/label reads `"N-month avg (N months)"` when `monthsOfHistory` is 2–5 (e.g. `"3-month avg (3 months)"`). At `monthsOfHistory >= 6` it reads `"6-month avg"`. At `monthsOfHistory < 2` no reference line is drawn at all (see AC1 — `average = null`). The `sr-only` table caption and the visible chart legend both reflect the correct label.

- [ ] **AC6 — empty states (two distinct cases):** (a) `monthsOfHistory < 2` → the chart area renders an informational empty state ("We'll show your spending trends as you build history." or equivalent from copy.ts) — no chart, no broken SVG; (b) current month has no spending transactions (all bars would be zero) → a distinct empty state ("No spending this month.") — also no chart. The empty state for (a) is also shown when the user has no connected accounts (no transactions at all). Both states are honest — no fabricated zeros or placeholder bars.

- [ ] **AC7 — dashboard integration (`app/(app)/dashboard/page.tsx`):** a `DashboardIntelligence` section is added to the dashboard page, containing `CategorySpendChart` wrapped in a `Suspense` boundary (skeleton fallback). This section is gated by `process.env.DASHBOARD_INTELLIGENCE_ENABLED` — when the flag is absent or `'false'`, the section is not rendered. The page remains `force-dynamic` and AAL2-guarded (no change). The anomaly panel placeholder is **not** added in this slice; the `DashboardIntelligence` section holds only the chart component for now. No change to the recap surface, budget surface, or ledger defaults.

- [ ] **AC8 — funnel event:** `CATEGORY_BAR_CLICKED: "category_bar_clicked"` is added to `packages/core/funnel.ts`. The `CategorySpendChart` component emits it once per bar click (fire-and-forget via the existing `emit` pattern) before navigation. No server-side route needed — emitted client-side on click.

- [ ] **AC9 — copy (`app/lib/copy.ts`):** a `dashboardIntelligence` copy block is added with at minimum: `categoryChartTitle` (display title for the section), `categoryChartEmptyNoHistory` (AC6a text), `categoryChartEmptyNoSpend` (AC6b text), `categoryBarClickedSrLabel` (screen-reader label for each bar link, e.g. `"View {category} transactions for {month}"`), and `categoryChartTableCaption` (sr-only table caption). The UX Writer owns the exact strings; Engineer uses these tokens — no inline string literals in the component.

- [ ] **AC10 — E2E test-data cleanup:** any E2E test that seeds transactions for the chart MUST hard-delete the seeded rows after the run. No orphaned test-transaction rows in shared or prod-like environments.

## Standard Experience Checklist

- [x] **Navigation** — each bar is a link to the existing WLT-23 ledger (no new page); the back path from the ledger is the existing browser back; the empty states are non-navigable — covered by AC4, AC6.
- [x] **States** — Suspense skeleton (loading) / empty-no-history (AC6a) / empty-no-spend (AC6b) / loaded chart with data / partial-history N-month avg label (AC5) — covered by AC1, AC5, AC6, AC7.
- [x] **Feedback** — bar link click emits `CATEGORY_BAR_CLICKED` and navigates to the filtered ledger; the avg label communicates the baseline window honestly; empty states explain what's missing — covered by AC4, AC5, AC6, AC8.
- [x] **Accessibility** — SVG is `aria-hidden`; `sr-only` data table provides the full chart data to screen readers; bar links carry a screen-reader label (`categoryBarClickedSrLabel`) naming the category and month; the avg legend/label is text (not colour-only) — covered by AC4, AC9.
- [x] **Edge cases** — `< 2` months history (no reference line, empty state AC6a); `< 6` complete months (N-month label AC5); current month has no spending (empty state AC6b); invalid `?month=` param on ledger (ignored, AC3); no connected accounts (falls into AC6a) — covered by AC1, AC3, AC5, AC6.
- [x] **Cross-surface consistency** — single web surface: `n/a — web only`. The load-bearing consistency is the WLT-23 ledger filter contract: the category name passed in the bar link must match the value `readTransactionsPage` resolves from `?category=` (see tech notes below).

## Tech notes

Build on the WLT-26 architecture. This is a read-only, additive slice with no migration and no new API routes.

**Key cross-cutting concern — category identity to the ledger filter:** the `category` value encoded in the bar's link href must exactly match the resolved category string that `readTransactionsPage`'s `category` opt accepts. Confirm the exact param value against `readTransactionsPage`'s contract (the resolved category name from `effectiveCategory`) before building `CategorySpendChart`. A mismatch silently shows an unfiltered ledger — the AC4 bar link behavior depends on getting this right.

**Average = median:** the Architect leans toward median (not mean) for the reference line, for consistency with the budget baseline compute and robustness to a one-off spike inflating its own baseline. The `SPIKE_MULTIPLE` constant (for the anomaly panel, WLT-26-2) is calibrated on this same median baseline — so the chart and the detector stay consistent.

**Performance:** before shipping, run `EXPLAIN ANALYZE` on `readCategorySpendChart`'s query and confirm the `(user_id, occurred_on, category)` composite index keeps the aggregation under 50ms for a typical corpus. The dashboard p95 < 200ms fitness function (architecture.md) covers the full dashboard load including this component. If the bounded `readAllPaged` + pure-compute pattern misses the target, Alt D (a SQL `GROUP BY` aggregation RPC) is the documented escalation — do not ship without validating.

**Feature flag:** `DASHBOARD_INTELLIGENCE_ENABLED` environment variable. Mirror the `RECAP_ENABLED` gate pattern already in the dashboard page. Default off. Flip after operator calibration of the full WLT-26 surface (both chart + anomaly panel).

**Out of scope for this slice:** the anomaly panel and its `0018_anomaly_kinds.sql` migration (WLT-26-2); anomaly detector rules; the `readDashboardAnomalies` function; the `AnomalyPanel` component; the `ANOMALY_INVESTIGATED` funnel event; any chart pagination or "all categories" view (brief out-of-scope).

## PRs

_Auto-populated as PRs open._

## Tests

- **Engineer (pure, `packages/core/dashboard-spend.test.ts`):** `buildCategorySpendChart` — top-10 selection; median average over prior complete months; ties broken alphabetically; `average = null` when `< 2` months; N-month label when `< 6` months; transfers/payments excluded via `countsAsSpending`; current-month calculation; no fabricated zeros.
- **Engineer (integration, `app/lib/dashboard-spend.test.ts`):** `readCategorySpendChart` with a real Postgres — returns the correct chart structure for a seeded user; `monthsOfHistory` accurate; empty-no-history case.
- **Engineer (component, `app/(app)/dashboard/CategorySpendChart.test.tsx`):** renders 10 bars with correct hrefs; dashed reference line present when `average !== null`; no reference line when `average = null`; N-month label copy; empty-no-history state; empty-no-spend state; `sr-only` table rows match bar data; bar click emits `category_bar_clicked`; SVG is `aria-hidden`.
- **Engineer (ledger month filter, `app/lib/transactions.test.ts` extension):** `readTransactionsPage` with `month='2026-05'` returns only May 2026 transactions; composes with existing `category` filter; no `month` param = existing behavior; malformed `month` ignored.
- **Codex (separate handoff):** RLS coverage for `readCategorySpendChart` (owner sees own transactions only; cross-tenant deny; the bounded scan respects RLS) + the gated real-path E2E: seed two months of transactions for a user → chart renders with reference line → click a bar → lands on the filtered ledger with the correct category + month pre-applied → second-user isolation (user B cannot see user A's chart data) → test-data hard-deleted (AC10).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions

- [2026-06-25] [PM] **WLT-26-1 = category chart only (Sub-feature B); anomaly panel is WLT-26-2** — rationale: the architecture explicitly flags the category chart as "lower-risk" and recommends it as the first stage; it validates the aggregation query + the `(user_id, occurred_on, category)` index before the more complex anomaly detector lands; it also delivers immediate value (spending context) without any migration — alternatives: bundle chart + anomaly panel in one story (heavier; anomaly panel requires the migration + scan extension + new detector rules; makes the first story harder to review and verify) — area: scope — reversibility: easy

- [2026-06-25] [PM] **Ledger month filter is part of this slice (not WLT-26-2)** — rationale: the category bar link (`?category=&month=`) is the primary action the chart enables; shipping the chart without a working bar click is a broken surface; the month filter is a small additive extension of the shipped WLT-23-2 bounded keyset scan — area: scope — reversibility: easy

- [2026-06-25] [PM] **`DASHBOARD_INTELLIGENCE_ENABLED` flag wraps the full `DashboardIntelligence` section** — rationale: keeps the chart dark until the operator has calibrated the full surface (chart + anomaly panel together); avoids partial launch where only the chart is live while the panel stub doesn't exist yet — area: rollout — reversibility: easy (flip the flag)

- [2026-06-25] [PM] **Arbitration PR #118: AC4 accessibility pattern confirmed correct; Next.js 15 searchParams typing confirmed correct** — rationale: Reviewer raised 2 ISSUEs and 1 NIT post-BLOCKER-fix. (1) Keyboard a11y ISSUE dismissed — engineer implemented the story's AC4-specified "aria-hidden SVG + sr-only table" idiom; concern about visible focus deferred as DRI Issue. (2) searchParams Promise typing ISSUE dismissed — project is `next: ^15.1.0`; awaiting searchParams is idiomatic in Next 15+. (3) Copy NIT dismissed — UX Writer was blocked; no copy.md source exists; engineer's copy matches AC9 token spec. PR #118 clear to merge after Reviewer re-confirms BLOCKER fix — area: process — reversibility: n/a

- [2026-06-26] [PM] **Arbitration PR #119 (HEAD da7953e): BLOCKER resolved; both disputes settled for engineer; PR clear to merge** — rationale: (1) BLOCKER (bars not clickable) confirmed resolved — each `<g>` now carries `onClick`+router.push+emitBarClick+transparent hit-rect+cursor-pointer; verified by code inspection. (2) `searchParams: Promise<...>` ISSUE dismissed again — same ruling as PR #118; `next: ^15.1.0` makes async searchParams idiomatic; reviewer applied Next.js 14 semantics. (3) `"N-month avg (N months)"` copy NIT dismissed — AC5 explicitly mandates this phrasing; changing it without a story amendment would contradict the accepted spec. (4) Framework-registration ISSUE resolved — engineer provided build-manifest evidence. (5) Batch-UPDATE ISSUE resolved — anomaly.ts now uses single `UPDATE … WHERE id IN (…)`. (6) E2E visible-bar-click gap deferred as DRI Issue (non-blocking) — area: process — reversibility: n/a

### Risks

- [2026-06-25] [PM] **Category identity mismatch between chart bar link and the ledger `?category=` filter silently shows an unfiltered ledger** — likelihood: low (the resolved category is a simple string match) — impact: medium (clicking a bar navigates correctly but shows all transactions, not the filtered set — trust regression) — mitigation: AC4 notes the exact contract check; a component test asserts the `href` encodes the resolved category matching `readTransactionsPage`'s opt — area: correctness

- [2026-06-25] [PM] **Category aggregation misses the p95 < 200ms fitness function** — likelihood: low (bounded 6-month window + top-10) — impact: high (architecture.md fitness function violation) — mitigation: EXPLAIN ANALYZE pre-launch; the Alt D SQL aggregation RPC is the documented escalation — area: performance

### Issues

- [2026-06-25] [Engineer] **Confirm `(user_id, occurred_on, category)` index exists or create it** — severity: medium — owner: Engineer — status: open — area: performance — the architecture assumes this index; if it doesn't exist as named, the additive migration `0018` (owned by WLT-26-2) may need to carry it, OR this slice adds a standalone `0018_category_index.sql` migration (coordinate with WLT-26-2 to avoid a numbering collision — whoever lands first takes 0018, the other takes 0019)

- [2026-06-25] [Engineer] **Average = mean or median — confirm with Architect before building** — severity: low — owner: Engineer — status: open — area: data — the Architect leans median (for spike-robustness and consistency with the budget baseline); the `SPIKE_MULTIPLE` in WLT-26-2's detector is calibrated on the same baseline, so both must agree on mean vs median

- [2026-06-25] [PM] **A11y: sr-only bar links have no visible focus ring for sighted keyboard users** — severity: low — owner: Engineer — status: open — area: accessibility — the current implementation follows the AC4-specified "aria-hidden SVG + sr-only table" idiom from YearSpread.tsx; sr-only links are keyboard-reachable but their focus indicator is clipped by Tailwind's `sr-only` class (overflow: hidden / clip). Sighted keyboard users cannot see which link has focus. Deferred from PR #118 arbitration (engineer correctly followed AC4 spec). Post-WLT-26-1 improvement: upgrade to visible `<a>` elements below the chart OR apply `focus:not-sr-only` Tailwind utility so the focused link becomes visible — whichever matches the design system pattern.

- [2026-06-26] [PM] **E2E gap: no test asserts visible bar click → /transactions?category=&month= navigation** — severity: low — owner: Engineer — status: open — area: test-coverage — the reviewer correctly identified that the E2E suite (step 2) covers anomaly panel flows only; no test clicks a visible SVG bar (not the sr-only link), asserts the resulting URL carries both `?category=<slug>&month=<YYYY-MM>`, or verifies the CATEGORY_BAR_CLICKED funnel POST fires. Deferred from PR #119 arbitration (non-blocking; bar-click behavior verified by code inspection). Should be added in a follow-on test commit or as part of the WLT-26-2 E2E pass.

---

_Story under bet: docs/bets/WLT-26/brief.md_
