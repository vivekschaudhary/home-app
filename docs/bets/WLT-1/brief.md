---
id: WLT-1
type: feature
status: approved
approved_date: 2026-06-05
priority: P1
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: []
parallel_with: [WLT-5]
architecture_required: false
created: 2026-06-05
promoted: 2026-06-05
author: PM
sources:
  - docs/foundation/portfolio.md (stub + MVP definition)
  - docs/foundation/product.md (L29 MFA-required posture)
  - docs/foundation/architecture.md (Layer 2 auth decision)
key_metric:
  name: sign-up → MFA-enrolled completion rate
  baseline: n/a (pre-launch)
  target: "≥80% of started sign-ups complete; median enrollment <60s"
  source: WLT-5 event instrumentation (funnel events)
guardrails:
  - name: MFA coverage
    threshold: 100% of accounts (security fitness function)
  - name: TTFV contribution of sign-up
    threshold: ≤60s median
  - name: p95 auth API latency
    threshold: <200ms
  - name: auth-related error rate
    threshold: <1% of attempts
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [backend, frontend, auth, security]
estimate:
  duration_weeks: 2
  confidence: low
  refined_by: stub
  refined_at: 2026-06-05
  estimated_start: 2026-06-08
  estimated_end: 2026-06-19
primary: gdrive://1N0ncwTqcNYW-wXAhC4lHx55jO-M4AyvAj303I0ATiAI
last_synced: 2026-06-05
---

> **Primary artifact (stakeholders read here):** https://docs.google.com/document/d/1N0ncwTqcNYW-wXAhC4lHx55jO-M4AyvAj303I0ATiAI/edit
> Approved 2026-06-05 (HITL); Doc title status prefix removed. This repo file is a slim pointer + inline cache for AI consumption. Supersedes the stub doc in the same GDrive folder.

# WLT-1 — Identity & MFA onboarding

## Problem

A financial platform asking for bank connections must first clear a trust + friction gate: 68% of consumers abandon financial-app onboarding before completion (Signicat "Battle to Onboard," 2025), and identity steps are the single most common drop-off point. Our posture makes this harder: MFA is required for every account (product.md L29) — a step most consumer apps make optional. If sign-up is slow or alien, the user never reaches the loop the MVP exists to prove; every other bet in the wedge sits behind this gate.

## User

The Mint-refugee / financially-anxious consumer (primary persona, ~80%, product.md L23, L26) on web, signing up for the first time. Job-to-be-done: "let me in quickly, and make me feel this app deserves my bank credentials' trust — without making me install an authenticator app."

## Why this matters

WLT-1 is the root of the portfolio dependency graph — WLT-2 and WLT-3 cannot start their loop stages without identity, and the brand/trust moat (product.md moat row 5: load-bearing in finance, must be earned) is earned or lost at the first screen. It also implements the compliance floor (MFA on 100% of accounts, SOC 2 path) that the regulatory moat row treats as a prerequisite.

## Hypothesis (the bet)

If we ship passkey-first MFA sign-up (passkey as default factor, TOTP fallback) — Supabase Auth for email+password + sessions, **passkey second factor via a custom WebAuthn layer** (architecture ADR-001, 2026-06-05; Supabase-native passkey is experimental) — then new users will clear the MFA-required trust gate without abandoning, measured by **≥80% of started sign-ups reaching MFA-enrolled with median enrollment <60s**, within 30 days of launch.

Evidence the friction bet is winnable: passkeys deliver ~4x faster logins and 25–70% higher login success vs passwords (HubSpot via Descope; PayPal case study), and fintech leads passkey adoption at ~60% of eligible users in 2026.

## Defensibility

**Moat impact (one line):** Seeds the switching-cost moat (identity anchors the connection graph + workflow history) and starts earning the brand/trust prerequisite; satisfies the regulatory floor — no new moat created by this bet alone.

## Scope

### In scope

- Supabase Auth sign-up / sign-in (email + password as base credential)
- MFA enrollment **at sign-up, passkey-first with TOTP fallback** (user-elicited decision, 2026-06-05)
- MFA challenge on sign-in; session handling (SSR-safe per Next.js App Router)
- RLS identity base: `auth.uid()` as tenancy key, default-deny policies + cross-tenant RLS tests
- Auth audit events to `AuditEvent` (append-only)
- Account recovery path (passkey loss → TOTP; TOTP loss → support-gated recovery, fail-closed)
- Sign-up funnel events emitted per WLT-5 event schema

### Out of scope

- Account aggregation / linking (WLT-2); intent capture (WLT-3)
- Social login / OAuth identity providers — revisit post-MVP
- Builder/developer personas + roles; enterprise SSO — post-MVP
- SMS as an MFA factor — SIM-swap exposure; deliberately not offered

## Open questions for Researcher

- None unresolved. UK PSD2 SCA: `n/a — US-first launch` (architecture DRI R4 carries the UK gate).

## Research findings

- 68% abandon financial-app onboarding (up from 63% two years prior); identity steps are the top drop-off point. [Signicat via [INSART](https://insart.com/anatomy-of-trust-fintech-ux-onboarding-dropoff/), [The Skins Factory](https://www.theskinsfactory.com/uiux-design-blog/fintech-onboarding-ux-design)]
- 38% leave mid-onboarding if it takes too long — supports the <60s target. [[Jumio](https://www.jumio.com/how-to-reduce-customer-abandonment/)]
- Passkeys: ~4x faster login, +25% login success (HubSpot); PayPal +70% login success, −50% password support tickets. [[Descope](https://www.descope.com/blog/post/auth-stats-2026), [Help Net Security](https://www.helpnetsecurity.com/2025/10/31/passkey-adoption-trends-2025/)]
- Fintech leads passkey adoption: ~60% of eligible users in 2026 (cross-industry 33–38%). [[state-of-passkeys.io](https://state-of-passkeys.io/), [MojoAuth](https://mojoauth.com/blog/passkey-adoption-rates-by-industry)]
- Competitive: YNAB / Monarch / Copilot all treat MFA as optional — enforcing it with lower friction than their optional flows is a trust differentiator consistent with research.md §1 (bank-linking trust barrier).

## User pain input (from Support)

`n/a — pre-launch; no support channel yet` (first-party signal arrives post-launch via WLT-5).

## Stories

- **WLT-6** — Sign up with passkey MFA + sign in — `shipped` (2026-06-06)
- **WLT-7** — Authenticator-app (TOTP) backup factor — `ready`
- WLT-8 _(planned)_ — support-gated recovery (both factors lost)

_Decomposed one at a time via `/create-story WLT-1`._

## Scan summary

- **Last scanned:** never — run `/scan WLT-1`

## Check-in log

_Populated by `/measure` cron._

## DRI Log

### Decisions

- [2026-06-05] [PM] MFA enrollment at sign-up, passkey-first + TOTP fallback — rationale: strictest read of MFA-required posture with the lowest-friction factor; user-elicited — area: scope/security — alternatives: progressive enrollment before first account link (rejected by user); TOTP-first (rejected — highest friction) — reversibility: medium
- [2026-06-05] [PM] `architecture_required: false` — rationale: foundational architecture already decides Supabase Auth + MFA + RLS-on-`auth.uid()` (architecture.md Layer 2); this bet implements without deviation — area: process — alternatives: auto (rejected — decision is already made upstream) — reversibility: easy (deviation in stories re-triggers the gate)
- [2026-06-05] [PM] SMS factor excluded — rationale: SIM-swap exposure inconsistent with Sensitive posture — area: security — alternatives: SMS fallback (rejected) — reversibility: easy
- [2026-06-05] [PM] Jira epic mirroring skipped — no Jira MCP on host — area: tooling — reversibility: easy

### Risks

- [2026-06-05] [PM] Passkey device-loss lockout on financial data — likelihood: medium — impact: high — mitigation: dual-enrollment nudge (passkey + TOTP), fail-closed support-gated recovery, recovery in-scope — area: security/UX
- [2026-06-05] [Researcher] Abandonment evidence is industry-wide, not Mint-refugee-specific (motivated switchers may differ) — likelihood: medium — impact: medium — mitigation: WLT-5 funnel events surface the real curve week 1 — area: research-coverage
- [2026-06-05] [Researcher] Passkey stats skew to login, not first-enrollment; <60s target partly extrapolated — likelihood: medium — impact: low — mitigation: treat as falsifiable target; revisit at first weekly check-in — area: evidence-quality

### Issues

- _None open beyond tooling (Jira MCP absent, logged above)._

---

_Approved by: Vivek (HITL) on 2026-06-05_
