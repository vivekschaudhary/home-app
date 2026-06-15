---
id: WLT-19-ARCH
bet: WLT-19
status: proposed
created: 2026-06-15
authors: [Architect, Enterprise/Solution Architect]
area_tags: [frontend, navigation, auth, routing]
---

# Technical Design: The app shell (full-screen, navigable, responsive home)

## Decision

Introduce a **Next.js App Router route group `(app)`** with a single shared **`layout.tsx`** that renders the responsive shell (fixed left sidebar on desktop/tablet → a focus-trapped **Headless UI `Dialog` drawer** on mobile, a **Headless UI `Menu`** account menu at the bottom) and **enforces AAL2 once for every shell route** (`requireAal2()` in the layout server component). The nav is driven by a **single source-of-truth `NAV_SECTIONS` config** (`{ key, label, href, icon, status: 'live' | 'coming_soon' }`) that renders the sidebar, the active state, AND the honest **`<ComingSoon>`** stub pages — so a future feature bet "mounts" by flipping one section to `live` and dropping in its page (the zero-shell-rework contract the bet's metric measures). Existing surfaces move under the group: **`/dashboard`** (URL unchanged) and **`/accounts`** (moved from `/settings/accounts`, with a redirect); `/settings/security` renders inside the shell, reached from the account menu. The five not-yet-built sections (`/budget` `/goals` `/debt` `/investments` `/subscriptions`) are stub routes that render `<ComingSoon>`. No data model, no API, no new service — a routing + layout reorganization within the approved frontend, plus two small Tailwind-family UI-primitive dependencies (Headless UI + an icon set).

## Context

- **Current routing (flat):** `/dashboard` (recap + WorkflowCard), `/settings/accounts`, `/settings/security`, plus the public auth/onboarding routes (`/sign-in`, `/sign-up`, `/forgot`, `/reset`, `/onboarding/intent`, `/unsupported`) and `/admin/metrics`. No shared post-auth chrome; `app/layout.tsx` is a bare `html/body`.
- **Auth model (two-layer, must be preserved):** (1) `middleware.ts` runs `createPasskeyMiddleware({ protectedPaths: ["/dashboard"] })` — an **edge** session/AAL gate; (2) **each page** calls `requireAal2()` server-side (`packages/passkey-2fa/src/guard.ts`) which returns the `userId` and **redirects to `/sign-in`** if the session isn't AAL2. The dashboard/accounts/security pages each do this today.
- **Constraint (the load-bearing one):** every route that joins the shell MUST stay AAL2-gated. A shell that renders financial pages without the gate is a **security regression** (brief guardrail "auth holds").
- **Stack:** Next.js App Router + React + **Tailwind** + `@wealth/ui` (foundation Stack table). The shell is built within this; the elicited choice adds **Headless UI** for accessible drawer/menu primitives.

## Approach

### Components affected

```
app/
  (app)/                         ← NEW route group (URL-invisible)
    layout.tsx                   ← the shell: <AppShell> + requireAal2() (the ONE gate)
    nav.ts                       ← NAV_SECTIONS source-of-truth (the mounting contract)
    _components/
      AppShell.tsx               ← sidebar + mobile drawer + main; client (drawer state)
      Sidebar.tsx                ← the nav list (desktop fixed; reused in the drawer)
      MobileDrawer.tsx           ← Headless UI Dialog (focus trap, Esc/overlay-close)
      AccountMenu.tsx            ← Headless UI Menu (email · Security · Sign out)
      NavItem.tsx                ← one link + active/current state (aria-current)
      ComingSoon.tsx             ← the honest placeholder (title + teaser)
    dashboard/page.tsx           ← MOVED from app/dashboard (content unchanged)
    accounts/page.tsx            ← MOVED from app/settings/accounts (→ /accounts)
    settings/security/page.tsx   ← MOVED under the shell (URL kept: /settings/security)
    budget/page.tsx              ← <ComingSoon section="budget" />
    goals/page.tsx               ← <ComingSoon section="goals" />
    debt/page.tsx                ← <ComingSoon section="debt" />
    investments/page.tsx         ← <ComingSoon section="investments" />
    subscriptions/page.tsx       ← <ComingSoon section="subscriptions" />
app/settings/accounts/page.tsx   ← becomes a redirect → /accounts (preserve deep links)
middleware.ts                    ← protectedPaths extended to all shell routes
```

- **`(app)/layout.tsx`** (server component): `const userId = await requireAal2();` → redirects if not AAL2; then renders `<AppShell user={...}>{children}</AppShell>`. **This is the single authoritative server gate** for every page in the group.
- **Pages under `(app)`** read the user with `getAal2UserId()` (no redundant redirect — the layout already gated); they keep their own `export const dynamic = "force-dynamic"`. Dashboard/Accounts/Security content is **unchanged** — only relocated.
- **`AppShell`** is a `"use client"` component owning the drawer open/closed state; `Sidebar`/`AccountMenu` render inside it. The server layout passes the user's email + the (server-rendered) nav.

### Data model changes
**None.**

### API / contract changes
**None** (no endpoints). The internal "contract" is `NAV_SECTIONS` + the `<ComingSoon>` component: a feature bet flips its section `coming_soon → live` and replaces the stub `page.tsx`. **Routing changes** (additive + one redirect): new `/budget /goals /debt /investments /subscriptions`; `/accounts` (new) + `/settings/accounts` → 301/redirect to it; `/dashboard` + `/settings/security` URLs unchanged.

### Dependencies (justified)
- **`@headlessui/react`** (elicited) — unstyled, accessible primitives for the **mobile drawer** (`Dialog`: focus trap, `aria-modal`, Esc/overlay-close, scroll lock) and the **account menu** (`Menu`: roving focus, keyboard). Hand-rolling correct a11y for these is the error-prone alternative the elicitation rejected. Tailwind-family (same authors as Tailwind), unstyled (we style with our Tailwind classes), tree-shakeable.
- **An icon set for the 7 nav items + hamburger/close** — recommend **`@heroicons/react`** (Tailwind-family, tree-shakeable). *Alternative:* inline SVGs (zero dependency) — Engineer's call; both are fine.

## Enterprise/Solution Architect input

### Cross-system implications
None — no new service, data store, runtime, or boundary crosses. This is frontend routing + layout within the existing Next.js/Vercel deploy. No change to Supabase, Inngest, or the API surface.

### Standards compliance — and the **foundational-stack deviation gate (step 7)**
**Assessed: not a foundational-stack deviation requiring a `/setup-foundation-architecture` amend.** Headless UI + heroicons are **leaf UI-primitive libraries** within the **already-approved frontend** (Next.js + React + **Tailwind**, Stack table) — companions to Tailwind (same authors), not a new framework, runtime, data store, service, or load-bearing architectural choice. The Stack table enumerates architecture-level picks, not component libraries; adding accessible primitives is below the deviation-gate threshold. **This is recorded explicitly, not silently** (the gate's actual concern). _Option:_ if the team wants it formalized, a one-line entry in the foundation Stack table ("UI primitives: Headless UI + heroicons") is a trivial foundation note — **not a blocker for this bet.** Other standards: routing follows App-Router conventions; the auth gate stays server-enforced (cross-cutting "fail-closed on auth"); no PII; responsive + a11y per the brief guardrails.

### Cost / capacity / vendor lock-in
Negligible. Two small client deps (tens of KB, tree-shaken); no runtime/infra cost. Lock-in: low — Headless UI is unstyled (our markup/classes stay ours); replaceable. Must hold the **p95<200ms / bundle** fitness function — verify the shell doesn't bloat first load (it shouldn't; the heavy primitives are client-islands, lazy where possible).

## Alternatives considered

| Option | Pros | Cons | Why not chosen |
|--------|------|------|----------------|
| **Chosen** — `(app)` route group + shared layout-gate + `NAV_SECTIONS` config + Headless UI drawer | One gate (DRY + secure); URL-clean; the config is the mount contract; a11y for free | adds 2 small deps; a routing move | — |
| **Per-page shell + per-page `requireAal2`** (no group) | no route move | the gate is duplicated N times (drift/forget risk — the brief's #1 risk); every feature re-wraps the shell | Rejected — defeats build-the-frame-once + risks an ungated route |
| **Gate only in middleware** (drop the server `requireAal2`) | one edge check | middleware AAL checks are coarser + the existing pattern is defense-in-depth server-side; a middleware-only gate is a weaker boundary for financial pages | Rejected — keep BOTH layers (edge + server layout) |
| **shadcn/ui design-system migration** | maximal polish | a design-system shift + bigger dep mid-week; foundation amend | Rejected by the brief elicitation (Headless UI primitives only) |
| **Hand-rolled drawer/menu (no Headless UI)** | zero new dep | correct focus-trap/aria-modal/scroll-lock is fiddly + easy to get wrong (a11y guardrail) | Rejected by the brief elicitation |

## Consequences

**Positive:**
- **One authoritative AAL2 gate** (the layout) for the whole shell — DRY + harder to leave a route ungated than the per-page status quo.
- **`NAV_SECTIONS` is the mounting contract** — each of the week's features is "flip to `live` + drop a page," which is exactly what the bet's metric measures (zero shell rework).
- The product reads as one cohesive, responsive surface (the trust input); honest `<ComingSoon>` signals the roadmap without faking it.

**Negative:**
- A **routing move** (dashboard/accounts/security into `(app)`) — mechanical but touches auth-critical paths; needs the redirect + the gate verified on every route.
- **Two new client deps** (small, Tailwind-family) — a minor surface to keep tree-shaken under the perf budget.
- The mobile drawer is a client island (state) — acceptable; the rest of the shell is server-rendered.

**Reversibility:** medium — the group/layout is additive; routes could flatten back. Headless UI is unstyled (low lock-in). The redirect for `/settings/accounts` is permanent-ish (don't churn the URL again).

## Test strategy

- **Unit:** `NAV_SECTIONS` integrity (every section has a route + a `status`; `live` sections point at a real page); the active-route helper (current-path → `aria-current`).
- **Component (jsdom):** `AppShell`/`MobileDrawer` — drawer opens/closes (hamburger, Esc, overlay), focus is trapped + returns to the trigger on close; `AccountMenu` keyboard-operable; `NavItem` sets `aria-current` on the active route; `<ComingSoon>` renders the section label, never fabricated data.
- **Real-path / `[real-path-integration-coverage]` (load-bearing — the auth boundary):** an **E2E (Codex)** that, for **every shell route** (`/dashboard /accounts /settings/security /budget /goals /debt /investments /subscriptions`), an **un-AAL2 session is redirected to `/sign-in`** (the gate holds on all of them, not just `/dashboard`), and an AAL2 session renders the shell. Plus: `/settings/accounts` redirects to `/accounts`. This is the security regression the brief flags — it must be exercised on the real routes, not asserted in a unit test.
- **Responsive QA (the explicit requirement):** a manual/visual pass on **phone ≤640 · tablet ~768–1024 · desktop ≥1280** — sidebar fixed on desktop, drawer on mobile, no overflow/illegibility; reduced-motion honored on the drawer transition.
- **Build-artifact inspection (`[mechanical-output-verification]`):** confirm the new `(app)` routes appear in `.next/server/app-paths-manifest.json` and **middleware still registers** (Next 15: `middleware-manifest.json` — the matcher must still cover the new protected paths). Per the CLAUDE.md anchor — middleware silently dropped = an ungated app.

## Rollout

- **Feature flag?** No — it's the new default post-auth surface; ships whole (the frame is small + the features depend on it landing first).
- **Migration?** Routing only: additive new routes + **move** dashboard/accounts/security into `(app)` + a **redirect** `/settings/accounts → /accounts`. Update `middleware.ts` `protectedPaths` to cover all shell routes (or a prefix helper). No data migration.
- **Backwards compatibility?** Existing deep links: `/dashboard` + `/settings/security` unchanged; `/settings/accounts` redirected (no broken link). The post-sign-in / post-onboarding landing should resolve to `/dashboard` (confirm the onboarding redirect still targets it).
- **Staged?** No — single PR (or two: the shell+gate+stubs, then wiring the moved pages) — Engineer's call; the auth-gate E2E gates merge either way.

## Open questions for Engineer

Escalate to Architect (don't improvise):
- **The gate must hold on every shell route.** Use `requireAal2()` in `(app)/layout.tsx` as the authoritative server gate **and** extend `middleware.ts` `protectedPaths`. If a layout-level gate proves not to short-circuit a child page in your Next version, fall back to per-page `getAal2UserId()`-or-redirect — but the E2E must prove every route redirects when un-AAL2. **Do not ship a shell route that renders without AAL2.**
- **`/settings/accounts → /accounts` redirect:** permanent redirect; update the in-app links (the dashboard header) to `/accounts`.

Figure out without escalating: the exact Tailwind breakpoints/markup, the icon choice (heroicons vs inline SVG), the `ComingSoon` copy (from `/create-story`'s copy doc), whether to lazy-load the drawer island.

## DRI Log

### Decisions
- [2026-06-15] [Architect] **`(app)` route group + a single layout that gates with `requireAal2()`** — rationale: one authoritative AAL2 gate for the whole shell (DRY + harder to leave a route ungated than per-page); URL-invisible so existing URLs stay — area: auth/routing — alternatives: per-page shell+gate (rejected — duplication/drift risk), middleware-only (rejected — keep edge+server defense-in-depth) — reversibility: medium
- [2026-06-15] [Architect] **`NAV_SECTIONS` config is the mounting contract** (`{key,label,href,icon,status}`) driving sidebar + active state + `<ComingSoon>` stubs — rationale: a feature mounts by flipping `coming_soon→live` + adding a page = zero shell rework (the bet's metric) — area: frontend — reversibility: easy
- [2026-06-15] [Architect] **Headless UI `Dialog` (drawer) + `Menu` (account)** for a11y primitives — rationale: focus-trap/aria-modal/scroll-lock + roving focus for free; the elicited choice; unstyled so our Tailwind stays — area: design/a11y — reversibility: medium
- [2026-06-15] [Enterprise Architect] **Headless UI + heroicons are NOT a foundational-stack deviation** (leaf Tailwind-family UI primitives within the approved frontend) — recorded explicitly per the step-7 gate; a foundation Stack-table note is optional, not required — area: stack — reversibility: easy
- [2026-06-15] [Architect] **Move dashboard/accounts/security into the shell; `/accounts` replaces `/settings/accounts` with a redirect** — rationale: Accounts is a top-level nav item; keep deep links working — area: routing — reversibility: medium (URL change — don't churn again)

### Risks
- [2026-06-15] [Architect/Security] **An ungated shell route** (the gate forgotten on a new route, or a layout gate that doesn't short-circuit) — likelihood: medium · impact: high (financial data without AAL2 = security regression) — mitigation: the single layout gate + middleware protectedPaths + a **real-path E2E that every shell route redirects un-AAL2 sessions**; the build-manifest check that middleware still registers — area: security
- [2026-06-15] [Architect] **Responsive breaks on one surface** (the explicit phone/iPad/desktop requirement) — likelihood: medium · impact: medium — mitigation: the responsive-QA pass on all three classes before "done"; Headless UI handles the drawer mechanics — area: ux
- [2026-06-15] [Enterprise Architect] **Bundle/first-paint regression from the new deps** — likelihood: low · impact: low — mitigation: tree-shaken imports, the drawer as a client island; verify against the p95<200ms FF — area: performance

### Issues
- [2026-06-15] [Architect] **Onboarding/post-sign-in landing target** — severity: low · owner: Engineer · status: open — area: routing — confirm the post-auth + post-onboarding redirect resolves to `/dashboard` inside the shell.
- [2026-06-15] [Architect] **Middleware `protectedPaths` maintenance** — severity: low · owner: Engineer · status: open — area: auth — listing each shell route is drift-prone; consider a shared prefix/helper so a new section is auto-protected.

---

_Approved by: <pending HITL> on <date>_
