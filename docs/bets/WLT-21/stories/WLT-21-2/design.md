# Design: WLT-21-2 — The year-spread view

## Design intent

Answer one question per category: **"is this month normal for me?"** A user looks at their budget table, wonders why a category feels high or low, and wants to see its **own 12-month rhythm** — on demand, without leaving the table. Calm and factual: real monthly bars, the current month honestly marked as still in progress, no trend-line storytelling or fabricated smoothing.

## Surfaces & flow

Builds directly on the WLT-21-1 row:

1. Each category row (that has spend history) gains an **expand control** — a chevron + "View the year" (collapsed) / "Hide" (expanded). Keyboard-operable; `aria-expanded` reflects state.
2. Expanding opens an **inline panel beneath the row** with: a one-line caption ("Monthly {category} spend — last 12 months"), the **bar chart**, and (when a budget is set) a faint **cap reference line**.
3. Collapsing returns focus to the toggle. Multiple rows can be open at once (independent per-row state).
4. A **zero-history** row (e.g. a picker-added category with no spend) shows **no expand control** — there's nothing honest to chart.

## The chart (custom SVG — no library)

- **12 equal-width bars**, oldest → newest, height ∝ that month's spend, scaled to the **category's own max** (so a small category isn't dwarfed). The max value is labeled.
- **Month labels** under each bar: 3-letter on desktop (Jan…Dec), single-initial on mobile.
- **The current (partial) month** is rendered **distinctly** (lighter fill + a hatched/outline treatment, not color alone) and labeled **"so far"** — so an in-progress low bar never reads as a real dip.
- **Zero months** render as a baseline tick (a real, honest zero) — never interpolated or hidden.
- **Budget cap line** (nice-to-have, not load-bearing): when the category has a saved budget, a faint horizontal reference line at the effective cap, with a small legend — so the spread reads against the limit. Omitted when no budget is set.
- **Hover/focus a bar** → its month + amount (via the bar's `<title>` + a focus state).

## States (every state ships)

| State | What renders |
|---|---|
| **Collapsed** | The row as in WLT-21-1 + the "View the year" control. |
| **Expanded — full history** | 12 real monthly bars + labels + max; current month "so far". |
| **Expanded — partial history** | Real zeros for pre-history months (honest), real bars where data exists. |
| **Expanded — with budget** | + the faint cap reference line + legend. |
| **No history** | No expand control (nothing to chart) — never an empty graph. |

## Responsive

- **Desktop/tablet:** the panel spans the row width; 3-letter month labels; comfortable bar spacing.
- **Phone ≤640:** the panel is full-width inside the category card; single-initial month labels; the expand target is ≥44px. No horizontal scroll.

## Accessibility

- The chart is decorative-with-data: a **visually-hidden data table** (or list) mirrors it — one row per month: "{Month}: {amount}" — so screen readers get the real numbers, not "chart".
- Each `<rect>` bar carries a `<title>` (month + amount); bars are focusable where it aids navigation.
- The expand control is a real `<button>` with `aria-expanded` + an accessible label; the panel is associated via `aria-controls`.
- The current-month distinction is conveyed by **text ("so far") + pattern**, never color alone. WCAG AA contrast on bars + labels.
- Reduced-motion: the expand/collapse uses `motion-safe` only.

## Honest / reduced-design notes

- **Real zeros, never interpolated.** A month with no spend is a zero bar; pre-history months are zeros, not omitted or guessed.
- **No chart for zero-history categories** — consistent with the table's "—" / honest-empty discipline (WLT-21-1).
- **No new dependency** — pure SVG + Tailwind. A charting library would trip the foundational-stack deviation gate; deliberately avoided.
- Scope: per-category 12-month spend only — no cross-category comparison, no forecasting, no zoom/range controls (later if wanted).

## DRI Log

### Decisions
- [2026-06-16] [Designer] **Expand-on-demand (not an always-on sparkline column)** — rationale: keeps the table scannable + lets the chart be legible with month labels + a budget line; better on mobile than a tiny inline spark — area: ux — alternatives: inline sparkline (rejected — too small/tight on mobile, no labels), full year-view toggle (rejected — denser build, out of scope) — reversibility: easy
- [2026-06-16] [Designer] **Bars, not a line** — rationale: "spread across the year" is about per-month magnitude/variation; bars read magnitude better than a trend line — area: ux — reversibility: easy
- [2026-06-16] [Designer] **Current month marked "so far" + patterned** — rationale: an in-progress month is partial; without the marker a low current bar reads as a real drop (a fabricated-insight risk) — area: trust — reversibility: easy

### Risks
- [2026-06-16] [Designer] **A tiny SVG chart is easy to get wrong on a11y** — likelihood: medium — impact: medium — mitigation: the visually-hidden data table is the load-bearing equivalent; bars are supplementary — area: a11y

### Issues
- [2026-06-16] [Designer] **Budget-cap line scope** — severity: low — owner: Engineer — status: open — area: ux — the cap reference line is a nice-to-have; ship the bars first, add the line if it doesn't complicate scaling.
