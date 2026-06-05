---
id: WLT-6
bet: WLT-1
type: story
status: ready
priority: P1
created: 2026-06-05
author: PM
design_link: docs/bets/WLT-1/stories/WLT-6/design.md
copy_link: docs/bets/WLT-1/stories/WLT-6/copy.md
area_tags: [frontend, backend, auth, security]
dependencies: []
primary: gdrive://1IQSNjYMap5ie3tFRcNTqRKG6UWxpeYCNxEpuUeowpWY
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/1IQSNjYMap5ie3tFRcNTqRKG6UWxpeYCNxEpuUeowpWY/edit

# WLT-6 — Sign up with passkey MFA + sign in

## Description

A new user creates an account with email + password, is required to enroll a passkey in the same flow (no skip), and signs in thereafter with a passkey MFA challenge. Sessions persist across reloads. This is the smallest slice that proves the trust gate works end-to-end; TOTP fallback + recovery flows are the next story.

## Acceptance Criteria

- [ ] AC1 — Sign-up happy path: email + password (≥12 chars) → mandatory passkey enrollment step → success lands signed-in on dashboard shell with confirmation. No path completes sign-up without an enrolled passkey.
- [ ] AC2 — Sign-in: email + password, then passkey MFA challenge; session persists across page reload and browser restart (SSR-safe per Next.js App Router); MFA enforced **server-side** (no full-privilege session without verified second factor).
- [ ] AC3 — Unsupported browser: WebAuthn capability check routes to explainer screen; sign-up blocked gracefully (no fake "continue"); event logged for funnel visibility.
- [ ] AC4 — Navigation: Sign-up ↔ Sign-in cross-links; enrollment screen has "Sign out" escape; no surface strands the user (back/Esc behavior per design spec).
- [ ] AC5 — States: every form has loading (CTA disabled + label), error, and success states per design spec; form values preserved on error.
- [ ] AC6 — Feedback: error messages discriminate validation / invalid-credentials / network / server / passkey-cancelled / unknown, using `copy.md` strings **verbatim**; success confirmations past-tense.
- [ ] AC7 — Accessibility: flow completable keyboard-only; focus to step heading on step change and to first invalid field on error; inputs labelled; errors `role="alert"`; WCAG AA contrast; reduced motion respected.
- [ ] AC8 — Tenancy base: RLS enabled default-deny on all user-scoped tables; cross-tenant access attempts fail; RLS policy tests (cross-tenant default-deny) pass in CI.
- [ ] AC9 — Audit: sign-up, passkey enrollment, sign-in success/failure, MFA challenge failure each append an `AuditEvent` row; structured logs contain no PII.
- [ ] AC10 — Funnel events: `signup_started`, `signup_credentials_created`, `mfa_enroll_started`, `mfa_enrolled`, `signin_success` emitted with timestamps (feeds TTFV clock / WLT-5 schema).
- [ ] AC11 — Performance guardrail: p95 < 200ms for auth API routes (excluding the WebAuthn ceremony itself), verified against the deployed canary.

## Standard Experience Checklist

- [x] **Navigation** — covered by AC4
- [x] **States** — covered by AC5 (loading/error/success/disabled); empty state `n/a — no list/collection surfaces in this story`
- [x] **Feedback** — covered by AC6 (+ success acks in AC1/AC2)
- [x] **Accessibility** — covered by AC7
- [x] **Edge cases** — covered by AC3 (unsupported browser) + AC6 (offline/network discriminated; slow network = loading states per AC5); permissions-denied `n/a — no permissioned resources pre-data`; missing-data `n/a — no fetched collections yet`
- [x] **Cross-surface consistency** — `n/a — web is the only Phase-1 target (architecture.md: mobile deferred)`

## Tech notes

- Supabase Auth: email+password primary factor; passkey (WebAuthn) as MFA factor; enforce AAL2 **server-side** for app surfaces — middleware/route-handler check, not client-only.
- RLS keyed on `auth.uid()` per foundational architecture (Layers 2/3); policies + cross-tenant tests in `/supabase`; default-deny.
- Session via Supabase SSR helpers (App Router); no tokens in client storage beyond Supabase defaults.
- `AuditEvent`: append-only, server-side inserts only; no PII in Sentry breadcrumbs (cross-cutting standards).
- Funnel events: thin server-side emitter; event names above are the contract WLT-5 adopts (no rename later).
- Boundaries: UI in `/app` + seeds `/packages/ui`; auth helpers in `/packages/db`; domain types in `/packages/core`.

## PRs

_Auto-populated as PRs open._

## Tests

- Engineer: unit (validation, session guard), API (auth routes), component (forms/states), RLS policy tests — co-located.
- Codex reviewer: E2E (sign-up→enroll→sign-in happy path + cancelled-ceremony path) in top-level `e2e/`.

## Fixes (post-merge)

_None._

## DRI Log

### Decisions

- [2026-06-05] [PM] First slice = passkey-only path; TOTP fallback + recovery deferred to next story — rationale: smallest independent slice proving the trust gate; unsupported browsers get an honest block (AC3), acceptable pre-launch — area: scope — alternatives: include TOTP now (rejected — doubles surface, delays first proof) — reversibility: easy
- [2026-06-05] [PM] Story ID WLT-6 (Jira-style sequential, sub-ticket of WLT-1); Jira mirror skipped — no MCP on host — area: tooling — reversibility: easy
- [2026-06-05] [PM] `status: ready` without story-level HITL — `hitl_level: milestones` in config; `/create-story` step 9 auto-advances — area: process

### Risks

- [2026-06-05] [PM] Passkey-only slice locks out unsupported-browser users until story 2 — likelihood: medium — impact: low (pre-launch) — mitigation: AC3 honest block + funnel event measures how many hit it; TOTP story next — area: scope
- [2026-06-05] [Designer] OS-owned passkey prompts vary; confusion lands on cancelled-state copy — likelihood: medium — impact: medium — mitigation: AC6 discriminated copy + retry — area: UX

### Issues

- [2026-06-05] [Designer] No design system tokens yet; this story seeds `/packages/ui` — severity: low — owner: Designer — status: open

---

_Story closed: <pending>, brief link: docs/bets/WLT-1/brief.md_
