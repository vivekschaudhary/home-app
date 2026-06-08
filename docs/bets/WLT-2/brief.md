---
id: WLT-2
type: feature
status: approved
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: [WLT-1]
parallel_with: [WLT-3]
architecture_required: true
architecture_status: proposed
created: 2026-06-05
author: PM
sources:
  - https://docs.google.com/document/d/1rksze12ty6GH0Jpfcs6n8ectDSz9iDcOuaJLU6pOxZ8/edit
key_metric:
  name: Real-data activation rate — signed-up users who link ≥1 real institution OR import a CSV
  baseline: 0 (no aggregation today; loop runs on demo data)
  target: ≥70% within 30 days of the bet shipping
  source: WLT-5 instrumentation (aggregation + funnel events)
guardrails:
  - name: Connection success rate (successful links / link attempts)
    threshold: ≥85%
  - name: Transaction freshness after connect (p95 initial backfill visible)
    threshold: <5 min
  - name: Aggregation cost per active connection
    threshold: modeled + within target margin (set in bet architecture)
  - name: Provider token-at-rest exposure
    threshold: 0 — all tokens in Supabase Vault; RLS default-deny on financial tables
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [backend, payments, data, security]
estimate:
  duration_weeks: 2
  confidence: low
  refined_by: brief-approval
  refined_at: 2026-06-07
  estimated_start: 2026-06-22
  estimated_end: 2026-07-03
primary: gdrive://1rksze12ty6GH0Jpfcs6n8ectDSz9iDcOuaJLU6pOxZ8
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/1rksze12ty6GH0Jpfcs6n8ectDSz9iDcOuaJLU6pOxZ8/edit

# WLT-2 — Account aggregation + CSV fallback

## Problem

Today the platform has nothing real to act on. A user can sign up and pass MFA (WLT-1), but the workflow engine, anomaly detection, and benchmarks all need the user's **actual** financial data — transactions, balances, accounts. Without it, the loop runs on demo data and nothing it surfaces is trustworthy or personal. Getting clean, real financial data in — across institutions that don't all play nicely — is the part comparable products spent the longest on (Monarch: ~1 year of private beta on data quality before launch).

## User

The **Consumer persona (~80%, primary)** — someone who connects their accounts and wants the platform to watch and act on their behalf, not someone who wants to build or reconcile data by hand. Job-to-be-done: "get my real money picture into this thing, once, without it breaking."

## Why this matters

This bet is the **data foundation of the entire loop** and of the product's primary moat. Per the portfolio, the wedge is "connects one real account (or imports CSV) and sees clean transactions" — WLT-2 is that step; WLT-4 (the engine) can't run on real data without it. Strategically it's the **switching-cost + data-intelligence moat** (product.md: "Aggregated behavior → unreplicable anomaly detection + benchmarks. PRIMARY"): 3–4 linked accounts plus accumulating transaction history are what make the product expensive to leave and impossible to clone.

## Hypothesis (the bet)

If we ship **one-provider OAuth account linking + CSV import** that lands clean, categorized transactions, then a consumer will get their real financial data into the platform in their first session, measured by **real-data activation ≥70% within 30 days** — proving the loop runs on real data, not demo data.

## Defensibility

Yes — this is the **primary moat** bet. Linked accounts create switching costs (high exit friction at 3–4 accounts); the aggregated transaction stream is the proprietary-intelligence substrate for anomaly detection + benchmarks that compound with scale.

**Moat impact (one line):** account links + transaction history are the foundation of both the switching-cost and data-intelligence moats — every later bet (anomalies, benchmarks, workflows) consumes this data.

## Scope

### In scope
- **One Plaid-class aggregation provider** (specific provider chosen in bet architecture ADR): read-only OAuth link flow.
- Provider **access tokens encrypted at rest in Supabase Vault**; never exposed client-side.
- **Inngest background sync** — initial backfill + incremental refresh.
- **Transaction + account/balance ingest** for **depository + credit** accounts (cash-flow), append/CDC with dedup; provider-supplied categories, normalized to one schema.
- **CSV import fallback** mapped to the same transaction schema — covers institutions the provider excludes (e.g. Fidelity, some credit unions).
- **Connection-health status** surface (connected / needs-reauth / error) per cross-cutting observability standards.
- **RLS default-deny** on all financial tables, keyed to `auth.uid()`; explicit consent + a disconnect/data-deletion path.

### Out of scope
- **Second aggregation provider** — fast-follow toward KR2's "2 providers," as a separate story once provider 1 + the ingest pipeline are proven (the 2nd is an additive adapter, not new infrastructure).
- Investments/holdings, liabilities detail, income/payroll streams (post-MVP).
- **Payment initiation / money movement** — read-only only.
- **UK / PSD2 / open banking** — US-only MVP; PSD2 deferred to pre-UK-launch (carried from product DRI).
- Custom/ML categorization (use provider categories), and webhook infra beyond what connection-health needs (polling acceptable to start).

## Open questions for Researcher

- **Provider selection for the ADR:** coverage (Fidelity / credit-union gaps), pricing model (Plaid's 2025 agreement to *pay* JPMorgan → variable per-user fee), developer experience, data quality — Plaid vs MX vs Teller vs Finicity.
- **CSV coverage:** which institutions' export formats to support first (target the provider's coverage gaps).
- **Cost model:** per-connection / per-active-user fee projection at MVP and growth scale (margin risk).
- **Liability/compliance:** data-handling obligations (Plaid's $58M 2021 settlement precedent), consent + revocation UX, retention/deletion.

## Research findings

From foundation research (`docs/foundation/research.md` §4): aggregation is mature but uneven — Plaid covers 12k–16k+ institutions but **excludes Fidelity + some credit unions/regional banks**, so **multi-provider + CSV fallback is well-targeted**. Cost is shifting against aggregators (Plaid→JPMorgan paid access, 2025) — **a margin risk, not a feasibility risk**. Liability precedent exists ($58M Plaid settlement, 2021). Founder testimony (Monarch) marks **data quality as the long pole** — the reason aggregation is its own bet rather than folded into the engine.

## User pain input (from Support)

_No production users yet (pre-launch). Proxy signal: comparable-product reviews cite broken/missing connections as the top aggregation complaint → connection-health + CSV fallback are first-class, not afterthoughts._

## Stories

_Decomposed one at a time via `/create-story WLT-2` after this brief + the bet architecture are approved._

## DRI Log

### Decisions
- [2026-06-07] [PM] **MVP = 1 provider + CSV, not 2** — rationale: the loop needs exactly one real connection + CSV; KR2's "2 providers" is an end-of-Q2 target, not an MVP gate; proving one provider + the ingest/Vault/sync pipeline de-risks the 2nd (an additive adapter) — area: scope — alternatives: 2 providers now (rejected — doubles integration + cost surface before the pipeline is proven) — reversibility: easy
- [2026-06-07] [PM] **Read-only, US-only, depository+credit only for MVP** — rationale: the in-scope workflows are cash-flow; investments / payment-initiation / UK add surface + regulatory load without serving the first loop — area: scope — alternatives: include investments/UK now (rejected) — reversibility: medium
- [2026-06-07] [PM] **architecture_required: true** — provider selection (ADR), token-vault design, ingest schema (append/CDC + dedup), and connection-health are load-bearing → `/create-bet-architecture WLT-2` **ran 2026-06-07 (see `architecture.md`, `architecture_status: proposed` — awaiting re-approval after independent-review hardening)** — area: architecture — reversibility: medium
- [2026-06-07] [PM] Jira mirror **skipped** — no Jira MCP on host (consistent with WLT-1) — area: tooling — reversibility: easy

### Risks
- [2026-06-07] [Researcher] **Aggregation data quality is the comparable-product long pole** — single provider + CSV may under-deliver "real data" trust at uncovered institutions — likelihood: medium — impact: high — mitigation: CSV fallback in scope + connection-health observability + pick highest-coverage provider in the ADR — area: technical
- [2026-06-07] [PM] **Aggregation cost is variable + rising** (Plaid→JPMorgan paid access) — likelihood: med-high — impact: high (margin) — mitigation: model per-connection fees as a first-order cost; prune dead links via connection-health; revisit 2nd-provider/cost at scale — area: financial
- [2026-06-07] [Security] **Data-practices liability** ($58M Plaid precedent) — likelihood: low — impact: high — mitigation: tokens in Supabase Vault, RLS default-deny, explicit consent + revocation + data-deletion path; mandatory Security Review at build — area: security/regulatory
- [2026-06-07] [PM] **PSD2/open-banking gap** if UK launch — likelihood: medium — impact: high — mitigation: US-only MVP; resolve PSD2 pre-UK (carried from product DRI) — area: regulatory

### Issues
- [2026-06-07] [Enterprise/Solution Architect] **Foundational-stack deviation** — the specific aggregation provider (Plaid / MX / Teller / Finicity) is a major external dependency NOT in `docs/foundation/architecture.md`'s Stack table; only Vault/Inngest/Upstash + the data-model entities are. `/create-bet-architecture WLT-2` step-7 deviation gate halts: selecting the data-spine provider is a **foundational-scope** decision (cross-bet cost / security / regulatory / reliability), not a bet-level pick. **Resolve:** run `/setup-foundation-architecture` in amend mode to add the provider with an ADR (e.g. ADR-002) citing WLT-2 as the trigger, then resume `/create-bet-architecture WLT-2`. — severity: high — owner: Enterprise/Solution Architect — status: **resolved** (2026-06-07 — **ADR-002** selects **Plaid**; added to the foundational Stack table; CSV import stays the coverage-gap fallback). **ADR-002 lands in its own PR #15 (split out of this bet PR); merge #15 before/with #14.** — area: architecture

---

_Approved by: Vivek on 2026-06-07_
