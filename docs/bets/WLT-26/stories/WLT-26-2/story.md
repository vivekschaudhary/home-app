---
id: WLT-26-2
bet: WLT-26
type: story
status: ready
priority: P2
created: 2026-06-26
author: PM
design_link: docs/bets/WLT-26/architecture.md
area_tags: [frontend, backend, data, spending, dashboard]
dependencies:
  - WLT-22     # effectiveCategory + countsAsSpending + normalizeMerchant (category resolver)
  - WLT-23     # readTransactionsPage category + month filters (Investigate navigation)
  - WLT-26-1   # DashboardIntelligence section + DASHBOARD_INTELLIGENCE_ENABLED flag (this slice adds AnomalyPanel into that section)
---

# Transaction Anomaly Panel (dashboard intelligence)

## Description

The user opens their dashboard and sees a compact **Anomaly Panel** that flags two things their plain ledger cannot: a **new merchant** they've never transacted with before, and a **category that is on pace to overspend** their 6-month norm. Each anomaly has a one-tap **Dismiss** (permanent for a new-merchant, monthly for a spend-spike) and a **See transactions** link that drills into the WLT-23 ledger pre-filtered to the relevant category and month. When fewer than 2 months of transaction history exist, an honest empty state holds the space instead. The detector runs off-request (daily Inngest scan), so the panel load is cheap: an indexed status-read, not a live computation.

This slice completes the WLT-26 bet. It reuses the shipped `anomalies` table (two new `kind` values), the existing `PATCH /api/anomaly/[id]` dismiss path, and the `DashboardIntelligence` section WLT-26-1 created — no new table, no new API route, one narrow expand-only migration to widen the `kind` check constraint.

## Acceptance Criteria

- [ ] **AC1 — Extend `AnomalyTxn` + `AnomalyKind` (`packages/core/anomaly.ts`):** add `merchant?: string | null` and `dedupKey: string` to `AnomalyTxn` (both fields are needed by the new rules; the scan already selects `dedup_key` and will add `merchant` in AC4). Extend `AnomalyKind` to `"large_charge" | "recurring_due" | "low_balance" | "new_merchant" | "category_spike"`. No change to existing rules or `detectAnomalies` signature.

- [ ] **AC2 — New pure rule `newMerchants` (`packages/core/anomaly.ts`):** detect debut merchants in the user's transaction history. Algorithm: (a) group all debits in the scan window by `normalizeMerchant(t.merchant)` (from `@wealth/core/categories` — already an in-scope dependency); (b) for each normalized merchant, find its earliest occurrence in the window; (c) if the earliest occurrence is within `LARGE_CHARGE_RECENT_DAYS` (7 days, reuse the existing constant) AND the merchant has **no occurrence before** that window, it is a debut; (d) emit one `AnomalyCandidate` per debut: `kind: 'new_merchant'`, `severity: 'info'`, `transactionId: debutTxn.id`, `dedupKey: 'new_merchant:' + debutTxn.dedupKey` (CDC-stable, PII-free — the prefix distinguishes it from `large_charge:` + id keys in the same column), `summary: { amount: round2(debutTxn.amount), date: debutTxn.occurredOn }` — **no merchant name in summary** (PII invariant; resolved at read time in AC6). History gate: skip if the user has fewer than `MIN_HISTORY_MONTHS` (2) distinct calendar months of debits in the scan window. `MIN_HISTORY_MONTHS = 2` is a named constant (same pattern as `LARGE_CHARGE_MIN_HISTORY`). Called from `detectAnomalies`. Unit tests: debut fires on first appearance within recent window; does NOT fire if the merchant appeared before the window; does NOT fire if `monthsOfHistory < 2`; does NOT fire if the merchant appeared only outside the recent window; merchant field is absent from summary.

- [ ] **AC3 — New pure rule `categorySpikes` (`packages/core/anomaly.ts`):** detect categories on pace to overspend the user's 6-month rolling norm. Algorithm: (a) group debits by resolved category + calendar month; (b) for each category with ≥ `MIN_HISTORY_MONTHS` (2) prior complete months of history in the rolling 6-month window: compute the **median** of those prior complete months' totals (reuse `median()` already defined in `anomaly.ts`; lean: median is robust to a spike inflating its own baseline, per architecture); (c) compute the **on-pace projection** for the current (partial) month: `projection = currentMonthTotal * (daysInMonth / Math.max(dayOfMonth, 1))`; (d) if `projection >= SPIKE_MULTIPLE × median` and the median is > 0, emit one candidate: `kind: 'category_spike'`, `severity: 'attention'`, `transactionId: null`, `dedupKey: 'category_spike:' + category + ':' + month` (where `month = asOf.slice(0, 7)` — YYYY-MM; monthly suppression — a new dedup_key next month re-evaluates on fresh data), `summary: { category: humanizeCategory(cat), amount: round2(projection), baseline: round2(median), multiple: round2(projection / median) }`. `SPIKE_MULTIPLE = 1.75` (named constant, in the conservative 1.5–2× band; do not make user-configurable — brief out-of-scope). Called from `detectAnomalies`. Unit tests: spike fires at 1.75× projected; does NOT fire at 1.74×; does NOT fire when < 2 prior complete months; does NOT fire on categories with baseline ≤ 0; projection formula is correct across months of varying length; `dedupKey` carries the YYYY-MM month for the current month.

- [ ] **AC4 — Extend the anomaly scan (`packages/jobs/recap/anomaly-scan.ts`):** add `merchant` to the `transactions` `.select(...)` call. Add `merchant: row.merchant ?? null` and `dedupKey: row.dedup_key` to the `AnomalyTxn` map (the select already returns `dedup_key`; extend the cast type to include `merchant: string | null`). No other structural change — the new kinds flow through the existing `detectAnomalies → upsert(anomalies)` path with the existing idempotency (`on conflict user_id,dedup_key do nothing`). The recap reads its 3 existing kinds regardless; the scan writing new kinds is additive.

- [ ] **AC5 — Migration (new, expand-only):** `supabase/migrations/0018_anomaly_kinds.sql` OR `0019_anomaly_kinds.sql` — take the next available number after WLT-26-1 settles (WLT-26-1 may claim `0018` for an index migration, or it may not need one; check before numbering — see Issues). The migration body:
  ```sql
  -- WLT-26-2: widen the anomaly kind domain for the two dashboard intelligence
  -- detector kinds. No new table, no new column, no RLS/trigger change.
  alter table anomalies drop constraint if exists anomalies_kind_check;
  alter table anomalies add constraint anomalies_kind_check
    check (kind in ('large_charge','recurring_due','low_balance','new_merchant','category_spike'));
  ```
  Verify the exact constraint name (`anomalies_kind_check`) on an ephemeral Postgres first before the migration lands (WLT-25 constraint-name discipline — the default for an inline unnamed check is `<table>_<col>_check`; confirm it hasn't been named differently). OPS-2 auto-applies on deploy. **No new table, no new column, no RLS/trigger change** — the existing policies, `anomalies_status_only` trigger, and `unique(user_id, dedup_key)` index all apply unchanged to the new kinds.

- [ ] **AC6 — `readDashboardAnomalies(userId: string)` (`app/lib/anomaly.ts`, new file):** an owner-scoped read (under the user's RLS session) that: (a) reads `anomalies` filtered to `kind in ('new_merchant', 'category_spike')` and `status in ('open', 'surfaced')`, ordered by severity desc then created_at desc; (b) for each `new_merchant` row, extracts the transaction `dedup_key` from the anomaly's own `dedup_key` by stripping the `'new_merchant:'` prefix, then resolves the live transaction (`removed_at is null and superseded_by is null`) to fetch the merchant name for display — if the transaction is not found (CDC supersession), `merchantName` is `null` (the panel renders without the merchant name, gracefully); (c) on first surface (status `'open'`), transitions to `'surfaced'` + emits `ANOMALY_SURFACED` once per anomaly (same pattern as `readTopAnomaly` in `recap.ts`); (d) also reads a count of distinct calendar months of debits for the user (owner-scoped, bounded to the rolling 6-month window) to determine `monthsOfHistory`; (e) returns `{ anomalies: DashboardAnomaly[], monthsOfHistory: number }`. The `DashboardAnomaly` type: `{ id: string; kind: 'new_merchant' | 'category_spike'; summary: Record<string, unknown>; merchantName?: string | null; rawCategory?: string | null }` — `rawCategory` is the pre-humanization category slug extracted from the `category_spike` dedup_key (format: `'category_spike:' + rawCat + ':' + YYYY-MM`) — the panel's Investigate link needs the raw slug for the `?category=` ledger filter (see Tech notes). Integration tests (against real Postgres): `readDashboardAnomalies` returns anomalies of the 2 new kinds only; cross-tenant isolation (user B cannot see user A's anomalies); `new_merchant` merchant resolved from live transaction; graceful null when transaction not found; open→surfaced transition fires; `monthsOfHistory` correct; **the recap's `readTopAnomaly` filter (kind in the 3 original kinds) does NOT return `new_merchant`/`category_spike` rows** (the orthogonality guard — assert in an integration test).

- [ ] **AC7 — `AnomalyPanel.tsx` component (`app/(app)/dashboard/AnomalyPanel.tsx`, new):** a React Server Component that: (a) calls `readDashboardAnomalies(userId)` and renders the panel; (b) if `monthsOfHistory < 2`, renders the `anomalyEmptyNoHistory` copy (AC10) — no panel, no broken state; (c) if `anomalies.length === 0` (and `monthsOfHistory >= 2`), renders `anomalyEmptyNoAnomalies` copy — positive "nothing unusual" state; (d) for each anomaly, renders: the per-kind phrasing (copy tokens `anomalyKindNewMerchant(merchantName)` / `anomalyKindCategorySpike(category, multiple)` from AC10), a **Dismiss** button (with per-kind label — see AC10; calls `PATCH /api/anomaly/[id]` `{ status: 'dismissed' }` via a Client Component wrapper or Server Action; optimistically removes the row), and a **See transactions** investigate link (see navigate targets in Tech notes; emits `ANOMALY_INVESTIGATED` client-side before navigation). Panel has a heading (`anomalyPanelTitle` from AC10). No SVG, no chart — text + action buttons only.

- [ ] **AC8 — Dismiss wiring:** the dismiss gesture uses the existing `PATCH /api/anomaly/[id]` route (already handles `status: 'dismissed'`, AAL2-gated, idempotent, emits `ANOMALY_DISMISSED`). The dismiss is a one-tap client action (no confirmation dialog — the brief: "dismiss gesture must be one tap"). The panel optimistically removes the dismissed row on the client. Subsequent page reload re-reads the updated status (the dismissed row no longer appears as `open`/`surfaced`). The dismiss button's accessible label disambiguates per kind: `new_merchant` → `anomalyDismissNewMerchant` ("Got it — don't flag this merchant again"); `category_spike` → `anomalyDismissMonthly` ("Dismiss for this month") — see AC10.

- [ ] **AC9 — `ANOMALY_INVESTIGATED` funnel event (`packages/core/funnel.ts`):** add `ANOMALY_INVESTIGATED: "anomaly_investigated"` alongside the existing `ANOMALY_SURFACED` / `ANOMALY_DISMISSED` entries. The `AnomalyPanel`'s investigate link emits this client-side (fire-and-forget via the existing `emit` pattern) with `{ anomaly_kind: row.kind }` before navigating to the ledger.

- [ ] **AC10 — Copy tokens (`app/lib/copy.ts`):** extend the `dashboardIntelligence` block (started in WLT-26-1) with anomaly panel tokens. Minimum required tokens: `anomalyPanelTitle` (section heading, e.g. "Flagged for review"), `anomalyKindNewMerchant` (string template — receives `merchantName`, may be null), `anomalyKindNewMerchantUnknown` (fallback when merchant is null: e.g. "New merchant — we couldn't identify it"), `anomalyKindCategorySpike` (string template — receives `categoryLabel` + `multipleLabel`), `anomalyDismissNewMerchant` (button label: "Got it"), `anomalyDismissMonthlySrLabel(category: string, month: string)` (sr-only label for the monthly dismiss button, for accessibility), `anomalyDismissNewMerchantSrLabel(merchantName: string)` (sr-only label), `anomalyInvestigate` ("See transactions"), `anomalyEmptyNoHistory` (copy for the < 2 months empty state), `anomalyEmptyNoAnomalies` (copy for the nothing-to-flag state). Engineer uses these tokens — no inline string literals in the component.

- [ ] **AC11 — Dashboard integration (`app/(app)/dashboard/page.tsx`):** add `<AnomalyPanel userId={userId} />` inside the `DashboardIntelligence` section (WLT-26-1 created this section with `CategorySpendChart`), wrapped in its own `Suspense` boundary (skeleton fallback). The anomaly panel renders **above** the category chart (it is higher-urgency content). The section remains gated by `DASHBOARD_INTELLIGENCE_ENABLED` (no flag change — the gate is already on the section). The recap surface, budget surface, and workflow surface are unchanged.

- [ ] **AC12 — E2E test-data cleanup:** any E2E test that seeds transactions or anomaly rows for the panel MUST hard-delete the seeded rows after the run. No orphaned test records. Anomaly rows may be hard-deleted (no audit constraint prevents it); test transactions follow the same cleanup AC as WLT-26-1.

## Standard Experience Checklist

- [x] **Navigation** — dismiss removes the row (optimistic client update); investigate link navigates to the WLT-23 ledger (back path = browser back, existing behavior); empty states are non-navigable — covered by AC7, AC8.
- [x] **States** — Suspense skeleton (loading, AC11) / empty-no-history (< 2 months, AC7) / empty-no-anomalies (nothing to flag, AC7) / loaded list of anomalies / post-dismiss optimistic removal (AC8) — covered by AC6, AC7, AC8, AC11.
- [x] **Feedback** — per-kind dismiss label disambiguates permanent vs monthly suppression (AC8, AC10); optimistic removal gives immediate feedback; investigate emits before navigation (AC9); per-kind anomaly phrasing explains what was detected (AC7, AC10); no silent actions — covered by AC7, AC8, AC9, AC10.
- [x] **Accessibility** — dismiss button has a distinct sr-only label per kind (AC10); investigate link is keyboard-navigable with descriptive text; anomaly phrasing is text (no color-only indication); panel heading provides a landmark (AC7, AC10) — covered by AC7, AC8, AC10.
- [x] **Edge cases** — `monthsOfHistory < 2` → honest empty state, no broken detector output (AC7); no open anomalies and enough history → distinct "nothing unusual" state (AC7); `new_merchant` debut transaction superseded at read time → panel renders without merchant name, not an error (AC6); already-dismissed anomaly re-submitted → idempotent 200 from the route (AC8); recap must not surface `new_merchant`/`category_spike` anomalies (AC6 orthogonality guard test) — covered by AC6, AC7, AC8.
- [x] **Cross-surface consistency** — single web surface: `n/a — web only`. Load-bearing guard: the recap `readTopAnomaly` filter must never return `new_merchant` or `category_spike` rows; the panel `readDashboardAnomalies` must never return `large_charge`, `recurring_due`, or `low_balance` rows — both guards asserted in AC6 integration tests.

## Tech notes

Build on the WLT-26 architecture (`docs/bets/WLT-26/architecture.md`). No new API routes. One narrow expand-only migration.

**Migration must land before the scan runs.** OPS-2 auto-applies migrations on deploy before the app boots. Do not deploy the scan extension (AC4) without the migration (AC5) — the `kind` check constraint will reject the new kinds. In practice: both land in the same PR.

**Migration number — coordinate with WLT-26-1.** WLT-26-1's DRI Issues note the `(user_id, occurred_on, category)` index may require its own migration (`0018_category_index.sql`), or may not (if the index already exists). Whoever lands first takes `0018`; this slice takes the next. Check the highest existing migration number at implementation time and take `n+1`. Do not hard-code `0018` here without confirming WLT-26-1 didn't already claim it.

**Investigate URL shape per kind:**
- `category_spike` → `/transactions?category=<rawCategory>&month=<YYYY-MM>` — `rawCategory` extracted from the dedup_key in `readDashboardAnomalies` (format `category_spike:<rawCategory>:<YYYY-MM>`); `month` = same YYYY-MM slice; reuses the WLT-26-1 + WLT-23 month filter.
- `new_merchant` → `/transactions?month=<YYYY-MM>` — the month of the debut transaction (`summary.date.slice(0, 7)`); shows the user their transactions for that month so they can find the new charge. There is no existing merchant-name filter on the ledger; the category + month filter is the closest supported slice.

**`rawCategory` vs humanized category in `readDashboardAnomalies`:** the `category_spike` dedup_key carries the raw resolved category slug (e.g. `category_spike:food_and_drink:2026-06`). Parse it at read time to obtain `rawCategory` for the Investigate URL. Separately, `summary.category` carries the humanized display name for the panel phrasing. Both are needed; do not conflate them.

**Orthogonality guard (load-bearing):** the recap's `readTopAnomaly` filters `kind in ('large_charge','recurring_due','low_balance')` — this filter must NOT be changed. `readDashboardAnomalies` filters `kind in ('new_merchant','category_spike')`. Both filters are one-sided: neither surface leaks into the other. A guard integration test asserts: (1) inserting a `new_merchant` row does NOT cause `readTopAnomaly` to return it; (2) inserting a `large_charge` row does NOT cause `readDashboardAnomalies` to return it.

**PII invariant:** `anomalies.summary` must never contain the merchant name or any raw transaction description. A `new_merchant` anomaly's `summary` carries only `{ amount, date }` — the merchant name is resolved at read time by joining the live transaction via the stripped dedup_key. This is the same invariant the 0009 migration comment enforces (`"NO merchant/description"`).

**`normalizeMerchant` in the pure detector:** `normalizeMerchant` is exported from `packages/core/categories.ts`. Import it in `anomaly.ts` (it's already in the `@wealth/core` package — same monorepo). The existing `anomaly.ts` imports `humanizeCategory` from `./recap`; add `normalizeMerchant` from `./categories`.

**New-merchant debut window:** reuse `LARGE_CHARGE_RECENT_DAYS` (7 days) as the "recent" flag window — a merchant first seen in the last 7 days relative to `asOf` is a new-merchant candidate. This keeps the two detectors consistent in how they define "recent."

**`categorySpikes` on-pace projection:** `projection = currentMonthTotal × (totalDaysInMonth / daysElapsedSoFar)`. `daysElapsedSoFar = daysBetween(asOf, firstDayOfCurrentMonth) + 1` (at least 1 to avoid divide-by-zero). `totalDaysInMonth` from the calendar (28–31). Do not fabricate zeros — if the current month has no transactions in a category, there is nothing to project.

**`countsAsSpending` in the pure rules:** the scan pre-filters transactions via `countsAsSpending` before calling `detectAnomalies` (line 72 in `anomaly-scan.ts`). The new rules receive pre-filtered transactions — transfers and payments are already excluded. No additional filtering needed inside `newMerchants` or `categorySpikes` beyond the debit direction check.

**Do NOT route Investigate through `reviewAnomaly` / `complete_anomaly_review`.** The `complete_anomaly_review` RPC creates a `recap_review_anomaly` WorkflowRun (a WAWU action tied to the recap loop). Investigate on the dashboard panel is navigation + a funnel emit only — it does NOT flip the anomaly status and does NOT create a WorkflowRun. The anomaly stays `surfaced` until dismissed.

**Feature flag:** the `DASHBOARD_INTELLIGENCE_ENABLED` flag (WLT-26-1) already gates the full `DashboardIntelligence` section. No new flag for the panel specifically — the architecture recommends staging by kind order (`new_merchant` first, then `category_spike`) within the operator calibration window after the flag is flipped. The staging is operational (flip, observe dismiss-rate guardrail, then proceed) rather than a code flag.

## PRs

_Auto-populated as PRs open._

## Tests

- **Engineer (pure — `packages/core/anomaly.test.ts` extension):** `newMerchants` — debut fires on first appearance in recent window; does not fire for a merchant with prior history; does not fire when `monthsOfHistory < 2`; does not fire for merchant appearing only outside the recent window; summary carries no merchant name; `dedupKey` = `'new_merchant:' + debutTxn.dedupKey`. `categorySpikes` — spike fires at ≥ 1.75× projection; does not fire at < 1.75×; does not fire when < 2 prior complete months; does not fire when baseline ≤ 0; projection formula correct across variable-length months; `dedupKey` encodes YYYY-MM of the current month; summary carries humanized category, projection, baseline, multiple. Shared: `detectAnomalies` calls both new rules; `AnomalyKind` accepts new values.
- **Engineer (integration — `app/lib/anomaly.test.ts`):** `readDashboardAnomalies` — returns only `new_merchant`/`category_spike` kinds; cross-tenant isolation (user B denied user A's rows); `new_merchant` merchant resolved from live transaction; null when transaction not found; open→surfaced transition fires `ANOMALY_SURFACED` once (idempotent); `monthsOfHistory` accurate for seeded data; **orthogonality guard** — seeded `new_merchant` row is NOT returned by `readTopAnomaly`; seeded `large_charge` row is NOT returned by `readDashboardAnomalies`.
- **Engineer (scan — `packages/jobs/recap/anomaly-scan.test.ts` extension):** scan mapping now populates `merchant` and `dedupKey` on `AnomalyTxn`; the two new kinds flow through the upsert path and land in the `anomalies` table; idempotent re-scan does not duplicate.
- **Engineer (component — `app/(app)/dashboard/AnomalyPanel.test.tsx`):** renders per-kind phrasing; dismiss button calls the route and removes the row optimistically; investigate link has correct href per kind; empty-no-history state renders when `monthsOfHistory < 2`; empty-no-anomalies state renders when list is empty and `monthsOfHistory >= 2`; null `merchantName` falls back to `anomalyKindNewMerchantUnknown` copy; sr-only dismiss labels present; panel heading present.
- **Codex (separate handoff):** RLS coverage for the new kinds on `anomalies` — owner SELECT returns own `new_merchant`/`category_spike` rows only; cross-tenant deny (user B cannot see user A's); service-role INSERT succeeds; owner UPDATE `status='dismissed'` succeeds via the status-only trigger; owner UPDATE any other field fails; **gated real-path E2E**: seed a user with ≥ 2 months of transactions + a debut merchant + a spiking category → scan runs → anomalies appear in the panel → dismiss a `new_merchant` row → it disappears + does not re-appear on reload → dismiss a `category_spike` row → does not re-appear until next month's dedup_key → investigate a `category_spike` → ledger opens with correct category + month filter → second-user isolation (user B's panel shows only their anomalies) → test data hard-deleted (AC12).
- **Performance:** EXPLAIN ANALYZE the `readDashboardAnomalies` read after the migration lands — confirm the `idx_anomalies_user_status` index (on `(user_id, status)`) keeps the panel read under 20ms for a typical corpus. No separate performance concern beyond the dashboard p95 < 200ms fitness function (covered by the cheap indexed read off the request path).

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions

- [2026-06-26] [PM] **WLT-26-2 = anomaly panel only; no split by anomaly kind** — rationale: the architecture recommends staging `new_merchant` before `category_spike` operationally (flip the flag, observe dismiss rate, then proceed) rather than in separate stories; both kinds share the same detector extension, migration, and panel component — splitting is arbitrary churn and makes the orthogonality guard harder to test in isolation — alternatives: two stories (one per kind — rejected: they share the same scan extension, migration, and AnomalyPanel; the operational staging is enough), bundle with WLT-26-1 (rejected: WLT-26-1 is already written as chart-only; the anomaly panel requires a migration + scan extension the chart does not) — area: scope — reversibility: easy

- [2026-06-26] [PM] **Investigate does NOT transition anomaly to `acted` / does NOT call `complete_anomaly_review`** — rationale: the `complete_anomaly_review` RPC creates a `recap_review_anomaly` WorkflowRun (a WAWU action in the recap loop); the dashboard panel's "See transactions" is navigation + a funnel signal, not a platform-prompted financial action — the anomaly stays open/surfaced until explicitly dismissed — alternatives: route Investigate through `reviewAnomaly` (rejected: conflates dashboard navigation with the recap's WAWU action loop; pollutes the WorkflowRun table with non-actions; breaks the `metrics_anomaly_weekly` acted/dismissed split) — area: product/architecture — reversibility: easy

- [2026-06-26] [PM] **Anomaly panel renders above the category chart** — rationale: anomalies are higher-urgency ("something looks off") than the chart ("context on spend"); the brief's key metric leads with anomaly engagement; placing it first gives it the attention it needs — alternatives: chart first (rejected — the chart is the passive context; the anomaly is the active signal) — area: UX — reversibility: easy (CSS order change)

- [2026-06-26] [PM] **`rawCategory` extracted from dedup_key at read time; not stored separately in summary** — rationale: the `category_spike` dedup_key (`category_spike:<cat>:<YYYY-MM>`) is the canonical record of the raw category and month; parsing it at read is a deterministic one-line split; adding a `rawCategory` field to `summary` would change the data shape unnecessarily and the summary is an `amount/enum/date only` jsonb by invariant — alternatives: store rawCategory in summary (rejected — widens the data shape; the dedup_key already carries it) — area: data — reversibility: easy

### Risks

- [2026-06-26] [PM] **`category_spike` on a 2–4-month window misleads (the brief's primary risk)** — likelihood: medium — impact: high — mitigation: SPIKE_MULTIPLE = 1.75 (conservative), MIN_HISTORY_MONTHS = 2 gate, one-tap dismiss as self-calibration, `metrics_anomaly_weekly` dismiss-rate guardrail (brief guardrail: < 50% dismiss rate within 14 days); the `DASHBOARD_INTELLIGENCE_ENABLED` flag lets the operator observe and calibrate before the surface goes live broadly — area: product quality

- [2026-06-26] [PM] **Migration number collision with WLT-26-1** — likelihood: medium (depends on WLT-26-1 needing its own migration) — impact: low (caught in CI) — mitigation: the DRI Issue below requires the Engineer to check the highest migration number at implementation time before naming the file — area: ops

- [2026-06-26] [PM] **`new_merchant` debut transaction superseded before panel renders** — likelihood: low (CDC supersession is rare) — impact: low (panel renders without merchant name — AC6 graceful degradation) — mitigation: null `merchantName` falls back to `anomalyKindNewMerchantUnknown` copy; no crash or empty panel — area: data

### Issues

- [2026-06-26] [Engineer] **Confirm migration number before naming the file** — severity: medium — owner: Engineer — status: open — area: ops — WLT-26-1 MAY claim `0018_category_index.sql`; check the highest existing migration file at implementation time and take `n+1`. Do not hard-code without checking.

- [2026-06-26] [Engineer] **Confirm `anomalies_kind_check` is the actual constraint name before the migration** — severity: low — owner: Engineer — status: open — area: data — the 0009 migration uses an inline unnamed check; the default Postgres name is `anomalies_kind_check`. Verify on an ephemeral PG with `\d anomalies` before writing the `drop constraint if exists` in the migration (WLT-25 discipline).

- [2026-06-26] [Engineer] **`rawCategory` parse contract: confirm the dedup_key format before implementing** — severity: low — owner: Engineer — status: open — area: data — the AC3 dedup_key format is `'category_spike:' + category + ':' + YYYY-MM`. If the raw category slug itself contains a `:` character (unlikely but confirm), the parse (`split(':')[1]`) would break. Validate against the actual category slug corpus before shipping.

- [2026-06-26] [Engineer] **Investigate URL for `new_merchant` — only month filter available** — severity: low — owner: Engineer — status: open — area: UX — the ledger currently supports `?category=` and (WLT-26-1) `?month=`. There is no `?merchant=` filter. The `new_merchant` investigate link passes `?month=<YYYY-MM>` (the debut month). If the user has many transactions that month, they still need to find the charge visually. Acceptable at launch (the month is the narrowest filter available without a new route); if post-launch feedback shows this is frustrating, a `?merchant=` filter or a direct transaction highlight is a fast-follow.

- [2026-06-26] [Engineer] **Average = median confirmed for `categorySpikes`** — severity: low — owner: Engineer — status: open (confirm with Architect at implementation start) — area: data — the Architect leans median (robust to a one-off spike inflating its own baseline; consistent with the budget baseline compute). The category chart (WLT-26-1) also uses median for the reference line. Both must agree on mean vs median so the chart baseline and the spike detector threshold are consistent.

---

_Story under bet: docs/bets/WLT-26/brief.md_
