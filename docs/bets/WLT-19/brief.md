---
id: WLT-19
type: feature
status: shipped
priority: P1
shipped: 2026-06-15
parent: FOUNDATION-PRODUCT
portfolio_stub: false
depends_on: []
parallel_with: []
architecture_required: auto
architecture_status: approved
created: 2026-06-15
author: PM
sources:
  - "user request (2026-06-15): full-screen navigable app shell + left nav (Dashboard · Budget & Spending · Goals · Debt payoff · Investments · Subscriptions · Accounts); other sections 'Coming soon'; responsive on mobile/iPad/desktop"
  - "design reference: platform.openai.com/home — fixed left sidebar + account at bottom + main content area (attached)"
  - docs/foundation/product.md
key_metric:
  name: the week's feature bets mount into the shell with ZERO layout rework + the shell renders clean on phone / tablet / desktop
  baseline: 0 — no app shell today; the post-auth app is disconnected pages (/dashboard, /settings/accounts, /settings/security) with header links
  target: 100% of the week's section bets (Budget & Spending · Goals · Debt payoff · Investments · Subscriptions) plug in as "a nav item + a page" with no change to the shell layout/nav/auth; the shell passes a responsive-correctness pass on all three surface classes. "Wrong if" a feature needs its own layout anyway, or the nav/responsive breaks on a surface.
  source: the section bets' build PRs (did the diff touch the shell layout?) + a manual responsive QA pass (phone ≤640 · tablet ~768–1024 · desktop ≥1280)
guardrails:
  - name: Responsive on every surface
    threshold: clean + usable layout on phone (≤640), tablet (~768–1024), desktop (≥1280) — no broken/overflowing/illegible state on any; the sidebar is fixed on desktop and a hamburger drawer on mobile
  - name: Accessible navigation
    threshold: keyboard-operable nav; the mobile drawer traps focus + closes on Esc/overlay; ARIA current-page on the active item; focus managed on open/close (Headless UI primitives)
  - name: Honest "Coming soon"
    threshold: not-yet-built sections show a clear, consistent "coming soon" — NEVER fake/placeholder data pretending the feature exists (the real-data principle, extended to features)
  - name: No regression + auth holds
    threshold: the existing Dashboard (recap + workflow), Accounts, and Security keep working inside the shell; the AAL2 gate applies to EVERY shell route; existing deep links / the onboarding redirect don't break
  - name: Don't over-build
    threshold: shell + nav + stubs + wire the two that exist (Dashboard, Accounts) ONLY — zero feature logic (each section is its own bet); no theming/dark-mode/settings-redesign this bet
  - name: Stay light
    threshold: the shell + Headless UI must not regress first paint / bundle past the p95<200ms fitness function; Headless UI is a small Tailwind-family primitive lib
measurement_window_days: 7
check_in_cadence: weekly
area_tags: [frontend, design, navigation]
estimate:
  duration_days: 2-3
  confidence: medium
  refined_by: brief-approval
  refined_at: 2026-06-15
---

# WLT-19 — The app shell: a full-screen, navigable, responsive home

## Problem

Today the post-auth product is a handful of **disconnected pages** — `/dashboard` (the recap + workflow card), `/settings/accounts`, `/settings/security` — stitched together with a couple of header links. There's no app shell, no way to move between areas, no sense of "the product" as one cohesive, full-screen surface, and **no home for the wealth features the team is about to build this week** (Budget & Spending, Goals, Debt payoff, Investments, Subscriptions). A user lands on a bare dashboard; it reads as a prototype, not a product. And without a shared frame, **every one of the week's feature bets would re-invent layout, navigation, responsive behavior, and auth gating** — slow and inconsistent.

## User

The **Consumer persona (~80%)** — wants a clean, app-like experience they can navigate across all their money areas on **any device** (phone, iPad, desktop). Their job-to-be-done: _"let me move around my whole financial picture from one place, and make it feel like a real, trustworthy product wherever I open it."_

## Why this matters

This is the **navigational frame the week's six features mount into** — built once so each feature is _"add a nav item + a page,"_ not _"re-decide the whole layout."_ Three payoffs:

1. **Velocity + consistency for the week.** Five feature bets ship into a ready frame instead of each re-solving nav/responsive/auth.
2. **It makes the product _feel_ like a product.** A clean, full-screen, navigable shell on every surface is a direct input to the **trust moat** (product.md moat row 5) — a prototype-shaped UI undercuts the trust a financial app needs.
3. **The nav IS the product's information architecture made visible.** The sections map to the foundation's workflow archetypes (spending → Budget & Spending; savings/goals → Goals; debt_payoff → Debt payoff) plus product expansion (Investments, Subscriptions) — so the shell renders the roadmap, and **honest "Coming soon" stubs** signal what's next without faking it.

## Hypothesis (the bet)

If we ship a **clean, responsive, full-screen app shell** with a **persistent left nav** (Dashboard · Budget & Spending · Goals · Debt payoff · Investments · Subscriptions · Accounts), the two existing surfaces wired in (Dashboard, Accounts) and honest **"Coming soon"** stubs for the rest, then **the week's feature bets each ship faster + more consistently** (plug into the frame) **and the app reads as one cohesive product on every surface.** **Wrong if:** the shell adds friction (the nav doesn't fit 7 sections cleanly, or responsive breaks on a surface), or the features end up needing per-feature layout anyway (the shell wasn't the right frame).

## Defensibility

Not a moat itself — an **enabler + a trust input**. It (a) compounds delivery velocity for the week's six bets (build-the-frame-once), and (b) raises the **trust prerequisite** (moat row 5): a polished, consistent, responsive surface is table stakes for a financial app and a precondition for the data + habit moats to accrue. A prototype-shaped UI would actively erode it.

**Moat impact (one line):** Converts disconnected pages into one trustworthy product surface + a frame that makes every future feature cheaper to ship.

## Scope

### In scope

- **A responsive app-shell layout** (a Next.js App Router route group `(app)` with a shared layout): a **fixed left sidebar** on desktop/tablet that **collapses to a hamburger drawer** on mobile (Headless UI `Dialog`/`Disclosure` for the drawer — focus-trapped, Esc/overlay-close).
- **The left nav** — Dashboard · Budget & Spending · Goals · Debt payoff · Investments · Subscriptions · Accounts — with the **active/current-page** state, icons, and clean typography; scales to 7+ items.
- **Wire the two that exist:** **Dashboard** → the current dashboard content (recap + workflow card) reframed as the Dashboard page; **Accounts** → the existing accounts surface (today `/settings/accounts`).
- **"Coming soon" stub pages** for **Budget & Spending · Goals · Debt payoff · Investments · Subscriptions** — a single consistent, honest placeholder (section title + a plain "coming soon" + a one-line teaser), each at its **own route** so a feature bet just fills it in.
- **A bottom-of-nav account menu** (the OpenAI-reference pattern): the user's email + Security/settings + Sign out — since those aren't top-level sections.
- **AAL2 auth gating preserved** on every shell route; existing redirects/deep-links kept working.
- **Headless UI + Tailwind** for the nav/drawer/menu primitives (accessibility), atop the existing `@wealth/ui` look.

### Out of scope

- **The actual features** (Budget, Goals, Debt, Investments, Subscriptions logic) — **each is its own bet this week**; this bet only gives them a home.
- A full **design-system migration** (shadcn) — explicitly _not_ chosen (Headless UI primitives only).
- Theming / dark mode, a settings redesign, profile management — later.
- **Mobile native app** — web-responsive only (Phase-1 stack: web).

## Open questions for Researcher / Architect

- **Route structure:** a `(app)` route group with the shell layout; do Dashboard/Accounts become top-level `/dashboard` + `/accounts` (Accounts is `/settings/accounts` today), with `/budget` `/goals` `/debt` `/investments` `/subscriptions` for the rest? How do existing links + the onboarding redirect migrate cleanly?
- **Post-auth landing:** does "Dashboard" become the landing after sign-in (and after onboarding)?
- **Headless UI as a stack note:** it's a small Tailwind-family primitive lib — does it need a foundation-architecture ADR note, or is it a minor in-spirit dependency? (The `architecture_required: auto` step decides.)
- **Icon set:** heroicons (Tailwind-family, pairs with Headless UI) vs lucide — pick one.
- **The shell ↔ AAL2 gate:** confirm every `(app)` route inherits the AAL2 requirement (one place, not per-page).

## Research findings

- **The reference is the canonical pattern.** platform.openai.com/home: a fixed left sidebar (sections + search), the account at the bottom, a titled main content area. Standard, proven, scales to many sections.
- **Every comparable PFM app uses exactly this shell + these sections.** Monarch, Copilot, YNAB, Empower all run a persistent-nav app shell with Budget / Goals / Accounts / Investments / Debt — the IA is **industry-standard for wealth apps**, which de-risks both the pattern and the section names (product.md competitive set).
- **The sections map to the product's own IA.** Budget & Spending ↔ the `spending_snapshot` archetype (WLT-17 shipped the recap version); Goals ↔ savings/goal archetypes; Debt payoff ↔ `debt_payoff`; Accounts ↔ WLT-2 (shipped). Investments + Subscriptions are product expansion. So the nav renders the roadmap.
- **Honest "Coming soon" beats fake screens** — consistent with the real-data / no-fabricated-UI principle that has governed every surface (WLT-10/12/16). A clear placeholder signals the roadmap without lying about what exists.
- `n/a` — quantitative: `n/a — pre-launch; this is an enabling/IA bet, validated by the week's features plugging in + a responsive QA pass, not a user KPI.`

## User pain input (from Support)

`n/a — pre-launch; this is a top-down product/IA request from the operator. The proxy: the current app reads as disconnected pages, not a product — the very gap this closes.`

## Stories

_Decomposed one at a time via `/create-story WLT-19` after this brief is approved (and `/create-bet-architecture WLT-19` if the `auto` step elects to run — the routing reorg + the new dependency may warrant a light pass). Likely first slice: the responsive shell + nav + the mobile drawer + the "Coming soon" stub component + wiring Dashboard & Accounts — i.e. the whole frame end-to-end, since it's small and the features depend on it landing first._

## DRI Log

### Decisions

- [2026-06-15] [PM] **This bet = the shell + nav + "Coming soon" stubs ONLY; the six sections are separate feature bets** (per the user: "we will build each of these features this week") — rationale: build-the-frame-once unblocks + speeds the week's work; mixing feature logic in would bloat it — area: scope — alternatives: shell + redesign the Dashboard content (rejected — out of scope), shell + build one real section now (rejected — mixes concerns) — reversibility: easy
- [2026-06-15] [PM, elicited] **Headless UI + Tailwind for the nav/drawer/menu primitives** (not shadcn, not extend-`@wealth/ui`-only) — rationale: accessible drawer/menu/dialog primitives (focus trap, keyboard) without a full design-system migration mid-week; lighter than shadcn, more robust than hand-rolling a11y — area: design/stack — alternatives: extend @wealth/ui only (rejected — a11y of a hand-rolled drawer is error-prone), adopt shadcn/ui (rejected by user — a design-system shift + a bigger dependency than the week wants) — reversibility: medium
- [2026-06-15] [PM, elicited] **Collapsible hamburger drawer on mobile; fixed sidebar on desktop/tablet** — rationale: matches the desktop sidebar + the reference + scales to 7+ sections; a bottom tab bar strains at 7 items — area: UX — alternatives: bottom tab bar (rejected — needs a "More" overflow, inconsistent with desktop), top bar + slide-over (rejected — a different pattern from desktop) — reversibility: easy
- [2026-06-15] [PM] **Honest "Coming soon" stubs, one consistent component** — rationale: the real-data/no-fake-UI principle extended to features; a clear placeholder signals the roadmap without faking it — area: trust — reversibility: easy
- [2026-06-15] [PM] **`architecture_required: auto`** — rationale: it reorganizes app routing (a `(app)` route group, moving Dashboard/Accounts), adds a dependency (Headless UI), and must re-confirm the AAL2 gate across new routes — a light architectural pass may be warranted; let the architect decide — area: process — reversibility: n/a

### Risks

- [2026-06-15] [PM] **Route restructuring breaks existing links / the onboarding redirect / the AAL2 gate** — likelihood: medium — impact: high (a broken auth gate is a security regression) — mitigation: gate inherited once at the `(app)` layout (not per-page); keep redirects; a real-path check that every shell route still enforces AAL2 (the #36 discipline) — area: security/routing
- [2026-06-15] [PM] **Responsive breaks on one surface** (the explicit requirement: phone/iPad/desktop) — likelihood: medium — impact: medium — mitigation: the responsive-correctness guardrail + a QA pass on all three classes before "done" — area: ux
- [2026-06-15] [PM] **A new dependency (Headless UI) trips the foundation-stack deviation gate** — likelihood: low-medium — impact: low — mitigation: it's a small Tailwind-family primitive lib; the `auto` architecture step records a light ADR note if needed, not a full amend — area: stack
- [2026-06-15] [PM] **Scope creep into the features** — likelihood: medium — impact: medium — mitigation: the "don't over-build" guardrail; stubs only; each section is its own bet — area: scope

### Issues

- [2026-06-15] [PM] **Section ↔ archetype naming** — severity: low — owner: PM — status: open — area: product — confirm the nav labels are the product's canonical names (e.g. "Budget & Spending" vs the `spending_snapshot` archetype) before features attach; resolve in the story.
- [2026-06-15] [PM] Jira/Confluence MCPs not connected — epic mirror skipped (consistent posture) — severity: low — owner: PM — status: open — area: tooling
