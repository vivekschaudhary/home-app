---
id: SUP-8
type: fix
bet: WLT-1
story: null
hygiene: false
severity: P3
status: in-fix
reporter: engineering (surfaced by the SUP-7 triage)
created: 2026-06-15
author: Support
area_tags: [auth, observability]
---

# Triage / Audit: the "blanket error code" anti-pattern across the auth handlers

## Issue

The same anti-pattern — a handler collapsing several *discriminable, user-actionable* failures into one opaque code — bit twice: `signIn` (#40, "everything → wrong password") and `updatePassword` (SUP-7, "everything → 502"). SUP-7 also showed the second-order cost: with **no server-side logging of the real code**, the first fix was built against an *inferred* trigger and was wrong. This audit sweeps the remaining auth handlers in `@vc1023/passkey-2fa` for the same collapse + missing observability.

## Audit (every handler in `packages/passkey-2fa/src/routes.ts`)

| Handler | Error handling | Verdict |
|---|---|---|
| `signIn` | `mapSignInError` (#40) | ✅ discriminated + logs the code |
| `updatePassword` | `mapUpdatePasswordError` + `insufficient_aal→mfa_required` (SUP-7) | ✅ discriminated + logs |
| `totpEnrollVerify`, `totpChallengeVerify` | `result.reason` (`invalid_code`/`expired_code` via `classifyVerifyError`) | ✅ discriminated |
| `totpEnrollStart`, `totpUnenroll` | `result.error`/`result.reason` (`already_enrolled`/`no_factor`/`last_factor`) | ✅ discriminated |
| `registerVerify`, `authenticateVerify` (passkey) | `verify` on `!verified` | ✅ acceptable (single meaningful failure) |
| `requestPasswordReset` | always `ok` (anti-enumeration) | ✅ by design |
| auth guards (`registerOptions`/`authenticateOptions`/`factorsList`/`signOut`/`totpChallengeVerify`: `!user → server`) | generic `server`/401 | ⚠️ semantic nit — "not authenticated" isn't a user-actionable discriminable error; the client treats it as an auth failure. **No change** (out of scope; not the harmful pattern). |
| **`signUp`** | **`if (error \|\| !data.user) → server, 400`** — every failure collapsed, **and nothing logged** | **❌ the residual instance** |

**Conclusion:** the pattern is *contained* — the two harmful instances are fixed. The one residual is **`signUp`**: it collapses to `server` and logs nothing, so a real signup failure would again be an inference guess (the SUP-7 trap).

## Fix (scoped, anti-enum-safe)

Add `mapSignUpError` (mirrors `mapSignInError`) + log the real code:
- `weak_password` (Supabase policy / leaked-password protection, on a password that passed our ≥12 gate) → `validation_password` ("choose a stronger one"), not `server`.
- rate limit (`over_request_rate_limit` / status 429) → `rate_limited`.
- **everything else → `server`** — deliberately including a Supabase "email already registered" error, to preserve the app's **anti-enumeration** posture (sign-in + reset already obfuscate; sign-up must not become the enumeration side-channel). The common existing-email case is already handled by Supabase's obfuscated no-session path → `email_confirmation_required`, not the error path.
- Add `console.warn("[signUp] auth error", { code, status })` — the SUP-7 observability lesson: never infer a code you can log.

## Severity rationale

**P3.** No user is blocked today (the discriminable signUp cases — weak, rate, existing-email — are largely pre-handled by the ≥12 schema, the handler's own limiter, and Supabase's obfuscation). The value is **uniformity** (all three credential handlers now discriminate + log) so the *next* signup failure surfaces its real cause instead of a third inference round.

## DRI Log

### Decisions
- [2026-06-15] [Engineer] **Harden `signUp` for uniformity + add logging; leave the auth-guard `server`/401 nit alone** — rationale: signUp is the last credential handler without discrimination/logging; the guards aren't the harmful pattern — area: auth — reversibility: easy
- [2026-06-15] [Engineer/Security] **Do NOT reveal "email already registered" at sign-up** — rationale: the app is anti-enumeration (sign-in + reset obfuscate); revealing it at sign-up would re-open the enumeration vector the posture closes — area: security — alternatives: reveal "email taken" for UX (rejected — breaks anti-enum) — reversibility: easy

### Risks
- [2026-06-15] [Engineer] **Low value if weak/rate are pre-gated** — likelihood: high — impact: low — mitigation: the real win is the added logging + uniformity, not the rare discriminated case — area: scope

### Issues
- _none — this audit closes the recurring-anti-pattern issue opened in #40 / SUP-7._
