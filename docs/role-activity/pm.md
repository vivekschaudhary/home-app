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
