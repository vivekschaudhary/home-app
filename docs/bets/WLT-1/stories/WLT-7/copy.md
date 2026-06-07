---
bet: WLT-1
story: WLT-7
author: UX Writer
created: 2026-06-07
---

> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-7 — Authenticator-app (TOTP) backup factor

## Voice and tone

Calm, plain, reassuring. The user is financially anxious and may not know what an "authenticator app" is. Teach the one term ("authenticator app"), never use jargon (**"TOTP", "OTP", "factor", "AAL2", "MFA"** are banned in UI). Frame the backup as protection ("so you don't get locked out"), not bureaucracy.

## Strings

| Location / ID | Final copy | Rationale (when non-obvious) |
|---------------|-----------|------------------------------|
| `security.title` | Security | Page heading |
| `security.subtitle` | How you sign in and protect your account. | |
| `security.passkey.label` | Passkey | |
| `security.passkey.status` | Added | Passkey is always present post-WLT-6 |
| `security.totp.label` | Authenticator app | The only term we teach here |
| `security.totp.empty.status` | Not set up | |
| `security.totp.empty.cta` | Add authenticator app | Says what it does |
| `security.totp.enrolled.status` | Added | Past-tense confirmation |
| `security.totp.enrolled.remove` | Remove | |
| `security.cancel` | Cancel | Neutral cancel for the enroll/remove dialogs (added during build) |
| `nudge.title` | Add a backup way to sign in | |
| `nudge.body` | Right now your passkey is the only way in. Add an authenticator app so you're not locked out if you lose your device. | The why, in plain terms |
| `nudge.cta` | Add a backup | |
| `nudge.dismiss` | Not now | Honest skip; non-committal |
| `totp.enroll.title` | Add your authenticator app | |
| `totp.enroll.body` | Scan this with an authenticator app like Google Authenticator, 1Password, or Authy, then enter the 6-digit code it shows. | Names familiar apps; sets expectation |
| `totp.enroll.manualKey.label` | Can't scan? Enter this key in your app | The text/a11y equivalent of the QR |
| `totp.enroll.manualKey.copy` | Copy key | Labelled, not icon-only |
| `totp.enroll.code.label` | 6-digit code | |
| `totp.enroll.cta` | Verify and add | Says what it does |
| `totp.enroll.loading` | Preparing… | While the QR/secret loads |
| `totp.enroll.verifying` | Verifying… | |
| `totp.enroll.success` | Authenticator app added. You now have a backup. | Past-tense; states the benefit |
| `totp.challenge.title` | Enter your authenticator code | |
| `totp.challenge.body` | Open your authenticator app and enter the current 6-digit code. | |
| `totp.challenge.code.label` | 6-digit code | |
| `totp.challenge.cta` | Verify | |
| `totp.challenge.verifying` | Verifying… | |
| `totp.challenge.retry` | Try again | |
| `totp.challenge.usePasskey` | Use your passkey instead | Back-link to the passkey challenge |
| `signin.useAuthenticator` | Use your authenticator app instead | The fallback link on the passkey challenge |
| `signin.noBackup.title` | Can't use your passkey? | Shown when no backup exists |
| `signin.noBackup.body` | This account doesn't have a backup set up yet. Contact support and we'll help you get back in. | Honest; no fake self-serve path (WLT-8) |
| `totp.remove.confirm.title` | Remove your authenticator app? | Destructive confirm |
| `totp.remove.confirm.body` | You'll go back to using only your passkey. You can add an authenticator again anytime. | |
| `totp.remove.confirm.cta` | Remove | |
| `totp.remove.lastFactor` | You can't remove your only backup while it's your sole protection. Add another way to sign in first. | Last-factor lockout guard |
| `errors.totp.invalid_code` | That code isn't right. Check your authenticator app and try again. | Discriminated: wrong code |
| `errors.totp.expired_code` | That code expired. Enter the current one from your app. | Discriminated: expired |
| `errors.totp.already_enrolled` | You already have an authenticator app set up. | Discriminated: duplicate |
| `errors.network` | You appear to be offline. Check your connection and try again. | Reused from WLT-6 |
| `errors.server` | Something went wrong on our side — your information is safe. Try again in a minute. | Reused from WLT-6 |
| `signin.success` | Welcome back. | First sign-in toast only (reused) |
| `a11y.code.hint` | Enter the 6 digits from your authenticator app. | Screen-reader hint for the code field |
| `a11y.copyKey.done` | Key copied | aria-live confirmation |

## Terminology consistency
- **"Authenticator app"** (never "TOTP", "OTP", "2FA app", "token") — the single new term.
- **"6-digit code"** (never "OTP", "one-time password", "token").
- **"Passkey"**, **"Sign in / Sign out"** — carried from WLT-6, unchanged.
- **"Backup"** for the second factor in user-facing prose (warm, clear).

## DRI Log

### Decisions
- [2026-06-07] [UX Writer] Ban "TOTP/OTP/factor/MFA" in UI; teach only "authenticator app" + "6-digit code" — rationale: financially-anxious persona; jargon erodes the trust this surface must build — area: terminology
- [2026-06-07] [UX Writer] No-backup copy points to support, makes no self-serve recovery promise — rationale: WLT-8 owns support-gated recovery; promising it now is a fake door — area: scope honesty

### Risks
- [2026-06-07] [UX Writer] "Authenticator app" still unfamiliar to some users — likelihood: medium — impact: low — mitigation: name concrete apps (Google Authenticator/1Password/Authy) in the enroll body — area: comprehension

### Issues
- _none_
