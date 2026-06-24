---
workflow: fix
step: 2
agent: automation
task: write-e2e-tests
generated: 2026-06-23 15:53
---

## Gate evaluation

**Gate for `write-e2e-tests`:** Story `status: ready`, design spec (if UI), Engineer's `implement-story` postconditions met.

Engineer's postconditions are met (PR #107 open, 41-test suite + build green). Now I evaluate whether E2E is the correct instrument for *this* changeset.

## Surface analysis — is there a user-facing vertical here?

I applied `[per-surface-vertical-test]`'s own trigger condition: it fires for **each data surface (view/route reading or writing authorization-gated data)**. Let me check what this change actually touches at runtime:

| Code path | Prod behavior | New behavior introduced |
|---|---|---|
| `aal2TtlSeconds()` / `aal2RenewalWindowSeconds()` | reads env, **gated off when `VERCEL_ENV == "production"`** → falls back to baked-in defaults | none — prod path is byte-identical to pre-change |
| `setAal2Cookie` `maxAge` | tracks effective TTL | in prod, effective TTL = default → **no observable change** |
| `.env.example` | docs only | none |

**Conclusion:** the production user flow (auth → AAL2 cookie → security route render) is **unchanged**. There is no new authz-gated surface, no new render path, no new user-traversable vertical. The only new behavior is a **test seam** that activates exclusively in non-prod. E2E exists to catch runtime/render-contract failures on real verticals — there is no new vertical to traverse.

The Engineer already proved the gate two ways: 12 unit tests on the gating logic, and **mechanical build-artifact inspection** confirming the `VERCEL_ENV` gate compiled into 7 server chunks and survives bundling. That is the correct verification for a compile-time/runtime env gate — not E2E.

## Decision: skip E2E for this step — documented refusal, not silent

Per `[failure-mode-first]` and `[per-surface-vertical-test]`, I do **not** write E2E that only proves a seam an E2E can't even exercise in prod (the seam is off in prod by definition). Writing a "preview-only E2E" here would be theater: it would test the test-infrastructure, not a user outcome.

**The consuming vertical IS real and DOES need E2E** — but it is correctly scoped to a separate story:

- **WP3 (separate story):** concurrency / session-persistence E2E that *consumes* this seam — authenticate as a real user on a deploy preview → set short TTL via the env override → exercise sliding-renewal / re-challenge → assert cookie expiry + re-auth render path. This is a genuine `[per-surface-vertical-test]` vertical (real auth → authz → render).
- **WP3 depends on WP2** (deploy-preview CI), which doesn't exist yet — so WP3 cannot run on a prod-equivalent runtime today. Writing it now would violate "tests must run against prod-equivalent runtime, not localhost."

I am **not** silently degrading — I am recording the deferred E2E as an explicit downstream obligation so it cannot be lost.

## DRI Decision logged

> **Decision:** No new E2E for the AAL2 TTL/renewal preview-seam (PR #107).
> **Rationale:** Change is `VERCEL_ENV`-gated off in production → zero new user-facing vertical, zero new authz-gated surface, zero render-path change in prod. The seam is inert in the environment E2E would assert against. Gate verified correctly via 12 unit tests + build-artifact gate-compilation inspection.
> **Downstream obligation (does not block this PR):** WP3 concurrency/session-persistence E2E consumes this seam and IS a real `[per-surface-vertical-test]` vertical (real auth → authz → render on a deploy preview). It is blocked on WP2 (deploy-preview CI) and must run on a prod-equivalent runtime — not localhost. Tracked as a separate story.

## Postcondition reconciliation

The standard postcondition ("E2E for every AC item; every data surface has a real vertical test") is satisfied by **scoped n/a with rationale**, which the task contract explicitly permits:

- E2E coverage — **n/a for this changeset — no production user-flow surface; change is preview-only test seam, inert in prod.**
- Per-surface vertical test — **deferred to WP3 (the consuming vertical), blocked on WP2 deploy-preview CI; cannot run prod-equivalent today.**
- Data-mutating test cleanup — **n/a — no tests added; no records created.**
- CI green — Engineer reports 41-test suite + build green on PR #107.

---

## TL;DR
- **Shipped:** no new E2E — correctly skipped. This changeset is a `VERCEL_ENV`-gated preview-only test seam; it is inert in production and introduces **no new user-facing vertical or authz-gated surface** for E2E to traverse. Verification of the gate is unit + build-artifact inspection (already done by Engineer).
- **CI status:** green (41 unit tests + production build) on PR #107 — unchanged by this step.
- **Deferred (not lost):** the real consuming vertical (WP3 concurrency/session-persistence E2E) is tracked as a separate story, blocked on WP2 deploy-preview CI; it cannot run prod-equivalent until WP2 lands.

## Files created / modified
None. No E2E written for this step (documented n/a, not silent skip).

## Pipeline verification
- **Did not re-run CI** — no new test artifacts to validate. Relying on Engineer's reported green: 41-test package suite + Next 15 production build, with `VERCEL_ENV` gate confirmed compiled into 7 server chunks.
- **Mechanical-output note:** the gate's correctness rests on build-artifact inspection (gate survives bundling) + unit tests (honored non-prod / ignored prod) — the correct instrument for a compile/runtime env gate. E2E would assert against prod, where the seam is intentionally off.

## Next recommended command
`reviewer` on PR #107 (different-host model) — already pending per Engineer's handoff. After review: Engineer `respond-to-review`. Separately, queue **WP2 (`configure-ci` — deploy-preview pipeline)**, which unblocks **WP3 (the consuming session-persistence E2E vertical)**.