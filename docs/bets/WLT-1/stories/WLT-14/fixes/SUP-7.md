---
id: SUP-7
type: fix
bet: WLT-1
story: WLT-14
hygiene: false
severity: P1
status: re-opened
reporter: dogfood (operator)
created: 2026-06-15
author: Support
area_tags: [auth, frontend, backend]
---

# Triage: Forgot-password "set a new password" POST returns 502

## Issue

A user completing password recovery clicks the email link, lands on `/reset` (the recovery session is established fine), enters a new password and saves — and the POST fails with a **502**. The reset cannot complete, so a user who came to recover their password is stuck. First item through the new support inbox (SUP-7).

## Reproduction

1. Sign-in → "Forgot password?" → submit email.
2. Open the emailed link → lands on `/reset` ("Set a new password"); the recovery session is valid (no "expired link" state).
3. Enter a password (≥12 chars) → **Save**.
4. The POST to `/api/auth/password/update` returns **502**; the UI shows the generic "something went wrong on our side" error.

**Expected:** the password updates and the user is sent to sign-in (or, if the password can't be used, a *clear, specific* reason).
**Actual:** a blanket 502 with no actionable reason.

## Environment

- Browser / OS / device: prod web (`home-app.kindtree.us`)
- Account type / role: a recovering user (AAL1 recovery session)
- Version / build: post-WLT-14 (PR #45); `@vc1023/passkey-2fa@0.4.0`
- Time of occurrence: 2026-06-15

## Severity rationale

**P1.** Password recovery — the WLT-14 feature's whole point — fails at the final step, and the error is a misleading 502 (no path forward for the user). Not P0: it's not data loss/security, and a passkey-protected account isn't exposed. Workaround: admin reset (the very gap WLT-14 exists to remove), so the feature is effectively inert for the affected case.

## Root cause (located)

`packages/passkey-2fa/src/routes.ts` `updatePassword` (L193–196): the recovery session is valid (`getUser()` succeeds, else it returns 401 `reset_link_invalid`), then `supabase.auth.updateUser({ password })` fails — and the handler maps **every** `updateUser` error to a blanket **502 `server`**:

```ts
const { error } = await supabase.auth.updateUser({ password: parsed.data });
if (error) { console.warn(...); return json({ ok: false, error: "server" }, 502); }
```

This is the **#40 class** (a discriminable auth error collapsed into one misleading code). The most likely *trigger*: Supabase rejects setting the password to **the one it already is** (`same_password`, HTTP 422) — this account was admin-reset to a known password minutes earlier and the user re-entered it. Breached/weak-policy (`weak_password`) rejections hit the same blanket path. The 502 is wrong for all of these — they're client-actionable, not server faults.

## Routing

Escalate to **Engineer** — a code fix in the WLT-14 handler (discriminate the `updateUser` error, mirroring the #40 `mapSignInError`). Regression-test-first. Bug originates in WLT-14 → fix lives under this story.

## DRI Log

### Decisions
- [2026-06-15] [Support] **P1, escalate to Engineer; bug originates in WLT-14's `updatePassword`** — rationale: prod recovery fails at the last step with a misleading 502; needs a code fix (error discrimination), not an L1 answer — area: auth — reversibility: n/a
- [2026-06-15] [Support] **Same class as #40** (blanket error mapping) but a distinct handler → a new fix, not a re-open of #40 — area: triage

### Risks
- [2026-06-15] [Support] **The specific `updateUser` code is inferred** (logs show it server-side) — likelihood: n/a — impact: low — mitigation: the fix discriminates ALL known codes + keeps the `console.warn`, so whichever it is now surfaces correctly — area: diagnosis

### Issues
- [2026-06-15] [Support] **Recurrence of the "blanket error code" anti-pattern** across auth handlers (signIn #40, now updatePassword) — severity: low — owner: Engineer — status: open (→ SUP-8) — area: auth — consider an audit of the remaining handlers for the same collapse.

## Re-open (2026-06-15) — the real root cause

PR #52 (v1) shipped the error-discrimination, but the **inferred trigger was wrong**. Prod logs after deploy: `[updatePassword] supabase error { code: 'insufficient_aal', status: 401 }` — NOT `same_password`. v1 mapped `insufficient_aal` to the `server` default → **still a 502** for the reporter. (The triage note's own Risk — "the specific code is inferred" — materialized.)

**Real root cause:** the account has a **Supabase-native TOTP factor** (enrolled in WLT-7). Supabase requires **AAL2** to change a password (a reset must not bypass MFA), but the recovery link only establishes an **AAL1** session — so `updateUser({ password })` returns `insufficient_aal`. WLT-14 never built a step to satisfy the second factor during recovery, so the flow dead-ends for any TOTP-enrolled user.

**The fix (v2, this PR):** add the authenticator step to recovery. On `insufficient_aal` the handler returns `mfa_required`; the reset page reveals an authenticator-code field; the user's code is verified **on the same Supabase client** (`verifyTotpChallengeOn` — `challengeAndVerify` upgrades that client's in-memory session to AAL2; a fresh client in the same request would read the old AAL1 cookies — the #36 lesson) → `updateUser` then succeeds. Wrong/expired codes are discriminated (`invalid_code`/`expired_code`); the v1 discrimination (`same_password`/weak/rate) is retained.

### Re-open decisions
- [2026-06-15] [Engineer] **v1 inferred the wrong code; v2 fixes the real cause (insufficient_aal)** — rationale: a password reset on an MFA account legitimately requires the second factor; build the TOTP step rather than weaken Supabase's AAL requirement (which would let an email link bypass MFA) — area: security — reversibility: medium
- [2026-06-15] [Engineer] **Elevate + update on the SAME client instance** — rationale: same-request cookie writes aren't readable back in the same request (#36); the in-memory AAL2 session is what `updateUser` must use — area: auth — reversibility: n/a
