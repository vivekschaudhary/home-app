# Architect — role activity log

Append-only. Patterns worth retroing per `[fractal-retro]` (canon v0.3.17). Specific · cite bet-id + instance count.

## Deviation-gate fires (foundational-stack expansion pressure)

- [2026-06-25] [WLT-26] **Charting-library pressure (instance 1).** The brief proposed adopting **Recharts** (`ComposedChart`) for the category bar + average-line chart. Declined at the deviation gate — the shipped `app/(app)/budget/YearSpread.tsx` already expresses bars + a dashed reference line + the `aria-hidden`-SVG/`sr-only`-table a11y pair with **no charting dependency** (its own header comment: "no charting dependency"). Watch for recurrence: if a 2nd bet pushes Recharts, that's a signal the hand-rolled-SVG idiom has hit its ceiling and a foundational ADR amendment (charting framework) is warranted — escalate then, not before.

## Recurring missing-context (brief underspecified — same type ≥2 bets to escalate)

- [2026-06-25] [WLT-26] **Brief proposed a new data store unaware of a shipped substrate that already covers it (instance 1).** The brief specified a fresh `anomaly_dismissals` table + weighed it only against `transaction_flags`, without accounting for the shipped WLT-15/18 `anomalies` table — which already provides status-based dismiss, dedup-key monthly suppression, the owner-status-only trigger, RLS, and a `metrics_anomaly_weekly` dismiss-rate view (the brief's own guardrail). Architecture reused the existing substrate instead. If a 2nd brief proposes a new table/store for a concern an existing foundational entity already models, escalate a brief-template prompt: "search `docs/foundation/architecture.md` Foundational Data Model + existing migrations for an entity that already covers this before proposing a new store."

## Cross-cutting prerequisite patterns (fix before feature)

- [2026-06-28] [WLT-27] **Feature bet surfaced a latent data-type gap that must be fixed before the feature ships (instance 1).** WLT-27 (manual accounts + multi-currency) revealed that `SpendingTxn` carries no `currency` field — all spending aggregation (budget, recap, anomaly scan, category chart) sums amounts across all currencies as raw numbers. USD-only users are unaffected today; a non-USD manual account would produce silent nonsense totals. The architecture treats the `SpendingTxn.currency` fix as a hard prerequisite (must land + regression-verified before `MULTI_CURRENCY_ACCOUNTS_ENABLED` flips). Pattern: when a feature introduces a new data dimension that existing aggregation code ignores, scope the fix as a prerequisite story with its own regression suite, not as a same-story side-effect. Escalate to the Architect if any future bet introduces a new transaction dimension (source, region, instrument type) and the spending-aggregation path does not already handle it.
