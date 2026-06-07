---
bet: WLT-1
story: WLT-7
author: Designer
created: 2026-06-07
figma: n/a — no Figma MCP on host; this spec is the source of truth for v1
area_tags: [frontend, auth]
---

# Design: WLT-7 — Authenticator-app (TOTP) backup factor

## Overview

Removes the passkey single-point-of-failure (WLT-1 DRI: device-loss lockout) by letting the user add an **authenticator app** (TOTP) as a backup second factor and sign in with a 6-digit code when their passkey isn't available. Passkey stays the default; TOTP is the safety net. Tone: reassuring, plain — most users don't know what "TOTP" is; we say "authenticator app" and "6-digit code" only.

Builds on WLT-6 (sign-up → passkey → AAL2 dashboard). New surfaces: a **Security** page, a **dashboard nudge**, and a **sign-in fallback** branch.

## User flows

### Flow: Add an authenticator backup (from Security)
1. Entry: dashboard nudge ("Add a backup") **or** `/settings/security`
2. Factor list shows: Passkey ✓ · Authenticator app — (not set up)
3. "Add authenticator app" → **enroll panel**: QR code + selectable manual key + a 6-digit code field
4. User scans in their app, types the current 6-digit code → **Verify**
5. Success: factor flips to ✓; confirmation toast
6. Failure: invalid/expired code → inline error, code field preserved, retry

### Flow: Sign in with the authenticator (passkey unavailable)
1. Sign-in step 1 (email + password) unchanged → AAL1
2. Passkey challenge screen now shows a secondary link **"Use your authenticator app instead"** — *only if* the account has a TOTP factor
3. Choosing it → **code screen**: 6-digit field → **Verify** → AAL2 → dashboard
4. Failure: invalid/expired → inline error + "Try again"; back-link returns to the passkey challenge

### Flow: No backup set up (can't use passkey, no TOTP)
- The "Use your authenticator app instead" link is **absent** (honest — no fake door). A small "Can't use your passkey?" link routes to an honest **"No backup set up — contact support"** explainer (seeds WLT-8 support-gated recovery; no promise of self-serve recovery yet).

### Flow: Remove the authenticator (Security)
- Factor list → "Remove" on the authenticator → confirm dialog. **Blocked** if it would leave the account with no second factor that isn't the passkey being removed — but since passkey is always present, removing TOTP is allowed; removing the **last** second factor is blocked with an explanation. Requires a fresh AAL2 session.

## Screens & states

### Screen: Security (`/settings/security`)
| State | Description | Copy |
|-------|-------------|------|
| Default | Heading + factor list (Passkey ✓, Authenticator —/✓) + actions | `security.*` |
| Empty (no TOTP) | "Authenticator app — not set up" + "Add authenticator app" CTA | `security.totp.empty.*` |
| Enrolled | "Authenticator app ✓ Added" + "Remove" | `security.totp.enrolled.*` |
| Loading | factor list skeleton while fetching | — |
| Error (load) | banner; retry | `errors.server` |

### Screen: TOTP enroll panel
| State | Description | Copy |
|-------|-------------|------|
| Default | QR + manual key (selectable) + 6-digit input + Verify | `totp.enroll.*` |
| Loading (QR) | spinner while `enroll()` returns the secret/QR | `totp.enroll.loading` |
| Verifying | CTA disabled + label | `totp.enroll.verifying` |
| Error | invalid/expired/already-enrolled, code preserved | `errors.totp.*` |
| Success | toast + factor flips to ✓ | `totp.enroll.success` |

### Screen: Sign-in TOTP challenge
| State | Description | Copy |
|-------|-------------|------|
| Default | 6-digit input + Verify + back to passkey | `totp.challenge.*` |
| Verifying | CTA disabled + label | `totp.challenge.verifying` |
| Error | invalid/expired/network/server discriminated; "Try again" | `errors.totp.*`, `errors.network`, `errors.server` |
| Success | redirect to dashboard (toast on first sign-in) | `signin.success` |

### Component: Dashboard nudge
- Dismissible banner (persists dismissal locally), shown when the account has **no** TOTP factor. Links to `/settings/security`. Honest framing about lockout. `nudge.*`

## Interactions
- **6-digit code input:** one field accepting 6 digits (`inputmode="numeric"`, `autocomplete="one-time-code"`, `pattern="\d*"`); auto-submit on the 6th digit is allowed but a visible **Verify** button remains (keyboard/AT users). Paste of a 6-digit code fills it.
- **Manual key:** monospace, selectable, with a "Copy" button (labelled, not icon-only).
- **QR:** an `<img>`/SVG with a **text alternative** — the manual key is the a11y equivalent, announced as "Can't scan? Enter this key in your app: …".
- **Remove:** confirm dialog; destructive styling; Esc cancels.

## Accessibility
- Keyboard-only completable; tab order = visual order; Enter submits; Esc dismisses dialogs/toasts.
- Focus: enroll panel open → focus the step heading (`h1`, `tabindex=-1`); error → focus the code field; success toast `aria-live="polite"`; errors `role="alert"`.
- QR is never the only path — the manual key + label is the screen-reader/no-camera equivalent.
- Code field: `<label>` "6-digit code", numeric, errors associated via `aria-describedby`.
- WCAG AA contrast; errors carry icon + text (never color-only); reduced motion respected.

## Design system components used
Reuses WLT-6's `Button`, `TextField`, `Banner`, `Toast`, `AuthCard`, `StepHeading`. **Establishes:** `CodeInput` (6-digit), `FactorRow` (label + status + action), `ConfirmDialog`, `QrPanel` (image + manual-key + copy). All Tailwind; seeds `/packages/ui`.

## DRI Log

### Decisions
- [2026-06-07] [Designer] Authenticator backup is **opt-in** via Security + a dashboard nudge, not a forced onboarding step — rationale: passkey is already the mandatory factor (WLT-6); forcing a second enroll at sign-up adds friction against the <60s TTFV target — alternatives: mandatory dual-enroll (rejected — friction) — area: flow
- [2026-06-07] [Designer] Sign-in fallback link only renders when a TOTP factor exists; no-backup users get an honest "contact support" path, never a fake option — rationale: no dark patterns; matches WLT-6 unsupported-browser honesty — area: trust
- [2026-06-07] [Designer] QR always paired with a selectable manual key — rationale: a11y + no-camera/desktop case; the key is the text equivalent — area: a11y

### Risks
- [2026-06-07] [Designer] Users may skip the nudge and remain single-factor (lockout risk persists) — likelihood: medium — impact: medium — mitigation: prominent, recurring-until-dismissed nudge; WLT-5 measures backup-adoption; WLT-8 support recovery is the floor — area: UX/scope

### Issues
- [2026-06-07] [Designer] No design-system `CodeInput`/`QrPanel` yet; this story seeds them in `/packages/ui` — severity: low — owner: Designer — status: open
