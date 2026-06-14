---
bet: WLT-1
story: WLT-14
author: Designer
created: 2026-06-14
---

# Design: WLT-14 — Forgot password: self-serve reset

## Design intent

This is a **recovery** moment — the user is locked out and anxious. The flow must feel calm, certain, and short: one field to ask, one clear "check your email," one field to set the new password, done. It reuses the existing auth-screen shell (the `AuthCard` from WLT-6) so it reads as part of the same trusted surface. **Honesty about security** is the tone: we say what's happening ("we've sent a link if that account exists") without over-explaining, and we never hint at whether an email is registered.

## Flow

```
[Sign in] ──"Forgot password?"──▶ [A] /forgot (enter email)
                                       │ submit (always succeeds)
                                       ▼
                                  [B] "Check your email"  ──(email link)──▶ [C] /reset (set new password)
                                                                                 │ save
                                                                                 ▼
                                                                            [D] "Password updated" ──▶ [Sign in]
   email link expired/used ─────────────────────────────────────────────▶ [E] "Link expired" → back to /forgot
```

## Screens & states

| Screen | State | What shows |
|---|---|---|
| **[A] /forgot** | request | `AuthCard`: heading, one **Email** field, **Send reset link** primary, a "Back to sign in" link. Loading → button spinner. |
| **[B] /forgot** | sent (success) | Replaces the form with a calm confirmation: *"If an account exists for {email}, we've sent a reset link."* + "Back to sign in." **Identical for known + unknown emails** (anti-enumeration). |
| **[C] /reset** | valid recovery session | `AuthCard`: heading, **New password** field (with show/hide + strength, reusing WLT-6's `PasswordField`/`PasswordStrength`), **Set new password** primary. |
| **[D] /reset** | success | Confirmation: *"Your password's updated."* + the **second-factor note** ("you'll still use your passkey to sign in") + **Go to sign in** primary. Focus moves here. |
| **[E] /reset** | invalid / expired / used link | Plain, non-alarming: *"This reset link has expired or already been used."* + **Request a new link** → `/forgot`. No password field shown. |
| any | error (network/server) | Inline `Banner` (discriminated per copy); the form stays, retryable; no data lost. |

## Sign-in entry (AC1)
A muted **"Forgot password?"** link beneath the password field on the sign-in screen — present, not prominent (it's a recovery path, not the happy path).

## Accessibility
- Each screen is a single labeled form; logical tab order; the primary button is the default submit.
- **Focus management:** on submit-success, focus moves to the confirmation heading (`tabIndex=-1`); on the reset success, focus lands on "Password updated."
- Async ("Sending…", "Saving…") announced via `aria-live="polite"`; the success line via `role="status"`.
- Password field: show/hide is keyboard-operable + labeled; strength meter is not the only signal (text accompanies). WCAG AA contrast; reduced-motion (no animated transitions when set).

## Honesty / security notes (load-bearing)
- **[B] is identical regardless of whether the email exists** — same copy, same layout, no extra latency. The design must not branch visibly on account existence.
- The **second-factor note on [D]** is required — a user who just reset their password will otherwise be confused when the passkey prompt appears.
- **[E]** is framed as routine ("expired or already used"), never as an error/failure — expired links are normal.

## DRI Log

### Decisions
- [2026-06-14] [Designer] **Reuse the `AuthCard` shell + WLT-6 password components** — rationale: recovery should feel like the same trusted surface, and reuse keeps the slice thin — area: UX — reversibility: easy
- [2026-06-14] [Designer] **The "sent" confirmation replaces the form and is existence-agnostic** — rationale: anti-enumeration has to be a *design* property, not just a backend one — area: security/UX — reversibility: easy
- [2026-06-14] [Designer] **Surface the second-factor note on success** — rationale: pre-empts the "I reset my password, why is it asking for a passkey?" confusion — area: comprehension — reversibility: easy

### Risks
- [2026-06-14] [Designer] **Email latency** can make [B] feel like nothing happened — likelihood: medium — impact: low — mitigation: the confirmation says a link is *on its way* + "check spam"; no spinner waiting on the email — area: UX

### Issues
- _none_
