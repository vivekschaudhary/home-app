---
id: INC-2026-06-19-merchant-rule-variability
type: incident
bet: WLT-22
status: mitigated           # fix-forward chosen (fuzzy matching) — PR open, awaiting review/merge
severity: P2                # not an outage — a product limitation in WLT-22-3 rule matching
detected_at: 2026-06-19T20:55
declared_by: operator (dogfooding) via /triage
on_call: Engineer (Claude Code runtime)
area_tags: [spending, aggregation, categorization]
---

# Incident: "Remember the merchant" doesn't categorize NEW transactions when Plaid's merchant name varies/null

## Summary

A user recategorized a **Walmart** transaction to **Groceries** and chose "always categorize this merchant," which **backfilled past** Walmart transactions correctly. But a **newly-synced** Walmart transaction shows Plaid's default category (**"General Merchandise"**) — the rule didn't apply to it. **Impact:** the WLT-22-3 promise ("new transactions from that merchant arrive already sorted") **silently under-delivers** for merchants whose Plaid `merchant_name` is **inconsistent or null** across transactions. No data loss, no security impact, nothing worsening — the rest of categorization works. **Scope:** any merchant Plaid reports under varying names (big-box / online+in-store: Walmart, Target, Amazon, …) or with a null `merchant_name`.

## Timeline

| Time (UTC) | Event | By |
|------------|-------|-----|
| 2026-06-19T20:55 | Reported via `/triage`: Walmart→Groceries rule backfilled history, but a new Walmart txn shows Plaid "General Merchandise" | Operator |
| 20:55 | Engineer investigation: traced the sync wiring + the rule-match key | Engineer |
| 21:00 | Root cause identified (exact-`merchant_name` rule matching; Plaid name variability/null) — see below | Engineer |

## Investigation

### Hypotheses considered

- **H1 — the sync-time apply step doesn't run on incremental/webhook syncs (P1 wiring bug)** — **RULED OUT.** Both ingest paths go through `syncConnection`, which ends with the `apply-category-rules` step ([packages/jobs/aggregation/sync.ts:172](packages/jobs/aggregation/sync.ts#L172)). The webhook/cron path (`aggregationRefresh` → `CONNECTION_REFRESH_EVENT`, [sync.ts:217-237](packages/jobs/aggregation/sync.ts#L217-L237)) and the initial-link path (`CONNECTION_LINKED_EVENT`) both call it. The step runs **after** ingest (ordering correct).
- **H2 — apply runs but writes nothing / a bug in `applyRulesToTransactions`** — **RULED OUT.** It correctly reads all active transactions + matches via the pure `matchRuleAssignments`, and **backfill (which uses the same function) worked** for the user. Same code, same result for matching rows.
- **H3 (ROOT CAUSE) — the rule matches on the EXACT normalized Plaid `merchant_name`, which Plaid emits inconsistently (or null) for the same real-world merchant.**
  - `transactions.merchant` = Plaid `merchant_name`, **`null` when Plaid can't resolve it** ([packages/aggregation/plaid/map.ts:49](packages/aggregation/plaid/map.ts#L49)).
  - The rule stores `merchant_norm = normalizeMerchant(merchant_name)` = `trim().toLowerCase().replace(/\s+/g," ")` — **no token/entity normalization** ([packages/core/categories.ts:41](packages/core/categories.ts#L41)).
  - Matching is an **exact map lookup** on that normalized string ([categories.ts:66-71](packages/core/categories.ts#L66-L71)).
  - **`applyRulesToTransactions` also excludes null-`merchant` rows** (`.not("merchant","is",null)`, [packages/db/categories.ts:80](packages/db/categories.ts#L80)) — so a new txn with a null `merchant_name` is unmatchable regardless.
  - **Net:** the rule applies to a new transaction **only if** Plaid gives it the *identical* `merchant_name` the rule was created from. Walmart in-store / Walmart.com / "Walmart Supercenter" / a null-merchant POS line all miss. Backfill "worked" only for the past rows that happened to share the stored name; the variants were silently missed there too.

### Evidence

- Sentry / observability: **n/a** — not an error-path incident (the miss is silent; no exception). Sentry MCP not connected this session.
- Code: the four citations above are the load-bearing evidence; the behavior is deterministic from them.
- Recent deploys / ops: WLT-22-3 shipped 2026-06-17 (PR #62). No recent change *caused* this — it's an as-designed limitation surfaced by real Walmart data.

## Mitigation (human-driven)

**Action taken:** **None / not applicable.** This is not an outage and nothing is degrading — it's shipped behavior under-delivering for an edge. No rollback, flag, or traffic shift is warranted (rolling back WLT-22-3 would remove a working feature). **The remedy is fix-forward** (see below). Interim user workaround: manually recategorize the new variant and re-check "remember" — that adds the variant's name as a second rule, covering it going forward (clunky, not a real fix).

## Fix-forward options (Engineer drafts; Human/PM chooses)

1. **Match on Plaid's `merchant_entity_id` (RECOMMENDED — the real fix).** Plaid provides a **stable merchant entity id** that is consistent across a merchant's transactions regardless of the display name — designed for exactly this. Ingest + store `merchant_entity_id` on `transactions`, key rules on it (with the `merchant_name` path as a fallback for older rows / providers without it). Cost: a migration (add the column) + ingest mapping + a rule-key change + a backfill. **This is a story (likely WLT-22 follow-on or a small bet); touches the rule-matching contract → a light architecture note is warranted.**
2. **Harder fuzzy normalization** (strip store numbers, `.com`, "supercenter", punctuation; match on a merchant token/prefix). Cheaper (no schema), but **risks over-matching** (a "Walmart" rule swallowing "Walmart Pharmacy" the user wanted separate) — a precision/recall tradeoff that needs care.
3. **Fall back to the raw `name`/description when `merchant_name` is null** (and don't exclude null-merchant rows from matching). Helps only the **null** case, not the variant case; still brittle.
4. **Accept as a known limitation** — document it ("remembering works best for merchants Plaid names consistently") and rely on the manual workaround. Cheapest; lowest user value.

**Recommendation:** Option 1 (`merchant_entity_id`) — it's the provider-native stable key and fixes both the variant and (largely) the null cases; Option 3 as a complementary fallback. Route to `/create-story WLT-22` (a WLT-22-4 hardening slice) or a small tech-debt bet.

## Comms

- **Internal:** `connectors.incident_alert: slack`, but no Slack MCP connected this session → **comms drafted here, not auto-sent** (logged skip). For a P2 product-limitation with a single dogfooding reporter, a status-page/customer comm is **not warranted**.
- **User-facing changelog:** none until a fix ships.

## DRI Log

### Decisions
- [2026-06-19] [Engineer] **Classified P2 (product limitation, not outage); no stop-the-bleed mitigation** — rationale: no data loss / security / worsening; the feature works for consistently-named merchants; rollback would remove a working feature — area: triage — reversibility: n/a
- [2026-06-19] [Engineer] **Recommend fix-forward via Plaid `merchant_entity_id`, not fuzzy matching** — rationale: the provider-native stable merchant key avoids the precision/recall risk of heuristic name-fuzzing — area: categorization — alternatives: fuzzy normalize (over-match risk), null-fallback (partial) — reversibility: medium
- [2026-06-19] [Human] **Chose fuzzy name matching** (over the recommended `merchant_entity_id`) — rationale: no migration, ships immediately, the over-match risk is acceptable. **Built conservatively to honor the precision concern:** `normalizeMerchant` strips store NUMBERS + punctuation + a tight format/legal/online NOISE list (`com/online/inc/llc/corp/co/supercenter/superstore`) then concatenates — it does NOT collapse to a first token, so "Walmart Pharmacy" stays distinct from "Walmart". `matchRuleAssignments` re-canonicalizes legacy stored keys (idempotent) → existing rules match new variants with **no migration**. Fix: PR (fix/merchant-rule-fuzzy-match). — area: categorization — reversibility: easy (it's a pure function)

### Notes (fix behavior)
- **Immediate effect:** the next `apply-category-rules` run (Plaid webhook or the 6h cron `aggregationScheduledRefresh`) re-applies rules with the new key → the user's existing Walmart variants get categorized then; not instant.
- **Null `merchant_name` still unhandled** — fuzzy matching needs a name to fuzz; a transaction Plaid leaves null can't match (the deferred Option-1 `merchant_entity_id` / Option-3 description-fallback would close that). Logged as a residual.
- **Residual over-match knob:** the noise list is the precision/recall dial; intentionally tight. Widen only with evidence.

### Risks
- [2026-06-19] [Engineer] **Silent under-delivery erodes trust in "remember the merchant"** — likelihood: medium — impact: medium — mitigation: fix-forward (Option 1) + set expectations in copy; the feature is most-promised for exactly the big-box merchants Plaid names inconsistently — area: product/trust
- [2026-06-19] [Engineer] **Fuzzy matching (Option 2) could mis-categorize** — likelihood: medium (if chosen) — impact: medium — mitigation: prefer the entity-id approach — area: correctness

### Issues
- [2026-06-19] [Engineer] **No observability on rule-apply effectiveness** — severity: low — owner: Engineer — status: open — there's no signal for "rules ran but matched 0 of N new merchant transactions," so this kind of silent miss isn't measured; a fix-forward should add a count/metric. — area: observability
