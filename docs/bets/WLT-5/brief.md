---
id: WLT-5
type: feature
status: proposed
parent: FOUNDATION-PRODUCT
portfolio_stub: true
depends_on: []
parallel_with: [WLT-1]
created: 2026-06-05
author: PM
estimate:
  duration_weeks: 1
  confidence: low
  refined_by: re-sequence
  refined_at: 2026-06-09
  estimated_start: 2026-06-12
  estimated_end: 2026-06-19
primary: gdrive://1Ejx3hxaXrwmC7TObNFCLWWzntvLd0JfsLFya82TqIA4
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/1Ejx3hxaXrwmC7TObNFCLWWzntvLd0JfsLFya82TqIA4/edit

# [STUB] WLT-5 — TTFV + WAWU instrumentation

**Hypothesis:** If TTFV and WAWU events are instrumented from day 1, the foundational hypothesis is falsifiable at launch — traces to product.md L54 (KR4: "TTFV instrumentation live vs <3-min target") + L38 (WAWU definition: "users taking ≥1 platform-prompted financial action per 7-day window").

This is a portfolio stub. Full brief content is filled by `/create-brief WLT-5` promotion (own HITL approval). Likely scope at promotion: event schema (sign-up, account-linked, intent-declared, workflow-running, action-completed), TTFV clock definition + measurement, WAWU counting query, Sentry/analytics wiring per architecture cross-cutting standards. No dependencies — starts day 1 in parallel with WLT-1.
