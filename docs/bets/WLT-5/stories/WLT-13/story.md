---
id: WLT-13
bet: WLT-5
type: story
status: shipped
priority: P1
created: 2026-06-12
author: PM
design_link: docs/bets/WLT-5/stories/WLT-13/design.md
copy_link: docs/bets/WLT-5/stories/WLT-13/copy.md
area_tags: [backend, data, frontend, product]
dependencies:
  - WLT-12
---

# WLT-13 — The instrument panel: TTFV + WAWU + funnel views, admin page, snapshots

## Description

The single WLT-5 story — makes the closed loop **measurable**. Read-only SQL views over `auth_funnel_events` compute the three metric families: **TTFV** (full-loop clock `signup_started → action_completed`, p80 vs the 180s target, with split times at `account_linked` / `workflow_assembled`), **weekly WAWU** (distinct users with ≥1 `action_completed` per 7-day window), and **stage-by-stage funnel conversion** (incl. KR3's intent→workflow baseline). One **AAL2 + admin-gated** server-rendered page (`/admin/metrics`) renders them — cross-user **aggregates only, every figure with its n, no PII** — and a snapshot script writes the same queries to `docs/metrics/WLT-5-<date>.json` for the `/measure` workflow. **This bet writes no new events** — the 17-event contract stays frozen.

## Acceptance Criteria

- [ ] AC1 — **Views migration (additive, read-only):** `0007_metrics.sql` creates the metric views over `auth_funnel_events` (no table/contract changes). **SELECT on the views is revoked from `authenticated` + `anon`** — base-table RLS doesn't govern view output (Postgres views run with owner privileges), so the views are reachable only via server-side service-role reads. 0 writes on any user path.
- [ ] AC2 — **TTFV family:** per-user full-loop duration (first `signup_started` → first `action_completed`); the headline **p80 vs 180s** (KR1 framing: "<3 min for ≥80%"); **split-time medians** for signup→`account_linked`, →`workflow_assembled`, →`action_completed`; each stat carries its **n**.
- [ ] AC3 — **WAWU weekly:** distinct users with ≥1 `action_completed` per 7-day window (the WorkflowRun = the WAWU unit), with n per window. The KR5 baseline.
- [ ] AC4 — **Funnel conversion:** per-stage user counts + adjacent-stage conversion % across `signup_started → mfa_enrolled → account_linked → intent_declared → workflow_assembled → action_completed`, incl. the **intent→workflow conversion** (KR3 + WLT-4's key_metric source).
- [ ] AC5 — **Admin gate:** `/admin/metrics` requires **AAL2 + membership in the `ADMIN_EMAILS` env allow-list** (server-checked). Non-admins (and signed-out users) get a **404** — the surface's existence is not revealed. No client-side-only gating.
- [ ] AC6 — **Aggregates only, no PII:** the page and snapshots expose no per-user rows, no emails/ids, no drill-down — only aggregate stats + their n (the brief's guardrails, mechanically checkable).
- [ ] AC7 — **Honest small-n:** every aggregate displays its **n**; when n=0 (or below a stated floor) the page shows the explicit pre-launch empty state from `copy.md` rather than implying signal. Partial funnels (users mid-loop) count correctly per stage, never as errors.
- [ ] AC8 — **Snapshots:** a script (`scripts/metrics-snapshot.mjs`) runs the same queries and writes `docs/metrics/WLT-5-<date>.json` (stats + n + generated-at), wired for the `/measure` workflow; documented in the script header.
- [ ] AC9 — **States:** loading (server-rendered — minimal), **empty/pre-launch** (n=0 banner), error (per `copy.md`, no internals leaked), populated. The page renders gracefully at n=0.
- [ ] AC10 — **Accessibility:** proper table semantics (`<th scope>`, captions), heading hierarchy, WCAG AA contrast, keyboard-reachable (read-only surface), no color-only meaning (target hit/miss also labeled in text).
- [ ] AC11 — **Tests:** view math verified against **seeded fixture events in live PG** (known timestamps → known TTFV/p80/WAWU/conversion); the admin gate tested (non-admin → 404, admin → 200); a no-PII assertion on the page's rendered output/snapshot shape.

## Standard Experience Checklist
- [x] **Navigation** — AC5 (direct URL, admin-gated; deliberately NOT in user navigation — an operator surface)
- [x] **States** — AC9 (loading / empty-pre-launch / error / populated)
- [x] **Feedback** — AC7 (honest n on every figure; explicit pre-launch state), AC9 (errors per copy)
- [x] **Accessibility** — AC10 (table semantics, headings, AA, not color-only)
- [x] **Edge cases** — AC7 (n=0, partial funnels, mid-loop users), AC1 (view privileges — no PostgREST leak), AC5 (signed-out/non-admin → 404)
- [x] **Cross-surface consistency** — `n/a — internal operator surface, web-only`

## Tech notes

Per the approved brief (`architecture_required: false` — within-stack: Postgres views + one gated RSC page + a node script).
- **Migration `0007_metrics.sql`** — views only (e.g. `metrics_ttfv_per_user`, `metrics_ttfv_summary`, `metrics_wawu_weekly`, `metrics_funnel_stages`); `revoke select ... from authenticated, anon` on each (AC1 rationale); additive, no contract changes.
- **First-event semantics:** use each user's **first** occurrence per event (`min(occurred_at)`) — re-runs/repeat sign-ins don't skew TTFV.
- **Gate:** `ADMIN_EMAILS` (comma-separated) checked server-side in the page's RSC against the AAL2 session email; absent/non-member → `notFound()`. Add to `.env.example` + a `check-env` note (warn-only — unset just means no admins).
- **Page:** `app/admin/metrics/page.tsx` — RSC, `runtime="nodejs"`, service-role reads of the views (server only; never pass the client), renders the three sections per `design.md`/`copy.md`. No client JS needed.
- **Snapshot:** `scripts/metrics-snapshot.mjs` — node + `pg` against `SUPABASE_DB_URL`, writes `docs/metrics/WLT-5-<date>.json`; same SQL as the views (query the views directly).
- **Tests:** extend the live-PG suite (`supabase/tests/`) with seeded `auth_funnel_events` fixtures + expected math; route/gate test for 404 vs 200; CI applies `0007` in provision + manifest check includes `/admin/metrics/page`.

## Dependencies
- **WLT-12** (shipped) — `action_completed` exists; the loop emits end-to-end. No external systems.

## DRI Log

### Decisions
- [2026-06-12] [PM] **One story for the whole bet** — rationale: a 1-week bet with one coherent deliverable (views + page + snapshot); splitting would manufacture overhead — area: scope — reversibility: easy
- [2026-06-12] [PM] **Admin gate = `ADMIN_EMAILS` env allow-list + AAL2, non-admin → 404** — rationale: no app-level role column exists (auth.users is Supabase-managed); an allow-list needs no migration and is reversible to a role model when an admin domain actually emerges; 404 keeps the surface unenumerable — area: security — alternatives: users.role column (rejected — a migration + role-management UI for exactly one admin today), Supabase custom claims (rejected — config outside the repo) — reversibility: easy
- [2026-06-12] [PM] **Views' SELECT revoked from `authenticated`/`anon`** — rationale: Postgres views execute with owner privileges (base-table RLS does not protect view readers); revoking closes the PostgREST cross-user leak by construction — area: security — reversibility: easy
- [2026-06-12] [PM] **First-occurrence-per-event semantics** for the TTFV clock — rationale: repeat events (re-sign-ins, second workflows) must not skew the first-value clock — area: metrics — reversibility: easy

### Risks
- [2026-06-12] [PM] **Tiny-n baseline misread as signal** — likelihood: high — impact: medium — mitigation: n on every figure + the explicit pre-launch empty state (AC7); no KR verdicts until n is meaningful — area: measurement
- [2026-06-12] [Security] **New cross-user-aggregate surface + service-role reads in an RSC** — likelihood: low — impact: high — mitigation: AAL2 + allow-list + 404; aggregates-only (AC6); service client never serialized to the client; mandatory Security Review — area: security

- [2026-06-12] [Engineer→review] **Unauthorized → 404 via `getAal2UserId()` + `notFound()`, never `requireAal2()`** — rationale: `requireAal2()` REDIRECTS signed-out/non-AAL2 sessions to `/sign-in`, which leaks the route's existence; the gate must 404 for EVERY unauthorized state (signed-out, non-AAL2, non-admin) to stay unenumerable — area: security — reversibility: easy
- [2026-06-12] [Engineer→review] **View SELECT revoked from `authenticated`/`anon`** — Postgres views run with owner privileges, so base-table RLS doesn't protect readers; the revoke (not RLS) is the boundary; live-PG test asserts `permission denied` — area: security — reversibility: easy
- [2026-06-12] [Engineer] **Gate + no-PII verified by a real-route E2E** (3/3 live: signed-out 404 / non-admin 404 / admin 200) + mechanical no-PII on the rendered HTML (only the viewer's own session values allowed) and every committed snapshot — area: verification

### Issues
- _none — shipped 2026-06-12 (PR #34; cross-model Codex Approve + Security clean; 3 review rounds: AC11 route+no-PII E2E → AC5 signed-out-redirect→404)._
