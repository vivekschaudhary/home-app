# Project Status

_Last updated: 2026-06-07 — WLT-7 shipped (`@vc1023/passkey-2fa@0.3.0`)_

## In flight

_None._ WLT-1's shipped stories (WLT-6 + WLT-7) cover identity + passkey + authenticator backup. No story is in build; next move is a deliberate choice (see Next up).

WLT-6 + **WLT-7 — authenticator-app (TOTP) backup factor — `shipped`** (2026-06-07). **WLT-8** (support-gated recovery, both-factors-lost) is **parked** by decision: revisit once WLT-7 is in real use and backup-adoption is measured — not auto-queued.

## Next up (from `docs/foundation/plan.md`)

No story auto-queues. When ready, promote the next bet via `/create-brief`:

| Bet | Title | Why next | Confidence |
|-----|-------|----------|------------|
| WLT-5 | TTFV + WAWU instrumentation | measures the backup-adoption that gates WLT-8 + the north-star | low |
| WLT-2 ∥ WLT-3 | Account aggregation ∥ Intent-first onboarding | the core loop; need WLT-1 (done) | low |
| WLT-4 | Workflow engine | needs WLT-2 + WLT-3 | low |

MVP-loop forecast ~2026-07-17 (low confidence, stub estimates).

## Awaiting human approval

_None blocking._ WLT-7 auto-advanced to `ready` (`hitl_level: milestones`). The 4 stubs (`WLT-2..WLT-5`) remain `proposed` by design (`portfolio_stub: true`) — they await promotion via `/create-brief`, not approval.

## Recently shipped

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
