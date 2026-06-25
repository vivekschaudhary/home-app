---
workflow: fix
step: 1
agent: engineer
task: triage-and-fix
generated: 2026-06-25 11:00
---

## Triage

**Severity:** P2 — degraded UX; balances display are stale but no data is lost.

**Repro:** Navigate to `/accounts`. The balances shown reflect whatever was stored in `financial_accounts.balance_current` at the time of the last Inngest sync, which runs at most every 6 hours. The user sees old numbers; they match no current bank total.

**Root cause (layered):**

1. **Previous fix (df6c1bc / PR #116):** `fetchAccounts()` was calling Plaid's `accountsGet` (cached snapshot) instead of `accountsBalanceGet` (real-time). That commit fixed the sync job so it NOW fetches live balances — but only when a sync runs.

2. **Remaining gap (this fix):** The accounts page never triggers a sync on load. `AccountsClient` calls `fetchConnections()` on mount, which reads the DB — it only shows what's already stored. Unless Plaid sent a webhook or the 6-hour cron fired recently, the displayed balance is stale. The page was never wiring up a "fetch fresh data when the user opens this page" flow.

**Root cause location:**
- `app/(app)/accounts/AccountsClient.tsx` — mount effect reads DB but never triggers Inngest sync
- `app/api/aggregation/connections/` — no refresh endpoint existed

---

## Fix

**New endpoint: `POST /api/aggregation/connections/refresh`**
- AAL2-gated (matches all other aggregation routes)
- Reads user's `active` connections via `handlers.connectionsList`
- Sends `CONNECTION_REFRESH_EVENT` for each to Inngest
- Returns `{ triggered: N }`
- The existing `aggregationRefresh` Inngest job has a 30 s debounce per connection, so rapid re-navigations collapse into one sync

**AccountsClient mount flow (updated):**
- On mount: fetch current DB state → snapshot `lastSyncedAt` per connection → call `triggerRefresh()` → if triggered, set `syncing = true`
- Polls every 5 s while `syncing` (skips when `anyImporting` — that 3 s import interval covers it)
- Stops polling when any connection's `lastSyncedAt` changes past the pre-trigger snapshot (Inngest job completed + DB updated)
- Hard stop after 120 s (covers slow or silently-failed Inngest jobs)
- Shows `COPY.accounts.syncing` ("Syncing your transactions…") while syncing and not importing

**Regression test:** `app/api/aggregation/connections/refresh/route.test.ts`
- Verifies: 401 when unauthenticated
- Verifies: sends correct CONNECTION_REFRESH_EVENT payload for each active connection
- Verifies: skips needs_reauth / error connections
- Verifies: triggered = 0 + no Inngest send when no active connections

---

## Files created / modified

| Path | Change |
|---|---|
| `app/api/aggregation/connections/refresh/route.ts` | New — the refresh trigger endpoint |
| `app/api/aggregation/connections/refresh/route.test.ts` | New — regression tests (4 cases) |
| `app/lib/aggregation-client.ts` | Added `triggerRefresh()` |
| `app/(app)/accounts/AccountsClient.tsx` | Mount sync trigger + polling + UI indicator |

---

## Production build verification

- `✓ Compiled successfully in 3.9s`
- `.next/server/functions-config-manifest.json`: `/api/aggregation/connections/refresh` confirmed registered
- `.next/server/app-paths-manifest.json`: route mapped to `app/api/aggregation/connections/refresh/route.js`

---

## DRI Decisions

- **Polling instead of push:** No WebSocket/SSE channel exists. 5 s polling for ≤120 s is an acceptable trade-off: fast enough to show fresh data before the user leaves the page, cheap enough not to spam the DB.
- **Detection via `lastSyncedAt` change:** `last_synced_at` on `account_connections` updates after the transaction sync page, which runs AFTER `fetch-accounts` upserts balances. Using it as the completion signal is correct: by the time it changes, balances are already fresh in the DB.
- **No server-side rate limiting on the refresh endpoint:** The Inngest `aggregationRefresh` function has `debounce: { key: "event.data.connectionId", period: "30s" }`. Rapid re-triggers (e.g. user navigating back and forth) are safely collapsed by Inngest without server-side rate limiting.

---

## Risks

- **[LOW] Plaid API latency:** `accountsBalanceGet` makes a live round-trip to the institution. If the bank is slow (>30 s), the Inngest debounce timer expires and the job starts before Plaid responds, delaying balance freshness. Covered by the 120 s polling window.
- **[LOW] Missing Inngest in local dev:** If `INNGEST_EVENT_KEY` isn't configured, `inngest.send()` throws. The `triggerRefresh()` client function returns `false` on any error, so the UI simply shows no syncing indicator rather than breaking.

---

Next: open PR → Reviewer
