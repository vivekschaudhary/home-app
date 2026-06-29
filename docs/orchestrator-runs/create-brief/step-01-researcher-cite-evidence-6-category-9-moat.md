---
workflow: create-brief
step: 1
agent: researcher
task: cite-evidence-6-category-9-moat
generated: 2026-06-28 20:35
---

Both artifacts are on disk. Here is the required output summary:

---

**TL;DR**

- **Categories cited:** User pain (high confidence — structural API gap), Competitive (medium — point-in-time), Technical (high — codebase-confirmed), Quantitative (high on MAU; medium on segment overlap), Trends (medium — CFPB Rule 1033 + Wise/Revolut market validation), Moat (all 9 evaluated)
- **n/a with reasons:** 5 items explicitly flagged unanswerable — first-party demand signal, per-user Apple Pay volume, multi-currency segment overlap with this app's user base, credit union block rate, CFPB rule implementation risk — all `n/a — no production telemetry yet` or `n/a — Apple does not publish per-user statistics`
- **Moats verdicted:** Switching costs (yes · primary), Brand/trust (yes · secondary), Data/proprietary intelligence (partial · future), Regulatory (partial · CFPB tailwind, not moat), Network effects (no), Scale economics (no), Distribution (no), Talent (no), Speed/velocity (no). **Primary moat(s): row 2 (Switching costs) + row 5 (Brand/trust)**

**Files modified**

- `docs/bets/WLT-27/research.md` — pre-existing; verified complete against all postconditions; status: `proposed`
- `docs/role-activity/researcher.md` — created; two entries logged: `[first-party-demand-signal-missing]` (instance 1, watch for recurrence) and `[community-signal-directional-only-discipline]` (positive confirmation)

**Open questions unresolved**

1. How many of this app's users are hitting Plaid coverage gaps? (`n/a — no production telemetry`)
2. What fraction of the user base has multi-currency accounts? (`n/a — no survey data for this intersection`)
3. Apple Pay transaction volume per user? (`n/a — Apple does not publish per-user statistics`)
4. Credit union Plaid failure rate in production? (`n/a — no Sentry aggregation-health data yet`)
5. CFPB Rule 1033 legal outcome? (`n/a — not actionable before a PM decision`)

**Recommendations vs. evidence** — separated in `docs/bets/WLT-27/research.md` §Recommendations. Key directional calls: build manual entry before multi-currency; ship region isolation before unified conversion; Apple Pay = guided CSV flow only (no live API ever); column-mapping UI is required (CSV formats irreconcilably diverse).