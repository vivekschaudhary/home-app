---
id: WLT-22-4
bet: WLT-22
type: story
status: shipped
priority: P2
created: 2026-06-19
author: PM
design_link: n/a — no UI surface (backend matching + schema; the recategorize picker is unchanged)
copy_link: n/a — no new user-facing copy
area_tags: [spending, aggregation, categorization, data]
dependencies:
  - WLT-22-3 (the merchant-rule mechanism this hardens; shipped)
  - INC-2026-06-19 (the fuzzy-match fix this layers on top of; resolved, PR #70)
  - WLT-2 (the Plaid ingest pipeline this extends; shipped)
---

# WLT-22-4 — Robust merchant identity for rules (Plaid `merchant_entity_id`)

## Description

Make "remember the merchant" **reliable** by matching on Plaid's **stable `merchant_entity_id`** — Plaid's own canonical merchant identity, consistent across a merchant's transactions regardless of the display name — **with the fuzzy normalized name (INC-2026-06-19) as the fallback**. Today rules match only on the heuristic name key, which mis-fires when Plaid's `merchant_name` varies; the entity id is the provider's truth and fixes exactly those cases for any merchant Plaid recognizes. This is **entity-first, name-fallback** — it loses nothing (the fuzzy name still covers transactions Plaid named but didn't assign an entity) and adds nothing for the irreducible floor (a transaction with **no** entity **and** no name stays unmatchable). Backend only — the recategorize UI is unchanged.

## Acceptance Criteria

- [ ] **AC1 — Ingest + store the entity id.** The Plaid map captures `merchant_entity_id` ([packages/aggregation/plaid/map.ts](packages/aggregation/plaid/map.ts)) onto the provider txn type + the ingest, and `transactions` gains a nullable **`merchant_entity_id`** column (migration). Null when Plaid doesn't provide one. **Expand-only** (additive column; tolerant of being null pre-backfill — see OPS-2 expand-contract).
- [ ] **AC2 — Rules carry the entity id.** `category_rules` gains a nullable **`merchant_entity_id`** column; creating a rule ("always categorize this merchant") captures the recategorized transaction's `merchant_entity_id` **and** keeps the canonical `merchant_norm` (the fallback). A rule may have an entity id, a name key, or both.
- [ ] **AC3 — Entity-first, name-fallback matching.** A transaction matches a rule when **`txn.merchant_entity_id == rule.merchant_entity_id`** (both non-null) **OR** `normalizeMerchant(txn.merchant) == normalizeMerchant(rule.merchant_norm)` (the INC-2026-06-19 canonical key). An **entity match works across ALL name variants** — including ones the fuzzy key would miss — and is **exact** (no over-match risk). The `'user'` override still outranks a `'rule'`; collisions resolve newest-wins (unchanged).
- [ ] **AC4 — Existing rules keep working; new rules prefer the entity.** Legacy rules (name key only, no entity) match via the fallback exactly as today. New rules created from a transaction that **has** an entity id store it and thereafter match entity-first. No data migration of existing rows required.
- [ ] **AC5 — Owner-scoped (load-bearing security).** The new columns are owner-scoped under the existing RLS; rule apply runs under the service role scoped by `user_id` (unchanged). Proven by extending the RLS suite (the new column is read/written only within the owner's rows) + the gated real-path E2E (below).
- [ ] **AC6 — Backfill + the irreducible floor.** `applyAllRulesForUser` re-applies with entity-first matching on the next sync, backfilling existing transactions whose entity now matches a rule. A transaction with **no entity id and no merchant name** remains unmatchable — **explicitly out of scope** (documented; the deferred ceiling).

## Standard Experience Checklist

- [ ] **Navigation / States / Feedback / Accessibility** — `n/a — no UI surface` (the recategorize picker + ledger are unchanged; this is the matching key + schema).
- [ ] **Edge cases** — entity present on both → match across any name; entity on one side only → name fallback; both entity-null → name fallback; both entity-null AND name-null → unmatchable; legacy name-only rules; the collision/newest-wins path (unchanged): **AC3, AC4, AC6**.
- [ ] **Cross-surface consistency** — `n/a — backend; the single resolver + rule mechanism already shared across budget/recap/anomaly/ledger`.

## Tech notes

- **Provider + ingest:** add `merchantEntityId: string | null` to the provider txn type ([packages/aggregation/core/types.ts](packages/aggregation/core/types.ts)); map `t.merchant_entity_id` in [plaid/map.ts](packages/aggregation/plaid/map.ts); thread through `ingestTransactions` → write `transactions.merchant_entity_id`. **Verify `merchant_entity_id` is present in our Plaid product/response tier** (PROD_READY-09 vendor-capability discipline) — it's a standard `/transactions/sync` field; confirm + note the date.
- **Migration** `0013_merchant_entity.sql` (expand-only, auto-applied via OPS-2): `alter table transactions add column merchant_entity_id text;` + `alter table category_rules add column merchant_entity_id text;`. No backfill of the columns themselves (CDC re-sync repopulates transactions; rules capture going forward). Index `transactions(user_id, merchant_entity_id)` for the match read if needed.
- **Matching** (`packages/core` + `packages/db`): extend `MerchantRuleSpec` / `RuleMatchTxn` with `merchantEntityId`; in `matchRuleAssignments`, build **two indices** (by entity id, by canonical name) and match entity-first then name-fallback, preserving the user-override exclusion + newest-wins collision resolution. `readRules` + `applyRulesToTransactions` select/carry the entity id; the rule-create path ([app/lib/categories.ts](app/lib/categories.ts)) captures the source txn's entity id.
- **No new architectural decision** — an additive extension of the WLT-22-3 rule key (name → entity-or-name) on the shipped saved-category model; captured as a DRI decision, not a new architecture doc (consistent with how WLT-22-3 added `category_rules`).

## Tests

- **Engineer (this PR):** unit (entity-first match across wildly-different names; name-fallback when entity absent; both-null → no match; legacy name-only rule still matches; collision/newest-wins preserved); ingest maps `merchant_entity_id`; the rule-create captures it.
- **Codex (separate `test:` handoff):** RLS for the new columns (owner-scoped read/write) + the gated real-path E2E — recategorize + remember a merchant, then a **new transaction with the SAME entity id but a very different `merchant_name`** auto-categorizes through session→RLS→render; a second user is isolated.

Tags: `regression: true`, `e2e: true` (Codex E2E).

## DRI Log

### Decisions
- [2026-06-19] [PM] **WLT-22-4 = entity-id-first, fuzzy-name-fallback rule matching** — rationale: `merchant_entity_id` is Plaid's canonical merchant identity (not a heuristic), so it fixes the name-variability cases exactly + with no over-match; the fuzzy name (INC-2026-06-19) remains the fallback for entity-null-but-named transactions; layering loses nothing — area: categorization — alternatives: fuzzy-only (shipped; mis-fires on variants), a hand-maintained merchant alias table (rejected — heavier, we'd be re-deriving Plaid's entity) — reversibility: medium
- [2026-06-19] [PM] **Null-entity + null-name stays unmatchable (explicit ceiling)** — rationale: no provider signal to match on; out of scope, documented — area: scope — reversibility: n/a

### Risks
- [2026-06-19] [PM] **`merchant_entity_id` not available / sparsely populated on our Plaid tier** — likelihood: low — impact: medium — mitigation: confirm at build (vendor-capability check); the fuzzy-name fallback already covers the gap, so a sparse entity id degrades gracefully rather than regressing — area: vendor/feasibility
- [2026-06-19] [PM] **Expand-contract: the column is null until a CDC re-sync repopulates it** — likelihood: medium — impact: low — mitigation: matching tolerates null entity (falls back to name); no behavior regression before backfill — area: data

### Issues
- [2026-06-19] [PM] **Jira sub-ticket mirror** — severity: low — owner: PM — status: open — no connector on host; create WLT-22-4 manually under the WLT-22 epic.
- [2026-06-19] [Codex→Engineer] **Entity-only transactions couldn't create a rule (BLOCKER)** — severity: blocker — owner: Engineer — status: **resolved** — the create path required a non-null merchant; now allows `merchant OR merchant_entity_id`, using the entity id as a synthetic `merchant_norm` placeholder (non-null/unique, never matches a real name; entity-first matching). Migration-free.
- [2026-06-19] [Codex→Engineer] **RLS + gated E2E for the new columns missing (BLOCKER)** — severity: blocker — owner: **Codex (Reviewer)** — status: open — routed back per cross-model independence (the story Tests contract assigns Codex the RLS suite + the gated "same entity, very different name" E2E + isolation; also covers the entity-only create path).

---

_Story closed: <date>, brief link: docs/bets/WLT-22/brief.md_
