---
workflow: fix
step: 4
agent: engineer
task: respond-to-review
generated: 2026-06-25 12:35
---

## Findings addressed

Reviewer returned 3 ISSUEs + 2 NITs. All addressed below (NIT-2 defended with inline justification rather than a code change).

### [ISSUE 1] Framework-registration check — VERIFIED

Production build ran. Runtime-artifact inspection confirms:

- `.next/server/functions-config-manifest.json` → `"/api/aggregation/connections/refresh": {}`
- `.next/server/app-paths-manifest.json` → `"app/api/aggregation/connections/refresh/route.js"`
- Route declares `export const runtime = "nodejs"` (explicit, not inferred).

Build output (route line): `ƒ /api/aggregation/connections/refresh  239 B  102 kB`

### [ISSUE 2] CSRF/abuse posture — DOCUMENTED

Added a `// Security posture:` block to `app/api/aggregation/connections/refresh/route.ts` covering:

- **Auth**: AAL2 required; `getAal2UserId()` returns null → 401 for any unauthenticated or AAL1 request.
- **CSRF**: Session cookies are `SameSite=Lax` (Supabase default); cross-site POST cannot carry credentials; no anti-CSRF token required. AAL2 check is a further backstop.
- **Abuse**: Inngest deduplicates refresh events per `connectionId` within a 30 s window.

File: `app/api/aggregation/connections/refresh/route.ts`

### [ISSUE 3] E2E vertical for sync indicator — LOGGED AS FOLLOW-UP

Full Inngest is not available in CI. An E2E that exercises the syncing indicator requires either:
(a) Inngest in the test environment (not present), or
(b) a controlled fixture that flips `lastSyncedAt` on demand (requires infra change).

This is a valid gap — logged as Automation follow-up with ticket scope:
- Seed an active connection with a known `lastSyncedAt`
- Mock `/api/aggregation/connections/refresh` to return `{ triggered: 1 }` (bypass Inngest)
- Mock the poll response to return an updated `lastSyncedAt` after 5 s advance
- Assert `COPY.accounts.syncing` appears, then clears

The existing unit tests in `AccountsClient.test.tsx` cover this logic path (including multi-connection "all must finish" case). DRI Risk: `per-surface-vertical-test` flag is open for Automation.

### [NIT 1] exhaustive-deps comment — EXTENDED

Added inline rationale to the `eslint-disable-next-line` explaining:
- Why the effect must run once (snapshot baseline at trigger time)
- Adding `refresh` would re-trigger on every render, breaking the "snapshot then trigger" ordering
- StrictMode double-invoke behavior and Inngest deduplication handling

File: `app/(app)/accounts/AccountsClient.tsx`

### [NIT 2] double act() with fake timers — JUSTIFIED (not changed to waitFor)

`waitFor` cannot be used here: its internal polling uses `setTimeout`, which is mocked by
`vi.useFakeTimers()`. With fake timers, `waitFor(() => screen.getByText(...))` times out (verified
by attempting the replacement — 2 tests timed at 5 s). The double `act(() => Promise.resolve())`
is the correct approach under fake timers: Promises (microtasks) still resolve normally, so
two ticks flush the two awaited calls in the mount effect (`fetchConnections`, then `triggerRefresh`).

Updated both occurrences with an inline comment explaining the fake-timer constraint and why
this count maps directly to the mount-effect awaited calls.

File: `app/(app)/accounts/AccountsClient.test.tsx`

## Test results

12/12 pass (AccountsClient + AccountCard unit tests). Pre-existing `act(...)` warning on the
"does not flash empty" test unchanged — this is not new to this PR.

## Production build

Green. Manifests inspected and confirmed above.

## Files modified

| File | Change |
|---|---|
| `app/api/aggregation/connections/refresh/route.ts` | Added `// Security posture:` comment block (CSRF/auth/abuse stance) |
| `app/(app)/accounts/AccountsClient.tsx` | Extended `eslint-disable` comment with fake-timer + StrictMode rationale |
| `app/(app)/accounts/AccountsClient.test.tsx` | Added inline justification for double act() under fake timers |
