---
id: WLT-11
bet: WLT-3
type: story
status: ready
priority: P1
created: 2026-06-09
author: PM
design_link: docs/bets/WLT-3/stories/WLT-11/design.md
copy_link: docs/bets/WLT-3/stories/WLT-11/copy.md
area_tags: [frontend, backend, data, product]
dependencies:
  - WLT-6
---

# WLT-11 — Declare your intent (6-cluster front door)

## Description

The first slice of the intent-first front door. A signed-in user (WLT-1) lands — **before any bank connection or setup** (intent-first, user-first) — on a calm screen that meets them at their **emotion/goal across the 6 clusters** (Fear / Goal / Confusion / Control / Habit / Aspiration), not a blank budgeting canvas. They pick a starter intent; the platform persists a structured **`Intent` + derived `Goal`** (the handoff payload WLT-4 will consume) and shows a **"we're putting your plan together"** placeholder. This ships **without** the workflow engine — it proves the front door converts and produces the Goal hand-off. A **"not sure yet / explore"** path guarantees no dead-end.

## Acceptance Criteria

- [ ] AC1 — **Intent-first placement:** a signed-in user **with no declared intent** is routed to the intent front door **immediately after sign-in, before connect/setup**. (A user who already declared one is not re-prompted — AC7.)
- [ ] AC2 — **The 6-cluster front door:** the screen presents all **6 clusters** (Fear/Goal/Confusion/Control/Habit/Aspiration), each surfacing 2–3 concrete **starter intents** (verbatim from `copy.md`). Visually calm, emotion-led — no jargon, no numbers, no spreadsheet.
- [ ] AC3 — **Declare → persist:** selecting a starter intent persists a structured **`Intent`** (cluster, `intent_key`, label) **and a derived `Goal`** (kind + default params) for the user. The write is **validated server-side** against the canonical taxonomy — an unknown cluster/`intent_key` is rejected (never persisted).
- [ ] AC4 — **Independent-ship placeholder:** after declaring, the user sees a **"we're putting your plan together"** confirmation state (WLT-4 not built yet). The intent is captured; the workflow assembles later. No fake workflow is shown.
- [ ] AC5 — **No dead-end:** a **"Not sure yet / explore"** action lets the user proceed without declaring (to the dashboard / next step). Intent is strongly encouraged, **not coerced** (user-first).
- [ ] AC6 — **RLS:** `intents` + `goals` are **owner-scoped** (the user may select/insert/update/soft-delete **their own**, keyed to `auth.uid()`); cross-tenant reads/writes return 0 / are denied. RLS policy tests (own-row CRUD, cross-tenant denied) pass in CI.
- [ ] AC7 — **Returning user:** a user who already has a non-deleted `Intent` is **not** re-shown the front door on sign-in (routed onward); they may still declare another from a Security/profile-style entry later (out of scope here — MVP declares ≥1).
- [ ] AC8 — **States:** loading (declaring — CTA spinner, disabled); error (discriminated per AC9); success → the placeholder (AC4); the front door itself is the "empty/initial" state.
- [ ] AC9 — **Feedback:** discriminated errors — validation (shouldn't happen via UI, but a tampered/unknown intent → generic "couldn't save that — try again"), network, server — all strings from `copy.md`. Success confirmation per copy.
- [ ] AC10 — **Accessibility:** completable keyboard-only; cluster groups + starter-intent options are a proper accessible control set (radio/listbox semantics) with labels; focus moves to the confirmation on declare; loading uses `aria-live="polite"`; WCAG AA; reduced-motion respected.
- [ ] AC11 — **Speed (guardrail):** the flow is a **single screen, one tap to declare** — median declaration time < 90s (it's on the TTFV<3min path). No multi-step wizard in this slice.
- [ ] AC12 — **WLT-5 event:** `intent_declared` emitted **server-side** on a successful declare with `{ cluster, intent_key }` — **no PII, no free-text**. Funnel baseline for intent→workflow conversion.

## Standard Experience Checklist
- [x] **Navigation** — AC1 (sign-in → intent front door), AC4 (→ placeholder), AC5 (explore → onward), AC7 (returning user skips)
- [x] **States** — AC8 (initial front door / loading / error / success-placeholder)
- [x] **Feedback** — AC9 (discriminated errors + success), AC12 (event)
- [x] **Accessibility** — AC10 (keyboard, radio/listbox semantics, aria-live, AA, reduced-motion)
- [x] **Edge cases** — AC3 (unknown intent rejected server-side), AC5 (explore/no-coerce), AC6 (cross-tenant denied), AC7 (already-declared)
- [x] **Cross-surface consistency** — `n/a — web-only Phase-1 (architecture.md: mobile deferred)`

## Tech notes

Within-stack (`architecture_required: false`); `Intent`/`Goal` are foundation entities (data model L65–66; ER `USER→INTENT→GOAL`).
- **Migration `supabase/migrations/0004_intent.sql`:** `intents` (`user_id`, `cluster` check-enum, `intent_key`, `label`, soft-delete, `set_updated_at`) · `goals` (`user_id`, `intent_id` FK, `kind`, `params jsonb default '{}'`, `status` default `'pending_workflow'`, soft-delete). **RLS owner CRUD** — `select/insert/update/delete` where `auth.uid() = user_id` (these are *user-declared config*, not system-written financial rows — unlike WLT-9's owner-SELECT-only posture). UUID PK, `timestamptz`.
- **Canonical taxonomy** — a typed constant in `@wealth/core` (`INTENT_CLUSTERS`): the 6 clusters → their starter intents (`intent_key`, label, derived `goal.kind` + default `params`). The single source the UI renders from and the API validates against (enumerable → no free-text in this slice).
- **API:** thin `app/api/intent/route.ts` (`POST`, `runtime="nodejs"`, auth-gated) → validate `{cluster, intent_key}` against the taxonomy → insert `Intent` + derived `Goal` via the **RLS server client** (`createServerSupabase`, owner insert) → emit `intent_declared` → return. Reject unknown intents (400).
- **Routing:** post-sign-in, if the user has no non-deleted `Intent`, route to `app/onboarding/intent/`; else onward. Wire in the existing post-auth redirect.
- **UI:** `app/onboarding/intent/` page + `IntentClusters` (6 grouped cards) + the declare action + the "putting your plan together" placeholder; strings verbatim from `copy.md`; states + a11y per `design.md`. Seed reusable `IntentCard`/`ClusterGroup` in `@wealth/ui`.
- **Event:** `intent_declared` via the existing `emitFunnel` path into `auth_funnel_events` (no rename — WLT-5 owns any rename).

## Dependencies
- **WLT-6** (auth session — the user must be signed in). No dependency on WLT-2 (intent is data-independent + leads it).

## DRI Log

### Decisions
- [2026-06-09] [PM] **Structured taxonomy, single screen, one-tap declare** — rationale: the < 90s TTFV guardrail + a clean enumerable hand-off to WLT-4; free-text is a deferred fast-follow — area: scope/UX — reversibility: easy
- [2026-06-09] [PM] **`intents`/`goals` use owner-CRUD RLS** (not WLT-9's owner-SELECT-only) — rationale: these are user-declared config the user writes directly, not system-written financial data — area: security/data — reversibility: medium
- [2026-06-09] [PM] **Ships without WLT-4** via a "putting your plan together" placeholder — rationale: the intent persists now; the workflow assembles when the engine lands; decouples the critical path — area: sequencing — reversibility: easy
- [2026-06-09] [PM] **Derive + persist a `Goal` now** (not just the Intent) — rationale: the `Goal` is the WLT-4 hand-off contract; deriving it here keeps the engine's input stable + enumerable — area: architecture — reversibility: medium

### Risks
- [2026-06-09] [Designer] **Starter-intent wording may not resonate** with the anxious persona — likelihood: medium — impact: high — mitigation: plain, emotion-led copy (see `copy.md`); iterate post-baseline via the `intent_declared` distribution — area: product/UX
- [2026-06-09] [PM] **Routing users to intent before connect could feel premature** if a user just wants to look around — likelihood: low — impact: medium — mitigation: the "not sure yet / explore" no-dead-end path (AC5) — area: UX

### Issues
- _none_

---

_Next WLT-3 slices: free-text intent expression · intent management (edit/add) · richer Goal params. Brief: docs/bets/WLT-3/brief.md_
