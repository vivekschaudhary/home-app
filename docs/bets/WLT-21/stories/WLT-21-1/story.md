---
id: WLT-21-1
bet: WLT-21
type: story
status: ready
priority: P1
created: 2026-06-16
author: PM
design_link: docs/bets/WLT-21/stories/WLT-21-1/design.md
copy_link: docs/bets/WLT-21/stories/WLT-21-1/copy.md
area_tags: [frontend, spending, budgets, data, security]
dependencies:
  - WLT-19 (the app shell — /budget mounts into it; shipped)
  - WLT-2 (transactions — the source for actual + recommended; shipped)
---

# WLT-21-1 — The Budget & Spending table

## Description

Ship the `/budget` page: a per-category table where a user sees a **Recommended** monthly limit drawn from their **own spending history**, their **This month so far** actual, and can **set their own budget** (a dollar amount or a percent) — then see at a glance whether they're under or over. Rows are the user's **real spending categories** (data-derived, sorted by spend); an **"+ Add a category"** picker lets them pre-set a budget on any bank category, even one they haven't spent in yet. The feature mounts into the WLT-19 shell by flipping the Budget & Spending nav item to `live`. The "spread across the year" chart is the next story (WLT-21-2) — out of scope here.

This is the first section feature to mount into the shell, and the first **user-writable** financial-adjacent table — so owner-isolation is load-bearing.

## Acceptance Criteria

- [ ] **AC1 — Mounted live.** `/budget` renders the real page inside the shell (not `<ComingSoon>`); `NAV_SECTIONS` `budget.status = "live"`; the AAL2 gate is inherited from the `(app)` shell + middleware. The page is an H1 + intro + the table.
- [ ] **AC2 — The category table.** One row per category that has **this-month spend OR a saved budget OR was user-added**; columns **Category · Recommended · This month so far · Your budget** (under/over status inline on the budget cell); sorted by this-month spend desc; `null`/unknown category → **"Other"**; amounts currency-formatted.
- [ ] **AC3 — Add a category (the picker).** A control lists bank categories (Plaid-primary, humanized) not already shown; choosing one adds a budgetable row whose actual reflects **real** spend ("—"/$0 if none this month — honest, user-chosen, never fabricated).
- [ ] **AC4 — Recommended from history (honest).** Per-category figure from the user's own trailing monthly spend — **median of monthly totals**, a modest **10% trim on discretionary** categories (essentials `RENT_AND_UTILITIES, GROCERIES, LOAN_PAYMENTS, MEDICAL, INSURANCE` untrimmed). **Cold-start** (<~1 month of history for that category) → "—" + the one-line history note; **never a fabricated number**.
- [ ] **AC5 — This month so far.** The actual column sums the **current calendar month** per category, labeled so it reads as the in-progress month (copy: "This month so far").
- [ ] **AC6 — Set / edit / clear a budget.** Per row, set a budget as a **dollar amount or a percent** (a $/% toggle); it persists (owner-CRUD `budgets`); editing updates; clearing removes it; **exactly one** of amount/percent. Percent = "% of your typical monthly spending" → resolves to an **effective cap** shown inline ("≈ $X/mo"); when there's no history to resolve a percent, prompt for a dollar amount.
- [ ] **AC7 — Over/under indicator.** With a budget set, the row shows under/over this month vs the (effective) cap via a **labeled** indicator (text/glyph, **not color-only**) + "{amount} left" / "{amount} over".
- [ ] **AC8 — Honest empty + cold-start.** No connected account / no transactions → an honest empty state ("Connect an account to start budgeting") — **no fake rows, no "$0 budget"**; connected-but-new shows real actuals where present + "—" recommendations.
- [ ] **AC9 — Feedback + validation.** Save shows a pending state → a "Saved" `Toast`; a failed save shows an inline `Banner` + retry and **preserves the user's input**; invalid input (non-numeric, ≤0, percent not in 1–100) is blocked with a clear message.
- [ ] **AC10 — Responsive.** Clean + usable on **phone ≤640** (rows become stacked cards; ≥44px touch targets), **tablet ~768–1024**, **desktop ≥1280** (the columnar table). No overflow/illegibility.
- [ ] **AC11 — Accessibility.** Semantic table with `<th scope>` header associations (cards keep label↔value pairing); the budget input + $/% toggle are labeled, keyboard-operable, and announced; the status indicator is not color-only; `aria-live` on save feedback; WCAG AA contrast.
- [ ] **AC12 — Owner isolation (load-bearing security).** A user only ever sees/sets their **own** budgets — proven by the `supabase/tests/rls.test.ts` budgets suite (cross-tenant read/write denied; soft-deleted hidden) **and** the gated real-path E2E. No budget read/write crosses tenants.
- [ ] **AC13 — Instrumentation.** `budget_viewed` (load), `budget_set` (save), `budget_cleared` (clear) emitted — additive funnel events (internal; supports the bet metric).

## Standard Experience Checklist

- [ ] **Navigation** — the nav item goes `live` + the page sits in the shell (back/chrome is the shell's job); the "+ Add a category" picker is in-page: **AC1, AC3** + design "Surfaces & flow".
- [ ] **States** — cold-start ("—"), empty (no account/txns), populated, budget-set (under/over), saving, error: **AC2, AC4, AC5, AC7, AC8, AC9** + design States table.
- [ ] **Feedback** — save pending → "Saved" toast; error Banner + retry (input preserved); inline validation: **AC9**.
- [ ] **Accessibility** — semantic table, labeled input + toggle, non-color-only status, aria-live save, AA: **AC11**.
- [ ] **Edge cases** — `null`→"Other"; percent >100 / ≤0 / non-numeric blocked; spend-but-no-budget; budget-but-no-spend; added-category-with-no-spend; cold-start recommendation; percent-with-no-history → dollar prompt: **AC3, AC4, AC6, AC8, AC9** + design.
- [ ] **Cross-surface consistency** — identical table semantics across phone/tablet/desktop, differing only in the table↔stacked-card layout: **AC10**. (`n/a — web-only at Phase 1; no native surface`.)

## Tech notes

Per `docs/bets/WLT-21/architecture.md`:
- **DB:** `supabase/migrations/0010_budgets.sql` — owner-CRUD `budgets` (mirror `intents`/`goals` RLS, **not** the financial service-role posture): `(category, limit_amount | limit_percent [exactly one], period 'monthly', soft-delete + set_updated_at trigger)`, unique active `(user_id, category)`. Add `0010` to `.github/workflows/ci.yml`.
- **Compute (`packages/core/budget.ts`, pure):** `computeMonthlySpending(txns, asOf)`, `computeRecommendedBudgets(txns, asOf)` (median of trailing monthly totals + discretionary trim; ≥1 month or "—"), `buildBudgetRows({budgets, txns, asOf})` → the view model incl. effective-cap + over/under. Reuse `humanizeCategory`/`median`/`round2`/string-date math from `recap.ts`/`anomaly.ts`. A small `PLAID_PRIMARY_CATEGORIES` constant feeds the picker.
- **App:** `app/lib/budget.ts` (`getBudgetView` reads `budgets` under RLS + a trailing ~7-month `readSpendingForBudgets`; `saveBudgetForUser`; `clearBudgetForUser`), `app/lib/budget-client.ts` (try/catch `{ok}|{error}`), `app/api/budget/route.ts` (`GET`/`POST`/`DELETE`, `getAal2UserId()` guard, `runtime="nodejs"`) — the Accounts read+mutate chain.
- **UI:** `app/(app)/budget/page.tsx` (stub→real RSC, `force-dynamic`, `BUDGET_VIEWED`), `app/(app)/budget/BudgetClient.tsx` (semantic table / mobile cards; `@wealth/ui` `TextField`/`Button`/`Banner`/`Toast`; reconcile-on-mount). Flip `app/(app)/nav.ts` `budget.status`. Add the `budget`/`budgetErrors` copy block + the 3 funnel events. **On-read compute; no rollup; no new dependency.**

## PRs

_To be linked on build._

Tags:
- `regression: false`
- `e2e: true`

## Tests

_Engineer: unit (`packages/core/budget.test.ts` — monthly actual, recommended median+trim, cold-start "—", percent→effectiveCap, over/under, `null`→Other), component (`BudgetClient.test.tsx` jsdom — render rows, $/% toggle, edit→save POST body, empty/cold-start, reconcile-on-mount), RLS (`supabase/tests/rls.test.ts` — budgets owner-CRUD + cross-tenant denied + soft-delete hidden). Codex: the real-path E2E (`e2e/budget.spec.ts`, `E2E_PASSKEY=1`-gated) — AAL2 → seed transactions → `/budget` renders recommended+actual → set a budget ($ then %) → reload persists + over/under correct (the #36-class RSC→RLS→render + owner isolation)._

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-16] [PM, elicited] **Rows = real spending categories + an "+ Add a category" picker** (not a fixed comprehensive list, not data-derived-only) — rationale: honors the user's intent to set budgets for their major categories up front while keeping the table honest (no empty/mismatched rows); the picker offers the real bank (Plaid-primary) categories — area: product/ux — alternatives: data-derived-only (rejected — can't pre-budget an unspent category), fixed canonical list (rejected — rows that don't match the bank's labels look broken) — reversibility: easy
- [2026-06-16] [PM] **The year-spread chart is NOT in this story** (WLT-21-2) — rationale: keep the slice shippable + avoid a charting-dependency decision here — area: scope — reversibility: easy
- [2026-06-16] [PM] **Owner-isolation is an explicit AC (AC12), gated on a real test** — rationale: budgets is the first user-writable financial-adjacent table; a cross-tenant leak is a security regression — area: security — reversibility: n/a

### Risks
- [2026-06-16] [PM] **The budget cell carries four sub-states** (recommended / empty / editing / set-with-status) — likelihood: medium — impact: low — mitigation: the design States table + copy.md enumerate each; component tests cover them — area: ux
- [2026-06-16] [PM] **Recommended heuristic feels off on real data** — likelihood: medium — impact: low — mitigation: pure + table-tested → easy to tune; the essential allowlist is adjustable; observe `budget_set` vs recommended — area: product

### Issues
- [2026-06-16] [PM] **Percent base legibility** — severity: low — owner: UX Writer — status: open — area: copy — the inline "≈ $X/mo" resolution must make "% of your typical monthly spending" unambiguous (finalized in copy.md; verify in build).
- [2026-06-16] [Architect] **Essential-category allowlist vs real Plaid values** — severity: low — owner: Engineer — status: open — area: data — confirm the `RENT_AND_UTILITIES`-style strings against actual data during build; adjust the set.

_Story status: ready — Standard Experience Checklist has no empty category._
