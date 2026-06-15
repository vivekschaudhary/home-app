---
bet: WLT-1
story: WLT-14
author: UX Writer
created: 2026-06-14
---

> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-14 — Forgot password: self-serve reset

## Voice and tone

Calm, plain, reassuring — the user is locked out and a little stressed. Short sentences. No blame ("you forgot" → never said), no jargon ("recovery token", "AAL1"). **Security through honesty:** we never say whether an email is registered, and we tell the user plainly that their passkey is still part of signing in. Matches the WLT-6/WLT-9 auth voice.

## Strings

| Location / ID | Final copy | Rationale |
|---|---|---|
| `signin.forgotLink` | Forgot password? | The entry link on sign-in |
| `forgot.title` | Reset your password | Plain, action-first |
| `forgot.body` | Enter your email and we'll send you a link to set a new password. | What happens next |
| `forgot.emailLabel` | Email | |
| `forgot.submit` | Send reset link | Says what it does |
| `forgot.sending` | Sending… | aria-live |
| `forgot.backToSignIn` | Back to sign in | Escape |
| `forgot.sentTitle` | Check your email | The confirmation heading |
| `forgot.sentBody` | If an account exists for that email, we've sent a link to reset your password. It expires in a little while, so use it soon. Don't see it? Check your spam folder. | **Existence-agnostic** (anti-enumeration) + sets expiry + spam hint |
| `reset.title` | Set a new password | |
| `reset.body` | Choose a new password for your account. | |
| `reset.passwordLabel` | New password | |
| `reset.submit` | Set new password | |
| `reset.saving` | Saving… | aria-live |
| `reset.doneTitle` | Your password's updated | Success heading (focus lands here) |
| `reset.doneBody` | You can sign in with your new password now. You'll still use your passkey to finish signing in — that hasn't changed. | Confirms + the **second-factor note** (AC4) |
| `reset.doneCta` | Go to sign in | |
| `reset.expiredTitle` | This link's expired | Routine, not alarming |
| `reset.expiredBody` | Reset links can only be used once, and they don't last long. Request a new one and we'll send it over. | Explains why (single-use + short-lived) |
| `reset.expiredCta` | Request a new link | → /forgot |
| `reset.mfaPrompt` | For your security, enter your authenticator code to finish resetting your password. | SUP-7: an account with an authenticator (TOTP) must prove the second factor before the reset — a reset must not bypass MFA. Revealed when the server returns `mfa_required`. |
| `reset.codeInvalid` | That code didn't match — enter the current one from your app. | Discriminated: wrong authenticator code (shown on the code field) |
| `reset.codeExpired` | That code expired — enter the current one from your app. | Discriminated: the code rotated before submit |
| `passwordErrors.weak` | Your password needs at least 12 characters. | Matches sign-up validation |
| `passwordErrors.network` | You appear to be offline. Check your connection and try again. | Discriminated: network (reused) |
| `passwordErrors.server` | Something went wrong on our side — your information is safe. Try again in a minute. | Discriminated: server (reused) |
| `passwordErrors.rateLimited` | Too many attempts. Wait a minute, then try again. | Discriminated: rate-limit (reused from #40) |
| `passwordErrors.samePassword` | That's already your password — choose a new one. | Discriminated: the new password equals the current one (SUP-7; was a misleading 502). Plain + actionable; reveals nothing about the account. |
| `a11y.resetRequested` | If an account exists, a reset link is on its way. | aria-live on submit |
| `a11y.passwordUpdated` | Password updated. Taking you to sign in. | aria-live on success |

## Terminology consistency
- **"Reset link"** (never "recovery token" / "magic link").
- **"Set a new password"** / **"new password"** (never "change credentials").
- **"Passkey"** for the second factor (consistent with WLT-6) — and we **always** remind the user it's still required after a reset.
- The "sent" confirmation is **word-for-word identical** whether or not the email is registered.

## DRI Log

### Decisions
- [2026-06-14] [UX Writer] **"Check your email" + existence-agnostic body** — rationale: the anti-enumeration guarantee must hold in the copy, not just the backend; the same words show for any email — area: security/tone
- [2026-06-14] [UX Writer] **Success copy names the passkey** ("you'll still use your passkey") — rationale: pre-empts the confusion of a passkey prompt right after a password reset — area: comprehension
- [2026-06-14] [UX Writer] **Expired-link copy is routine, not an error** ("can only be used once") — rationale: expired links are normal + expected; framing them as failures alarms an already-stressed user — area: tone

### Risks
- _none — internal-consistency only._

### Issues
- _none_
