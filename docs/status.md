# Project Status

_Last updated: 2026-06-12 — **🎉 the MVP bet portfolio is COMPLETE.** All 5 bets delivered: the loop runs (①②③④) AND measures itself (⑤). WLT-13 (the instrument panel) shipped to prod — KR4 done, the north star (WAWU) visible, the foundational hypothesis now falsifiable._

## In flight

_None — the MVP portfolio is complete (see Recently shipped). Open follow-on tracks: WLT-4's remaining 5 archetypes (one story each on the shipped engine), and the deferred post-MVP items in `portfolio.md` (anomaly detection, marketplace, billing). Next strategic move is the team's: ship/observe (let real traffic populate the instrument panel → `/measure`) or start a follow-on bet._

**WLT-5 — TTFV + WAWU instrumentation — `shipped`** (2026-06-12). The last MVP bet, delivered in one story (WLT-13). Compute + surface what the loop already emits (no new events; the 17-event contract frozen). **Loop now measures itself.**
- **WLT-13 (The instrument panel) — `shipped`** (PR #34, 2026-06-12, live in prod). `0007` read-only views (TTFV full-loop clock + p80 + split times · weekly WAWU · funnel conversion; SELECT revoked from authenticated/anon — Postgres views bypass base-table RLS, so the revoke is the boundary) · `/admin/metrics` (**AAL2 + `ADMIN_EMAILS` allow-list, every unauthorized state → 404 via `getAal2UserId()`+`notFound()` — unenumerable**) · `metrics-snapshot.mjs` → `docs/metrics/` for `/measure` · honest small-n (n everywhere, no-KR-verdicts banner). First baseline recorded: **WAWU=1**. Cross-model Codex **Approve** + Security **clean** after 3 rounds (AC11 route+no-PII E2E → AC5 signed-out redirect→404); gate E2E 3/3 live.

**WLT-4 — Workflow engine + pre-built workflows** — brief + architecture `approved` (2026-06-11); **building**. The MVP-loop **convergence point**: consume the declared `Goal` (WLT-3) + real data (WLT-2) → auto-assemble a personalized running workflow → surface one platform-prompted action (`WorkflowRun` = the WAWU north-star unit). Scope (PM-elicited): **template-select + personalize** (composition/marketplace deferred); **one workflow per Goal.kind** via a ~6-archetype registry mapping all 14 goalKinds (no dead-end). Architecture: 2 tables (`workflows`/`workflow_runs`), composite same-user FKs, immutable runs, two-phase assembly, no new tooling.
- **WLT-12 (Assemble + run your first workflow — net-worth snapshot) — `shipped`** (PR #31, 2026-06-11, live in prod). **The loop-closing story.** The engine end-to-end + `networth_snapshot` (5 goalKinds, balances-only): declare → plan-ready connect bridge → real net-worth snapshot → one-tap "set your target" → an **immutable `WorkflowRun` (the first WAWU event)** → "Running — tracking toward {target}". Engine: archetype registry + two-phase assembly + injectable `EngineStore` seam; the action commits via an **atomic SECURITY-INVOKER plpgsql function** (replay-guarded at two layers); `workflow.assemble`/`workflow.action` audit events; `workflow_assembled`/`action_completed` funnel events. Cross-model: 4 Codex rounds (funnel contract → loading state → engine tests/replay → **atomicity** + audit → E2E), Security **clean**. **Full-path E2E verified live** (19.5s, real stack). Other 9 goalKinds keep the WLT-11 placeholder until their archetype story (total-coverage = bet exit gate).
- **Later slices:** `savings_rule` · `spending_snapshot` · `budget_guardrail` · `cashflow_forecast` · `debt_payoff` (one per story, same engine) · scheduled execution (the "running" fast-follow).

**WLT-3 — Intent-first onboarding** — brief `approved`; **building**. Directive baked in: **intent-first, user-first** — declare intent *before* connecting (defer friction).
- **WLT-11 (Declare your intent — 6-cluster front door) — `shipped`** (PR #26, 2026-06-09, live in prod). The intent-first front door (Fear/Goal/Confusion/Control/Habit/Aspiration → starter intents) → persist `Intent` + derived `Goal` → "putting your plan together" placeholder → bridge to connect; `intent_declared` baseline event. Post-auth now lands here (session-scoped explore escape). Cross-model Codex code + security both **Approve** after 4 rounds — deepest catch: a **composite FK** `goals(intent_id,user_id)→intents(id,user_id)` blocking forged cross-tenant goal→intent links at the DB. Ships without WLT-4.
- **Later slices:** free-text intent expression · intent management (edit/add) · richer Goal params.

**WLT-2 — Account aggregation + CSV fallback** — brief + architecture `approved`; **building**.
- **WLT-9 (connect first bank via Plaid OAuth + initial sync) — `shipped` + activated in production** (PR #18). The `@wealth/aggregation` **pluggable** pipeline (provider-neutral core + Plaid adapter + Supabase Vault + Inngest backfill + owner-SELECT RLS + consent/accounts UI); cross-model Codex code + security both **Approve**. **Validated live** with a real Wells Fargo connection (real accounts + 154 transactions). Prod activation surfaced + fixed: Inngest config + app sync, an atomic link-rollback + Inngest preflight gate (PR #20), and a prod-DB cleanup (test-user cruft + a typo-account dupe purged).
- **WLT-10 (full-history backfill + webhook-driven sync) — `shipped`** (PR #28, 2026-06-11, live in prod). `days_requested:730` (24mo) + a **verified Plaid webhook** (ES256 JWT/JWK + body-hash + replay + ownership re-derivation) → debounced incremental re-sync, **6h cron fallback**, and an **"Importing your history…"** UI that settles on a server `history_synced_at` flag stamped only when sync activity **stabilizes** (consecutive quiet passes — not a clock). Cross-model Codex code **Approve** + Security **clean** after 6 rounds (premature-Connected → clock → unconditional-stamp → single-pass → consecutive-quiet). **Ops to light up real-time:** set `PLAID_WEBHOOK_URL` in Vercel (Production) + register with Plaid — cron completes full history until then.
- **Later slices:** re-auth/connection-health UI · CSV / email import · Statements (>24-month history) · 2nd provider (KR2).
- **Open ops note:** prod Supabase **Site URL** still `localhost:3000` (fix → `https://home-app.kindtree.us` so TOTP issuer + email links are correct); two old Plaid items un-revoked on Plaid's side (remove via Plaid dashboard if desired).

WLT-6 + **WLT-7 — authenticator-app (TOTP) backup factor — `shipped`** (2026-06-07). **WLT-8** (support-gated recovery, both-factors-lost) is **parked** by decision: revisit once WLT-7 is in real use and backup-adoption is measured — not auto-queued.

## Next up (from `docs/foundation/plan.md`)

_The MVP portfolio is delivered — these are **follow-on tracks**, the team's choice, not a critical path:_

| Track | What | Why |
|-----|-------|----------|
| **Observe** | let real traffic populate the instrument panel → run `/measure WLT-5` weekly | the baselines (TTFV/WAWU/Day-30) decide whether the foundational bet is validated — read before building more |
| WLT-4 breadth | the remaining 5 archetypes (`savings_rule` → `debt_payoff`), one story each on the shipped engine | every declared intent gets a matching workflow (total-coverage test = bet exit gate) |
| Post-MVP bets | anomaly detection · marketplace · billing (`portfolio.md` "deliberately out of MVP") | promote via `/create-brief <free-text>` when the loop's baseline justifies the next wedge |

**Loop status: ①②③④⑤ — the MVP bet portfolio is COMPLETE** (shipped ~3 weeks ahead of the ~2026-07-01 forecast). The loop runs and measures itself.

## Awaiting human approval

_None._ All 5 MVP bets are promoted, approved, and **shipped**.

## Recently shipped

- **WLT-13 — The instrument panel (TTFV + WAWU + funnel)** — `shipped` 2026-06-12 to production (PR #34); **the final bet of the MVP portfolio**. Read-only Postgres views over the loop's events compute **TTFV** (signup→action, p80 vs 180s, split times), **weekly WAWU** (the north star — first reading: 1), and **stage funnel conversion**; an AAL2 + allow-list `/admin/metrics` page renders them (every unauthorized state → 404, unenumerable; aggregates only, n everywhere, no PII), and `metrics-snapshot.mjs` records dated `docs/metrics/` snapshots for `/measure`. View SELECT revoked from `authenticated`/`anon` (views bypass base-table RLS → the revoke is the boundary). 94 tests + a 3-case live gate E2E; Codex **Approve** + Security **clean** after 3 rounds. **Makes the foundational hypothesis falsifiable (KR4/KR5/KR3).**
- **WLT-12 — Assemble + run your first workflow (engine + net-worth snapshot)** — `shipped` 2026-06-11 to production (PR #31). **The loop-closing story**: a declared `Goal` + real balances auto-assemble into a personalized workflow with one platform-prompted action; completing it writes the **first immutable `WorkflowRun` — the first WAWU event**. Archetype registry (`networth_snapshot`, 5 goalKinds) + two-phase assembly (select at declare → personalize post-connect) + an **atomic SECURITY-INVOKER action commit** (replay-guarded at two layers: in-transaction check + `unique(workflow_id, kind)`) + audit trail (`workflow.assemble`/`workflow.action`) + funnel events. 86 tests incl. live-PG RLS (forged composite-FKs both directions, run immutability, the RPC driven as an authenticated user); **full-path E2E verified live** (19.5s). 4 Codex rounds + Security clean — deepest catch: the **non-atomic action commit** whose half-failure would have stranded workflows un-recoverably behind the replay guard.
- **WLT-10 — Full-history backfill + webhook-driven sync** — `shipped` 2026-06-11 to production (PR #28); deepens WLT-2 from the recent ~90 days to the full **24 months** + keeps it fresh. `days_requested:730`; a **verified public Plaid webhook** (ES256 JWT vs Plaid JWK cached by `kid` + body-sha256 + `iat` replay-guard + item→connection ownership re-derivation) → **debounced** incremental refresh; **6h cron** missed-webhook fallback; `needs_reauth`/`error` health + `CONNECTION_ERROR` funnel signals. The **"Importing your history…"** UI derives from a server `history_synced_at` flag stamped only when sync activity **stabilizes** (consecutive quiet passes, via the pure unit-tested `settleHistory`) — survives reload, correct in both directions. 60 tests; cross-model Codex **Approve** + Security **clean** after 6 rounds. **Real-time webhooks pending one ops step:** `PLAID_WEBHOOK_URL` in Vercel (cron completes full history until set).
- **WLT-9 — Connect first bank via Plaid OAuth + initial sync** — `shipped` 2026-06-08 to production (PR #18), **activated** (prod Plaid keys live, Production-only scope); the first WLT-2 aggregation story and the moment the loop touches **real money**. Built the `@wealth/aggregation` pluggable pipeline (provider-neutral core → never imports Plaid; isolated Plaid adapter; Supabase Vault token store — 0 tokens in tables; Inngest 90-day backfill, cursor-after-commit; owner-SELECT-only RLS, service-role writes; consent → unwrapped Plaid Link → connected-accounts → disconnect). 40 tests (+ live-PG RLS), cross-model Codex code + security review both **Approve**. Prod deploy in flight; **production Plaid keys pending** (ships dark via `check-env` until set).
- **WLT-7 — Authenticator-app (TOTP) backup factor** — `shipped` 2026-06-07 (PR #12). Optional TOTP second factor + sign-in fallback; closes the passkey-lockout DRI risk. Codex code + Security review clean (cross-model); 3 review rounds + an independent package audit (fixed credential-table RLS + signing-key hardening). Published as **`@vc1023/passkey-2fa@0.3.0`** (password + passkey + authenticator).
- **`@vc1023/passkey-2fa` published to npm** — 0.1.1 → 0.2.0 → **0.3.0**; reusable password + passkey + authenticator(TOTP) 2FA for Next.js + Supabase, extracted from WLT-6.
- **WLT-6 — Sign up with passkey MFA + sign in** — `shipped` 2026-06-06 to production (`home-app.kindtree.us`); PR #2; Codex review + Security review approved; full passkey E2E green.
- **Foundational architecture bet** — `approved` 2026-06-05 (+ **ADR-001**: passkey via custom WebAuthn, TOTP as Supabase-native fallback).
- **MVP bet portfolio + plan + product + research + architecture** — all `approved` 2026-06-05.

## Blockers

_None._

## Risks

- **Optional TOTP backup (WLT-7)** — users who skip the nudge stay single-factor (passkey-loss lockout persists) — likelihood: med / impact: med — mitigation: prominent nudge + WLT-5 backup-adoption metric; WLT-8 support recovery is the floor — owner: PM
- **Republish `@vc1023/passkey-2fa` 0.2.0 → 0.3.0** for WLT-7 (TOTP added) while home-app consumes via workspace — likelihood: low / impact: med — mitigation: bump + republish only after build green — owner: Engineer
- **Self-built auth surface on a financial app** (custom WebAuthn + now TOTP/factor-removal) — likelihood: med / impact: high — mitigation: AAL2-gated, server-side verify, rate-limited, mandatory Security Review per build — owner: Security
- **PR previews don't fully exercise auth** — passkeys are domain-bound (`home-app.kindtree.us`); preview URLs render but auth completes only locally/prod — likelihood: low / impact: low — mitigation: local E2E + prod verification

## Health

- **Throughput:** WLT-6 built → reviewed → shipped → extracted into a published npm package → hardened, across 2026-06-05…07.
- **CI:** `check` + `e2e` green on main (lint, typecheck, live RLS, build-registration, prod audit gate, guard E2E).
- **Plan freshness:** `last_refreshed: 2026-06-05` — consider `/plan` refresh after WLT-7 ships.
- **Tooling note:** GitHub via `gh` CLI (PRs #2–#10 used); Jira MCP not connected (mirrors skipped, logged in DRIs).
