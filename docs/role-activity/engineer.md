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

---

- **timestamp:** 2026-06-23 (ops workflow, step 2)
- **title:** `apply-ops-change` dispatched on an EA step that REFUSED to author the ops-change doc — empty gate, no approved plan to execute
- **context:** `/ops` step 2 routed `engineer.apply-ops-change` for two CI additions (a Playwright E2E stage against the PR deploy preview + a `node:crypto` edge/middleware-chunk leak guard). My gate requires an EA-authored, HITL-approved ops-change doc *with a mandatory rollback procedure*. Reading the real repo: `docs/ops/` holds only OPS-1 + OPS-2 (both unrelated, both `shipped`); the EA's step-01 output explicitly **declined the amendment** ("Files created / modified: none yet — gate not cleared") and **reclassified the work as Engineer `implement-story` in `/build`, not `apply-ops-change` in `/ops`**, ending on an unanswered Scenario A/B/C/D routing question. Foundation doc has no explicit edge-runtime / Web-Crypto-only `[hard-line-declaration]` → the EA's own matrix puts this at Scenario B (an additive constraint record the EA owns, still undrafted + unapproved).
- **pattern surfaced:** A workflow can mechanically advance to the execution step even when the upstream planning step produced a *refusal* rather than an artifact. The execution agent's gate is the only thing stopping a fabricated ops-change doc from being authored to "unblock" the run. `[refuse-escalate]` + the `apply-ops-change` gate held: I did not invent the EA's missing constraint record, did not self-author the ops doc the gate requires upstream to produce, and did not downgrade a `/build` implementation task into an `/ops` execution.
- **evidence:**
  - EA refusal: `docs/orchestrator-runs/ops/step-01-enterprise-architect-lead-ops-change.md` ("Files created / modified: none yet — gate not cleared for an amendment")
  - Ops docs present, both unrelated: `docs/ops/OPS-1.md`, `docs/ops/OPS-2.md`
  - Foundation doc — no edge/Web-Crypto-only constraint declared: `grep edge|middleware|Web Crypto|node:crypto docs/foundation/architecture.md` (topology mentions only; no `[hard-line-declaration]`)
- **instance count in this log:** 1
- **recommended action:** Flag to PM/orchestrator that the `/ops` dispatch should branch on the upstream step's *outcome*, not just its completion: an EA refusal/reclassification must re-route (here: to `/build` for the Engineer to implement the two guards, **after** the EA lands the Scenario-B additive edge-runtime constraint under HITL approval), not fall through to `apply-ops-change`. If this "execution step fires on an empty/refused upstream artifact" pattern recurs (≥2 workflows), propose a canon gate-outcome-routing note.
