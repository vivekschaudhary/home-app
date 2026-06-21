---
id: INC-2026-06-20-spending-double-count
type: incident
bet: WLT-22
status: open                # open | mitigated | resolved | postmortem-pending | closed
severity: P1                # silent data-correctness in the core product number
detected_at: 2026-06-20T22:30
declared_by: operator (dogfooding)
on_call: Engineer (Claude Code)
area_tags: [spending, budget, categorization, data, correctness]
---

# Incident: Spending totals double-count credit-card payments + internal transfers

## Summary

Every budget/spending number is **inflated** because the spending computes sum **every debit regardless of category** — including credit-card payments and internal transfers. A purchase on a credit card is counted once (the debit on the card), and the **payment of that card from checking is counted again** (a second debit). Internal account-to-account transfers are likewise counted as spending. On the operator's 3872-transaction dogfooding account, **≈ $99,980.61 (~37%) of the trailing-12-month "spend" (≈ $266,937) is transfers/payments, not real outflow** — true spend is ~$167k/yr (~$14k/mo) vs the displayed ~$20–37k/mo.

**Customer impact: none** — pre-launch, single dogfood account. So incident phases 3 (stop-the-bleed), 5 (postmortem), 6 (comms) are **N/A**; this triage routes straight to fix-forward (Phase 4).

This surfaced immediately after **FIX-2026-06-20c** (the 1000-row read cap). That fix made the totals *complete*; this makes them *honest*. Both were real and both were needed — the cap fix is not implicated in the double-count.

## Timeline

| Time (UTC) | Event | By |
|------------|-------|-----|
| 2026-06-20T22:05 | FIX-2026-06-20c (1000-row cap) merged + deployed (#77) | Engineer |
| 2026-06-20T~22:20 | Operator verifying budget totals notices ~$20–37k/mo is implausibly high | operator |
| 2026-06-20T~22:25 | Operator: "we use credit cards — card payments must be accounting, double-counting?" | operator |
| 2026-06-20T~22:30 | Engineer confirms in code: all four computes sum every debit, no category exclusion | Engineer |
| 2026-06-20T~22:35 | Operator SQL: ≈ $99,980.61 of trailing-window debits are transfers/payments | operator |

## Investigation

### Hypotheses considered

- **H1 — the 1000-row cap fix over-counted** — ruled out: the cap fix only added rows that were always in-scope (debits in the window); it changed completeness, not the category filter. Removing it would just return to *truncated* inflation.
- **H2 — credits miscounted as debits** — ruled out: the computes filter `direction === "debit"`; card *payments received* (credits on the card, `TRANSFER_IN`) are already excluded. The leak is on the **debit** side.
- **H3 (root cause) — no "is this spending?" concept; every debit counts** — confirmed below.

### Evidence (code — deterministic, no Sentry needed)

All four spending computes in [packages/core/budget.ts](packages/core/budget.ts) do exactly one filter, `if (t.direction !== "debit") continue`, then sum keyed by category — **no category is ever excluded**:
- `computeMonthlySpending` ([budget.ts:133](packages/core/budget.ts#L133))
- `computeMonthlySeries` (year-spread, [budget.ts:158](packages/core/budget.ts#L158))
- `computeRecommendedBudgets` ([budget.ts:190](packages/core/budget.ts#L190))
- `typicalMonthlyTotal` ([budget.ts:293](packages/core/budget.ts#L293))

`buildBudgetRows` ([budget.ts:248](packages/core/budget.ts#L248)) then emits a row for **every** category key in actuals/recommended/budgets — so `TRANSFER_OUT` / `LOAN_PAYMENTS` appear as spending rows and feed the totals + year-spread + typical-monthly base.

Categories carry only `kind: 'essential' | 'discretionary'`, which **only gates the recommendation trim** ([budget.ts:62](packages/core/budget.ts#L62)) — it does not affect whether an amount is counted. The "add a category" picker *does* exclude income/transfers (`BUDGETABLE_CATEGORIES`, [budget.ts:43](packages/core/budget.ts#L43)) — but that's a UI affordance, not enforced in the compute.

**Same pattern in the other surfaces:** recap ([app/lib/recap.ts](app/lib/recap.ts)) and anomaly ([packages/jobs/recap/anomaly-scan.ts](packages/jobs/recap/anomaly-scan.ts)) both group on `direction === "debit"` with no category exclusion → they double-count too.

### Evidence (operator SQL)

Trailing-420-day debits by category, total ≈ $266,937; of which ≈ **$99,980.61 (~37%)** is transfers/card-payments. (Per-category breakdown to be attached — drives the exact seed exclusion list.)

## Mitigation (human-driven)

**N/A** — no customers, no production bleed. No rollback/flag/hotpatch. Routes directly to fix-forward.

## Resolution

**Approved fix (operator decision) — route to fix-forward.** A **protected, auto-seeded "Transfers & Payments" category that is flagged not-spending**, honored everywhere. This collapses two earlier candidate designs (a per-category `counts_as_spending` boolean vs. a manual-assign bucket) into one shape that is correct-by-default AND transparent:

1. **Data:** a `counts_as_spending boolean` (default `true`) on `categories` (migration), plus the notion of a **protected/system category** (`source = 'system'`, not user-deletable) for the canonical non-spending home, **"Transfers & Payments"** (`counts_as_spending = false`). A boolean is the cleaner orthogonal axis — an excluded category has no essential/discretionary meaning.
2. **Compute:** thread an `isExcluded(name)` / `countsAsSpending(name)` predicate into all four `packages/core/budget.ts` computes (mirroring the existing `isEssential` threading from WLT-22-2) so non-spending categories drop out of totals, the year-spread, the recommendation, and the typical-monthly base. Apply the same exclusion in recap + anomaly.
3. **Seed + AUTO-ASSIGN (zero-friction default):** seed the protected "Transfers & Payments" category and **auto-assign** `TRANSFER_IN` / `TRANSFER_OUT` and credit-card payments (Plaid detailed `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`) into it on first load — so it's honest on day one with **no user action**. The protected category is visible (the user can see what was set aside) and undeletable (the exclusion can't be accidentally broken).
4. **User-overridable, rules-backed (no recurring friction):** the user can move any transaction in/out of "Transfers & Payments." Crucially this reuses the **WLT-22-3/4 merchant-rule engine** — a recurring payment (e.g. "CHASE CC PAYMENT") is assigned **once** with "remember this merchant," and every future sync self-categorizes it. So the user never hand-sorts payments on an ongoing basis. Surface it as a **gentle nudge** ("we set aside N transfers so they don't inflate your spending — review?"), **not a blocking gate**. Provider taxonomy is a seed; the **user's decision is authority, resolved at read** ([[user-categories-are-source-of-truth]], [[user-first-intent-first]]).
5. **`LOAN_PAYMENTS` (mortgage/auto/student)** — real outflow, NOT a double-count. Default **keep** as spending; exclude only the CC-payment detailed category + transfers. User can still override.

**Why protected-category over a scattered per-row flag:** one canonical, visible home for "this isn't spending" is more trustworthy than a hidden boolean on arbitrary categories, and it leverages rules the product already ships. **Why auto-assign over manual-assign:** manual assignment of 100+ existing rows (and every future card payment) is recurring friction; default auto-assignment + a one-time "remember" per merchant removes it. The friction only appears if manual assignment is the *primary* path — it isn't here.

**Scope note:** this carries a **migration + UI (the protected category + the in/out toggle + the review nudge) + cross-surface compute change** — story-sized, not a hot patch. Recommend building as a **WLT-22 story** (or scoped `/fix` with architecture awareness), with Codex owning the RLS/E2E for the new column + protected-category semantics + a real-path test proving auto-assigned transfers drop from the budget total, year-spread, recap, and anomaly.

## Postmortem reference

N/A (no customer-facing incident). Findings captured here; action = the fix-forward story above.

## DRI Log

### Decisions
- [2026-06-20] [Support] **Severity P1, not P0** — rationale: silent correctness in the product's headline number (budget/spend), but no data loss, no security, and no customers (pre-launch dogfood) — area: triage — alternatives: P0 (rejected — no production/customer bleed), P2 (rejected — undermines the core value prop, ~37% inflation is not minor)
- [2026-06-20] [Engineer] **Root cause is "no exclusion concept," not the 1000-row cap fix** — rationale: the cap fix only restored completeness; the category filter was always absent — area: correctness
- [2026-06-20] [Engineer/operator] **Fix via a user-overridable "exclude from spending" state, seeded to exclude transfers + CC-payments** — rationale: matches [[user-categories-are-source-of-truth]] (taxonomy is a seed, user decides); makes the operator's "I'll categorize them" instinct actually work (re-bucketing alone does nothing today) — area: product — alternatives: hardcode a Plaid-taxonomy exclusion in the compute (rejected — no user control, couples compute to provider taxonomy); leave as-is (rejected — core number is wrong)
- [2026-06-20] [operator/Engineer] **Use a PROTECTED, auto-assigned "Transfers & Payments" category as the non-spending home — not a manual-assign bucket or a hidden per-row flag** — rationale: a visible, undeletable canonical bucket is more transparent and trustworthy than a hidden boolean, and auto-assignment (Plaid tags) + the WLT-22-3/4 "remember" rules removes the recurring friction of hand-sorting payments every sync — area: product/UX — alternatives: manual user assignment (rejected — recurring friction on 100+ rows + every future payment); per-category boolean only, no canonical bucket (rejected — less transparent) — reversibility: easy (the boolean + seed are data)

### Risks
- [2026-06-20] [Engineer] **`LOAN_PAYMENTS` mis-default** — likelihood: medium — impact: medium — mitigation: default keep mortgage/auto/student as spending; exclude only the CC-payment detailed category; user can override — area: product
- [2026-06-20] [Engineer] **Exclusion not applied uniformly across surfaces** → budget, recap, anomaly disagree — likelihood: medium — impact: medium — mitigation: thread one shared predicate; reuse the WLT-22-2 AC4 resolution-guard test pattern to assert every grouping reader honors exclusion — area: correctness
- [2026-06-20] [Engineer] **Transfer/payment detection depends on Plaid category fidelity** — a mis-tagged transfer slips through — likelihood: low — impact: low — mitigation: user override is the backstop; the seed is best-effort, not load-bearing — area: data

### Issues
- [2026-06-20] [Engineer] **recap + anomaly main transaction reads are ALSO still uncapped** (logged in FIX-2026-06-20c) — fold the exclusion + pagination fixes together when those surfaces are touched — severity: medium — owner: Engineer — status: open
