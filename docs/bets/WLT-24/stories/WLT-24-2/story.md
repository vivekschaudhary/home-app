---
id: WLT-24-2
bet: WLT-24
type: story
status: ready
priority: P2
created: 2026-06-22
author: PM
design_link: docs/bets/WLT-24/stories/WLT-24-2/design.md
area_tags: [frontend, backend, data, detection]
dependencies:
  - WLT-24-1   # the transaction_flags overlay + the pure cadence/merchant compute + the SubscriptionDetector seam
  - WLT-22     # normalizeMerchant + the signal/override (assigned_by='system') precedence pattern
---

# Find subscriptions for me — auto-detect recurring charges, I stay in control

## Description

The detection fast-follow to WLT-24-1. Instead of the user marking every subscription by hand, a **custom, provider-agnostic detector** finds their recurring charges and marks them automatically — they open Subscriptions and their streaming services, gym, and SaaS tools are **already there**. Detection is a **signal, not a verdict**: each auto-mark is written `source='auto'` as a default the **human overrides** (the [providers-signal-human-decides] posture — Plaid or any aggregator gives the signal, the human decides the outcome). It is **high-precision and never alarming** (the WLT-18 anomaly ethos): only a merchant with enough regular, stable charges is auto-marked, and the user can dismiss any one. The load-bearing rule: **once the user removes an auto-detected subscription, the detector must never re-add it** — a dismissal is durable. We chose the **custom detector** over Plaid's recurring product, so nothing here needs a new Plaid product or an ADR-002 amendment (the architecture's open vendor question stays closed for this slice). Builds entirely on WLT-24-1's `transaction_flags` overlay + the pure cadence/merchant compute + the `SubscriptionDetector` seam. See [WLT-24 architecture](../../architecture.md).

## Acceptance Criteria

- [ ] **AC1 — schema (migration `0016_transaction_flags_dismissed.sql`):** add `dismissed_at timestamptz` (nullable) to `transaction_flags` + a partial index `(user_id, flag_type) where dismissed_at is null` (the active-flags read path). **No new RLS policy** — dismissal is an owner `UPDATE`, already gated by the existing `transaction_flags_update_own` policy. Expand-only; OPS-2 auto-applies. No change to `transactions`/`categories`/`budgets`. Verify on an ephemeral Postgres before PR (the WLT-22-5 discipline).
- [ ] **AC2 — the pure detector (`@wealth/core/subscriptions.ts`):** implement the existing `SubscriptionDetector` seam as a **pure** `detectSubscriptions({ txns }) → CandidateSubscription[]` (no I/O). Group a user's active debits by **`subscriptionMerchantKey`** (entity-id-first, reused). A merchant is a candidate only if it passes **three independent precision gates** — **(a)** ≥3 occurrences (stricter than a human mark's ≥2), **(b)** a **non-irregular** inferred cadence (`cadenceFromInterval(median(intervals)) ∈ {weekly, monthly, annual}`, reused), **(c)** **amount stability** (coefficient of variation `CV = stddev/mean ≤ 0.10`, scale-invariant; mean=0 guarded) — and a **confidence ≥ 0.70** (`0.45·amountScore + 0.35·intervalRegularityScore + 0.20·occurrenceScore`). All thresholds are **named constants**, unit-tested at the boundaries.
- [ ] **AC3 — the write path (`@wealth/db/subscriptions.ts`):** `detectAndFlagSubscriptionsForUser(client, userId)` reads active debits → runs the pure detector → writes `transaction_flags(source='auto')` for each candidate's charges, mirroring `autoAssignTransfers`. **Skips** any merchant already flagged (`source='user'` or `'auto'`) **or** dismissed; **idempotent** (`upsert … ignoreDuplicates`); never clobbers a `'user'` row. `writeFlags` is parameterized to take `source`. **Precedence: user mark > auto-detect > (dismissed → never re-added).**
- [ ] **AC4 — the dismissal model (load-bearing):** **unmark becomes a soft-delete** — `unmarkMerchantSubscription` sets `dismissed_at = now()` for the merchant's flags (BOTH sources) instead of hard-deleting. `readSubscriptionFlags` filters `dismissed_at is null` (one filter — it's the single source for both the panel **and** the ledger ★, so dismissed subs drop from both). The detector **skips any merchant with a dismissed flag**. An explicit **re-mark clears the dismissal** (`dismissed_at = null`, `source = 'user'`) — a user choice always wins.
- [ ] **AC5 — when detection runs:** in the **sync job** (a new `detect-subscriptions` step after `apply-subscription-merchants`) for steady state, **and** idempotently at the **top of the Subscriptions page RSC** before the view read, so an already-connected user sees detections on first visit (the WLT-22-5 `ensureSeededCategories`-in-the-read pattern). A cheap no-op when there are no new candidates.
- [ ] **AC6 — orthogonality preserved (WLT-24-1 AC5 still holds):** auto-detection touches **only** `transaction_flags` — it never reads the category resolver, never writes a category, never changes a charge's budget contribution or its WLT-22-5 `counts_as_spending`. The orthogonality guard (`app/lib/subscriptions.guard.test.ts`) stays green (and is extended to assert the core detector imports no DB).
- [ ] **AC7 — honest UI (auto vs. user):** the Subscriptions panel (and optionally the ledger ★) shows a **subtle "detected" tag** on `source='auto'` rows so an auto-mark reads as intentional, not a bug (the trust contract — the inverse of the empty-panel scare). A **dismissible review nudge** ("We found N recurring charges — review them below") surfaces when there are un-acknowledged auto subs (the WLT-22-5 nudge pattern; quiet, not a modal). Dismiss is the existing unmark control — now durable. Honest states throughout (no fake rows; the headline still counts only confidently-inferred cadences).
- [ ] **AC8 — funnel:** `SUBSCRIPTION_DETECTED` (per detect run, the count of newly auto-flagged merchants) + `SUBSCRIPTION_DISMISSED` (on unmark) in `@wealth/core/funnel.ts` — making the manual-vs-detected and the false-positive (dismissal) rates falsifiable for the bet metric.

## Standard Experience Checklist

- [x] **Navigation** — no new surface; detection populates the existing WLT-24-1 Subscriptions surface + the ledger ★. The review nudge links the user's attention to the freshly-detected rows below it — covered by AC5, AC7.
- [x] **States** — detecting (the page-RSC run is a normal server read, no bespoke spinner); detected-rows present (tagged); the review nudge (present / dismissed); no-candidates (a clean no-op — the WLT-24-1 empty state is unchanged); dismiss-saving / success / discriminated error+retry (the existing unmark control) — covered by AC4, AC7.
- [x] **Feedback** — the "detected" tag explains *why a row appeared without a mark*; the review nudge gives the at-a-glance "we found N"; unmark/dismiss success ("Removed from subscriptions") is the existing toast, now durable — covered by AC7.
- [x] **Accessibility** — the "detected" tag is text (not colour-only) with an accessible affix on the row label; the review nudge is an announced region with an accessible dismiss; the unmark control keeps its WLT-24-1 screen-reader label — covered by AC7 (detailed in design.md).
- [x] **Edge cases** — a dismissed merchant is never re-detected (AC4); a re-marked merchant flips to `source='user'` and survives the next detect run (AC3/AC4); a variable-amount merchant (e.g. a weekly restaurant) is **not** detected (AC2 gate c); a too-sparse merchant (<3 charges) is **not** detected (gate a); user mark always beats auto (AC3); a new charge for a detected merchant auto-joins via the existing WLT-24-1 merchant re-apply — covered by AC2, AC3, AC4.
- [x] **Cross-surface consistency** — single web surface: `n/a — web only`. The load-bearing consistency is again the **orthogonality invariant** (auto-detection never alters the budget/category/spend surfaces), enforced by AC6 + the guard test.

## Tech notes

Build on the WLT-24-1 substrate + the WLT-22-5 signal/override model. Reuse, don't rebuild:
- **Detector** implements the `SubscriptionDetector` interface already in `@wealth/core/subscriptions.ts`; reuses `subscriptionMerchantKey`, `median`, `daysBetween`, `cadenceFromInterval`. Extend `MarkedTxn` with `merchantEntityId?` and `CandidateSubscription` with `merchantKey/cadence/occurrences` (additive; `summarizeSubscriptions` ignores the new fields).
- **Write path** mirrors `autoAssignTransfers`/`autoAssignTransfersForUser` (`@wealth/db/categories.ts`): paged read → pure decision → chunked `upsert` with `ignoreDuplicates` that never clobbers a user row. The **dismissed/flagged merchant-key sets** are read once and used as skip filters.
- **Dismissal** mirrors the anomaly precedent (`0009_anomalies.sql` + `recap.ts` `dismissAnomaly`): a retained, skipped record — here a `dismissed_at` soft-delete rather than a hard delete. The WLT-24-1 unmark path (`unmarkMerchantSubscription`) flips from `DELETE` to `UPDATE dismissed_at`.
- **Sync step** slots into `packages/jobs/aggregation/sync.ts` after `apply-subscription-merchants`, before `emit-sync-completed`.
- **Page-RSC run** mirrors `readCategories → ensureSeededCategories` running inside the categories read path (`app/lib/categories.ts`).
- **Out of scope (this story):** the Plaid `/transactions/recurring/get` adapter (the rejected alternative — would need an ADR-002 amendment; the open architecture Issue stays parked); price-change / cancel / reminder features; the `followup` flag (separate bet); a "detect now" button (the sync + first-visit runs suffice).

## PRs

_Auto-populated as PRs open._

## Tests

- **Engineer:** unit (`detectSubscriptions` — detects a regular+stable merchant with the right cadence/confidence; **skips** <3 occurrences, irregular cadence, unstable amount (high CV), and unmatchable merchant; confidence/threshold boundaries pinned at the constants); db-layer (`detectAndFlagSubscriptionsForUser` writes `source='auto'`, skips already-flagged + dismissed, idempotent on re-run; `unmarkMerchantSubscription` soft-deletes; `readSubscriptionFlags` excludes dismissed; re-mark clears `dismissed_at`); the **orthogonality guard** stays green (extended: the core detector imports no DB); migration `0016` verified on an ephemeral Postgres.
- **Codex (separate handoff):** the RLS update for `dismissed_at` (owner can set/clear; a second user cannot UPDATE another user's flag's `dismissed_at`; the owner-CRUD suite still green on `0016`) + the gated real-path E2E (seed a recurring stable merchant → detect on sync/visit → the panel shows it **tagged "detected"** → the user **dismisses** it → re-run does **not** re-add it → the user re-marks a different detected sub (flips to `user`, survives) → a variable-amount merchant is **not** detected → second-user isolation).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-22] [PM/operator] **Custom detector, not Plaid `/transactions/recurring/get`** — rationale: provider-agnostic, no new Plaid product + no ADR-002 amendment, and it reuses the WLT-24-1 cadence/merchant compute we already shipped; settles the architecture's deferred Plaid-vs-custom elicitation — area: architecture/vendor — alternatives: Plaid recurring (rejected — a billed new product + a foundation amendment before the value is proven) — reversibility: easy (the `SubscriptionDetector` seam keeps either path open)
- [2026-06-22] [Engineer] **Dismissal = a `dismissed_at` soft-delete on `transaction_flags`; unmark soft-deletes for BOTH sources; the detector skips dismissed merchants; an explicit re-mark clears it** — rationale: the load-bearing precedence (a user removal must beat a later auto-detect) needs a retained "the user said no" record, mirroring the anomaly dismissal precedent; one column + one read-filter (on the single shared flag reader) covers both the panel and the ledger ★ — area: data/correctness — alternatives: a separate dismissed table (rejected — a second keying scheme + its own RLS), a per-merchant dismissal record (rejected — drifts from the per-`dedup_key` grain) — reversibility: medium (changes WLT-24-1's hard-delete unmark)
- [2026-06-22] [Engineer] **High-precision gates: ≥3 occurrences AND a clean cadence AND amount CV ≤ 0.10 AND confidence ≥ 0.70** — rationale: a wrong auto-mark is annoying (the "never alarming" ethos); precision is the conjunction of independent filters, recall is sacrificed knowingly (the user can still mark by hand) — area: product/data — alternatives: looser gates / a single score (rejected — more false positives) — reversibility: easy (named constants)
- [2026-06-22] [Engineer] **Run detection in the sync step AND idempotently on the Subscriptions page read** — rationale: the sync step is steady-state; the read-path run gives an already-connected user (the operator) immediate first-visit value without waiting for a cron — mirrors WLT-22-5 — area: ux/perf — alternatives: sync-only (rejected — slow first value), a "detect now" button (deferred — unnecessary ceremony) — reversibility: easy

### Risks
- [2026-06-22] [PM] **A false-positive auto-mark erodes trust** (the detector's central risk) — likelihood: low — impact: medium — mitigation: the three precision gates + the confidence floor; the "detected" tag makes auto-marks legible; one-tap dismiss that's durable; `SUBSCRIPTION_DISMISSED` makes the false-positive rate measurable → tighten thresholds if it climbs — area: product/trust
- [2026-06-22] [Engineer] **Changing WLT-24-1's hard-delete unmark to a soft-delete regresses the unmark behaviour** — likelihood: low — impact: medium — mitigation: `readSubscriptionFlags` filters `dismissed_at is null` so the user-visible result is identical; Codex's RLS + E2E cover set/clear and the no-re-add path — area: correctness
- [2026-06-22] [Engineer] **The page-RSC detect run adds read-path latency** — likelihood: low — impact: low — mitigation: a no-op when there are no new candidates; bounded by `readAllPaged` (the same pattern the budget + transfers reads already use on page load); a `last_detected_at` marker is the additive escape hatch if needed — area: perf

### Issues
- [2026-06-22] [Engineer] **A `last_detected_at` guard for the read-path run is deferred** — severity: low — owner: Engineer — status: open — area: perf — not built this slice (the no-candidate no-op bounds the cost); revisit if the read-path detect shows up in latency.
- [2026-06-21] [Enterprise Architect] **Plaid `/transactions/recurring/get` ADR-002 amendment** — severity: low (now) — owner: Enterprise/Solution Architect — status: parked — area: vendor/scope — **closed for this slice** by the custom-detector decision; only re-opens if a future slice adopts the Plaid recurring product.

---

_Story under bet: docs/bets/WLT-24/brief.md_
