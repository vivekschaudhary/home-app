---
bet: WLT-3
story: WLT-11
author: Designer
created: 2026-06-09
figma: n/a — no Figma MCP on host; this spec is the source of truth for v1
area_tags: [frontend, product]
---

# Design: WLT-11 — Intent front door

## Overview

The first thing a new user sees after sign-in — **before any bank connection** (intent-first, user-first). The emotional job: a financially-anxious person should feel **met and reassured**, not handed a setup form. So the screen is **calm, warm, low-density**: a friendly question, six clusters of plain first-person intents, one tap to declare. No numbers, no charts, no jargon. This is the product's first real impression of "this thing gets me."

New surface: `app/onboarding/intent/`. Builds on the WLT-1 signed-in shell.

## User flow
1. Sign in (WLT-1) → **no declared intent** → routed to the intent front door.
2. User reads "What would you like help with?" → scans the 6 clusters → **taps one starter intent**.
3. Declare → brief "Saving…" → **"Got it. We're putting your plan together."** placeholder → CTA **"Connect an account"** (bridge to WLT-2) or **"I'll do that later."**
4. Escape hatch at any point: **"I'm not sure yet — just let me look around"** → dashboard (no intent persisted; not re-prompted aggressively).

## Screen: Intent front door (`/onboarding/intent`)
- **Header:** `intent.title` (large, warm) + `intent.subtitle` (reassuring, smaller).
- **Body:** the **6 cluster groups**, each a soft card with the cluster header (`a11y.clusterGroup`) and its 2–3 starter intents as **selectable options**. Selection is **single across the whole screen** (one intent declared) — radiogroup semantics spanning the groups, or a listbox; visually the chosen option highlights.
- **Footer:** `intent.explore` as a quiet text link (never a loud button — it's the fallback, not the goal).
- **Layout:** clusters in a responsive 2–3 column grid on desktop, single column on mobile; generous whitespace; emotion-led, not data-dense.

| State | Description | Copy |
|---|---|---|
| Initial | the 6 clusters, nothing selected | `intent.title` / `intent.subtitle` |
| Selecting | one option highlighted; a primary "Continue"/declare affordance appears (or tap-to-declare) | — |
| Declaring | CTA → spinner, disabled | `intent.declaring` |
| Error | inline, non-destructive; selection preserved; retry | `errors.*` |
| Success | replaced by the confirmation panel | `intent.done.*` |

## Screen: Confirmation (placeholder)
- Calm success panel: `intent.done.title` + `intent.done.body`, primary **`intent.done.cta`** ("Connect an account" → WLT-2), secondary **`intent.done.secondary`** ("I'll do that later" → dashboard).
- **No fake workflow / no fabricated plan** — WLT-4 isn't built; we promise it's coming, we don't mock it.

## Interactions
- **One tap to declare** (guardrail < 90s) — no multi-step wizard in this slice.
- Selecting an intent is reversible before confirming (pick a different one).
- The explore link never blocks — it's always available.
- Returning user (already declared) never sees this screen (routed onward).

## Accessibility
- The intents form a single **radiogroup** (one selection across the screen); each cluster card is a labelled subgroup (`a11y.clusterGroup`). Fully keyboard-operable (arrow keys within the set, Enter to declare).
- Focus moves to the confirmation panel on declare; `aria-live="polite"` announces `a11y.declared`.
- WCAG AA contrast; selection conveyed by **shape/check + text**, never color alone; reduced-motion respected (no celebratory motion that could read as patronizing).

## Design system components
Reuses `Button`, `Banner`/inline error, the card shell, `Toast` from `@wealth/ui`. **Establishes:** `ClusterGroup` (labelled card wrapping a set of intent options) + `IntentOption` (selectable first-person chip/row with selected state). Tailwind; seeds `/packages/ui`.

## DRI Log
### Decisions
- [2026-06-09] [Designer] **Calm, low-density, emotion-led** over a dense form — rationale: first impression for an anxious persona; warmth + reassurance is the differentiation, density is the incumbents' failure — area: UX/trust
- [2026-06-09] [Designer] **Explore is a quiet link, declaring is the primary path** — rationale: encourage intent (the product's wedge) without coercing it (user-first) — area: UX
- [2026-06-09] [Designer] **No mocked plan** on the placeholder — rationale: honesty; promising-but-not-faking the workflow keeps trust until WLT-4 lands — area: trust
### Risks
- [2026-06-09] [Designer] Six clusters could feel like a lot to scan — likelihood: medium — impact: low — mitigation: strong visual grouping + short first-person labels keep it skimmable; measure drop-off, prune later — area: UX
### Issues
- _none_
