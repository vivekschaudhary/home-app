---
id: WLT-7
bet: WLT-1
type: story
status: in-review
priority: P1
created: 2026-06-07
author: PM
design_link: docs/bets/WLT-1/stories/WLT-7/design.md
copy_link: docs/bets/WLT-1/stories/WLT-7/copy.md
area_tags: [frontend, backend, auth, security]
dependencies:
  - WLT-6
---

# WLT-7 — Authenticator-app (TOTP) backup factor

## Description

A signed-in user can add an **authenticator app** (TOTP) as a backup second factor — from a new **Security** page, and prompted by a dashboard nudge after passkey onboarding. On a later sign-in, if their passkey isn't available, they choose **"Use your authenticator app instead"** and finish with a 6-digit code. This removes the single-point-of-failure of passkey device loss (WLT-1 DRI risk). The passkey stays the default/required factor; the authenticator is an optional backup. Recovery when **both** factors are lost (support-gated) is the next story (WLT-8).

## Acceptance Criteria

- [ ] AC1 — Enroll: from `/settings/security`, a signed-in user with a current **AAL2** session starts authenticator enrollment → sees a QR code + a selectable manual key → enters the current 6-digit code → on success the factor is marked added. Enrollment requires AAL2 (re-challenge if the session isn't AAL2).
- [ ] AC2 — Nudge: after passkey enrollment (first dashboard visit, while no authenticator exists) a **dismissible, skippable** nudge invites adding a backup, honestly framed ("lose your passkey → locked out"); it links to `/settings/security`.
- [ ] AC3 — Sign-in fallback: on the passkey challenge screen, **"Use your authenticator app instead"** appears **only if** the account has an authenticator factor; choosing it → 6-digit code → **server-verified** → AAL2 → dashboard. Session persists across reload (SSR-safe).
- [ ] AC4 — No-backup honesty: a user **without** an authenticator who can't use their passkey is shown an honest "no backup set up — contact support" path (no fake authenticator option). Seeds WLT-8; makes no self-serve recovery promise.
- [ ] AC5 — Factor status + remove: `/settings/security` shows enrolled factors (Passkey ✓ / Authenticator ✓ or —) and allows removing the authenticator behind a confirm, **blocking removal that would leave no second factor** (no lockout). Remove requires AAL2.
- [ ] AC6 — States: enroll (QR-loading / awaiting-code / verifying / success / error) and challenge (entering / verifying / invalid-or-expired / success) each render per design; the code value is preserved on error.
- [ ] AC7 — Feedback: errors discriminate invalid-code / expired-code / already-enrolled / network / server using `copy.md` strings **verbatim**; success confirmations past-tense.
- [ ] AC8 — Accessibility: QR has a text equivalent (selectable, labelled manual key); the code input is labelled, `inputmode="numeric"`, completable keyboard-only; errors `role="alert"`; focus moves to the step heading on step change and to the code field on error; WCAG AA; reduced motion respected.
- [ ] AC9 — Audit + funnel: `totp_enroll_started`, `totp_enrolled`, and `signin_success` (when signed in via authenticator) are emitted; `AuditEvent` rows for enroll + authenticator sign-in success/failure; **the TOTP secret is NEVER written to logs** (no PII/secrets in logs).
- [ ] AC10 — Security: enroll + remove require AAL2; code verification is server-side; the verify endpoints are rate-limited (reuse the package's `RateLimiter`); last-factor removal is blocked server-side, not just in the UI.
- [ ] AC11 — Performance: p95 < 200ms for the authenticator enroll/verify API routes (excluding the time the user spends typing/scanning), verified against the deployed canary.

## Standard Experience Checklist

- [x] **Navigation** — covered by AC2 (nudge → security), AC3 (fallback link + back-to-passkey), AC5 (security nav + remove confirm/cancel)
- [x] **States** — covered by AC6 (loading/verifying/success/error/disabled); empty state = "Authenticator app — not set up" on `/settings/security` (AC5)
- [x] **Feedback** — covered by AC7 (discriminated errors + past-tense success); destructive remove confirms before executing (AC5)
- [x] **Accessibility** — covered by AC8
- [x] **Edge cases** — covered by AC4 (no-backup user), AC7 (invalid / expired / already-enrolled; offline = network error), AC5/AC10 (last-factor removal blocked); slow network = loading states per AC6
- [x] **Cross-surface consistency** — `n/a — web is the only Phase-1 target (architecture.md: mobile deferred)`

## Tech notes

- **TOTP is Supabase-native** (architecture **ADR-001**): `supabase.auth.mfa.enroll({ factorType: 'totp' })` returns the QR/secret/`factorId`; verify enrollment + sign-in challenges with `supabase.auth.mfa.challenge({ factorId })` + `verify({ factorId, challengeId, code })`. Supabase owns its `auth.mfa_factors` tables — **no new app DB migration** (contrast WebAuthn, which needed our own tables). `[auth.mfa.totp]` is already enabled in `supabase/config.toml`.
- **Extend `@vc1023/passkey-2fa` → 0.3.0** (user decision) so the package offers passkey **or** authenticator as the second factor, both minting the **same AAL2 cookie**:
  - server `totp.ts`: `enrollTotp`, `verifyTotpEnrollment`, `createTotpChallenge`, `verifyTotp`, `listFactors`, `unenrollTotp` (wrap `supabase.auth.mfa.*`).
  - `/routes`: add handlers (`totpEnrollStart` / `totpEnrollVerify` / `totpChallengeVerify` / `factorsList` / `totpUnenroll`) — **reuse `setAal2Cookie` + the injected `RateLimiter`**; emit `onEvent` for the new TOTP events.
  - `/client`: `enrollTotp`, `verifyTotpEnrollment`, `challengeWithTotp`, `listFactors`, `removeTotp`.
  - **AAL2 reuse:** after a verified authenticator code, call the package's existing `setAal2Cookie(user.id)` — so `requireAal2()` on `/dashboard` works identically for either factor.
- **App:** new `/settings/security` page (enroll/manage) + dashboard nudge + a fallback branch in `app/sign-in/SignInFlow.tsx`. New funnel events (`totp_*`) added to `@wealth/core` funnel constants + the `onEvent` map in `app/lib/auth.ts` (extends the WLT-5 contract — no rename of existing events).
- **Republish** `@vc1023/passkey-2fa@0.3.0` after build (home-app consumes via `workspace:*`).
- **Test note:** E2E uses a deterministic TOTP code (derive from the enrollment secret with a TOTP lib) so the authenticator flow runs headless.

## PRs

- PR #12 — feat(WLT-7): authenticator-app (TOTP) backup factor — in-review (Codex + Security Review pending)

## Tests

- Engineer: unit (TOTP verify wrapper, last-factor-removal guard, AAL2 mint on TOTP verify), API (enroll/verify/remove routes), component (CodeInput, FactorRow states) — co-located.
- Codex reviewer: E2E (enroll authenticator → sign out → sign in via authenticator fallback → dashboard; remove-last-factor blocked) in top-level `e2e/`, using a derived TOTP code.

## Fixes (post-merge)

_None._

## DRI Log

### Decisions

- [2026-06-07] [PM] Slice = authenticator enroll + sign-in fallback; **support-gated recovery (both factors lost) deferred to WLT-8** — rationale: smallest independent slice that kills the passkey-lockout risk; support-gated recovery needs ops tooling/process and is its own surface — area: scope — alternatives: include recovery now (rejected — doubles surface, couples to support ops) — reversibility: easy
- [2026-06-07] [PM] TOTP added to **`@vc1023/passkey-2fa` (0.3.0)**, not app-side — rationale: the package was extracted for reuse across the user's apps; a complete "passkey or authenticator" MFA package is more reusable and keeps AAL2 ownership in one place — area: architecture — alternatives: app-side via Supabase MFA + the package's `setAal2Cookie` (rejected — splits auth across two homes, less reusable) — reversibility: medium
- [2026-06-07] [PM] Authenticator is an **optional backup** via Security + nudge, not mandatory at sign-up — rationale: passkey is already the required factor (WLT-6); a forced second enroll fights the <60s TTFV target — area: scope — alternatives: mandatory dual-enroll (rejected — friction) — reversibility: easy
- [2026-06-07] [PM] Jira mirror **skipped** — no Jira MCP on host (consistent with WLT-6) — area: tooling — reversibility: easy
- [2026-06-07] [Engineer] TOTP `unenroll` finds the user's verified factor server-side (no client-supplied factorId) — rationale: a user has at most one verified TOTP factor; keeps the factorId off the wire — area: api — reversibility: easy
- [2026-06-07] [Engineer] E2E determinism: `workers: 1` + `globalSetup` route-warming + `retries: 2` for the gated specs — rationale: `next dev` compiles routes on first hit and two WebAuthn-virtual-authenticator ceremonies can't share one dev server; production `next start` is unusable locally (forces Secure cookies + https RP-ID) — area: test-infra — reversibility: easy
- [2026-06-07] [Engineer] Added a neutral `security.cancel` ("Cancel") string for the enroll/remove dialogs (mirrored into copy.md) — rationale: copy.md lacked a dialog cancel label — area: copy — issue: UX Writer to confirm wording

### Risks

- [2026-06-07] [PM] Optional backup means nudge-skippers stay single-factor (lockout risk persists) — likelihood: medium — impact: medium — mitigation: prominent recurring nudge; WLT-5 measures backup-adoption; WLT-8 support recovery is the floor — area: scope
- [2026-06-07] [PM] Extending + republishing a **published** package (0.2.0 → 0.3.0) while home-app consumes it via workspace — likelihood: low — impact: medium — mitigation: workspace `*` resolves locally; bump + republish only after the build is green — area: release
- [2026-06-07] [Security] New server-verified factor + factor-removal path on a financial account — likelihood: medium — impact: high — mitigation: AAL2 required for enroll/remove, server-side verify, rate-limited, last-factor guard server-side; **mandatory Security Reviewer pass** at `/build` — area: security

### Issues

- [2026-06-07] [Designer] No `CodeInput` / `QrPanel` design-system components yet; this story seeds them in `/packages/ui` — severity: low — owner: Designer — status: open

---

_Story closed: <pending>, brief link: docs/bets/WLT-1/brief.md_
