---
bet: WLT-15
story: WLT-16
author: UX Writer
created: 2026-06-14
---

> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-16 — The "since last time" recap

## Voice and tone

Calm, plain, encouraging — the same voice as WLT-12. This is the reason to return, so the language is **concrete, personal, and forward-looking** ("your money," "your target," "since last time"). A drop in net worth or being behind target is **never** framed as failure — it's just where things stand, with a move you can make. No jargon — **no "workflow", "archetype", "snapshot job", "WorkflowRun", "recap engine", "WAWU"** in the UI. Direction (up/down) is always stated in **words**, never color alone. Money is locale-formatted via the shared formatter; copy carries the slot only.

## Strings

| Location / ID | Final copy | Rationale |
|---|---|---|
| `recap.heading` | Since last time | The section heading; the whole promise in three words |
| `recap.loading` | Pulling your latest numbers… | aria-live during load |
| `recap.coldStart` | We've started watching your money. You'll see how it's moving here in a few days. | Honest cold-start — real or absent, never a fake number |
| `recap.movementUp` | Up {amount} since last week | Movement, in words; positive |
| `recap.movementDown` | Down {amount} since last week | Movement, plain — not a verdict |
| `recap.movementFlat` | About the same as last week | Flat; reassuring-neutral |
| `recap.netWorthLine` | Net worth {netWorth} | The current figure, labeled |
| `recap.progressLabel` | Toward your target | Section label for the bar |
| `recap.progressValue` | {current} of {target} | The plain numbers under the bar |
| `recap.progressPercent` | {percent}% there | The bar's text value (never color-only) |
| `recap.onTrack` | You're on track. | Positive framing when ahead/on-pace |
| `recap.behind` | A bit behind your target — here's a move. | Plain, forward; no shame, no red |
| `action.adjust` | Adjust your target | The one action when behind |
| `action.raise` | Aim higher? | The one action when on-track/ahead — a real choice |
| `action.saving` | Saving… | aria-live during the write |
| `acked.line` | Got it — we'll keep tracking. | Quiet confirmation; focus lands here |
| `errors.network` | Connection lost — check your internet and try again. | Discriminated: network (reused) |
| `errors.save` | Couldn't save that just now — try again. | Discriminated: save/validation |
| `errors.server` | Something went wrong on our side — your information is safe. Try again in a minute. | Discriminated: server; reassures (reused) |
| `a11y.recap` | {movement}. Net worth {netWorth}. {percent}% toward your {target} target. | SR label for the figure block |
| `a11y.progressBar` | Progress toward target: {percent} percent | progressbar SR label |
| `a11y.acked` | Saved. We'll keep tracking toward your target. | aria-live success announcement |

## Terminology consistency

- **"Since last time"** — the surface's name; second-person, time-anchored. Never "dashboard recap" / "insights feed".
- **"Your target" / "your money" / "net worth"** — always second-person + concrete; never "the goal record" / "the workflow".
- **"Up / Down / About the same"** — movement always in words (never an arrow or color as the only signal).
- **"On track" / "a bit behind"** — progress framed plainly; never "failing", "off track", "you missed".
- The only figures this slice: **net-worth movement, net worth, target progress**. No spending breakdown, no anomalies (later stories) — don't introduce labels for them here.

## DRI Log

### Decisions
- [2026-06-14] [UX Writer] **"Since last time" as the heading** — rationale: names the entire value prop (a reason to return) in the user's words; warmer + clearer than "Recap" or "Insights" — area: tone
- [2026-06-14] [UX Writer] **Movement stated in words ("Up/Down/About the same"), never color/arrow alone** — rationale: accessibility + honesty; a falling number must read as plain fact, not an alarm — area: comprehension/a11y
- [2026-06-14] [UX Writer] **"A bit behind your target — here's a move" (no failure language)** — rationale: the anxious persona must not feel judged; consistent with WLT-12's non-judgmental framing — area: tone
- [2026-06-14] [UX Writer] **No product nouns in UI** (no "workflow"/"recap engine"/"run") — rationale: the machinery stays invisible; the user sees their money, not the system — area: comprehension

### Risks
- [2026-06-14] [UX Writer] **{amount}/{netWorth}/{current}/{target} interpolation** must be locale-formatted currency — likelihood: low — impact: low — mitigation: Engineer formats via the shared money formatter; copy carries the slot only — area: i18n

### Issues
- _none_
