---
bet: WLT-4
story: WLT-12
author: Designer
created: 2026-06-11
---

# Design: WLT-12 — Assemble + run your first workflow (net-worth snapshot)

## Design intent

This is the payoff moment of the loop: the user stated what they want (WLT-11), connected their money (WLT-9), and now the platform **does something with it** — assembles a real, personalized plan and asks for one concrete commitment. Tone matches the existing surfaces: **calm, trustworthy, plain**. The screen must read as *"this is yours, it's real, here's your one next move"* — not a dashboard of charts, not a configuration form. One snapshot, one action.

## Surfaces & flow

```
Declare intent (WLT-11)
   │  (overview/aspiration/checkup goalKind)
   ▼
[A] Plan-ready / pending_data  ──connect──▶  WLT-9 connect flow
   │  (returns after sync)
   ▼
[B] Workflow card — net-worth snapshot (active)
   │  "Set your target" (one action)
   ▼
[C] Set-target step  ──save──▶  [D] Running confirmation (WorkflowRun written)
```

Non-mapped goalKinds (the other 9) are out of scope → they keep the WLT-11 placeholder unchanged.

## States (every state ships — load-bearing)

| State | Trigger | What shows |
|---|---|---|
| **pending_data** | declared, no connected/synced account | `[A]` plan-ready card + primary **Connect** CTA (bridges to WLT-9) + secondary "I'll do this later" → dashboard. Never a number. |
| **loading / assembling** | personalizing from balances | inline skeleton on the card + `aria-live` "Putting your snapshot together…" |
| **active** | personalized | `[B]` net-worth snapshot (net worth, with assets/debts subtotals) + one **Set your target** action |
| **set-target** | user taps the action | `[C]` a suggested target (one-tap accept) OR a short amount input; primary **Set target** + cancel |
| **completed / running** | WorkflowRun written | `[D]` running confirmation; the card now reads "Running — tracking toward {target}"; focus moves here |
| **error** | network/save/server | discriminated banner on the card (per copy); the action stays retryable; no data loss |
| **empty** | connected but 0 accounts/balances | treat as pending_data (connect/repair prompt); never a fake/zero net worth |

## Layout — the workflow card (`[B]`)

```
┌──────────────────────────────────────────┐
│  Your money, right now                    │  ← title (archetype framing)
│                                           │
│  Net worth                                │
│  $ 24,180                                 │  ← real, from balances; large, calm
│  Assets $31,400   ·   Debts $7,220        │  ← subtotals, muted
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │  Set your target            →        │ │  ← THE one action (primary)
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```
- One card, one primary action. No charts, no secondary metrics competing for attention this slice.
- Lives on the dashboard (the post-connect home), above the accounts list.
- Set-target `[C]`: lead with a **suggested target** (e.g., +10% / a round number above current) as a one-tap accept — minimizes effort (the < 90s / one-tap spirit). A "choose my own" reveals a single amount input.
- Running `[D]`: the card collapses to a quiet "Running — tracking toward $X" row; this is the persistent home of the workflow.

## Accessibility

- **Keyboard:** Connect, Set-your-target, the suggested-target accept, the amount input, Set-target, Cancel — all reachable + operable; logical tab order.
- **Focus:** on completion, focus moves to the running-confirmation heading (`tabIndex=-1`), so SR users land on the outcome.
- **Live regions:** assembling ("Putting your snapshot together…") and saving ("Setting your target…") announced via `aria-live="polite"`; the success line via `role="status"`.
- **Labels:** the net-worth figure has an SR label spelling out "Net worth: $24,180, assets $31,400, debts $7,220." The action button text is self-describing ("Set your net-worth target").
- **WCAG AA** contrast; **reduced-motion** honored (no count-up animation on the figure when reduced-motion is set — show the final value directly).
- Numbers are never the only signal (labels accompany).

## Reduced / honest design notes
- The net-worth figure is **real or absent** — if balances aren't ready, the card is `pending_data`, never `$0`/placeholder (mirrors WLT-10's "don't show Connected before it's true").
- The "target" is a commitment the user owns — framed as encouragement, never coercion (consistent with WLT-11's no-coerce principle); the secondary "later" path is always present.

## DRI Log

### Decisions
- [2026-06-11] [Designer] **One card, one action — no dashboard of charts** — rationale: the loop's payoff must read as a single clear next move, matching the calm voice; multi-metric dashboards are a later surface — area: UX — reversibility: easy
- [2026-06-11] [Designer] **Lead the target step with a one-tap suggested value** — rationale: honors the low-friction/one-tap spirit; "choose my own" is the reveal, not the default — area: UX — reversibility: easy

### Risks
- [2026-06-11] [Designer] **Net worth can be emotionally heavy** (negative / low) for an anxious user — likelihood: medium — impact: medium — mitigation: plain non-judgmental framing; the action is forward-looking ("set a target"), not a verdict — area: tone

### Issues
- _none_
