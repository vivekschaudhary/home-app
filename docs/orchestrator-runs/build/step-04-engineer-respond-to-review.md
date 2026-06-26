---
workflow: build
step: 4
agent: engineer
task: respond-to-review
pr: 119
branch: feat/WLT-26-bet-context-wlt-26-briefmd-----id
fix_commit: f5a06e7
generated: 2026-06-26
---

## Findings addressed

### [BLOCKER] Category bars are not clickable — FIXED

**Root cause:** The SVG `<rect>` bars were `aria-hidden` but had no pointer interaction. The `emitBarClick` funnel and navigation were only reachable via the `sr-only` table links — invisible to sighted users.

**Fix (commit `f5a06e7`):**
- `app/(app)/dashboard/CategorySpendChart.tsx` — imported `useRouter` from `next/navigation`; moved `href` computation into the SVG map; added `onClick={() => { router.push(href); emitBarClick(...) }}` + `className="cursor-pointer"` to each `<g>` element; prepended a transparent full-slot `<rect>` (width=STEP, height=CH) in each group as a larger hit target.

### [ISSUE] N open→surfaced UPDATEs per read — FIXED (batched)

**Fix (commit `f5a06e7`):**
- `app/lib/anomaly.ts` — collected all `open` rows before the build loop; issued a **single** `UPDATE anomalies SET status='surfaced' WHERE id IN (...) AND status='open'`; then emitted `ANOMALY_SURFACED` per transitioned row. Eliminates N round-trips.

### [ISSUE] Framework-registration check — VERIFIED

From `pnpm build` at HEAD `f5a06e7`:

`.next/server/functions-config-manifest.json`:
```json
{
  "/api/dashboard/anomaly-investigated": {},
  "/api/dashboard/category-bar-clicked": {}
}
```

`.next/server/app-paths-manifest.json`:
```json
{
  "/api/dashboard/category-bar-clicked/route": "app/api/dashboard/category-bar-clicked/route.js",
  "/api/dashboard/anomaly-investigated/route":  "app/api/dashboard/anomaly-investigated/route.js"
}
```

Both routes registered at their expected paths.

### [NIT] Defensive cap on bars — FIXED

Added `bars.slice(0, N)` in `CategorySpendChart.tsx` to enforce geometry consistency at the component boundary.

---

## Disputes

### [ISSUE] `searchParams` Promise typing — DISPUTED

Reviewer asserts `searchParams` should be a plain object. In **Next.js 15** (this project: `^15.1.0`), `searchParams` is officially an **async dynamic API typed as `Promise<...>`** and must be awaited. The current code is correct and consistent with `app/reset/page.tsx`. No change made.

### [NIT] avg legend phrasing — DISPUTED

Reviewer flags `"N-month avg (N months)"` as redundant. **AC5** of story WLT-26-1 explicitly specifies this exact format: `"N-month avg (N months)"` for 2–5 months. Changing it would contradict the accepted spec. No change made.

---

## Verification

- 435 tests pass (unchanged from before — no regressions)
- `pnpm tsc --noEmit` clean
- Production build green, runtime artifacts inspected

## Status

Fix commit `f5a06e7` pushed to origin. Review response + dispute reasoning posted on PR #119. Re-review requested.
