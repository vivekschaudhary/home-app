---
bet: WLT-1
story: WLT-6
author: Designer
created: 2026-06-05
figma: n/a — no Figma MCP on host; this spec is the source of truth for v1
area_tags: [frontend, auth]
primary: gdrive://11PaT0uanocz3v1e1sgIeZh-4nmlXgR2vlfOdRCqd8GU
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/11PaT0uanocz3v1e1sgIeZh-4nmlXgR2vlfOdRCqd8GU/edit

# Design: WLT-6 — Sign up with passkey MFA + sign in

## Overview

First authentication surface of the product: email+password sign-up with mandatory passkey enrollment in the same flow, then sign-in with passkey MFA challenge. Tone target: this screen must *earn bank-credential trust* (brief: trust gate) while staying under 60s median.

## User flows

### Flow: Sign-up + passkey enrollment

1. Entry point: `/` (logged-out landing) → "Create account"
2. Step 1 — Credentials: email + password (+ strength meter), submit
3. Step 2 — Passkey enrollment (immediately, not skippable): explainer + "Create passkey" → native WebAuthn ceremony
4. Success state: signed-in dashboard shell with confirmation toast
5. Failure paths: validation errors inline (step 1); passkey ceremony cancelled → retry panel ("Try again", stay on step 2, never silently skip); WebAuthn unsupported → Unsupported screen; network/server errors → discriminated banners

### Flow: Sign-in with MFA challenge

1. Entry point: `/` → "Sign in"
2. Step 1: email + password
3. Step 2: passkey challenge (auto-triggered WebAuthn prompt; "Try again" if dismissed)
4. Success: dashboard shell (session persists across reload; SSR-safe)
5. Failure paths: invalid credentials (non-revealing); challenge cancelled/timed out → retry; account-without-passkey edge (shouldn't exist in slice 1; show support contact)

### Flow: Unsupported browser

1. Entry: WebAuthn capability check fails on enrollment step
2. Full-screen explainer: why passkeys, which browsers work — no fake "continue anyway"
3. Exit: "Sign out" + supported-browser list. (TOTP fallback arrives next story — do NOT promise it in UI yet.)

## Screens & states

### Screen: Sign-up (credentials)

| State | Description | Copy needed |
|-------|-------------|-------------|
| Default | email, password, strength meter, CTA, link to Sign in | `signup.*` |
| Loading | CTA disabled + spinner label | `signup.cta.loading` |
| Error (validation) | inline per-field; focus to first error | `errors.validation.*` |
| Error (network/server) | banner above form; values preserved | `errors.network`, `errors.server` |
| Success | advance to enrollment step (no dead-end screen) | — |

### Screen: Passkey enrollment

| State | Description | Copy needed |
|-------|-------------|-------------|
| Default | explainer, "Create passkey" CTA, "Sign out" escape | `mfa.enroll.*` |
| Loading | ceremony in progress; CTA disabled | `mfa.enroll.loading` |
| Error (cancelled) | re-prompt panel, "Try again" | `mfa.enroll.cancelled.*` |
| Error (unsupported) | route to Unsupported screen | `mfa.unsupported.*` |
| Success | toast + redirect to dashboard shell | `mfa.enroll.success` |

### Screen: Sign-in (credentials + challenge)

| State | Description | Copy needed |
|-------|-------------|-------------|
| Default | email, password, CTA, link to Create account | `signin.*` |
| Loading | CTA disabled + spinner | `signin.cta.loading` |
| Error | invalid-credentials (non-revealing) / network / server — discriminated | `errors.*` |
| Challenge | passkey prompt state with "Try again" | `mfa.challenge.*` |
| Success | redirect; toast on first sign-in only | `signin.success` |

## Interactions

- **Submit buttons:** click/Enter → submit; disabled while loading; re-enabled on error.
- **Password field:** show/hide toggle (labelled button, not icon-only); Caps-lock hint on focus.
- **Passkey CTA:** click → `navigator.credentials.create()`; Esc/system-cancel → cancelled state (focus returns to CTA).
- **All links:** real anchors, keyboard reachable, visible 2px focus ring.

## Accessibility

- Keyboard flow: completable keyboard-only; tab order = visual order; Enter submits, Esc dismisses toasts.
- Focus management: step change → focus to step heading (`h1`, `tabindex="-1"`); error → first invalid field; toasts `aria-live="polite"`, errors `role="alert"`.
- Screen reader: all inputs labelled; ceremony status announced; strength meter has text equivalent.
- Color contrast: WCAG AA (4.5:1); errors never color-only (icon + text).
- Reduced motion: no animated transitions under `prefers-reduced-motion`.

## Design system components used

None exist yet (first UI story, greenfield). **Establishes:** `Button` (primary/secondary, loading), `TextField` (label/error/helper), `Banner` (error/info), `Toast` (success), `AuthCard` layout, `StepHeading`. All Tailwind per architecture; seeds `/packages/ui`.

## DRI Log

### Decisions

- [2026-06-05] [Designer] Passkey enrollment is step 2 of sign-up, not a post-signup task — rationale: enforces MFA-at-sign-up scope; one continuous <60s flow — alternatives: deferred nudge (rejected — violates brief scope) — area: flow
- [2026-06-05] [Designer] No "skip for now" affordance in enrollment — rationale: MFA-required posture; a visible skip that errors is a dark pattern — alternatives: disabled skip + tooltip (rejected) — area: flow/trust
- [2026-06-05] [Designer] Unsupported-browser screen makes no TOTP promise — rationale: TOTP ships next story; promising it now is a fake door — area: scope honesty

### Risks

- [2026-06-05] [Designer] Native passkey prompts vary by OS/browser — confusion lands on our cancelled-state copy — likelihood: medium — impact: medium — mitigation: cancelled-state explainer + "Try again"; UX Writer owns clarity

### Issues

- [2026-06-05] [Designer] No Figma MCP + no design system tokens yet — severity: low — owner: Designer — status: open — this spec is source of truth; components established here seed `/packages/ui`
