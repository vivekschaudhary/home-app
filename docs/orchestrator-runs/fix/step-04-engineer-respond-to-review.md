---
workflow: fix
step: 4
agent: engineer
task: respond-to-review
generated: 2026-06-23 16:11
---

All pushed. Here's the task summary.

---

## TL;DR
- **All 4 Reviewer findings addressed** on PR #107 — and the demanded `[mechanical-output-verification]` pass on the production *bundle* surfaced a real defect the green build had hidden: the gate was dead-code-eliminated and misclassified Vercel preview as prod.
- **72 passkey-2fa tests** (was 41) + **373 full-suite** green · typecheck + lint clean · prod build green with runtime-artifact inspection confirming the override branch is **live**.
- Pushed `fix:` + response comment + re-requested review: https://github.com/vivekschaudhary/home-app/pull/107

## Files modified
| Path | Change |
|---|---|
| `packages/passkey-2fa/src/aal2.ts` | modified — `overrideAllowed()` VERCEL_ENV allowlist gate (fail-closed) + bounded `positiveIntEnv()` `[1, AAL2_TTL_SECONDS]` |
| `packages/passkey-2fa/src/aal2-constants.test.ts` | modified — 40 tests (fail-closed matrix, Vercel-preview-shape regression, malformed/extreme values) |
| `packages/passkey-2fa/src/guard-cookie.test.ts` | **created** — `setAal2Cookie` maxAge == `aal2TtlSeconds()` in seconds |
| `packages/passkey-2fa/.env.example` | modified — documents `[1,3600]` bound + fail-closed contract |
| `docs/role-activity/engineer.md` | **created** — logged the NODE_ENV-inline constant-fold pattern |

## The three proofs the task demanded — all verified, not asserted
1. **FAIL-CLOSED** — unknown/empty/`"staging"`/`"prod"`/unset VERCEL_ENV → production → default. Pinned by the "fail-closed across environment values" suite.
2. **Production ignores the envs entirely** — `VERCEL_ENV=production` (and self-hosted `NODE_ENV=production` with VERCEL_ENV unset) → baked-in 3600/300. Bundle inspection: prod chunks return the default; the override read is gated off.
3. **Malformed → secure default, never unbounded** — `/^\d+$/` + `[1,3600]` clamp rejects `""`, `"1.5"`, `"1e9"`, `"-1"`, `MAX_SAFE_INTEGER`, `default+1`; can only shorten, never lengthen.

## Production-build artifact verification
Inspected `.next/server/app/api/**/route.js`. **Before:** `aal2TtlSeconds` minified to `function h(){return process.env.VERCEL_ENV,3600}` — override read **dead-code-eliminated** because `NODE_ENV` is inlined and folded the gate to `||!0`, and Vercel sets `NODE_ENV=production` on preview. **After:** `function j(){...process.env.VERCEL_ENV; if(...)return h.has(a)...process.env[a]...3600}` — the VERCEL_ENV branch + dynamic override read + default are **live in the bundle**. (The remaining `||!0` fold is `config.isProd` for the WebAuthn checks — a different function that *should* fail-loud in prod.)

## Disputes
None — I accepted all four findings. The BLOCKER was resolved by your suggested allowlist, which turned out to also fix a deeper Next.js inline/constant-fold defect.

## Open risk flagged for Automation (`[per-surface-vertical-test]`)
The override is now genuinely live on preview — the deferred WP3 vertical (real auth → short-TTL via override → sliding-renewal/re-challenge render) is now meaningfully testable once WP2 deploy-preview CI exists.

**Next recommended command:** wait for Reviewer re-review on PR #107.