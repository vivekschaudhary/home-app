---
workflow: fix
step: 4
agent: engineer
task: respond-to-review
generated: 2026-06-25 11:20
commit: 8674efa
---

## Findings addressed

All 5 ISSUEs addressed. 2 NITs: NIT-2 addressed, NIT-1 (return connectionIds from route) disputed below.

### [ISSUE 1] Sync completion detection — FIXED

`activeIdsRef` now stores the Set of connectionIds that were active at trigger time (filtered from the pre-trigger fetch by `healthStatus === "active"`). The completion effect was changed from `connections.some(...)` to `[...activeIds].every(...)` — syncing only clears when ALL triggered connections have an updated `lastSyncedAt`, or after the 120 s hard timeout.

File: `app/(app)/accounts/AccountsClient.tsx`

### [ISSUE 2] Missing AccountsClient tests — FIXED

Added a new `describe` block in `AccountsClient.test.tsx` with 5 tests:
- mount calls `fetchConnections` then `triggerRefresh`
- syncing indicator appears when `triggerRefresh` returns true
- no indicator when `triggerRefresh` returns false
- syncing clears when ALL active connections have updated `lastSyncedAt` (5 s poll, fake timers)
- hard timeout at 120 s clears syncing (fake timers)

### [ISSUE 3] Framework registration — VERIFIED

Build ran; manifests confirmed:
- `.next/server/functions-config-manifest.json` → `/api/aggregation/connections/refresh` present
- `.next/server/app-paths-manifest.json` → `app/api/aggregation/connections/refresh/route.js`
- Runtime: nodejs (declared via `export const runtime = "nodejs"` in route source)

### [ISSUE 4] Route test missing disconnected fixture — FIXED

Added `stubConn({ connectionId: "conn-disconnected", healthStatus: "disconnected" })` to the "skips non-active connections" test. The expectation already asserted only 1 triggered; the fix makes the test actually exercise the described case.

### [ISSUE 5] Sign-in success a11y — FIXED

Added `<p role="alert" className="sr-only">{COPY.signinSuccess}</p>` to the success branch. `role="alert"` implies `aria-live="assertive"` — fires immediately on render, before the 900 ms `router.push`. Toast's `aria-live="polite"` is kept for sighted users but can be pre-empted by navigation.

File: `app/sign-in/SignInFlow.tsx`

### [NIT 1] Return connectionIds from route — NOT addressed

The route could return `{ triggered: number, connectionIds: string[] }` to let the client explicitly wait for those IDs. The ISSUE 1 fix achieves equivalent "wait for all" semantics by filtering active IDs on the client side from the pre-trigger fetch, which is the approach the reviewer described in their own fix suggestion. Adding an API surface change for this would require touching 3 files and creates a versioning consideration. Deferring unless Reviewer insists.

### [NIT 2] triggerRefresh error logging — FIXED

Added `console.error` for both non-OK response and fetch-failure paths. Operationally visible; no user-facing change.

## Test results

402 tests pass, 41 skipped (pre-existing skips). 0 failures.

## Production build

Green. Functions-config and app-paths manifests verified above.
