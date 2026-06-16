---
id: WLT-20
bet: WLT-19
type: story
status: shipped
priority: P1
shipped: 2026-06-15
shipped_pr: 57
created: 2026-06-15
author: PM
design_link: docs/bets/WLT-19/stories/WLT-20/design.md
copy_link: docs/bets/WLT-19/stories/WLT-20/copy.md
area_tags: [frontend, navigation, auth, routing]
dependencies:
  - WLT-12   # the Dashboard content (recap + workflow) the shell frames
  - WLT-9    # the Accounts surface the shell frames
---

# WLT-20 — The app shell: responsive nav frame + Coming Soon

## Description

Ship the whole app shell in one slice — because "half a shell" isn't shippable and the week's section features depend on the frame landing first. A `(app)` route group with a shared layout renders the responsive navigation chrome (fixed left sidebar on desktop/tablet → a focus-trapped hamburger drawer on mobile, an account menu at the bottom), **enforces AAL2 once for every shell route**, and is driven by a single `NAV_SECTIONS` config that also renders the honest `<ComingSoon>` stubs. The two existing surfaces are wired in (Dashboard, Accounts); the five not-yet-built sections render `<ComingSoon>`. From this point a feature bet "mounts" by flipping its section `coming_soon → live` and dropping in a page — zero shell rework.

## Acceptance Criteria

- [ ] **AC1 — The shell.** A Next.js `(app)` route group with a shared `layout.tsx` renders the responsive shell wrapping every page in the group: a **fixed left sidebar** at `lg` and up; a **top bar + hamburger drawer** below `lg`. Built on **Headless UI** (`Dialog` for the drawer, `Menu` for the account control) + Tailwind, atop `@wealth/ui`.
- [ ] **AC2 — Nav from one config.** A single `NAV_SECTIONS` source-of-truth (`{ key, label, href, icon, status }`) renders the sidebar (and the drawer's copy of it) in order: **Dashboard · Budget & Spending · Goals · Debt payoff · Investments · Subscriptions · Accounts**, with the active item marked (`aria-current="page"` + non-color-only styling). Labels verbatim from `copy.md`.
- [ ] **AC3 — One AAL2 gate, on every shell route (load-bearing).** `requireAal2()` runs **once** in `(app)/layout.tsx` (redirect to `/sign-in` if not AAL2); `middleware.ts` `protectedPaths` is extended to cover **all** shell routes. An un-AAL2 session hitting **any** of `/dashboard /accounts /settings/security /budget /goals /debt /investments /subscriptions` is redirected — proven by a real-path E2E (not a unit assertion). **No shell route renders financial chrome without AAL2.**
- [ ] **AC4 — Wire the two that exist + migrate cleanly.** Dashboard (recap + WorkflowCard) renders at `/dashboard` inside the shell (content unchanged); Accounts moves to `/accounts` (content unchanged) with `/settings/accounts` **redirecting** to it; `/settings/security` renders inside the shell, reached from the account menu; in-app links updated. The post-sign-in / post-onboarding landing resolves to `/dashboard`.
- [ ] **AC5 — Honest Coming Soon.** `/budget /goals /debt /investments /subscriptions` each render the **single `<ComingSoon>`** component — section title + the verbatim teaser + the "Coming soon" badge — and **never fabricated/placeholder data**.
- [ ] **AC6 — The mobile drawer.** The hamburger opens the drawer (Headless UI `Dialog`): focus is **trapped**, it closes on a nav tap / ✕ / **Esc** / scrim tap, **focus returns to the hamburger**, body scroll is locked, `aria-modal`. Reduced-motion removes the slide/fade.
- [ ] **AC7 — Account menu.** At the bottom of the sidebar/drawer: the user's email opens a Headless UI `Menu` with **Security** + **Sign out**; keyboard-operable + click-away/Esc close; Sign out hits the existing sign-out path.
- [ ] **AC8 — Responsive on every surface.** Clean, usable, no overflow/illegibility on **phone ≤640 · tablet ~768–1024 · desktop ≥1280** — sidebar fixed on desktop/tablet, drawer on mobile; ≥44px touch targets on mobile. Verified by a responsive QA pass across the three classes.
- [ ] **AC9 — Accessibility.** Skip-to-content; keyboard-navigable nav + menu + hamburger; `<nav aria-label="Main">`; `aria-current` on the active item; the drawer/menu a11y from Headless UI; WCAG AA contrast.

## Standard Experience Checklist

- [ ] **Navigation** — every section reachable from the sidebar/drawer; the drawer has explicit dismiss paths (nav-tap / ✕ / Esc / scrim, focus returns); the account menu → Security/Sign out; skip-to-content: **AC2, AC6, AC7, AC9** + design "Surfaces & flow".
- [ ] **States** — active section, drawer open/closed, live page (Dashboard/Accounts), coming-soon, account-menu open/closed, and the never-reached un-AAL2 (redirected): **AC2, AC5, AC6, AC7** + design States table. (Loading: pages are server-rendered/`force-dynamic`; the shell itself has no async state → `n/a`.)
- [ ] **Feedback** — the shell is navigation, not data entry; the one action is **Sign out** (no destructive confirm needed — it's reversible by signing back in); error states belong to the framed pages, not the shell: `n/a — navigation chrome; AC7 covers the sole action`.
- [ ] **Accessibility** — skip-to-content, keyboard nav, `aria-current`, focus trap + return on the drawer, menu roving focus, AA contrast, reduced-motion: **AC6, AC9** + design "Accessibility" + copy `a11y.*`.
- [ ] **Edge cases** — un-AAL2 hitting any shell route → redirect (**AC3**); `/settings/accounts` deep link → redirect (**AC4**); a long email in the account control (truncate, full value in title); tablet ~768 cramping (design risk); reduced-motion: **AC3, AC4, AC8** + design.
- [ ] **Cross-surface consistency** — the explicit requirement: identical IA + behavior across **phone / tablet / desktop**, differing only in the elicited sidebar↔drawer pattern; `n/a — web-only at Phase 1 (no native surface)`, but **AC8** covers the viewport classes.

## Tech notes

Build per the approved bet architecture (`docs/bets/WLT-19/architecture.md`).

- **`(app)` route group + `layout.tsx`:** the layout is a **server component** that calls `requireAal2()` (the one authoritative gate) and renders `<AppShell>`. `AppShell` is `"use client"` (drawer state). Move `app/dashboard` → `(app)/dashboard`, `app/settings/accounts` → `(app)/accounts` (+ a redirect at the old path), `app/settings/security` → `(app)/settings/security`. Pages read the user via `getAal2UserId()` (the layout already gated — no double redirect); keep `force-dynamic`.
- **`NAV_SECTIONS`** (`(app)/nav.ts`): the source-of-truth array; the active state derives from the current pathname. This is the **mounting contract** — a feature flips `status` + replaces the stub page.
- **Middleware:** extend `protectedPaths` to all shell routes (or a prefix helper to avoid drift — see arch Issue).
- **Deps:** `@headlessui/react` (+ `@heroicons/react` or inline SVG — Engineer's call). Tree-shake; keep the drawer a client island; hold the p95<200ms/bundle FF.
- **Carry the lessons:** the **AAL2 gate is the load-bearing risk** — the real-path E2E (every shell route redirects un-AAL2) + the `[mechanical-output-verification]` check that the new routes are in `app-paths-manifest.json` **and middleware still registers** (a silently-dropped middleware = an ungated app). No PII; honest ComingSoon (no fake data).
- **Escalate (per arch):** if a layout-level gate doesn't short-circuit a child page in this Next version, fall back to per-page gating — but the E2E must prove every route redirects.

## PRs

_Auto-populated as PRs open._

## Tests

_Engineer: unit (`NAV_SECTIONS` integrity; active-route helper), component (jsdom: drawer open/close/Esc/scrim + focus trap/return; account menu keyboard; `aria-current`; `<ComingSoon>` renders the label, no fake data). Codex: the real-path E2E — every shell route redirects an un-AAL2 session to `/sign-in` + renders for an AAL2 session; `/settings/accounts` → `/accounts`; the mobile drawer + account menu happy path._

Tags:
- `regression: true|false`
- `e2e: true|false`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-15] [PM] **The whole frame is one story** (not sliced further) — rationale: "half a shell" isn't shippable + the week's features depend on it landing; it's still small (chrome + routing + stubs, no feature logic) — area: scope — reversibility: easy
- [2026-06-15] [PM] **The AAL2 gate is the story's load-bearing AC** (AC3) — rationale: an ungated shell route is a security regression; one gate in the layout + middleware + a real-path E2E across every route — area: security — reversibility: n/a

### Risks
- [2026-06-15] [PM] **A new route ships ungated** (gate forgotten / layout doesn't short-circuit) — likelihood: medium — impact: high — mitigation: AC3 + the real-path E2E across all routes + the manifest/middleware check — area: security
- [2026-06-15] [PM] **Responsive breaks on one surface** — likelihood: medium — impact: medium — mitigation: AC8 QA pass on all three classes before "done" — area: ux

### Issues
- [2026-06-15] [PM] **Middleware protectedPaths drift** — severity: low — owner: Engineer — status: open — area: auth — prefer a prefix/helper so a new section is auto-protected (arch Issue).
- [2026-06-16] [Engineer] **The authenticated-E2E commit (`e3c09d3`) merged without a fresh Codex pass** — severity: low (test-only diff: `e2e/shell-flow.spec.ts` + the four reframe-broken specs re-pointed at new shell helpers; no app/runtime code) — status: **resolved** — area: process — cause: merged on "codex is clear", which had cleared the *prior* commit (`4507e1b`); the follow-up commit answering the review BLOCKER was never re-reviewed. Caught by the user the next morning. **Fix:** Codex reviewed `e3c09d3` post-merge → **approved**. **Lesson:** when a review BLOCKER is answered by a *new* commit, the clear must name that commit — don't merge until the re-review covers the actual HEAD.

---

_Story closed: 2026-06-16, brief link: docs/bets/WLT-19/brief.md_
