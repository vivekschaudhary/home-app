---
id: WLT-2
type: feature
status: proposed
parent: FOUNDATION-PRODUCT
portfolio_stub: true
depends_on: [WLT-1]
parallel_with: [WLT-3]
created: 2026-06-05
author: PM
estimate:
  duration_weeks: 2
  confidence: low
  refined_by: stub
  refined_at: 2026-06-05
  estimated_start: 2026-06-22
  estimated_end: 2026-07-03
primary: gdrive://1rksze12ty6GH0Jpfcs6n8ectDSz9iDcOuaJLU6pOxZ8
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/1rksze12ty6GH0Jpfcs6n8ectDSz9iDcOuaJLU6pOxZ8/edit

# [STUB] WLT-2 — Account aggregation + CSV fallback

**Hypothesis:** If a user can link one real institution via OAuth (or import CSV) and see clean transactions, the loop runs on real data, not demo data — traces to product.md L52 (KR2: "2 aggregation providers live + CSV-import fallback").

This is a portfolio stub. Full brief content is filled by `/create-brief WLT-2` promotion (own HITL approval). Likely scope at promotion: one provider adapter (Plaid-class), OAuth tokens in Supabase Vault, Inngest sync jobs, transaction ingest (append/CDC), CSV import path, connection-health status. Open question for promotion: 1 vs 2 providers in MVP (KR2 says 2 by end of Q2; the loop needs 1 + CSV). Researcher risk: aggregation data quality is the comparable-product long pole.
