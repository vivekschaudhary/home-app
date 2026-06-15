---
bet: WLT-19
story: WLT-20
author: Designer
created: 2026-06-15
---

# Design: WLT-20 — The app shell (responsive nav frame + Coming Soon)

## Design intent

Make the product feel like a **real, trustworthy, full-screen app on every device** — the calm, plain, uncluttered voice every shipped surface already uses (auth, recap, accounts), now wrapped in one navigational frame. The reference (platform.openai.com/home) is the pattern: a **fixed left sidebar** (sections + the account at the bottom) and a **titled main content area**. Nothing flashy — clean type, generous space, a clear "where am I." The shell must read as finished, because a prototype-shaped UI undercuts the trust a money app needs.

## Surfaces & flow

```
DESKTOP (≥1280) / TABLET (768–1024)          MOBILE (≤640)
┌────────────┬───────────────────────┐       ┌─────────────────────┐
│  Wealth…   │  Dashboard            │       │ ☰  Wealth…          │  ← top bar (hamburger)
│            │                       │       ├─────────────────────┤
│ ▸ Dashboard│   <page content>      │       │   <page content>    │
│   Budget…  │   (recap, accounts,   │       │                     │
│   Goals    │    or Coming soon)    │       │                     │
│   Debt…    │                       │       └─────────────────────┘
│   Invest…  │                       │        ☰ → drawer slides over:
│   Subs…    │                       │       ┌───────────────┐▓▓▓▓▓  (overlay)
│   Accounts │                       │       │ Wealth…    ✕  │▓▓▓▓▓
│            │                       │       │ ▸ Dashboard   │▓▓▓▓▓
│ ┌────────┐ │                       │       │   Budget…     │▓▓▓▓▓
│ │ you@…  ▾│ │                       │       │   … Accounts  │▓▓▓▓▓
│ └────────┘ │                       │       │ ┌─────────┐   │▓▓▓▓▓
└────────────┴───────────────────────┘       │ │ you@…  ▾│   │▓▓▓▓▓
  fixed sidebar (≈260px) · main fills         └───────────────┘▓▓▓▓▓
```

- **Desktop/tablet:** the sidebar is **always visible + fixed**; main content scrolls independently. Tablet keeps the sidebar (it fits) — narrower gutters.
- **Mobile:** a slim **top bar** with a hamburger + the wordmark; tapping ☰ slides the **same sidebar** in as an overlay drawer (scrim behind). The drawer closes on a nav tap, the ✕, Esc, or scrim tap.
- The **active section** is highlighted (subtle filled background + medium weight + `aria-current="page"`).
- The **account control** sits at the **bottom of the sidebar** (and drawer): the user's email → a menu with **Security** + **Sign out**.

## States (every state ships — load-bearing)

| State | What shows |
|---|---|
| **active section** | the current nav item filled/bold + `aria-current`; others quiet |
| **drawer closed → open (mobile)** | hamburger toggles; drawer slides over a scrim; focus moves into the drawer |
| **drawer dismiss** | nav-tap / ✕ / Esc / scrim → closes; **focus returns to the hamburger** |
| **a live section** | renders its real page (Dashboard = recap + WorkflowCard; Accounts = the accounts surface) — unchanged content, just framed |
| **a coming-soon section** | the `<ComingSoon>` placeholder — section title + a one-line teaser + a muted mark; **never fabricated data** |
| **account menu** | closed by default; opens up-and-over the email; Security + Sign out; keyboard + click-away close |
| **not signed in (AAL1/none)** | never reached — the layout gate redirects to `/sign-in` before the shell renders |

## Layout & responsive

- **Sidebar:** ~260px, fixed, full-height; brand wordmark top, nav list, account control pinned to the bottom. Subtle right border, off-white/white surface (match the existing cards).
- **Main:** fills the rest; comfortable max content width for readability on wide screens; the page owns its own title/content (Dashboard, Accounts, ComingSoon each render their heading).
- **Breakpoints (Tailwind):** `lg:` and up → fixed sidebar, no hamburger; below `lg` → top bar + drawer. Touch targets ≥44px on mobile.
- **Reduced motion:** the drawer slide + scrim fade are removed under `prefers-reduced-motion` (appear/disappear instantly).

## ComingSoon

A single calm, centered placeholder — **honest, not a fake dashboard**: the section's **title** (large), a **one-line teaser** of the value (copy.md), a muted icon. It reads "this is coming," never "here's your (empty) data." One component, parameterized by section.

## Accessibility

- **Skip-to-content** link as the first focusable element.
- **Keyboard:** every nav item + the account menu + the hamburger reachable + operable; logical order; `Enter`/`Space` activate.
- **Drawer (Headless UI Dialog):** focus trapped while open, `Esc`/scrim close, focus returns to the hamburger on close, `aria-modal`, body scroll locked.
- **Account menu (Headless UI Menu):** roving focus, `Esc` + click-away close.
- **Current page:** `aria-current="page"` on the active nav item; the nav is a labelled `<nav aria-label="Main">`.
- **WCAG AA** contrast; the active-state is not color-only (weight + fill + aria).

## Honest / reduced-design notes

- **Coming-soon is real-or-absent applied to features** — a clear placeholder, never a fabricated screen (the WLT-10/12/16 honesty line).
- **The shell is the frame, not the feature** — it adds chrome + navigation; it doesn't change Dashboard/Accounts content. One nav config drives everything so a future feature is "flip to live + add a page."

## DRI Log

### Decisions
- [2026-06-15] [Designer] **Flat 7-item nav, fixed sidebar (desktop/tablet) → overlay drawer (mobile); account pinned bottom** — rationale: matches the reference + scales to 7 items without grouping; the elicited mobile pattern — area: UX — reversibility: easy
- [2026-06-15] [Designer] **ComingSoon is one calm, honest placeholder (title + teaser), never fake data** — rationale: extends the real-data principle to not-yet-built features; signals the roadmap truthfully — area: trust — reversibility: easy
- [2026-06-15] [Designer] **Active state = fill + weight + aria-current (not color alone)** — rationale: accessibility + a clear "where am I" — area: a11y — reversibility: easy

### Risks
- [2026-06-15] [Designer] **Tablet is the awkward middle** (sidebar + content can feel cramped ~768px) — likelihood: medium — impact: low — mitigation: keep the sidebar but tighten gutters; verify at ~768 in the responsive pass — area: ux

### Issues
- _none_
