---
id: WLT-22-ARCH
bet: WLT-22
status: Approved
created: 2026-06-17
authors: [Architect, Enterprise/Solution Architect]
area_tags: [frontend, spending, budgets, data]
---

# Technical Design: Budget transparency + category correction

## Decision

**Plaid owns the transaction entries** (amount, date, merchant — untouched). A **category is an indication**, and **whatever the user sets is SAVED** — written as a concrete, persisted per-transaction assignment, not recomputed at read. Concretely: add three small **owner-CRUD** tables — `categories` (the user's own set), `category_rules` (merchant → category), and **`transaction_categories`** (the **saved** assignment, keyed by the stable **`dedup_key`**). Recategorizing **writes** `transaction_categories`; a merchant **rule writes** assignments on its matches (past on create, future at sync). Reads take the **saved** value and fall back to Plaid's category only for transactions the user **hasn't** touched — via **one shared read helper** that `app/lib/budget.ts`, `app/lib/recap.ts`, and the `anomaly-scan` job all use, so every surface agrees. The pure compute (`packages/core/{budget,recap,anomaly}.ts`) is **unchanged** — it receives the effective category string and groups as before. **Drill-down (WLT-22-1) needs none of this** — a read of existing rows + a UI, so it ships first. **No new tooling.**

## Context

- **Categories today are a single denormalised snapshot.** `transactions.category` = Plaid's coarse `personal_finance_category.primary` (legacy `category[0]` fallback), stamped at ingest (`map.ts`), shown via `humanizeCategory()`. No taxonomy, no hierarchy, no user control.
- **`transactions.category` is part of the CDC `content_hash`** (`dedup.ts`) — a Plaid re-sync writes a **new revision row**. So the user's saved category **cannot** be a column on that row (it would orphan on re-sync); it must live in its own table keyed by something invariant.
- **`dedup_key` is the stable transaction identity** (`${source}:${providerAccountId}:${providerTransactionId}`, content hash for manual/CSV) — invariant across CDC revisions. The key the saved assignment hangs on.
- **Category is read in exactly three paths**, all grouping by the raw string: `app/lib/budget.ts` (`readSpendingForBudgets`), `app/lib/recap.ts` (`readRecentSpending`, WLT-17), and `packages/jobs/recap/anomaly-scan.ts` → `packages/core/anomaly.ts` (WLT-18). The pure functions are string-agnostic — they don't care where the string came from.
- **Owner-CRUD + the RLS soft-delete lesson:** `intents`/`goals`/`budgets` are the owner-CRUD model; an authenticated soft-delete fails under a `deleted_at`-filtering SELECT policy (WLT-21-1) → these tables **hard-delete** on clear.

## Approach

### Components affected

- **New (DB):** `00NN_categories.sql` — `categories`, `category_rules`, `transaction_categories` (owner-CRUD RLS, hard-delete, composite FKs).
- **New (app):** `app/lib/categories.ts` (read the user's set/rules + the saved assignments; **write** a recategorization / rule / category; apply a rule), `app/lib/categories-client.ts`, `app/api/categories/*` routes; the drill-down read + UI under `app/(app)/budget/`.
- **New (read helper, shared):** `effectiveCategory` join logic — one place that turns `(transaction, savedAssignment)` into the category string (`saved ?? plaidDefault`). Used by all three read paths.
- **Edited:** `app/lib/budget.ts`, `app/lib/recap.ts`, `packages/jobs/recap/anomaly-scan.ts` — `LEFT JOIN` the saved assignments by `dedup_key` and pass the **effective** category into the unchanged pure functions. Additive funnel events in `packages/core/funnel.ts`. The **sync job** applies the user's rules to newly-ingested transactions.
- **Unchanged:** `packages/core/{budget,recap,anomaly}.ts`; `transactions.category` (Plaid's).

### Write paths (the user's intent is SAVED)

- **Recategorize one transaction** → upsert `transaction_categories(user_id, dedup_key, category_id, assigned_by='user')`. A user assignment is authoritative — a later rule never overwrites it.
- **Create / edit a merchant rule** → store it in `category_rules`, then **apply it**: write `transaction_categories(..., assigned_by='rule')` for every matching transaction **without** a `'user'` assignment (a bulk upsert over the user's history).
- **New transactions** (Plaid sync) → after ingest, the sync job applies the user's rules to the new rows, writing `'rule'` assignments — so future transactions are categorized + saved, not resolved-on-the-fly.
- **Delete a rule** → remove its `'rule'` assignments (keep `'user'` ones); **delete a category** → reassign/clear its transactions (resolve in the story).

### Read path (simple — read what's saved)

`transactions LEFT JOIN transaction_categories ON (user_id, dedup_key)` → **effective category = saved category name `??` Plaid's category** (the indication, for anything untouched). One shared helper; the three readers select `dedup_key` + the saved join + `category` and hand the **resolved string** to the pure compute. No precedence engine at read — the saved value already won at write time.

### Data model — `00NN_categories.sql` (additive; owner-CRUD; hard-delete)

```
categories (
  id uuid pk, user_id uuid not null → auth.users on delete cascade,
  name text not null, kind text check (kind in ('essential','discretionary')) default 'discretionary',
  source text check (source in ('seed','custom')) default 'custom',
  created_at/updated_at,  unique (user_id, lower(name)),  unique (id, user_id)
)
category_rules (
  id uuid pk, user_id uuid not null → auth.users,
  merchant_norm text not null,                          -- normalized merchant match key
  category_id uuid not null,
  created_at/updated_at,  unique (user_id, merchant_norm),
  foreign key (category_id, user_id) → categories(id, user_id)
)
transaction_categories (                                -- the SAVED per-transaction assignment
  id uuid pk, user_id uuid not null → auth.users,
  dedup_key text not null,                              -- the STABLE txn identity (survives CDC)
  category_id uuid not null,
  assigned_by text check (assigned_by in ('user','rule')) not null,
  rule_id uuid,                                         -- which rule wrote it (for delete-rule revert)
  created_at/updated_at,  unique (user_id, dedup_key),
  foreign key (category_id, user_id) → categories(id, user_id)
)
```

- **RLS:** owner-CRUD on all three (the `intents` 4-policy pattern); **hard-delete** on clear; composite FKs `(category_id, user_id)` block forged cross-tenant links. `transactions.category` is **untouched** (Plaid's).

### API / contract changes

- **HTTP (new, AAL2-guarded):** `GET /api/categories` (set + rules); `POST /api/categories` (create); `POST /api/categories/recategorize` `{dedupKey, categoryId, applyToMerchant?: boolean}` (writes the user assignment + optionally creates/applies the merchant rule); `DELETE` for a rule / category. Drill-down line items ride on the budget view.
- **Funnel (additive):** `category_drilldown_viewed`, `transaction_recategorized`, `category_rule_created`.

### Dependencies

**None.** Postgres tables + App Router routes/UI + a small read helper on the existing stack.

## Enterprise/Solution Architect input

### Cross-system implications

- **One read helper is the load-bearing invariant.** Category is read in 3 places; all 3 must apply the same saved-`??`-Plaid join or a surface disagrees (the brief's #1 guardrail). Enforced structurally + a guard test that no grouping consumer reads `transactions.category` raw.
- **Rule application is a WRITE, in two moments** — on rule create/edit (backfill the user's history) and on **sync** of new transactions (the sync job). This is the cost of "saved, not resolved": a rule edit re-writes its assignments. Predictable + matches the user's model (assignments are concrete saved facts).
- **The anomaly job** joins the saved assignments per user, so detections use the user's categories. **Already-stored anomalies** keep their point-in-time category snapshot — not retro-rewritten (a detection is a moment-in-time record). Accepted edge.
- **Provider-coupling resolved structurally** — Plaid's category is demoted to a fallback indication; the user's saved category is authoritative. No new external surface.

### Standards compliance

Owner-CRUD RLS + composite FKs + hard-delete-on-clear match `intents`/`goals`/`budgets`; additive funnel events; API-route + AAL2 write-path. **No drift.**

### Cost / capacity / vendor lock-in

The saved table holds only **touched** transactions (user + rule-matched), not all history — bounded. Reads add one indexed `LEFT JOIN` on `(user_id, dedup_key)`. Rule application is a bounded bulk upsert. No vendor change; **reduces** lock-in.

## Alternatives considered

1. **Resolve-at-read (store only deltas; compute effective = override → rule → provider each read), nothing materialized** — **rejected per the product owner**: a category the user sets should be a **saved fact**, not recomputed each read; the saved model is more legible + makes reads a simple join. (Resolve-at-read's only edge — a rule change reflects without a re-apply — is handled here by re-applying on rule edit.)
2. **Store the saved category as a column on `transactions`** — rejected: the row churns on CDC re-sync; the assignment must hang off the stable `dedup_key` in its own table.
3. **Use Plaid `detailed` as the finer taxonomy** (store + backfill) — demoted to optional: users define their own splits, so `detailed` is only a nicer cold-start seed; backfill no longer required (drops the heaviest risk).

## Consequences

**Positive:** the user's intent is a **persisted, inspectable fact** (their explicit ask); reads are a simple indexed join; Plaid stays clean + CDC-safe; the pure compute is untouched; drill-down ships with no schema; the heavy Plaid-`detailed` backfill is optional.

**Negative:** rule application is a **write step** that must run on rule create/edit (backfill) **and** on new-transaction sync — more moving parts than resolve-at-read; a rule edit re-writes assignments; the saved table grows with corrections (bounded, only touched rows); stored anomalies aren't retro-rewritten (accepted); a migration seeds the user's category set so WLT-21 budgets carry over.

**Reversibility:** medium — additive tables + a read helper + a sync hook; removable by dropping the join (reverting to Plaid categories) without losing transaction data.

## Test strategy

- **Unit** — the saved-`??`-Plaid effective-category helper (saved wins; untouched → Plaid; `null` → "Other"); rule-application (writes `'rule'` rows for matches, skips `'user'` rows).
- **Integration (read layer)** — `getBudgetView`/`readRecentSpending`/anomaly job reflect a saved assignment + a rule, consistently.
- **RLS (`supabase/tests/rls.test.ts`)** — the 3 tables: owner CRUD; cross-tenant denied; composite FK blocks a forged cross-tenant `category_id`; hard-delete.
- **Component (jsdom)** — drill-down lists a category's line items (sum = the total); recategorize → POST `{dedupKey, categoryId, applyToMerchant}`; "remember this merchant" creates + applies the rule.
- **Real-path E2E (gated, Codex)** — seed transactions → drill in (verify line items = total) → recategorize with "remember the merchant" → reload → budget + line items reflect the saved category; **re-insert a CDC revision** of that transaction → the saved assignment **survives** (keyed by `dedup_key`).
- **Mechanical** — migration applies in CI; 3 funnel events present; guard test that no grouping consumer reads `transactions.category` raw.

## Rollout

Additive migration (3 tables; `transactions` untouched) — expand-only, safe. **WLT-22-1 (drill-down) ships first, zero schema.** **WLT-22-2** adds the tables + write paths + recategorize UI; **seed each user's `categories` from the distinct provider categories present in their data** on first use, so WLT-21 budgets map 1:1 and can be split/renamed. No env flag; with no saved assignments, every effective category is just Plaid's (today's behaviour) — ships dark-safe.

## Open questions for Engineer

- **Budget-key migration:** WLT-21 `budgets.category` stores a provider string → map to the seeded `categories` row; lean `budgets.category_id` (rename-safe) — a small migration.
- **Recommendation/essentials on user categories:** carry `kind ('essential'|'discretionary')` on the `categories` row (seed from the WLT-21 allowlist) so `computeRecommendedBudgets` reads it.
- **Rule application mechanism for FUTURE transactions:** confirm it runs in the **sync job** (post-ingest, per user) — keeping the provider-neutral `packages/aggregation` mapper clean; backfill-on-create is a bounded bulk upsert.
- **Merchant normalization:** lowercase + trim + collapse whitespace; last-write-wins per `merchant_norm`; a `'user'` per-transaction override is the exception escape hatch.

## DRI Log

### Decisions

- [2026-06-17] [User] **The user's category is SAVED (materialized per transaction), not resolved-at-read** — rationale: Plaid owns the entries; a category is an indication, and what the user sets must be a persisted fact, not recomputed each read; reads become a simple join — area: architecture/product — alternatives: resolve-at-read / store-only-deltas (rejected by the product owner) — reversibility: medium
- [2026-06-17] [Architect] **Saved assignment lives in `transaction_categories` keyed by `dedup_key`, NOT on `transactions`** — rationale: `transactions.category` is in the CDC `content_hash` (churns on re-sync); `dedup_key` is invariant so the saved value survives — area: data — reversibility: medium
- [2026-06-17] [Architect] **A merchant rule applies as WRITES** (backfill on create/edit + apply at sync), with `assigned_by` so a user's explicit assignment is never clobbered by a rule — rationale: keeps the saved data concrete + correct for past + future; the predictable cost of the saved model — area: architecture — reversibility: medium
- [2026-06-17] [Architect] **One shared read helper (saved `??` Plaid) across budget/recap/anomaly; pure compute unchanged** — rationale: consistency by construction; the pure functions just receive the effective string — area: architecture — reversibility: easy
- [2026-06-17] [Architect] **Drill-down (WLT-22-1) ships first, no schema** — rationale: a read of existing rows; immediate verification win, de-risked from the category model — area: scope — reversibility: easy

### Risks

- [2026-06-17] [Architect/EA] **A category read bypasses the saved-`??`-Plaid helper → surfaces disagree** — likelihood: medium — impact: high — mitigation: the shared read helper + a guard test — area: correctness
- [2026-06-17] [Architect] **Rule re-apply / sync-time application has gaps** (a new transaction or a rule edit not re-applied → a stale saved value) — likelihood: medium — impact: medium — mitigation: apply on rule create/edit (backfill) AND in the sync job for new rows; integration tests on both moments — area: correctness
- [2026-06-17] [Architect] **Migration/seed of existing budgets to user categories** — likelihood: medium — impact: medium — mitigation: seed `categories` from each user's distinct provider categories; small `budgets`→`category_id` migration — area: data

### Issues

- [2026-06-17] [Architect] **Stored anomalies aren't retro-rewritten** — severity: low — owner: Engineer — status: accepted — area: correctness — point-in-time records; only new detections use the saved category.
- [2026-06-17] [Architect] **Delete-a-category / delete-a-rule semantics** — severity: low — owner: PM/Designer — status: open — area: product — what happens to assignments when a category or rule is removed (revert rule rows; reassign category rows) — resolve in the story.

_Approved by: Vivek on 2026-06-17_
