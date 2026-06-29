---
id: WLT-27
type: feature
status: approved
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-2]
parallel_with: []
architecture_required: true
created: 2026-06-26
author: PM
sources:
  - docs/bets/WLT-27/research.md
  - docs/foundation/product.md
  - docs/bets/WLT-27/architecture.md
key_metric:
  name: Manual/CSV account activation rate — % of users who create ≥1 manual account or successfully complete ≥1 CSV import batch within 30 days of the feature being available
  baseline: 0% (feature does not exist)
  target: ≥15% of MAU within 90 days (conservative proxy; YNAB's manual-entry segment estimated at 40%+ of their user base)
  source: Post-ship measurement via account creation events tagged source='manual' or source='csv'
guardrails:
  - name: CSV ingest error rate
    threshold: <5% of import batches result in a parse or dedup error
  - name: Existing WAWU delta
    threshold: WAWU for existing USD-only users must not decline ≥5% in the 30 days following launch (no regression to spend intelligence from currency-awareness fix)
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [accounts, transactions, csv-import, multi-currency, backend, frontend]
estimate:
  duration_weeks: 4
  confidence: medium
  refined_by: architecture
  refined_at: 2026-06-28
approved: 2026-06-29
source_run: create-brief--WLT-27--20260628T203401
---

# Manual Account Entry + CSV Import + Multi-Region Account Isolation

## Problem

A meaningful slice of every user's financial activity is **structurally invisible** to any bank-aggregation platform. Apple Pay has no developer transaction API and never will (Apple support HT211489; Apple Wallet developer docs — no transaction history endpoint). Cash App (56M MAU, Block Q4 2023), Venmo (~80–90M active accounts, PayPal 10-K Q4 2023), and PayPal (428M global accounts, PayPal 10-K Q4 2023) do not surface reliable Plaid-compatible transaction data. Beyond platform gaps, ~4,500 US credit unions (NCUA Q4 2023) are only partially covered, and a significant privacy-averse cohort will not share bank credentials with any aggregator.

Separately, ~9 million Americans live abroad (US State Dept / AARO 2023) and maintain accounts in multiple currencies alongside US accounts. No US-native PFM app (Monarch, Copilot, Empower) supports multi-currency or non-US accounts as of 2026-06-26. Wise (12.8M active customers, FY2023 Annual Report) and Revolut (40M+ global users, 2024 press) have proved this segment is large enough to build a business on. Without multi-region isolation, users who add a EUR or JPY account would receive nonsense spending totals (see architecture DRI Issue 3 — confirmed in codebase).

## User

**Consumer persona** (product.md §Target users — ~80% of the platform): specifically the sub-segments who are currently unable to see their full financial picture on any aggregation-first PFM tool:

- **Coverage-gap users:** Rely on Apple Card, Apple Pay, Cash App, Venmo, PayPal, or Plaid-unsupported credit unions for a material portion of spending.
- **Privacy-averse users:** Will not connect bank accounts via aggregator; prefer manual entry or CSV import for control and security (validated commercial segment — YNAB 1M+ subscribers, TechCrunch).
- **Multi-currency users:** Americans abroad (AARO: ~9M), recent immigrants, or users with accounts in multiple countries who currently have no US-native option.

Job-to-be-done: _"I want to see all of my real spending — including the accounts that don't connect — so I can trust the platform's budgeting, anomaly detection, and recaps."_

## Why this matters

The platform's foundational hypothesis rests on **real aggregated data** driving durable financial-habit formation (product.md §Hypothesis). If a user's Apple Card or Cash App spending is invisible, the hypothesis is untestable for those users — and anomaly detection, budget recommendations, and recaps are demonstrably wrong. This bet closes the gap that prevents a segment of the primary persona from ever becoming a WAWU user.

Product.md Q2 2026 OKR KR2 explicitly calls out "2 aggregation providers live + **Email account alert parser**" or **CSV-import fallback**" — WLT-27 directly delivers the **Email account alert parser** or CSV-import element of that KR. Manual entry and multi-region isolation are sequenced extensions of the same data-completeness principle.

Strategically, this is a **defensive bet**: it closes a coverage gap that blocks a meaningful user cohort from completing the core value loop. It is not an offensive moat-builder (see Defensibility below), but it is a precondition to WAWU growth beyond the Plaid-connectable segment.

## Hypothesis (the bet)

If users who have accounts at Plaid-unreachable institutions (Apple Card, P2P platforms, credit unions) can add those accounts manually or via CSV import — and if users with multi-currency accounts can see per-currency spending surfaces without cross-currency noise — **then those users will complete the core value loop and enter the WAWU cohort**, measured by manual/CSV account activation rate reaching ≥15% of MAU within 30 days of launch, with no regression in WAWU for existing USD-only users.

**Wrong if:** activation rate stays below 5% (the feature exists but users don't care / find it too hard), or the currency-awareness fix causes a measurable WAWU regression for existing users.

## Defensibility

This feature is **primarily defensive**, not offensive. It does not create a new moat — it prevents churn from a gap that competing tools also have.

- **Switching costs (primary moat increment):** Manual accounts mean users have personally contributed their own data — imported CSV history, custom account names, handcrafted transaction descriptions, currency mappings. Exiting means rebuilding that corpus elsewhere. Multi-region compounds this. [Research DRI Decision §2]
- **Brand / trust (secondary moat increment):** "No bank link required" is a commercially validated trust differentiator (YNAB evidence). Privacy-conscious users specifically choose YNAB for this. A US-native app with manual-entry + multi-currency positions against the "Plaid = credential risk" objection. [Research finding 2]
- **All other moats: no increment** — Network effects, Scale economics, Distribution, Talent, Speed/velocity evaluated and rejected for this bet. [Research §9-moat table]

**Moat impact (one line):** Increments Switching costs (row 2) and Brand/trust (row 5) from the foundational moat table — defensive gap-close, no new moat created.

## Scope

### In scope

**Sub-feature A — Manual Account Entry**

- `POST /api/accounts` Route Handler (service-role write) — create a `financial_accounts` row with `connection_id = null` (the existing nullable column designates a manual account)
- `ManualAccountForm` UI — name, institution name, account type (checking / savings / credit / investment / other), native currency (ISO 4217, default USD)
- Feature flag: `MANUAL_ACCOUNTS_ENABLED` (USD-only manual accounts safe to ship before the currency-awareness fix)

**Sub-feature B — CSV Transaction Import**

- `POST /api/accounts/[id]/import` Route Handler — accepts parsed rows, normalizes to `NormalizedTransaction`, runs through `ingestTransactions` (existing service-role upsert path, idempotent dedup via `dedupKey`)
- `CsvImportWizard` UI — file upload → column-mapping step (map date / description / amount / category columns) → preview → confirm
- CSV parsing in the browser via `papaparse` (minor npm library; no foundational-stack impact)
- Apple Card CSV preset (Apple CSV format per Apple support HT211489 — verified before implementation)
- `providerAccountId = null` edge case: normalize dedup key segment to `'manual'` for null provider account IDs (confirmed fix required in `dedupKey` — architecture.md)

**Sub-feature C — Multi-Region Account Isolation**

- Add `currency: string` to `SpendingTxn` interface and propagate `currency` scope parameter through all spending-aggregation paths: budget functions, `buildCategorySpendChart`, anomaly scan, transaction ledger read
- Feature flag: `MULTI_CURRENCY_ACCOUNTS_ENABLED` — gates all non-USD manual account creation until currency-awareness fix is verified
- Per-currency spending surfaces: region switcher on budget, category chart, recap, and anomaly surfaces for users with multi-currency accounts
- **No exchange rate API, no unified cross-currency conversion, no cross-currency totals** — users see separate per-currency dashboards (region isolation only)

### Out of scope

- Unified cross-currency totals / net-worth in a single base currency (Phase 2 — requires exchange rate API, rate storage, "as of" UX)
- UK Open Banking / PSD2 integration (separate regulatory gate; distinct provider work)
- OFX/QFX parser (higher implementation cost, narrower benefit — CSV first)
- Live Apple Pay transaction sync (Apple has no transaction API; will never be possible via API)
- Cash App / Venmo / PayPal live sync beyond current Plaid connectivity
- CFPB Rule 1033 credit-union re-connection logic (deferred until rule implementation trajectory is clear)
- Multi-language / locale number-format support in CSV parser (English-locale CSV only for MVP; EU locale formats deferred to a follow-on)

## Research findings

Research complete — full citations in `docs/bets/WLT-27/research.md`. Summary by 6 categories:

| Category        | Status    | Evidence quality                       | Key finding                                                                                                                                              |
| --------------- | --------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. User pain    | Cited     | High                                   | Apple Pay/Plaid gap is structural and permanent (Apple API docs); Cash App 56M MAU + Venmo ~80–90M MAU outside Plaid reach (public filings)              |
| 2. Competitive  | Cited     | Medium (point-in-time)                 | No US-native PFM (Monarch, Copilot, Empower) supports multi-currency; YNAB + Toshl own this segment globally                                             |
| 3. Technical    | Cited     | High (codebase-confirmed)              | Schema already ready (nullable connection_id, ISO 4217 columns, csv dedup path); gaps are API + UI only; currency-awareness bug confirmed in SpendingTxn |
| 4. Quantitative | Cited     | High on MAU; medium on segment overlap | 9M Americans abroad (AARO); 12.8M Wise active customers proves cross-border finance is a real product category                                           |
| 5. Trends       | Cited     | Medium                                 | CFPB Rule 1033 (Oct 2024) reduces credit-union gap by 2027–2030; Apple Pay and P2P remain structurally closed regardless                                 |
| 6. Moat         | Evaluated | —                                      | Switching costs (primary) + Brand/trust (secondary); all 9 moat types evaluated; defensive bet                                                           |

**n/a items (justified):**

- First-party demand signal (how many of this app's users are hitting Plaid gaps): `n/a — no production telemetry yet`
- Apple Pay per-user volume: `n/a — Apple does not publish per-user statistics`
- Multi-currency segment overlap with this app's user base: `n/a — no survey data for this intersection`
- Credit union Plaid failure rate in production: `n/a — no Sentry aggregation-health data`
- CFPB Rule 1033 legal outcome: `n/a — legal challenge active; not actionable before a PM decision`

## User pain input (from Support)

`n/a — no production support data yet; product is pre-public-launch. Researcher directional signal: r/personalfinance and r/ynab recurring threads on Plaid trust concerns and CSV-only mode (directional only, not consensus).`

## Architecture

Architecture approved: `docs/bets/WLT-27/architecture.md` (`status: approved`, 2026-06-28).

Summary: All three sub-features build within the existing foundational stack (Postgres + RLS + Route Handlers + existing `@wealth/aggregation` ingest pipeline + React/Tailwind). No new service, data store, runtime, or framework. No migration required (schema already supports manual accounts and CSV). Currency-awareness fix (Sub-feature C prerequisite) confirmed as a blocker before any non-USD account is enabled. `papaparse` is the only new dependency (minor CSV-parsing library, no foundational-stack impact).

## Stories

Decomposed (6 stories) — each lives under `docs/bets/WLT-27/stories/<story-id>/story.md`:

| Story ID | Title                                               | Status | Depends on             |
| -------- | --------------------------------------------------- | ------ | ---------------------- |
| WLT-27-1 | Currency-Awareness Fix (SpendingTxn.currency)       | ready  | —                      |
| WLT-27-2 | Manual Account Entry API + UI                       | ready  | WLT-27-1 (for non-USD) |
| WLT-27-3 | CSV Import API (ingest pipeline extension)          | ready  | WLT-27-2               |
| WLT-27-4 | CSV Import Wizard UI (column mapping + preview)     | ready  | WLT-27-3               |
| WLT-27-5 | Region Switcher UI (per-currency spending surfaces) | ready  | WLT-27-1               |
| WLT-27-6 | Apple Card CSV Preset + End-to-End Integration Test | ready  | WLT-27-4               |

## Scan summary

- **Last scanned:** n/a — not yet built
- **Current phase:** brief
- **Open findings:** 0
- **Suppressed:** 0
- **Blocking advance:** no
- **Full report:** [`scan-report.md`](./scan-report.md) — not yet generated

## DRI Log

### Decisions

- **[2026-06-28] [PM] Scope sequencing: Manual Entry (A) → CSV Import (B) → Region Isolation (C), not bundled** — The three sub-features share a data substrate but have very different implementation costs and user-facing risks. Shipping A first (manual account creation) validates the "manual entry" UX concept with minimal backend change. B (CSV import) adds the column-mapping wizard — the hardest UX piece. C (region isolation) requires the currency-awareness fix to land first without regressions. Bundling all three inflates the perceived scope and risks blocking on rate-API infrastructure (which is explicitly out of scope). Alt rejected: single omnibus story (too large, blocks partial shipping). Reversibility: high.

- **[2026-06-28] [PM] Feature-flagging split: MANUAL_ACCOUNTS_ENABLED (USD) vs. MULTI_CURRENCY_ACCOUNTS_ENABLED (non-USD)** — USD-only manual accounts (a checking account with no Plaid link) carry zero currency-aggregation risk; the existing spending pipeline ignores `currency` for USD-only users without error. Non-USD accounts must be gated until WLT-27-1 (SpendingTxn.currency fix) is verified in production. Two flags allow shipping A earlier and reducing risk surface. Area: release strategy. Reversibility: high (flags removed post-verification).

- **[2026-06-28] [PM] CSV-first over OFX/QFX** — OFX/QFX is more structured but requires a legacy-format parser at higher implementation cost for a narrower set of users (fewer banks still offer it). CSV with column mapping (YNAB pattern) handles the broadest format diversity and is user-controllable. OFX/QFX deferred to a post-MVP follow-on if demand emerges from support tickets. Alt rejected: OFX parser first (higher cost, narrower benefit). Reversibility: high.

- **[2026-06-28] [PM] No cross-currency conversion in WLT-27** — Unified cross-currency totals (e.g., EUR converted to USD in a single net-worth view) require an exchange rate API, rate storage per transaction, and careful "as of" UX. These are a meaningful additional investment — larger than sub-features A and B combined. The researcher's recommendation (Finding 4) is to ship region isolation first and validate demand for conversion before committing. Alt rejected: unified conversion in WLT-27 (scope creep; blocks launch on an unvalidated user need). Reversibility: high (Phase 2 scope).

- **[2026-06-28] [PM] Mirror to Confluence/Jira skipped** — neither MCP is connected on this host. Area: tooling. Reversibility: high.

### Risks

- **[2026-06-28] [PM] First-party demand signal is missing** — We do not know how many of this product's current users are hitting Plaid coverage gaps or have multi-currency needs. All quantitative evidence is external proxy data. Decision to build WLT-27 rests on structural evidence (Apple Pay/Plaid incompatibility is permanent) and market validation (YNAB, Wise) rather than first-party telemetry. Likelihood: high (no telemetry yet). Impact: medium (may be building for a segment smaller than estimated). Mitigation: instrument Plaid link-failure events and add a "Did we fail to connect?" fallback UI pointing to CSV import — use these events to quantify the coverage-gap cohort before WLT-27-2 is promoted to shipped. Area: demand validation.

- **[2026-06-28] [PM] CSV format diversity will generate support load** — Every bank exports CSV differently. A column-mapping UI reduces but does not eliminate the burden. Apple Card preset is planned (WLT-27-6); other bank presets will be driven by support tickets. YNAB has a dedicated help center with per-bank instructions — plan for the same. Likelihood: high. Impact: low (support load, not a product failure). Mitigation: build format preset library incrementally from real support tickets after MVP. Area: operational.

- **[2026-06-28] [PM] Currency-awareness fix regression risk** — SpendingTxn.currency propagation touches budget, category chart, anomaly scan, and transaction ledger — the core spending intelligence stack. An off-by-one in the currency filter could produce wrong totals or suppress real anomalies for existing USD users. Likelihood: low (all existing rows are USD; the filter defaults to USD for omitted currency param). Impact: high (silent wrong spend totals would undermine user trust and WAWU). Mitigation: WLT-27-1 AC requires a regression suite that verifies existing USD-only behavior is unchanged before the feature flag can be enabled. Area: data integrity.

### Issues

- **[2026-06-28] [PM] `dedupKey` null providerAccountId must be verified** — severity: medium — owner: Engineer — status: open — area: implementation. The `dedupKey` function in `packages/aggregation/core/dedup.ts` uses `t.providerAccountId` as the second key segment; for manual accounts this is null. Must normalize to `'manual'` to keep dedup keys stable across re-imports. Confirm fix in WLT-27-3 AC before ingest pipeline merges.

- **[2026-06-28] [PM] Apple Card CSV format must be validated against a real export** — severity: low — owner: Engineer — status: open — area: implementation. The format described in research.md Finding 5 is based on Apple support docs; must be confirmed with an actual iOS export before the CSV preset is hardcoded in WLT-27-6.

- **[2026-06-28] [PM] Plaid link-failure instrumentation not yet in place** — severity: medium — owner: Engineer — status: open — area: demand validation. Without Plaid link-error event tracking, we cannot measure the size of the coverage-gap cohort that will benefit from WLT-27. Add this instrumentation as a prerequisite or parallel track to WLT-27-2.

---

_Flip `status: proposed → status: approved` when ready to proceed to `/build WLT-27`._
