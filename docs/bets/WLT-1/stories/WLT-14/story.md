---
id: WLT-14
bet: WLT-1
type: story
status: ready
priority: P1
created: 2026-06-14
author: PM
design_link: docs/bets/WLT-1/stories/WLT-14/design.md
copy_link: docs/bets/WLT-1/stories/WLT-14/copy.md
area_tags: [frontend, backend, auth, product]
dependencies:
  - WLT-6
---

# WLT-14 — Forgot password: self-serve reset

## Description

A user who forgets their password currently has **no way back in** — there's no reset, no recovery flow anywhere in the product (the gap that stranded the first real dogfood user; their password had to be reset by an admin). This story ships the standard self-serve recovery: a **"Forgot password?"** link → request a reset → Supabase emails a secure, single-use link → a **`/reset`** page to set a new password → sign in. It recovers the **first factor only** — the passkey (second factor, WLT-6) still applies on the next sign-in; a user who's *also* lost their passkey is the separate, parked WLT-8 (both-factors-lost recovery). The request path is **anti-enumeration** (never reveals whether an email is registered) and **rate-limited**. The email links require the prod Supabase **Site URL / redirect** config (today `localhost:3000`) — declared as the activation prerequisite.

## Acceptance Criteria

- [ ] AC1 — **Entry point:** a **"Forgot password?"** link on the sign-in screen routes to `/forgot`.
- [ ] AC2 — **Request reset (anti-enumeration):** `/forgot` takes an email and calls Supabase `resetPasswordForEmail(email, { redirectTo: <prod>/reset })`, **rate-limited**. It **always** shows the same *"if an account exists, we've sent a link"* confirmation — **never** reveals whether the email is registered (no timing/he­ading/status difference between known + unknown emails).
- [ ] AC3 — **Set a new password:** the emailed link lands on `/reset` with a recovery session; the user sets a new password (**≥12 chars**, the same validation as sign-up), persisted via `updateUser({ password })`. An **expired / already-used / invalid** link renders a clear *"this link expired — request a new one"* state with a path back to `/forgot`, never a crash or a blank page.
- [ ] AC4 — **Second factor still applies:** resetting the password restores **AAL1 only**. On the next sign-in the user still completes the **passkey (AAL2)** challenge. The success copy states this so the user isn't surprised. (Lost passkey too → out of scope; that's WLT-8.)
- [ ] AC5 — **Audit trail:** `password_reset_requested` (on AC2) and `password_reset_completed` (on AC3) `AuditEvent`s emitted server-side — security-relevant actions; user_id + action only, **no PII, no token**.
- [ ] AC6 — **Rate-limited:** the request endpoint is rate-limited per the existing limiter (abuse / email-bomb protection); over-limit returns the discriminated `rate_limited` message, not a generic error.
- [ ] AC7 — **Validation + discriminated feedback:** a weak/short new password is rejected with the validation copy; network / server / expired-link are discriminated (per `copy.md`); success confirmations per copy.
- [ ] AC8 — **States:** request form / "email sent" confirmation / reset form (valid recovery session) / invalid-or-expired-link / success / loading / error — every one ships.
- [ ] AC9 — **Accessibility:** completable keyboard-only; labeled fields; focus moves to the confirmation/result; async steps use `aria-live="polite"`; WCAG AA; reduced-motion respected.
- [ ] AC10 — **Security posture:** the reset link is **single-use + time-limited** (Supabase default); no password or recovery token in logs or URLs we emit; the request reveals nothing about account existence (AC2). New **unauthenticated public endpoints** → mandatory Security Review.
- [ ] AC11 — **Ops prerequisite (declared, gating):** the flow needs the prod Supabase **Site URL + redirect allowlist** = `https://home-app.kindtree.us` and the **password-reset email template**. Build + tests use Supabase's recovery flow; **prod activation depends on this config** (ships dark, like `PLAID_WEBHOOK_URL` did for WLT-10). This also closes the long-standing `localhost:3000` Site-URL ops note.

## Standard Experience Checklist
- [x] **Navigation** — AC1 (forgot link), AC2 (→ email-sent), AC3 (email → reset → success → sign-in), AC3 (expired → back to /forgot)
- [x] **States** — AC8 (request / sent / reset / expired / success / loading / error)
- [x] **Feedback** — AC7 (discriminated errors + success), AC5 (audit)
- [x] **Accessibility** — AC9 (keyboard, labels, focus, aria-live, AA, reduced-motion)
- [x] **Edge cases** — AC3 (expired/used/invalid link), AC2/AC10 (anti-enumeration), AC4 (second factor still required), AC6 (rate-limit)
- [x] **Cross-surface consistency** — `n/a — web-only Phase-1 (architecture.md: mobile deferred)`

## Tech notes

Within-stack (`architecture_required: false`) — Supabase Auth's built-in password recovery + package handlers + app pages. No new tooling.
- **Package `@vc1023/passkey-2fa`** (the auth engine): add `requestPasswordReset` (calls `resetPasswordForEmail`; **anti-enumeration** — catch errors + always resolve success; rate-limited via the existing limiter) and `updatePassword` (calls `updateUser({ password })` under the recovery session) handlers in `routes.ts`; validation reuse (≥12); client helpers in `client.ts`; new `ApiErrorCode`s (e.g. `reset_link_invalid`). **Published package → minor bump 0.3.0 → 0.4.0** on republish (new feature); home-app consumes via workspace, so edits apply directly.
- **App:** a "Forgot password?" link in `SignInFlow.tsx`; `app/forgot/page.tsx` + `ForgotFlow`; `app/reset/page.tsx` + `ResetFlow` (handles the Supabase recovery session — `onAuthStateChange`/`PASSWORD_RECOVERY` or the code-exchange); thin route wrappers `app/api/auth/password/reset-request/route.ts` + `app/api/auth/password/update/route.ts`; strings verbatim from `copy.md`.
- **Config:** `SITE_URL` in the package config drives `redirectTo`; the URL must be in Supabase's **redirect allowlist**; set the Site URL + the reset email template (the ops prerequisite, AC11).
- **Audit:** `emitAudit` with new `AUTH.PASSWORD_RESET_REQUESTED` / `PASSWORD_RESET_COMPLETED` actions.

## Dependencies
- **WLT-6** — the auth foundation (Supabase Auth AAL1 + the passkey AAL2 that still gates after reset).
- **Ops prerequisite (AC11)** — prod Supabase Site URL / redirect allowlist / reset email template.

## DRI Log

### Decisions
- [2026-06-14] [PM] **Scope = recovery (forgot → reset) only**; change-password-while-signed-in is a thin fast-follow (shares `updatePassword`) — rationale: the painful gap is the *locked-out* user with no way back; ship that first — area: scope — reversibility: easy
- [2026-06-14] [PM] **Recovers AAL1 (password) only; AAL2 (passkey) still required** after reset — rationale: a password reset must not silently weaken the second factor; full both-factors-lost recovery stays the parked WLT-8 — area: security — reversibility: medium
- [2026-06-14] [PM] **Anti-enumeration + rate-limit on the request** — rationale: an unauthenticated public endpoint must not leak which emails are registered, nor be an email-bomb vector — area: security — reversibility: easy
- [2026-06-14] [PM] **Published-package minor bump (0.4.0)** for the new handlers — rationale: `@vc1023/passkey-2fa` is a real shared library; a feature addition is a minor version — area: packaging — reversibility: easy
- [2026-06-14] [PM] **Ops-gated activation (Site URL)** rather than blocking the build — rationale: build + verify against Supabase's recovery flow now; prod activation needs the config (ships dark, the WLT-10 `PLAID_WEBHOOK_URL` pattern); also closes the localhost:3000 ops note — area: ops — reversibility: easy

### Risks
- [2026-06-14] [PM] **Site-URL/email config is the gating prerequisite** — without it, reset links point to localhost and break — likelihood: high — impact: high (the feature is inert) — mitigation: AC11 declares it; check-env warns; verify in prod before calling it shipped — area: ops
- [2026-06-14] [PM] **Supabase default email deliverability/rate limits** (built-in SMTP is throttled) — likelihood: medium — impact: medium — mitigation: fine for dogfood/low volume; a real SMTP provider is a later infra slice — area: infra
- [2026-06-14] [Security] **New unauthenticated public endpoints** (request + token-based update) — likelihood: medium — impact: high — mitigation: anti-enumeration, rate-limit, single-use time-limited Supabase tokens, no token/PII in logs; mandatory Security Review — area: security

### Issues
- _none open — ready for `/build WLT-14` (note the AC11 ops prerequisite before prod verification)._
