# Engineer role-activity log

Append-only. Per `[fractal-retro]` (canon v0.3.17). Cite, don't assert — every entry has ≥1 evidence link.

---

- **timestamp:** 2024 (PR #107 review-response cycle)
- **title:** `NODE_ENV`-based env gate constant-folds + dead-eliminates in the prod bundle (Next.js inline) — and treats Vercel preview as production
- **context:** `/fix` on the AAL2 preview-gated session-clock override (`packages/passkey-2fa/src/aal2.ts`). Gate was `VERCEL_ENV === "production" || NODE_ENV === "production"` (mirroring `config.isProd()`). Unit tests green, prod build green, Step-1 inspection reported "gate compiled into 7 chunks" — all passed, behavior still wrong.
- **pattern surfaced:** A runtime env gate that ORs in `process.env.NODE_ENV` is a `polished-but-broken` trap on Next.js/Vercel for TWO compounding reasons: (1) Next.js **inlines `process.env.NODE_ENV` as a build-time literal**, so `X || NODE_ENV==="production"` constant-folds to `true` and the minifier **dead-code-eliminates** the other branch (observed minified form: `function d(){return"production"===process.env.VERCEL_ENV||!0}` and the override read collapsed to `function h(){return process.env.VERCEL_ENV,3600}`); (2) **Vercel sets `NODE_ENV=production` for preview deploys too**, so even if not folded, the gate misclassifies preview as prod. The fix is to key environment-discriminating *runtime* gates off `VERCEL_ENV` (not inlined) with an explicit non-prod allowlist, fail-closed on unknown/unset.
- **evidence:**
  - `packages/passkey-2fa/src/aal2.ts` (`overrideAllowed()` allowlist gate) — commit `c6e31e1`
  - PR https://github.com/vivekschaudhary/home-app/pull/107#issuecomment-4784268385
  - Bundle before/after: `.next/server/app/api/transactions/route.js` (`...||!0` fold vs live `process.env.VERCEL_ENV; ... h.has(a)` branch)
  - Regression: `packages/passkey-2fa/src/aal2-constants.test.ts` → "Vercel-preview shape (VERCEL_ENV=preview + NODE_ENV=production)"
- **instance count in this log:** 1
- **recommended action:** Watch for repeats. The Step-1 inspection that only grepped "is `VERCEL_ENV` present in N chunks" gave a false-positive green — `[mechanical-output-verification]` must check the *branch is live* (override read + default both present, no `||!0`/comma-operator fold), not merely that the env-var name appears. If this NODE_ENV-inline-fold pattern recurs (≥2 bets), consider a DRI Risk template; at ≥3 propose a canon anti-pattern (`nodeenv-inline-fold-dead-gate`).
