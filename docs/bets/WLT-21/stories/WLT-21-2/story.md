---
id: WLT-21-2
bet: WLT-21
type: story
status: ready
priority: P1
created: 2026-06-16
author: PM
design_link: docs/bets/WLT-21/stories/WLT-21-2/design.md
copy_link: docs/bets/WLT-21/stories/WLT-21-2/copy.md
area_tags: [frontend, spending, budgets, data]
dependencies:
  - WLT-21-1 (the budget table — this expands its rows; shipped)
  - WLT-2 (transactions — the source for the 12-month series; shipped)
---

# WLT-21-2 — The year-spread view (12-month per-category)

## Description

Add the brief's **"ability to see the spread across the year"** to the Budget & Spending table: each category row **expands to a 12-month bar chart** of that category's own monthly spend — built as **custom SVG, no charting dependency**. The data is computed on-read and ships with the page, so expanding is instant. This is the **final slice of bet WLT-21**; when it ships, the bet is complete.

## Acceptance Criteria

- [ ] **AC1 — Expandable row.** Each category row with spend history gains an **expand/collapse** control (real `<button>`, keyboard-operable, `aria-expanded` + `aria-controls`, not color-only) that reveals the year chart inline beneath the row. A **zero-history** row (e.g. a picker-added category with no spend) shows **no** control — no empty graph.
- [ ] **AC2 — The 12-month chart.** A custom-SVG **bar chart** of the category's spend across the **trailing 12 calendar months**, oldest→newest, each bar **month-labeled** (3-letter desktop / initial mobile); bars scale to the category's **own max** (max labeled); the **current partial month is visually distinct (text "so far" + a pattern, not color-only)**. Values are real, from `transactions`.
- [ ] **AC3 — Honest / cold-start.** No-spend months render as **real zero bars**; a category with <12 months of history shows real zeros for pre-history months — **never fabricated/interpolated** values. Consistent with the table's "—" discipline.
- [ ] **AC4 — On-stack, no dependency.** Pure SVG + Tailwind; **no charting library** (the architecture's deferred decision, resolved to custom to avoid a foundational-stack deviation).
- [ ] **AC5 — Accessibility.** A **visually-hidden data table/list** mirrors the chart (one "{Month}: {amount}" row each, current month flagged "this month so far"); each bar carries a `<title>`; the toggle is keyboard-operable with `aria-expanded`/`aria-controls`; current-month distinction is text+pattern (not color-only); WCAG AA; transitions `motion-safe`.
- [ ] **AC6 — Responsive.** Clean + usable on **phone ≤640** (full-width in the card, initial month labels, ≥44px expand target), **tablet**, **desktop** (3-letter labels). No overflow.
- [ ] **AC7 — On-read data, no rollup.** The 12-month series is **computed server-side** in `getBudgetView` (read window widened to ~13 months) and included in `BudgetView` so expanding is **instant** — no new endpoint, no rollup table, no job.
- [ ] **AC8 — Instrumentation.** `budget_spread_viewed` (additive funnel event) emitted on first expand per load (engagement signal for the bet metric).

## Standard Experience Checklist

- [ ] **Navigation** — the in-row expand/collapse control; the chart renders inline (no route change): **AC1**.
- [ ] **States** — collapsed · expanded (full) · expanded (partial history → real zeros) · with-budget (cap line) · no-history (no chart): **AC1, AC2, AC3** + design States table.
- [ ] **Feedback** — expand/collapse is immediate (series ships with the page); `aria-expanded` reflects state: **AC1**. (`n/a — no async fetch on expand`.)
- [ ] **Accessibility** — visually-hidden data table, per-bar titles, keyboard expand, non-color-only current-month marker, AA, reduced-motion: **AC5**.
- [ ] **Edge cases** — <12 months history; a zero-spend month; the current partial month ("so far"); a picker-added zero-history category (no chart): **AC2, AC3** + design.
- [ ] **Cross-surface consistency** — same chart semantics across phone/tablet/desktop, labels adapt: **AC6**. (`n/a — web-only at Phase 1; no native surface`.)

## Tech notes

Per `docs/bets/WLT-21/architecture.md` (on-read compute, no rollup, no new dependency):
- **Compute (`packages/core/budget.ts`):** add `computeMonthlySeries(txns, asOf, months = 12): Map<string, number[]>` — per category, debit spend in each of the trailing 12 calendar months (index 0 = oldest … 11 = current "so far"). Reuse the existing `trailingMonths`/month-key/`round2` helpers; pure + table-tested (`budget.test.ts`).
- **View (`app/lib/budget.ts`):** widen `TRAILING_DAYS` (215 → ~400) to cover 12 full months; add `series: Record<string, number[]>` + the ordered `seriesMonths: string[]` (the 12 'YYYY-MM' keys) to `BudgetView`; thread through `getBudgetView` (still one read).
- **UI:** new `app/(app)/budget/YearSpread.tsx` — the accessible custom-SVG bar chart (bars + labels + current-month marker + visually-hidden data table + optional budget-cap line). Wire an expand/collapse into `app/(app)/budget/BudgetClient.tsx` (per-row open state; emit `budget_spread_viewed` on first open via a tiny client→route or reuse the page's funnel — see below). Add the `budgetYear` copy block + the additive funnel event in `packages/core/funnel.ts`.
- **Event path:** `budget_spread_viewed` is a client interaction → emit via a lightweight `POST /api/budget` variant or a dedicated tiny route; simplest is a `fetch("/api/budget/spread-viewed")` no-op endpoint guarded by `getAal2UserId()` (mirrors the existing route guard). Engineer's call — keep it additive + non-blocking.
- **Reuse:** the WLT-21-1 row/table structure, `humanizeCategory`, the local money formatter; `@wealth/ui` for the toggle button. **No new dependency.**

## PRs

_To be linked on build._

Tags:
- `regression: false`
- `e2e: true`

## Tests

_Engineer: unit (`packages/core/budget.test.ts` — `computeMonthlySeries`: 12 ordered months, real zeros for gap/pre-history months, current month is the last index, `null`→Other), component (`YearSpread`/`BudgetClient` jsdom — expand reveals the chart + the visually-hidden data table; no control for a zero-history row; current month labeled "so far"; `aria-expanded` toggles). Codex: extend the gated real-path E2E (`e2e/budget.spec.ts`) — seed ≥2 months of a category → expand its row → the year panel renders the real monthly values (the RSC→RLS→render path)._

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-16] [PM, elicited] **Expand-on-demand per row** (not an always-on sparkline column or a full year-view toggle) — rationale: keeps the table scannable + lets the chart be legible (labels, budget line) + works on mobile; matches the brief's "an ability to see" — area: ux — reversibility: easy
- [2026-06-16] [PM] **Custom SVG, no charting library** — rationale: a dep trips the foundational-stack deviation gate (would need `/setup-foundation-architecture` + the user's opt-in); a 12-bar chart is trivially hand-drawn — area: stack — alternatives: recharts/visx (rejected — deviation for a tiny chart) — reversibility: medium
- [2026-06-16] [PM] **On-read series, shipped with the page** — rationale: 12×~13 numbers is tiny; preloading makes expand instant + avoids a new endpoint/rollup — area: performance — reversibility: easy

### Risks
- [2026-06-16] [PM] **SVG-chart accessibility is easy to under-build** — likelihood: medium — impact: medium — mitigation: the visually-hidden data table is the load-bearing equivalent (AC5); bars are supplementary — area: a11y
- [2026-06-16] [PM] **Current partial month misreads as a real dip** — likelihood: medium — impact: low — mitigation: "so far" text + a pattern marker, in both the bar and the screen-reader text — area: trust

### Issues
- [2026-06-16] [PM] **Budget-cap reference line scope** — severity: low — owner: Engineer — status: open — area: ux — ship the bars first; add the faint cap line only if it doesn't complicate the scaling.
- [2026-06-16] [PM] **`budget_spread_viewed` emit path** — severity: low — owner: Engineer — status: open — area: instrumentation — pick the lightest additive path (tiny route vs. piggyback); must be non-blocking.

_Story status: ready — Standard Experience Checklist has no empty category. Shipping this completes bet WLT-21._
