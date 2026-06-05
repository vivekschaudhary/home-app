---
id: WLT-1
type: feature
status: proposed
parent: FOUNDATION-PRODUCT
portfolio_stub: true
depends_on: []
parallel_with: [WLT-5]
created: 2026-06-05
author: PM
estimate:
  duration_weeks: 2
  confidence: low
  refined_by: stub
  refined_at: 2026-06-05
  estimated_start: 2026-06-08
  estimated_end: 2026-06-19
primary: gdrive://1gCPvw67U40iTxkHfbQsuJdtI1USncWmnve7o__lS6tE
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/1gCPvw67U40iTxkHfbQsuJdtI1USncWmnve7o__lS6tE/edit

# [STUB] WLT-1 — Identity & MFA onboarding

**Hypothesis:** If sign-up with managed MFA (TOTP + passkey via Supabase Auth) completes in under a minute, users clear the trust gate without abandoning — traces to product.md L29 ("Auth posture: MFA-required").

This is a portfolio stub. Full brief content (problem, user, scope, research, guardrails) is filled by `/create-brief WLT-1` promotion, which requires its own HITL approval. Likely scope at promotion: Supabase Auth sign-up/sign-in, mandatory MFA enrollment (TOTP + passkey), RLS identity base (`auth.uid()`), session handling, auth audit events. MVP definition this enables: `docs/foundation/portfolio.md`.
