# PM Role Activity Log

Append-only. Per `[fractal-retro]` (canon v0.3.17): log recurring patterns, HITL edits, dispute clusters, and moat-eval gaps. Cite evidence + instance count.

---

## 2026-06-28 — WLT-27 draft-brief (re-authored after HITL rejection)

**Bet:** WLT-27 — Manual Account Entry + CSV Import + Multi-Region Account Isolation
**Action:** Re-authored `docs/bets/WLT-27/brief.md` from scratch — prior file contained PM step-2 response text, not brief content (flagged by delivery-manager step-4 and HITL rejection step-3). Research was complete and approved architecture was present; this pass consumed both.
**Key decisions captured in DRI log:** scope sequencing (A→B→C not bundled), two-flag release strategy (MANUAL_ACCOUNTS_ENABLED / MULTI_CURRENCY_ACCOUNTS_ENABLED), CSV-first over OFX/QFX, no cross-currency conversion in WLT-27.
**n/a disciplines applied:** 5 items explicitly flagged unanswerable (first-party demand signal, Apple Pay per-user volume, segment overlap, credit union failure rate, CFPB legal outcome) — all `n/a — <reason>` per `[cite-or-mark-na]`.
**HITL pattern note (instance 1 for this bet):** Prior PM pass wrote step output into brief.md instead of the actual artifact. Recurrence signal: watch for orchestrator harness mis-routing where a PM's narrative output is written to the artifact file path. Recommend: PM output should never be the artifact; the artifact is what PM writes to disk.
**Status:** `proposed` — awaiting human approval.

---

## 2026-06-28 — WLT-27 decompose-bet-to-story

**Bet:** WLT-27 — Manual Account Entry + CSV Import + Multi-Region Account Isolation
**Stories decomposed:** 6 (WLT-27-1 through WLT-27-6)
**Backlog shape:**

| ID | Title | Type | Priority | Depends On |
|----|-------|------|----------|------------|
| WLT-27-1 | Currency-Awareness Fix (SpendingTxn.currency) | task | P1 | — |
| WLT-27-2 | Manual Account Backend (Route Handlers + DB) | story | P1 | WLT-27-1 |
| WLT-27-3 | Manual Account Form UI | story | P1 | WLT-27-2 |
| WLT-27-4 | CSV Import Backend | story | P1 | WLT-27-1, WLT-27-2 |
| WLT-27-5 | CSV Import Wizard UI | story | P2 | WLT-27-3, WLT-27-4 |
| WLT-27-6 | Currency Region Switcher | story | P2 | WLT-27-1, WLT-27-3 |

**Sequencing rationale:** WLT-27-1 is a hard prerequisite (currency fix + dedup null-providerAccountId fix) and must land first. WLT-27-2 (backend API) enables WLT-27-3 (form UI) and WLT-27-4 (import backend). WLT-27-5 (wizard UI) requires both the accounts page (WLT-27-3) and the import API (WLT-27-4). WLT-27-6 (region switcher) requires the currency fix (WLT-27-1) and the accounts page (WLT-27-3).

**Standard Experience Checklist:** all 6 stories have every category covered by ≥1 AC or `n/a — <reason>`. No empty categories.

**Data-mutating stories with E2E cleanup ACs:** WLT-27-2 (AC6), WLT-27-3 (AC8), WLT-27-4 (AC5), WLT-27-5 (AC7). WLT-27-1 and WLT-27-6 create no persistent data — no cleanup obligation.

**Mirror:** no MCP Jira/Linear connector configured — skip logged as DRI Decision below.

**DRI Decision:** [2026-06-28] [PM] Mirror to Jira/Linear skipped — no MCP connector configured in compass/config.yaml. Stories live in `docs/bets/WLT-27/stories/`. Area: process.

---

## 2026-06-29 — WLT-27-1 arbitrate-dispute (PR #123)

**Bet/Story:** WLT-27 / WLT-27-1 — Currency-Awareness Fix
**Action:** Arbitrated 4 ISSUEs and 2 NITs raised by Reviewer against PR #123.

**Rulings:**
- ISSUE 1 (time-dependent budget test): PARTIALLY ADDRESSED — engineer fixed `dashboard-spend-currency.test.ts` and `recap-spending-currency.test.ts` but missed `budget-currency.test.ts`, the originally-flagged file. Still has 2026-06 dates and no `vi.useFakeTimers`. Two days until July 1; this is urgent.
- ISSUE 2 (no direct filter assertion in budget test): VALID — `budget-currency.test.ts` lacks `expect(queryMock.getCurrencyFilter()).toBe(...)` while the other two test files have it.
- ISSUE 3 (missing chart + recap tests): RESOLVED — engineer added both files.
- ISSUE 4 (query plan/perf risk): DISMISSED — `.eq("currency","USD")` is a no-op on an all-USD corpus; EXPLAIN obligation deferred to WLT-27-5 as DRI Risk.
- NITs 1 & 2: OUT OF SCOPE — both reference the `stroke-green-500` change in merged PR #122.

**PR #123 status:** Not clear to merge. Two mechanical test fixes required in `budget-currency.test.ts`.

**Pattern note (instance 1 — incomplete fix sweep):** Engineer fixed 2 of 3 affected test files. The originally-flagged file was missed. Recurrence signal: when a reviewer cites a specific file by name, confirm that the fix commit touches that exact file, not only sibling files discovered during investigation.
