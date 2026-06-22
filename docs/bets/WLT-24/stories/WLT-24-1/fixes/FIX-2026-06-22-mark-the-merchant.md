---
id: FIX-2026-06-22-mark-the-merchant
type: fix
bet: WLT-24
story: WLT-24-1
status: shipped
severity: P2
reported_by: operator (dogfooding)
created: 2026-06-22
area_tags: [spending, subscriptions, ux]
---

# Fix: marking a subscription should flag the whole merchant, not just the one charge

## Triage

- **Report (operator):** "it does not flag all Netflix in the transactions with the label." Marking one Netflix charge tagged only that row; the other Netflix charges stayed unmarked, and a single mark showed "cadence pending" (no monthly total).
- **Severity:** P2 — correctness/UX of a just-shipped surface; the manual-first mark is more tedious than anyone expects (mark every charge) and yields no headline number until ≥2 of the same merchant are marked.
- **Affected:** WLT-24-1 (the mark write-path + the per-row indicator + the headline-from-one-mark).

## Root cause

Slice 1 shipped per the written spec: the flag is keyed per **transaction** (`dedup_key`), and the Subscriptions summary groups the **flagged** transactions. So marking one charge flags exactly that charge — the user's mental model is per-**merchant** ("Netflix is a subscription"), not per-charge. Cadence then can't be inferred until ≥2 charges of the merchant are hand-marked.

## Fix — mark the MERCHANT

Marking (or unmarking) a charge now applies to its whole merchant, reusing the WLT-22-3/4 merchant-match key:

- New pure `subscriptionMerchantKey(merchant, merchantEntityId)` (`@wealth/core`) — entity-id first (Plaid's stable id, robust to name drift like "NETFLIX.COM #123"), else the normalized name; null ⇒ unmatchable (mark just the one charge).
- `markMerchantSubscription` / `unmarkMerchantSubscription` (`@wealth/db/subscriptions`) — resolve the charge's merchant key, then flag/unflag **every** active debit from that merchant (entity-id → an indexed SQL match; name → a paged JS-normalized scan), chunked upsert/delete. `app/lib` mark/unmark call these.
- **Sync re-apply** `applySubscriptionMerchantsForUser` — a new `sync.ts` step flags freshly-synced charges whose merchant the user has already marked (so next month's Netflix auto-joins), mirroring the WLT-22-3 rule re-apply. No-op until something is marked; never un-flags.

**Two problems solved at once:** (1) every Netflix row now shows "★ Subscription"; (2) the Subscriptions view infers cadence + the monthly total from the merchant's **full history** on the **first** mark — the "mark 2 before you see a number / cadence pending" friction is gone. No schema change (reuses `transaction_flags`); orthogonality (AC5) preserved — the guard still passes (no category/budget coupling).

## Verification

- Unit: `subscriptionMerchantKey` (entity-id preferred, name fallback collapses variants, null when unidentifiable).
- Full gate: lint · typecheck · tests · build.
- **Codex (separate handoff):** update the gated E2E so marking ONE recurring charge flags ALL of that merchant + yields the monthly total from one mark + a newly-synced same-merchant charge auto-flags; the RLS suite is unchanged (same table/policies).

## DRI Log

### Decisions
- [2026-06-22] [Engineer/operator] **Mark the merchant, not the charge** — rationale: matches the user's mental model ("Netflix is a subscription") and removes the per-charge tagging + the cadence-pending friction; reuses the proven WLT-22-3/4 merchant-match key — area: ux/product — alternatives: keep per-charge + rely on detection to catch siblings (rejected — the manual surface should already behave right) — reversibility: easy (the flags are still per-`dedup_key`; only the write/apply fan-out changed)

### Risks
- [2026-06-22] [Engineer] **Name-fallback mark scans the user's active debits** (no entity id) — likelihood: low (most Plaid merchants carry an entity id → indexed path) — impact: low — mitigation: a deliberate user action off the hot path, paged; the entity-id path is the common, cheap case — area: perf

### Issues
- _none_

---

**Shipped:** PR #91 (squash `6e73ff9`), 2026-06-22. Reuses the WLT-24-1 `transaction_flags` substrate; no migration. Codex review CLEAN after one BLOCKER (the gated E2E had to prove the new merchant-mark contract, not the old per-charge flow) — Codex updated `e2e/subscriptions.spec.ts` (one mark → all 3 flagged · total from one mark · CDC survival · a name-variant same-entity charge auto-joins via the sync step · second-user isolation), committed to the branch. RLS suite unchanged (re-verified at 24 tests on the WLT-24-1 build). Full gate green: lint · typecheck · 290 tests · build. **CLEAR tied to HEAD `6e73ff9`.**
