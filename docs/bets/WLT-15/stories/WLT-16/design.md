---
bet: WLT-15
story: WLT-16
author: Designer
created: 2026-06-14
---

# Design: WLT-16 — The "since last time" recap (net-worth movement + target progress + one move)

## Design intent

This is the **reason to return**. The user finished the loop (WLT-12) and hit the dead-end — "nothing left to do." This surface makes the dashboard **different every visit**: it shows *what changed with your money since last time* and hands you *one* next move. Tone matches every surface before it — **calm, plain, trustworthy, non-judgmental**. It must read as *"here's what moved, here's where you stand, here's your one move"* — not a chart dashboard, not an alert wall. One recap, one action. The figure is **real or absent** — never a fabricated number (the WLT-10/WLT-12 honesty rule).

## Surfaces & flow

```
/dashboard (logged in, AAL2)
   │
   ▼
[RECAP]  "Since last time"  ── reconcile-on-load (reads live, never stale props)
   │   • Net-worth movement (since last snapshot)
   │   • Progress toward your target  ← wires the WLT-12 "running" workflow to actually track
   │   • ONE prompted action (state-ranked)
   │
   ├─ cold-start (───<2 snapshots──▶)  honest "we'll show movement soon" state
   │
   ▼ user taps the one action
[ACTION]  adjust / affirm your target  ──save──▶  WorkflowRun written (repeatable, weekly)
   │
   ▼
[ACKED]  quiet confirmation; recap stays; focus moves to the outcome line
```

The recap sits **above** `WorkflowCard` on the dashboard. `WorkflowCard` (WLT-12) is unchanged — it remains the workflow's home; the recap is the new returning-user surface layered on top. The recap only appears once the user has a **running workflow with a target set** (the dead-end population); before that, the existing WorkflowCard onboarding owns the screen.

## States (every state ships — load-bearing)

| State | Trigger | What shows |
|---|---|---|
| **cold-start** | running workflow + target, but < 2 net-worth snapshots | recap header + honest "We've started watching — you'll see how your money moves here in a few days." Target-progress shows (current vs target works from day one). **Never a fake movement number.** |
| **loading** | recap data resolving | inline skeleton on the recap card + `aria-live` "Pulling your latest numbers…" |
| **steady (movement up/down/flat)** | ≥ 2 snapshots | movement line ("Up $X since last week" / "Down $X" / "About the same") + progress-toward-target + the one action |
| **on-track** | progress ≥ pace | progress framed positively; action = review/raise target (forward, not a verdict) |
| **behind** | progress < pace, or net worth fell | progress framed plainly + non-alarming; action = adjust target / keep pushing — **never** a red "you failed" |
| **action-saving** | user submits the action | `aria-live` "Saving…"; button busy; no data loss on failure |
| **acked** | WorkflowRun written | quiet "Got it — we'll keep tracking." line; focus moves here; recap remains |
| **error** | network / save / server | discriminated banner on the recap card (per copy); action stays retryable; the recap figures still render (degrade the action, not the whole surface) |
| **no-data / repair** | connections error or balances missing | defer to WorkflowCard's pending/repair path; recap hides rather than showing a hollow shell |

## Layout — the recap card

```
┌──────────────────────────────────────────────┐
│  Since last time                              │  ← section heading
│                                               │
│  Up $420 since last week                      │  ← movement (real, or cold-start line)
│  Net worth $24,600                            │  ← current, calm
│                                               │
│  Toward your target                           │
│  ████████████░░░░░░  68%                       │  ← progress bar — THE thing that now tracks
│  $24,600 of $36,000                           │  ← plain, labeled
│                                               │
│  ┌──────────────────────────────────────────┐│
│  │  Adjust your target            →          ││  ← THE one action (state-ranked)
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

- **One card, one action.** No competing CTAs, no chart grid this slice (spending breakdown is WLT-17; anomalies are Slice 2).
- **Movement** is the "what changed" line; **progress** is the "where you stand" bar. Both come from the new daily `net_worth_snapshots` series.
- **The one action is honest + tied to the real target** — it opens the target step (reuses the WLT-12 target mechanism), so the user either adjusts or affirms their target. **No vanity tap** (guardrail: no dark patterns) — the WorkflowRun records a genuine decision the user made looking at real data.
- Progress bar is **never the only signal** — the % and the "$X of $Y" line accompany it (a11y + honesty).

## The one prompted action (ranking — this slice)

Only target/movement signals exist this slice (spending + anomalies come later), so the ranker is simple and honest:

1. **Behind / net worth fell** → *"Adjust your target"* — opens the target step; the user can lower it (honest reset) or keep it. Framed plainly, never as failure.
2. **On-track / ahead** → *"Aim higher?"* (raise target) — a real forward choice, not a nudge-for-nudge's-sake.
3. **Cold-start (no movement yet)** → no action pushed beyond the WorkflowCard; the recap states it's watching. (We do not manufacture an action when there's nothing to act on — guardrail.)

Exact pace/threshold math (what counts as "behind") is an Engineer escalation per the bet architecture (I2); design fixes the *shape* (one state-ranked action), not the numbers.

## Accessibility

- **Keyboard:** the one action, the target input + save + cancel (reused from WLT-12) — all reachable + operable; logical tab order; Esc cancels the target step.
- **Focus:** on action completion, focus moves to the "Got it" outcome line (`tabIndex=-1`) so SR users land on the result; on cold-start, no focus trap.
- **Live regions:** loading ("Pulling your latest numbers…") and saving ("Saving…") via `aria-live="polite"`; the acked line via `role="status"`.
- **Screen-reader labels:** movement + net worth + progress have a spelled-out SR label ("Up $420 since last week. Net worth $24,600. 68% toward your $36,000 target."). The progress bar uses `role="progressbar"` with `aria-valuenow/min/max`.
- **WCAG AA** contrast; **reduced-motion** honored — no count-up / bar-fill animation when reduced-motion is set (render final state directly).
- Numbers are never the only signal (labels + text accompany). Direction (up/down) is conveyed in **words**, not color alone.

## Honest / reduced-design notes

- **Movement is real or absent.** Cold-start shows an honest "watching" line, never `$0 change` or a placeholder (mirrors WLT-10 "don't show Connected before it's true").
- **Behind-target is plain, not punitive** — no red alarm, no shame; the action is forward-looking. An anxious user (the persona) must not feel judged (carries the WLT-12 tone risk forward).
- **Reconcile-on-load** (the #36 / `[real-path-integration-coverage]` lesson): the recap reads live on mount; it never trusts stale server props. Persistence (the action write) happens in the route handler, never in RSC render.
- The recap **degrades, not collapses**: if the action errors, the figures still show; if balances are missing, the recap hides rather than showing a hollow frame.

## DRI Log

### Decisions
- [2026-06-14] [Designer] **One recap card, one action — layered above the unchanged WorkflowCard** — rationale: the returning-user surface must read as a single clear "what moved + one move," not a dashboard; WorkflowCard stays the workflow's home — area: UX — reversibility: easy
- [2026-06-14] [Designer] **The one action opens the real target step (adjust/affirm/raise), never a vanity tap** — rationale: honors the no-dark-patterns guardrail; the WorkflowRun must record a genuine decision on real data — area: UX/trust — reversibility: easy
- [2026-06-14] [Designer] **Cold-start states it's watching; no manufactured action** — rationale: real-data-only guardrail; movement is real or absent — area: honesty — reversibility: easy

### Risks
- [2026-06-14] [Designer] **"Behind target" / falling net worth can feel like a verdict** to an anxious user — likelihood: medium — impact: medium — mitigation: plain non-judgmental framing, forward-looking action, no red/alarm styling, direction in words not color — area: tone

### Issues
- _none_
