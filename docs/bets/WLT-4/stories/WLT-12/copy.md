---
bet: WLT-4
story: WLT-12
author: UX Writer
created: 2026-06-11
---

> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-12 — Assemble + run your first workflow (net-worth snapshot)

## Voice and tone

Calm, plain, encouraging — never judgmental, never salesy. This is the moment the platform turns the user's stated intent into something real, so the language is **concrete and personal** ("your money," "your target") and **forward-looking** (a next move, not a verdict). No jargon — **no "workflow", "archetype", "assemble", "WorkflowRun", "engine"** in the UI. Money figures are stated plainly; a low or negative net worth is never framed as failure.

## Strings

| Location / ID | Final copy | Rationale |
|---|---|---|
| `plan.ready.title` | Your plan's ready | The payoff; warm, brief |
| `plan.ready.body` | Connect an account and we'll turn this into your real money picture — and your first move. | The why; bridges to connect |
| `plan.ready.connectCta` | Connect an account | Says what it does (→ WLT-9) |
| `plan.ready.later` | I'll do this later | Honest no-coerce escape (→ dashboard) |
| `snapshot.assembling` | Putting your snapshot together… | aria-live during personalize |
| `snapshot.title` | Your money, right now | The card heading; present, grounding |
| `snapshot.netWorthLabel` | Net worth | Plain |
| `snapshot.assetsLabel` | Assets | Subtotal |
| `snapshot.debtsLabel` | Debts | Subtotal |
| `snapshot.action` | Set your target | THE one action; forward-looking |
| `target.title` | Set your target | Step heading |
| `target.suggestion` | A good first target: {amount} | One-tap suggested value |
| `target.suggestionAccept` | Use this target | Primary, one tap |
| `target.ownCta` | Choose my own | Reveals the input |
| `target.ownLabel` | Your target | Input label |
| `target.save` | Set target | Primary save |
| `target.cancel` | Cancel | Secondary |
| `target.saving` | Setting your target… | aria-live during save |
| `running.title` | You're set | Success heading (focus lands here) |
| `running.body` | We're tracking your money toward {amount}. You'll see how you're doing here. | Confirms it's running + sets expectation |
| `running.cardStatus` | Running — tracking toward {amount} | The persistent card status row |
| `errors.network` | Connection lost — check your internet and try again. | Discriminated: network (reused from WLT-9) |
| `errors.save` | Couldn't set that just now — try again. | Discriminated: save/validation |
| `errors.server` | Something went wrong on our side — your information is safe. Try again in a minute. | Discriminated: server; reassures (reused) |
| `a11y.netWorth` | Net worth {netWorth}; assets {assets}, debts {debts} | SR label for the figure block |
| `a11y.targetSet` | Target set. We're putting your tracking together. | aria-live success announcement |

## Terminology consistency
- **"Your plan" / "your target" / "your money"** — always second-person + concrete; never "the workflow" / "the goal record".
- **"Set your target"** for the action (never "configure", "create a goal", "run a workflow").
- **"Running" / "tracking"** for the active state (never "active workflow", "execution").
- **"Net worth"**, **"assets"**, **"debts"** — the only three figures this slice; no other metrics introduced.

## DRI Log

### Decisions
- [2026-06-11] [UX Writer] **"Your money, right now" (not "Net worth snapshot")** as the card title — rationale: present-tense and human; the figure is labeled "Net worth" beneath, so the heading stays warm — area: tone
- [2026-06-11] [UX Writer] **Target framed as "a good first target" + "I'll do this later" escape** — rationale: encouragement without coercion, consistent with WLT-11's no-coerce intent-first principle — area: tone
- [2026-06-11] [UX Writer] **No product nouns in UI** ("workflow", "assemble", "run") — rationale: the user declared a wish, not a workflow; the machinery stays invisible — area: comprehension

### Risks
- [2026-06-11] [UX Writer] **{amount}/{netWorth} interpolation** must be locale-formatted currency — likelihood: low — impact: low — mitigation: Engineer formats via the shared money formatter; copy carries the slot only — area: i18n

### Issues
- _none_
