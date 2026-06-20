---
id: FIX-2026-06-20-remember-cant-override-user
type: fix
bet: WLT-22
story: WLT-22-3
status: shipped
severity: P2
reported_by: operator (dogfooding)
created: 2026-06-20
area_tags: [spending, categorization]
---

# Fix: "Always categorize this merchant" can't change a transaction that has a prior user choice

## Triage (Support)

- **Report:** "I changed the category for FLC Dining from Food and Drink to Education — it changed for two but the ones in 2025 stayed the same. I'm trying to change them but after selecting the checkbox and the category it shows up again with the old values."
- **Severity:** **P2** — categorization correctness; the user is blocked from an explicit intent. No data loss, no security, nothing degrading.
- **Affected:** WLT-22-3 (remember-the-merchant), the recategorize-with-remember path. Deterministic from code; no Sentry needed.

## Root cause (Engineer)

`recategorizeTransaction(applyToMerchant=true)` ([app/lib/categories.ts](app/lib/categories.ts)) creates the rule and delegates assignment to `applyRulesToTransactions`, whose contract was "write `'rule'` for every matching transaction with **NO `'user'` override"** — it **excludes** every `'user'`-owned row. The create-path comment even assumed _"…incl. this one, since it has no 'user' override."_

So when the user does **recategorize + "remember"** on a transaction that **already carries a `'user'` override** (from a prior manual edit) — or whose sibling 2025 rows do — the rule respects the old override and **skips it**. The explicit new choice silently doesn't apply, and the picker re-renders the old value. Only the not-yet-touched rows changed ("two"); the previously-touched 2025 rows didn't; re-trying can't move them.

### Hypotheses
- **H1 — Plaid name-variant mismatch** — partly possible, but WLT-22-4/INC-2026-06-19 already broadened matching, and a variant case would be **fixed by re-trying** remember (the new rule captures the variant key). The report says re-trying **fails** → rules out variant-only.
- **H2 (root cause) — the rows have `'user'` overrides; the explicit remember can't override the user's own prior choices** (unconditional exclusion). Explains both symptoms.

## Fix

The copy is **"Always categorize {merchant} this way"** — an explicit, merchant-wide decision that should supersede the user's *own scattered prior* choices for that merchant.

- `applyRulesToTransactions` gains **`overrideUserAssignments`**. When set, it does NOT exclude `'user'` rows — the rule re-assigns **all** matching transactions (incl. the edited one + prior user-categorized siblings) as `'rule'`.
- The **explicit** recategorize-with-remember path passes `overrideUserAssignments: true`.
- **Sync-time** `applyAllRulesForUser` keeps the default (**respects** `'user'` overrides) — automatic re-application on new syncs never clobbers a deliberate manual exception. The two intents stay distinct: _explicit "remember"_ = blanket override now; _single recategorize (no remember)_ = a protected per-transaction exception.

## Verification

- Pure-seam contract test (`matchRuleAssignments`: empty owner-set overrides a prior user choice; populated set protects it).
- Codex (separate handoff): the gated real-path E2E — a user-categorized transaction + "remember this merchant" **does** update it (and prior-user-categorized siblings); a single recategorize without remember is **still protected** from a later sync re-apply; second-user isolation.

## DRI Log

### Decisions
- [2026-06-20] [Engineer] **Explicit "remember" overrides the user's own prior per-transaction choices for that merchant; sync-time apply still respects them** — rationale: matches the "Always categorize {merchant} this way" copy + the user's intent; preserves the WLT-22-3 "user wins over **automatic** rule" invariant where it belongs (sync), not on a deliberate user action — area: categorization — alternatives: only update the edited row (rejected — leaves siblings stuck), never override (status quo bug) — reversibility: easy (a flag)

### Risks
- [2026-06-20] [Engineer] **An intentional per-transaction exception for the same merchant is overridden by a later "remember"** — likelihood: low — impact: low — mitigation: that's the literal meaning of "always categorize this merchant"; the user can re-set an exception (a single recategorize without remember → sync-protected) — area: product

---

**Shipped:** PR #72 (squash `edfa1f5`), 2026-06-20. Codex authored the gated real-path E2E ([e2e/budget.spec.ts](e2e/budget.spec.ts)): seeds prior user-categorized Corner Hardware siblings, proves an explicit "Always categorize…" overrides all of them across the merchant, then re-establishes a single no-remember exception and verifies a later sync **still protects** it while continuing to auto-categorize new same-entity rows. Pure-function fix (no migration) — prod migrate-prod a no-op. **CLEAR tied to HEAD `0a895f2`.**
