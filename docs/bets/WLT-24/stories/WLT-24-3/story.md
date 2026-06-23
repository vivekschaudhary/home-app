---
id: WLT-24-3
bet: WLT-24
type: story
status: shipped
priority: P2
created: 2026-06-22
author: PM
design_link: docs/bets/WLT-24/stories/WLT-24-3/design.md
area_tags: [frontend, backend, data, detection]
dependencies:
  - WLT-24-2   # the detector + the dismissal model this slice sub-divides per price
  - WLT-24-1   # summarizeSubscriptions + the mark-the-merchant fan-out
---

# One vendor, several subscriptions — split a merchant by price

## Description

A dogfooding fix after WLT-24-2: a single vendor can bill **more than one subscription** (Sony PlayStation → PS Plus *and* a second sub), but the Subscriptions surface assumes **one merchant = one subscription** — so the two collapse into one group and, because their billing dates interleave into an `irregular`-looking cadence, the vendor often **disappears entirely** (the detector drops it; a manual mark shows one blended, uncounted row). The fix reframes the unit: a subscription is a **(merchant, price)**, not just a merchant. We sub-group each merchant's charges into **price clusters** — keeping a single sub's price creep together while splitting genuinely distinct prices — and run the existing per-series math (median amount, cadence, amount-stability, confidence) on each clean cluster. Each real subscription then gets its own row, its own detection, and its own durable dismissal. **No schema change** — clusters are re-derived from amounts at read/detect time; the flag stays per `dedup_key`. The orthogonality invariant (a subscription is still real spend, never a category) is untouched. See [WLT-24 architecture](../../architecture.md).

## Acceptance Criteria

- [ ] **AC1 — price clustering (pure, `@wealth/core/subscriptions.ts`):** `clusterByPrice(members)` — per merchant, sort the distinct charge amounts ascending and **single-linkage split** wherever `amount[i] / amount[i-1] > CLUSTER_MAX_RATIO` (**1.25** — a >25% jump). Keeps **price creep together** (Netflix $15.49 → $16.99 = 1.10 → one cluster) and **splits distinct subs** (PS $9.99 vs $17.99 = 1.80 → two). `clusterId = c:<min amount in cluster, 2dp>` (stable, re-derived, composes into the identity key). The threshold is a **named constant**, unit-tested at the price-creep/distinct boundaries. Documented irreducible limit: two subs at the **same price** from one vendor can't be split (rare; logged in a comment).
- [ ] **AC2 — the view shows one row per (merchant, cluster):** `summarizeSubscriptions` sub-groups each merchant by `clusterByPrice` and emits one `SubscriptionRow` per cluster — `normKey = ${normKey}|${clusterId}` (unique React key + identity), `dedupKeys` = only that cluster's charges, with per-cluster typical amount / cadence / `source` / monthly-equivalent. A two-sub Sony renders **two rows**, each with its own price + cadence; the headline **sums both** (no more single blended `irregular` row excluded from the total).
- [ ] **AC3 — the detector finds each series:** `detectSubscriptions` sub-groups each merchant by cluster and runs the three precision gates + confidence **per cluster**, emitting one `CandidateSubscription` per cluster carrying `clusterId` + `compositeKey = ${merchantKey}|${clusterId}` (additive). Distinct subs that read as `irregular` when blended now each pass cleanly.
- [ ] **AC4 — per-cluster precedence (correctness-critical):** the detector's already-flagged + dismissed skip-sets become **composite-keyed** (`${merchantKey}|${clusterId}`). Dismissing one cluster must **not** skip the other; a new charge of a **dismissed** cluster (same price) stays skipped; a new charge of a **live** cluster is detected. `applySubscriptionMerchantsForUser` (the WLT-24-1 sync re-apply) becomes **cluster-aware** too — it must not re-flag a charge whose composite is dismissed, or a dismissed cluster silently revives on the next sync (the merchant stays "marked" via the *other* cluster — the cross-cluster revive hole).
- [ ] **AC5 — unmark is cluster-scoped:** today the view's unmark re-fans-out to the whole merchant (`unmarkMerchantSubscription` → `merchantCharges`), so removing PS Plus would also dismiss PS Now. A new `dismissSubscriptionFlags(client, userId, dedupKeys[])` soft-deletes **exactly** the row's cluster charges — identical for a single-cluster merchant (Netflix), correct for multi-cluster. **Mark stays merchant-wide** (the ledger mark is a coarse "I recognize this vendor"; the view then splits the flagged charges into separate, separately-removable cluster rows — strictly more forgiving than mark-the-cluster).
- [ ] **AC6 — orthogonality + honesty + precision preserved:** clustering imports only `normalizeMerchant`; no category/budget coupling (the guard stays green). A variable-spend merchant whose amounts chain into one wide cluster is still rejected by the existing **amount-CV > 0.10** gate — single-linkage chaining never manufactures a false subscription (it only ever sub-divides). **No schema change, no migration.**
- [ ] **AC7 — accessible same-named rows:** two rows both display the vendor name (e.g. "Sony PlayStation"); the **amount column** is the visual disambiguator (no invented plan names). Wire the existing per-row `rowA11y` / `rowDetectedA11y` label (carrying amount + cadence) onto the row so assistive tech distinguishes them.

## Standard Experience Checklist

- [x] **Navigation** — no new surface; the same Subscriptions tab + ledger entry points — `n/a — no nav change` beyond the per-cluster rows (AC2).
- [x] **States** — detected vs user rows render per cluster; the WLT-24-2 "detected" tag + review nudge + per-row unmark work unchanged once `dedupKeys` / `source` are per-cluster — covered by AC2, AC3.
- [x] **Feedback** — unmark now removes exactly one series and the other stays (the load-bearing UX fix); existing mark/unmark toasts unchanged — covered by AC5.
- [x] **Accessibility** — each same-named row exposes a distinct accessible name (vendor + amount + cadence) so AT can tell the two Sony rows apart — covered by AC7.
- [x] **Edge cases** — price creep stays one row (AC1); same-price-twice merges, documented (AC1); a variable-spend merchant is still not detected (AC6); dismiss-one-keep-other + no-revive-on-sync (AC4/AC5) — covered by AC1, AC4, AC5, AC6.
- [x] **Cross-surface consistency** — single web surface: `n/a — web only`. The load-bearing consistency is again the **orthogonality invariant** (clustering never touches the budget/category axis), AC6.

## Tech notes

Build on WLT-24-1 (summarize + mark-the-merchant) + WLT-24-2 (detector + dismissal). Reuse, don't rebuild:
- **Clustering** is a small pure helper in `@wealth/core/subscriptions.ts` next to the existing `median`/`cadenceFromInterval`/the detector thresholds; reuses `normalizeMerchant` only. The **identity key** becomes `${merchantKey}|${clusterId}` everywhere the subscription identity matters (summarize grouping, detect grouping, the detector skip-sets, the sync re-apply).
- **No schema / no migration** — the cluster is re-derived from amounts each read/detect run; the `transaction_flags` grain stays per `dedup_key`. Confirmed: nothing about the cluster must survive a CDC re-sync.
- **The two correctness traps** (per the design): (1) the detector + `applySubscriptionMerchantsForUser` skip-sets must be **composite-keyed**, not merchant-keyed, or a dismissed cluster revives via its sibling; (2) the view's unmark must dismiss the **cluster's** dedupKeys, not re-fan-out to the merchant.
- **One PR, UI folded in** (the WLT-24-2 lesson — never ship a grouping/detection change without its UI legibility). DB-layer behavior (per-cluster skip/dismiss/re-apply) verified on an **ephemeral Postgres** (the WLT-22-5 discipline).
- **Out of scope:** same-price-twice disambiguation (irreducible from amount+date — documented); per-plan naming (we have no plan names — the amount disambiguates); any change to the `transaction_flags` schema.

## PRs

_Auto-populated as PRs open._

## Tests

- **Engineer:** pure (`clusterByPrice` splits distinct prices / keeps price creep / single fixed price / same-price-twice merges; `summarizeSubscriptions` → two Sony rows with correct per-cluster amounts + a summed headline + single-cluster Netflix unchanged; `detectSubscriptions` → two candidates with distinct `compositeKey`; variable-spend still rejected by the CV gate); **db-layer on ephemeral PG** (dismiss cluster A → B still detected + A not revived; a new charge of dismissed A stays skipped; a new charge of live B joins; `dismissSubscriptionFlags` leaves the sibling cluster active; `applySubscriptionMerchantsForUser` doesn't revive a dismissed cluster); component (two rows, distinct keys + amounts; unmark dismisses only that cluster; distinct a11y name); the orthogonality guard stays green.
- **Codex (separate handoff):** confirm **no RLS delta** (no schema change — the existing `transaction_flags` suite still passes) + the gated E2E extension (seed a **two-price vendor** → both detected as **separate rows** → dismiss one → the other **stays** + the dismissed one does **not** return on re-detect → second-user isolation).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-22] [PM/operator] **A subscription is a (merchant, PRICE), not a merchant** — rationale: dogfooding found a vendor (Sony) with two subs collapsing into one `irregular`, vanishing group; sub-grouping by price is the smallest reframe that makes each real series detectable + countable — area: product/data — alternatives: per-plan naming from a provider (we have none), manual split UI (heavier, off the recognition moment) — reversibility: easy
- [2026-06-22] [Engineer] **Single-linkage price clustering on a relative gap, `CLUSTER_MAX_RATIO = 1.25`** — rationale: a ratio is scale-invariant (works for a $4 newsletter and a $180 annual); 1.25 sits in the empty band between price-creep (≲15%/yr → one cluster) and distinct-sub gaps (≳30% → split); single-linkage only ever sub-divides, and a chained variable-spend cluster is still caught by the existing CV>0.10 gate (no new false positives) — area: data — alternatives: absolute-dollar gap (fails across scales), k-means (overkill, needs k) — reversibility: easy (named constant; **confirm with operator at build**)
- [2026-06-22] [Engineer] **Composite (merchant, cluster) identity for the skip-sets AND the sync re-apply** — rationale: a per-merchant dismissed set would skip a sibling cluster; making the detector + `applySubscriptionMerchantsForUser` composite-keyed keeps per-cluster precedence and closes the cross-cluster revive hole on sync — area: correctness — alternatives: merchant-keyed (the revive bug) — reversibility: easy
- [2026-06-22] [Engineer] **Unmark dismisses the cluster's charges; mark stays merchant-wide** — rationale: the ledger mark is a coarse "I recognize this vendor" gesture (the user can't see the price structure there), so mark-the-merchant + view-splits-by-price is more forgiving; but removal must be precise (the dedupKeys of the row), so unmark stops re-fanning-out to the whole merchant — area: ux/correctness — alternatives: mark-the-cluster (needs two marks, surprising) — reversibility: easy

### Risks
- [2026-06-22] [Engineer] **The 1.25 threshold mis-splits an aggressive price increase or under-splits two close-priced subs** — likelihood: low — impact: low — mitigation: the 1.20–1.30 band is robust (price creep ≲15%, distinct subs ≳30%); a named constant tunable at build; the CV gate still guards false positives downstream — area: data
- [2026-06-22] [Engineer] **A dismissed cluster revives via its sibling on the next sync** — likelihood: medium (without the fix) — impact: medium — mitigation: AC4 makes `applySubscriptionMerchantsForUser` composite-aware + the db-layer test proves no-revive — area: correctness

### Issues
- [2026-06-22] [Engineer] **Two distinct subs at the SAME price from one vendor cannot be split** — severity: low — owner: Engineer — status: accepted — area: data — irreducible from amount + date alone; rare; documented in code + here. Revisit only if a provider exposes per-plan identifiers.

---

**SHIPPED, 2026-06-22 — PR #99** (squash `e1d1441`). A subscription is now a **(merchant, price)**: a pure `clusterByPrice` single-linkage-splits each merchant's charges on a relative gap (`CLUSTER_MAX_RATIO = 1.25` — **confirmed with the operator against real Sony amounts**, $45 / $13.99 = 3.2×), so `summarizeSubscriptions` + `detectSubscriptions` sub-group per cluster and a multi-sub vendor shows one row + one detection + one durable dismissal per series. The two correctness traps were handled: the detector **and** the sync re-apply skip-sets are **composite-keyed** (`merchant|cluster`) so a dismissed series never revives via its sibling, and removal is **cluster-scoped** (`dismissSubscriptionFlags` for the panel; `dismissSubscriptionSeriesForCharge` resolves the charge's series for the ledger toggle). **No migration** (clusters re-derived from amounts; flag stays per `dedup_key`); UI folded into the one PR (the WLT-24-2 lesson). **Codex review** cleared with no functional blocker; its gated E2E (two-price vendor → two detected rows → durable per-series dismiss → re-mark → second-user isolation) landed **uncommitted** and was committed with Codex co-author (the recurring pattern). Full gate: lint · typecheck · **314 unit tests** (clusterByPrice boundaries, two-Sony summarize/detect, variable-spend still rejected, same-price merge, two-row a11y + series-scoped unmark) · build; **RLS 25/25 on a real Postgres** (no schema/policy change → no RLS delta). **CLEAR tied to HEAD `561597a`.**

**WLT-24 bet:** manual mark (24-1) → auto-detect (24-2) → multi-subscription-per-vendor (24-3), all shipped.

_Story under bet: docs/bets/WLT-24/brief.md_
