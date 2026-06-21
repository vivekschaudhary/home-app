---
id: WLT-24-ARCH
bet: WLT-24
status: approved
created: 2026-06-21
authors: [Architect, Enterprise/Solution Architect]
area_tags: [frontend, backend, data, spending]
---

# Technical Design: Subscriptions — see and manage recurring spend

## Decision

Add a **`transaction_flags`** overlay table — owner-CRUD, keyed by the stable **`dedup_key`** (survives Plaid CDC re-syncs), with `flag_type ∈ {subscription}` this bet (the schema admits `followup` for the planned sibling bet) and a `source ∈ {user, auto}` column (slice 1 writes only `user`; the column reserves the auto-detection precedence for the fast-follow). A subscription is an **overlay orthogonal to category** — NOT a category and NOT a `transactions` column. **Mark/unmark** reuses the WLT-23 in-row picker/popover and writes the flag; the **Subscriptions view** reads the user's flagged transactions, groups them by **`normalizeMerchant`** (WLT-22-3/4), and a **pure compute in `@wealth/core`** infers each subscription's cadence + typical amount from history (≥2 occurrences) and a **headline monthly + annualized total**. Auto-detection is a deliberate **fast-follow** behind a **provider-agnostic `SubscriptionDetector` seam** (no implementation in slice 1; Plaid-recurring-vs-custom decided at that build). Everything is **within the foundational stack** (Postgres, Route Handlers, Inngest, Plaid) — no new tooling.

## Context

- **The overlay axis (load-bearing).** A subscription is orthogonal to category — a Netflix charge is _both_ "Entertainment" _and_ a subscription — and orthogonal to the WLT-22-5 spend/transfer classification (a subscription is real spend; it stays counted). So it cannot live on the category axis (`transaction_categories` / `categories`) without losing one of the two facts. It is a **flag overlay** on a transaction.
- **Why a table keyed by `dedup_key`, not a column.** `transactions.category` and other per-row fields churn on Plaid CDC re-sync (a revision is a new row). The WLT-22 lesson: user-set facts live in their own table keyed by the invariant `dedup_key` so they survive re-sync. `transaction_flags` follows `transaction_categories` exactly.
- **Patterns to reuse (all shipped):** the saved-assignment owner-CRUD + RLS pattern (`0011_categories.sql`), `normalizeMerchant` + the newest-wins merchant grouping (`@wealth/core` `categories.ts`), the WLT-23 ledger row + its reused picker/popover, `readAllPaged` (the 1000-row-cap guardrail, `@wealth/db/paged`), the funnel-event pattern (`@wealth/core/funnel.ts`), OPS-2 migrate-on-deploy.
- **Delete posture.** `transaction_flags` is user-declared config (like `categories`/`budgets`/`transaction_categories`) → owner-CRUD with **hard-delete on unmark** (the WLT-21 RLS lesson: a `deleted_at`-filtering SELECT policy makes an authenticated soft-delete structurally impossible). Not a financial/audit record, so no retention obligation.
- **Foundational-stack deviation gate: PASS for slice 1.** No new tool/service/dependency — Postgres table + Route Handlers + a pure compute. The fast-follow's _Plaid `/transactions/recurring/get`_ option is a **new Plaid product** beyond ADR-002's documented "Accounts / Balance / Transactions" scope → flagged as a **future foundation-amendment** to resolve at that build (DRI Issue), NOT introduced now. The custom-detector option needs no new tooling.

## Approach

### Components affected

- **New (DB):** `supabase/migrations/0015_transaction_flags.sql` — the `transaction_flags` table (owner-CRUD RLS, hard-delete, no composite FK needed — it's a standalone flag, not a cross-tenant reference).
- **New (pure, `@wealth/core`):** `subscriptions.ts` — `summarizeSubscriptions(markedTxns) → { subscriptions: SubscriptionRow[]; monthlyTotal; annualTotal }`. Pure + unit-testable: group by `normalizeMerchant`, infer cadence + typical amount, normalize to monthly. Plus the `SubscriptionDetector` interface (the fast-follow seam) and 2 funnel events.
- **New (`@wealth/db` or `app/lib`):** `readSubscriptions(client, userId)` (the flagged-txn read, paginated) + `markSubscription` / `unmarkSubscription` writers. A shared `transaction_flags` reader mirrors `readCategoryAssignments`.
- **New (app):** `app/api/subscriptions/route.ts` (GET the view), `app/api/subscriptions/mark/route.ts` (POST mark / DELETE unmark) — AAL2-guarded, `runtime="nodejs"`, discriminated responses. The Subscriptions page (`app/(app)/subscriptions/page.tsx` — replaces the "coming soon" stub) + `SubscriptionsClient.tsx` + `subscriptions-client.ts`.
- **Edited:** `app/(app)/nav.ts` — flip `subscriptions` from `status: "coming_soon"` to live. The WLT-23 ledger row (`TransactionsClient` / its picker) gains a "Mark as subscription" / "Unmark" affordance (reusing the existing popover; the row already exposes `dedupKey`). `app/lib/copy.ts` — the subscriptions copy block. `@wealth/core/funnel.ts` — `SUBSCRIPTION_MARKED`, `SUBSCRIPTIONS_VIEWED`.
- **Unchanged:** `transactions.category` (Plaid's), the WLT-22 category model, the WLT-22-5 `counts_as_spending` axis — a subscription flag never touches them.

### Data model changes

`0015_transaction_flags.sql` (expand-only; OPS-2 auto-applies):

```
transaction_flags (
  id          uuid pk default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  dedup_key   text not null,                       -- the stable txn identity (survives CDC)
  flag_type   text not null check (flag_type in ('subscription')),  -- admits 'followup' later
  source      text not null default 'user' check (source in ('user','auto')),  -- 'auto' reserved for detection
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, dedup_key, flag_type)           -- one flag of a type per transaction
)
```

- Indexes: `(user_id, flag_type)` for the Subscriptions read. RLS: 4 owner policies (`select/insert/update/delete` on `auth.uid() = user_id`) — the `intents`/`categories` pattern. **Hard-delete** on unmark. **No composite FK** (unlike `transaction_categories` — there's no second-table reference to forge; the flag is self-contained, isolation is the plain `user_id` policy).
- **No change** to `transactions`, `categories`, `transaction_categories`, `budgets`.

### API / contract changes

- `GET /api/subscriptions` → `{ subscriptions: SubscriptionRowDTO[]; monthlyTotal; annualTotal }` (AAL2; emits `subscriptions_viewed` once per view, fire-and-forget like the WLT-22-1 drill).
- `POST /api/subscriptions/mark` `{ dedupKey }` → upsert `transaction_flags(flag_type='subscription', source='user')`; emits `subscription_marked`. `DELETE` (or `{ unmark: true }`) → hard-delete the flag.
- The cadence/total math is **server-side** in the GET (the pure `@wealth/core` compute over the paginated flagged read) so the client renders a ready DTO — consistent with the budget view.

### Dependencies

None new. Reuses `@wealth/core` (`normalizeMerchant`, funnel), `@wealth/db` (`readAllPaged`, emitters), Supabase (Postgres + RLS + AAL2), the WLT-23 ledger UI. The **`SubscriptionDetector` seam** (fast-follow) is an interface only this bet:

```
interface SubscriptionDetector { detect(input): Promise<CandidateSubscription[]> }  // emits candidates → auto-set flags (source='auto'), a signal the user overrides
```

## Enterprise/Solution Architect input

### Cross-system implications

- **Orthogonality is the invariant.** A subscription flag must NOT change a transaction's category, its budget contribution, or its WLT-22-5 `counts_as_spending`. The Subscriptions read is a _separate_ surface; the budget/recap/anomaly readers are untouched. (Guard: no shared compute — the subscription summary doesn't go through the category resolver.)
- **Reuses the WLT-23 ledger** as the primary mark entry point (the natural "I recognize this recurring merchant" moment); the row already carries `dedup_key`.
- **The detector seam** (fast-follow) auto-sets flags `source='auto'`; the precedence (a user unmark must beat a later auto-detect) needs a "dismissed" record — **resolved at the fast-follow**, not slice 1 (open question below). Slice 1's `source` column makes the table forward-compatible.

### Standards compliance

Owner-CRUD RLS (default-deny tenancy), AAL2-guarded routes, no PII beyond the user's own merchant/amount/date (same posture as the WLT-23 ledger). No new audit obligation (user config, not a financial record).

### Cost / capacity / vendor lock-in

- **Slice 1: zero new vendor cost.** A table + reads.
- **Fast-follow lock-in flag:** the Plaid-recurring option is a separately-enabled (potentially billed) Plaid product beyond ADR-002 — a real **cost/lock-in** decision deferred to that build; the provider-agnostic seam keeps the custom-detector exit open. Aggregation cost is the foundation's named first-order variable cost, so this is logged, not waved through.

## Alternatives considered

1. **A "Subscriptions" category** (on the WLT-22 category axis). Rejected — conflates two orthogonal axes; a Netflix charge would be _either_ "Entertainment" _or_ "Subscription," losing one. The overlay table preserves both.
2. **A boolean column on `transactions`** (`is_subscription`). Rejected — churns on CDC re-sync (a revision is a new row, the flag would orphan); a `dedup_key`-keyed table survives it (the WLT-22 lesson).
3. **Detection-first** (ship auto-detection as slice 1). Rejected per the brief — heavier, couples to a provider before demand is proven; manual-first ships the substrate + surface cheaply and the detector then rides the same flag as a signal.
4. **Per-mark user-selected cadence.** Rejected for slice 1 — more friction per mark and redundant once detection lands; inferring from history (with an honest "cadence pending" fallback) is lighter and improves automatically as history accrues.

## Consequences

- **Positive:** a shared overlay substrate the follow-up-flag bet reuses (investment amortized); reuses every shipped pattern (RLS, normalization, ledger picker, pagination); forward-compatible with auto-detection (the `source` column + the seam); the orthogonality keeps the category/budget surfaces untouched (low blast radius).
- **Negative:** manual marking is friction until the detector lands (mitigated: tiny slice + the metric makes the manual-vs-detect question falsifiable fast); cadence/total can mislead on thin history (mitigated: ≥2-occurrence rule + honest "pending" label).
- **Reversibility:** easy — the table + surface are additive; the seam is an interface; nothing in the budget/category path changes.

## Test strategy

- **Pure (`@wealth/core`):** `summarizeSubscriptions` — grouping by normalized merchant; cadence inference (monthly/annual/weekly from the median interval; "pending" at 1 occurrence); typical-amount = median; monthly-total normalization (annual ÷ 12, weekly × 4.33); pending rows excluded from the normalized headline.
- **Engineer (component/integration):** mark/unmark from the ledger row → POST/DELETE + the row reflects it; the Subscriptions view renders the list + totals + honest empty state; the read paginates (the guardrail).
- **Codex (separate handoff):** the RLS suite for `transaction_flags` (owner CRUD, cross-tenant deny, hard-delete) + a gated real-path E2E (mark a recurring merchant from the ledger → it appears in Subscriptions with the right cadence/total → survives a CDC revision → second-user isolation).

## Rollout

- Migration `0015` (expand-only; OPS-2 auto-applies on deploy). No feature flag needed — a new additive surface; the nav flips `subscriptions` to live when slice 1 ships (gate the nav flip on the slice shipping, not the migration). Staged: slice 1 (substrate + mark + view) → fast-follow (detection behind the seam).

## Open questions for Engineer

- **Single-occurrence handling in the headline total:** a subscription with 1 observed charge shows "cadence pending" — include it in the monthly total at face value for its month, or exclude until a 2nd occurrence confirms cadence? (Lean: exclude from the _normalized_ headline, list it separately so the number stays honest.)
- **Cadence interval thresholds:** the day-interval bands for weekly/monthly/annual (+ "irregular") — pick tolerant bands (e.g. monthly = 26–35 days) in the pure compute; unit-test the boundaries.
- **Mark entry points:** ledger row for slice 1; also the budget drill? (Lean: ledger row first.)
- **Fast-follow precedence (not slice 1):** an auto-detector must not re-flag what a user unmarked → needs a "dismissed"/`source`-aware record; design at the detection build.

## DRI Log

### Decisions

- [2026-06-21] [Architect] **A `transaction_flags` overlay table keyed by `dedup_key`, not a category or a `transactions` column** — rationale: a subscription is orthogonal to category + to the spend/transfer axis; a dedup_key-keyed owner-CRUD table survives CDC re-sync (the WLT-22 lesson) — area: data — alternatives: a Subscriptions category (conflates axes), a boolean column (CDC churn) — reversibility: medium (schema)
- [2026-06-21] [Architect/operator] **Provider-agnostic `SubscriptionDetector` seam; defer Plaid-vs-custom to the fast-follow build** — rationale: keeps slice 1 unblocked + commits nothing prematurely; the seam shapes the auto-set-flag path either way — area: architecture — alternatives: commit to Plaid recurring now (a new Plaid product + ADR-002 amendment before demand is proven), commit to a custom detector now (more work) — reversibility: easy
- [2026-06-21] [Architect/operator] **Infer cadence + monthly total from marked history (≥2 occurrences), honest "pending" fallback** — rationale: lightest manual-first model that yields a real headline number and improves as history accrues; no per-mark friction — area: product/compute — alternatives: user-selected cadence (friction), latest-amount-only (weak headline) — reversibility: easy
- [2026-06-21] [Architect] **`source ('user','auto')` column included in slice 1** — rationale: forward-compatibility for the detector without a later migration; slice 1 writes only `user` — area: data — reversibility: easy

### Risks

- [2026-06-21] [Architect] **The Subscriptions aggregation read undercounts on a >1000-flag account** — likelihood: low (subscriptions are few) — impact: medium — mitigation: paginate (`readAllPaged`) from day one per the guardrail — area: scale
- [2026-06-21] [Architect] **Cadence/total misleads on thin history** — likelihood: medium — impact: low — mitigation: ≥2-occurrence inference + "pending" label + exclude pending from the normalized headline — area: data
- [2026-06-21] [Enterprise Architect] **Orthogonality regression** — a future change routes the subscription flag through the category/budget path and double-counts or mis-classifies — likelihood: low — impact: medium — mitigation: keep the subscription summary on a separate compute (never the category resolver); a guard test if the surfaces ever converge — area: correctness

### Issues

- [2026-06-21] [Enterprise Architect] **Plaid `/transactions/recurring/get` exceeds ADR-002's documented Plaid scope** — severity: medium (High if/when the fast-follow chooses it) — owner: Enterprise/Solution Architect — status: open — area: vendor/scope — the detection fast-follow's Plaid option needs a `/setup-foundation-architecture` amendment (ADR-002) before it's built; the provider-agnostic seam means slice 1 incurs nothing now.

---

_Approved by: operator on 2026-06-21_
