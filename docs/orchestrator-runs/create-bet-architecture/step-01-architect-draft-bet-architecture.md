---
workflow: create-bet-architecture
step: 1
agent: architect
task: draft-bet-architecture
generated: 2026-06-28 17:44
---

`docs/bets/WLT-27/architecture.md` is written and on disk at `status: proposed`. The role-activity log has been updated.

---

**TL;DR:** `architecture.md` drafted for WLT-27 (Manual Account Entry + CSV Import + Multi-Region Account Isolation) — all 12 required sections populated, `status: proposed`, HITL halt in effect. The central architectural call is that `SpendingTxn.currency` fix is a **hard prerequisite** that must land before any non-USD account is enabled, since the current spending aggregation (budget, recap, anomaly scan, category chart) sums amounts across all currencies as raw numbers.

**Files created/modified:**
- `docs/bets/WLT-27/architecture.md` — created, `status: proposed`
- `docs/role-activity/architect.md` — appended WLT-27 cross-cutting-prerequisite pattern

**Next recommended command:** Review `docs/bets/WLT-27/architecture.md`, then flip `status: proposed → status: approved` and set `architecture_status: approved` in the brief frontmatter to proceed to story breakdown.

**Open questions flagged for HITL review:**
- `dedupKey` null `providerAccountId` serialization (Engineer must confirm and fix before CSV import ships)
- Anomaly scan per-currency fan-out and `dedup_key` currency scoping for `category_spike`
- Whether `ManualAccountForm` should include an optional balance field
- ISO 4217 currency allowlist breadth