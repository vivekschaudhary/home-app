---
bet: WLT-3
story: WLT-11
author: UX Writer
created: 2026-06-09
---

> Engineer note: use these strings **verbatim**. The cluster + starter-intent strings are also the
> **canonical taxonomy** — `intent_key` values are the contract the API validates + WLT-4 consumes.
> Voice: calm, warm, plain. **Meet the user at the emotion, not the spreadsheet.** No jargon, no numbers.

# Copy: WLT-11 — Declare your intent

## Screen
| ID | Final copy | Rationale |
|---|---|---|
| `intent.title` | What would you like help with? | Warm, open, low-pressure — not "set up your budget" |
| `intent.subtitle` | Pick what feels closest. You can always change it later. | Reassures; removes the fear of a "wrong" choice (user-first, no-coerce) |
| `intent.explore` | I'm not sure yet — just let me look around | The no-dead-end path (AC5) |
| `intent.declaring` | Saving… | Loading state while persisting |

## The 6 clusters + starter intents (canonical taxonomy)
Each row: cluster header + the starter intents (with `intent_key`). Verbatim labels.

| Cluster | `cluster` | Header copy | Starter intents (`intent_key` → label) |
|---|---|---|---|
| **Fear** | `fear` | What's worrying you? | `fear_overspending` → "I think I'm overspending" · `fear_not_enough` → "I'm scared I won't have enough" · `fear_where_it_goes` → "I don't know where my money goes" |
| **Goal** | `goal` | What are you working toward? | `goal_save_specific` → "Save for something specific" · `goal_pay_off_debt` → "Pay off debt" · `goal_emergency_fund` → "Build an emergency fund" |
| **Confusion** | `confusion` | Want to make sense of it? | `confusion_understand` → "Help me understand my money" · `confusion_doing_okay` → "Am I doing okay?" |
| **Control** | `control` | Want to get a grip? | `control_one_place` → "See all my money in one place" · `control_whats_coming` → "Know what's coming up" |
| **Habit** | `habit` | Want to build a routine? | `habit_save_regularly` → "Build a saving habit" · `habit_stick_to_budget` → "Stick to a budget" |
| **Aspiration** | `aspiration` | Thinking bigger? | `aspiration_grow_wealth` → "Grow my wealth" · `aspiration_plan_future` → "Plan for my future" |

## Confirmation (placeholder — WLT-4 not built yet)
| ID | Final copy | Rationale |
|---|---|---|
| `intent.done.title` | Got it. We're putting your plan together. | Confirms the intent landed; sets expectation without promising a fake workflow |
| `intent.done.body` | We'll use this to set up the right things for you. Next, connect an account so we can work with your real numbers. | Bridges to WLT-2 (connect) — intent first, *then* the friction |
| `intent.done.cta` | Connect an account | The natural next step after intent |
| `intent.done.secondary` | I'll do that later | No-coerce; lets them explore first |

## Errors
| ID | Final copy | Rationale |
|---|---|---|
| `errors.save` | We couldn't save that — give it another try. | Generic save failure (incl. a rejected/unknown intent) |
| `errors.network` | You appear to be offline. Check your connection and try again. | Reused from WLT-6 |
| `errors.server` | Something went wrong on our side — your information is safe. Try again in a minute. | Reused from WLT-6 |

## Accessibility
| ID | Final copy | Rationale |
|---|---|---|
| `a11y.clusterGroup` | {cluster header} — choose one | Group label for the radio/listbox set |
| `a11y.declared` | Saved. Putting your plan together. | aria-live confirmation on declare |

## Terminology consistency
- **"What would you like help with?"** framing — never "set up", "configure", "budget".
- Starter intents are **first-person, plain, emotion-led** ("I'm scared…", "Help me…") — never feature-speak.
- **"Connect an account"** — carried from WLT-9, unchanged.

## DRI Log
### Decisions
- [2026-06-09] [UX Writer] **First-person, emotion-led starter intents** ("I think I'm overspending") not feature labels ("Spending insights") — rationale: meets the anxious persona at the feeling; the product's wedge is empathy over tooling — area: voice
- [2026-06-09] [UX Writer] Confirmation **bridges to connect** ("Next, connect an account…") — rationale: intent-first then friction; the intent motivates the connection — area: flow
### Risks
- [2026-06-09] [UX Writer] Some starter intents may overlap across clusters (e.g. "doing okay?" vs "overspending?") — likelihood: medium — impact: low — mitigation: the `intent_declared` distribution will show which resonate; prune/merge post-baseline — area: taxonomy
### Issues
- _none_
