---
bet: WLT-1
story: WLT-6
author: UX Writer
created: 2026-06-05
primary: gdrive://1NSn9-TovVbnR1vu84zhV8lIbxqQLg05pqYhzm3h5OrA
last_synced: 2026-06-05
---

> **Primary artifact:** https://docs.google.com/document/d/1NSn9-TovVbnR1vu84zhV8lIbxqQLg05pqYhzm3h5OrA/edit
> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-6 — Sign up with passkey MFA + sign in

## Voice and tone

Calm, plain, trust-building. This user is financially anxious (persona) and being asked for security steps most apps skip. Explain *why* once, briefly; never use jargon ("WebAuthn", "FIDO2", "AAL2") in UI. "Passkey" is the only new term we teach.

## Strings

| Location / ID | Final copy | Rationale (when non-obvious) |
|---------------|-----------|------------------------------|
| `signup.title` | Create your account | |
| `signup.email.label` | Email | |
| `signup.password.label` | Password | |
| `signup.password.helper` | At least 12 characters. A short sentence works well. | Length > complexity rules; passphrase nudge |
| `signup.cta` | Create account | Says what it does, not "Submit" |
| `signup.cta.loading` | Creating account… | |
| `signup.signin.link` | Already have an account? Sign in | |
| `mfa.enroll.title` | Secure your account with a passkey | |
| `mfa.enroll.body` | A passkey uses your face, fingerprint, or device PIN — no codes to type. It keeps your financial data locked to devices you trust. | The one explainer; why + what |
| `mfa.enroll.cta` | Create passkey | |
| `mfa.enroll.loading` | Waiting for your device… | Ceremony is OS-owned; sets expectation |
| `mfa.enroll.cancelled.title` | Passkey not created | States what happened |
| `mfa.enroll.cancelled.body` | The passkey prompt was closed before finishing. Your account needs a passkey to continue. | What + why it can't be skipped |
| `mfa.enroll.cancelled.cta` | Try again | |
| `mfa.enroll.success` | Passkey created. Your account is protected. | Past-tense confirmation |
| `mfa.enroll.signout` | Sign out | Escape hatch on enrollment screen |
| `mfa.unsupported.title` | This browser doesn't support passkeys | |
| `mfa.unsupported.body` | To keep your financial data safe, we require a passkey. Use a current version of Chrome, Safari, Edge, or Firefox on this or another device, then sign in again. | What to do; no fake door; no TOTP promise yet |
| `signin.title` | Sign in | |
| `signin.cta` | Sign in | |
| `signin.cta.loading` | Signing in… | |
| `signin.signup.link` | New here? Create an account | |
| `mfa.challenge.title` | Confirm it's you | |
| `mfa.challenge.body` | Use your passkey to finish signing in. | |
| `mfa.challenge.retry` | Try again | |
| `signin.success` | Welcome back. | First sign-in toast only |
| `errors.validation.email` | Enter a valid email address, like name@example.com. | What + example |
| `errors.validation.password` | Your password needs at least 12 characters. | |
| `errors.invalid_credentials` | That email and password combination doesn't match our records. Try again. | Non-revealing (security) |
| `errors.network` | You appear to be offline. Check your connection and try again. | Discriminated: network |
| `errors.server` | Something went wrong on our side — your information is safe. Try again in a minute. | Discriminated: server; reassures on data safety |
| `errors.unknown` | That didn't work, and we're not sure why. Try again; if it keeps happening, contact support. | Discriminated: unknown; honest |
| `a11y.password.show` | Show password | Toggle label |
| `a11y.password.hide` | Hide password | |
| `a11y.capslock` | Caps Lock is on | |

## Terminology consistency

- **"Passkey"** (never "WebAuthn", "credential", "security key") — matches OS vocabulary (Apple/Google/Microsoft all say passkey).
- **"Sign in / Sign out"** (never "Log in/out") — fixed product-wide from this story forward.
- **"Create account"** (never "Register"; "sign-up" allowed in prose only).

## DRI Log

### Decisions

- [2026-06-05] [UX Writer] "Sign in" over "Log in" — rationale: matches the platform conventions the passkey prompts use; consistency with OS dialogs — alternatives: Log in (rejected) — area: terminology
- [2026-06-05] [UX Writer] Server-error copy includes "your information is safe" — rationale: financial-anxiety persona; a 500 during auth reads as breach risk — area: tone

### Risks

- [2026-06-05] [UX Writer] "Passkey" still unfamiliar to a slice of users despite ~60% fintech adoption — likelihood: medium — impact: low — mitigation: one-line explainer at enrollment; never assume prior knowledge — area: comprehension

### Issues

- _none_
