---
id: FIX-budget-popovers
type: fix
hygiene: true
status: in-review
severity: P3
affects_bets: [WLT-22, WLT-21]
area_tags: [frontend, ux, accessibility]
author: Engineer
created: 2026-06-18
---

# Fix: budget drill-down + year-spread — popovers, not inline-table expansion

## Triage

- **Severity:** P3 — UX consistency, not a functional defect. The numbers + flows are correct; the *presentation* (a panel that expands **inside** the table row, pushing the rows below) reads disjointed.
- **Source:** user UX preference (2026-06-18) — _"use popups wherever applicable and not inline table."_ See memory [[prefer-popovers-over-inline-table-expansion]].
- **Affected surfaces (shipped):** the WLT-22-1 **drill-down** line-items panel and the WLT-21-2 **year-spread** chart, both inline `<tr>` expansions in `app/(app)/budget/BudgetClient.tsx`.
- **Classification:** hygiene (preference-driven UX change to shipped UI), linked to WLT-22 + WLT-21 for defect attribution.

## Fix

Convert both inline `<tr>` expansions to **Headless UI `Popover`** panels anchored to their triggers (`PopoverButton` + `PopoverPanel anchor`):
- **Portal-anchored** → no table-cell clipping; the panel renders outside the budget `<table>`.
- **Headless UI is portal-aware** → the drill-down's nested recategorize picker (a `Menu`) does NOT close the parent popover on interaction (the reason a hand-rolled outside-click overlay was rejected).
- Focus management + `Escape` + outside-click close come from Headless UI.
- The drill panel is scrollable (`max-h-[60vh] overflow-auto`) for tall histories; the year panel is wider for the chart.

**Behavior change (intended):** one popover open at a time (Headless UI closes others on outside-click) — replaces the prior "expand several rows at once." Loses side-by-side compare of two categories' line items; accepted for the cleaner pattern.

**Logic preserved:** the lazy-load (once per category per load), the `budget_spread_viewed` / `category_drilldown_viewed` events (fired once per category per load, idempotent on the popover's toggle-close), and the recategorize reconcile (drop the drill cache + refetch the source popover so it updates live).

## Verification

- `pnpm typecheck` · `pnpm lint` · `pnpm test` (full suite **236 green**) · `pnpm build` (green; `/budget` registered).
- Budget suite **22 green** incl. a new regression guard: the opened drill + year panels are **portaled out of the budget `<table>`** (`budgetTable.contains(panelContent) === false`) — a revert to the inline-row pattern fails it.
- The existing open/close/content/event/reconcile assertions all pass unchanged against the popover implementation.

## DRI Log

### Decisions
- [2026-06-18] [Engineer] **Headless UI `Popover` (not a hand-rolled overlay)** — rationale: the drill panel contains a nested Headless UI `Menu` (the recat picker) that portals outside the panel; only a portal-aware popover keeps the parent open during a nested-picker interaction — area: ux/a11y — reversibility: easy
- [2026-06-18] [Engineer] **Single-open popover model** — rationale: the natural popover behavior; minor loss of multi-row compare, accepted — area: ux — reversibility: easy

### Risks
- [2026-06-18] [Engineer] **Nested popover (recat picker inside the drill popover) could mis-behave on outside-click** — likelihood: low — impact: medium — mitigation: Headless UI tracks nested floating elements; the gated real-path E2E (Codex) should exercise recategorize-from-the-popover — area: ux

### Issues
- [2026-06-18] [Engineer] **jsdom can't assert popover positioning** — severity: low — owner: Codex — status: open — anchoring/overflow is visual; the unit guard asserts portaling + open/close, not pixel placement.
- [2026-06-18] [Codex→Engineer] **Nested-popover real-path E2E missing (BLOCKER)** — severity: blocker — owner: **Codex (Reviewer)** — status: open — routed back per cross-model independence (the WLT-22 / WLT-23-1 pattern; fix workflow Phase 3 step 16). Codex to extend `e2e/budget.spec.ts`: open drill popover → open the nested picker inside it → parent stays open → recategorize reconciles through session→RLS→render.
