---
workflow: fix
step: 1
agent: engineer
task: triage-and-fix
generated: 2026-06-23 15:50
---

PR opened: **https://github.com/vivekschaudhary/home-app/pull/107**

Branch pushed and PR created. (The "22 uncommitted changes" warning is the pre-existing unrelated dirty files in the working tree — none of them are part of my changeset, which is the 5 files in the two commits.)

---

## TL;DR
- **Shipped**: preview-gated AAL2 TTL + renewal-window env overrides in `packages/passkey-2fa/src/aal2.ts` — honored only when `VERCEL_ENV != "production"`; prod always uses baked-in defaults.
- **Tests green**: 12 new gating unit tests (committed *before* the fix, TDD) + full 41-test package suite + production build.
- **PR open**: https://github.com/vivekschaudhary/home-app/pull/107

## Files created / modified
| Path | Change |
|---|---|
| `packages/passkey-2fa/src/aal2-constants.test.ts` | **created** — 12 gating unit tests (`regression: true`, `e2e: false`) |
| `packages/passkey-2fa/src/aal2.ts` | modified — `aal2TtlSeconds()` / `aal2RenewalWindowSeconds()` + `AAL2_RENEWAL_WINDOW_SECONDS` constant + preview gate |
| `packages/passkey-2fa/src/guard.ts` | modified — `setAal2Cookie` `maxAge` tracks effective TTL (consumer sweep) |
| `packages/passkey-2fa/.env.example` | modified — documents both vars as preview/dev/test-only |

## Production-build artifact verification
Next 15 build green. Inspected: `middleware-manifest.json` → middleware registered (`/` + auth matcher); `app-paths-manifest.json` → `/(app)/settings/security` + auth routes registered; **`VERCEL_ENV` gate compiled into 7 server route chunks** — the preview-gate survives bundling and runs at request time. `AAL2_TTL_SECONDS` resolves as a runtime `process.env` read (correct for a server-only var: each environment reads its own value).

## Open questions / risks
- **Naming decision**: task said `aal2-constants.ts`; that file doesn't exist — constants live in `aal2.ts`. Per `[refuse-escalate]` I did not split the source of truth into a parallel file. Flag if a standalone `aal2-constants.ts` is actually required.
- **Pre-existing typecheck error** in `app/(app)/transactions/TransactionsClient.test.tsx` (`isFollowup` optionality) — present on the dirty working tree before my change, **out of scope** for this defect. Worth a separate ticket.
- **`[per-surface-vertical-test]` flagged for Automation**: the override enables an E2E re-challenge / sliding-renewal spec on a preview deploy — unit gating proves the env-gate, not the runtime cookie-expiry render path.

**Next recommended command**: wait for Reviewer (different-host model) on PR #107; then `respond-to-review`.