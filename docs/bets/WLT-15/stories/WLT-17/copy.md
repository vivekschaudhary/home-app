---
bet: WLT-15
story: WLT-17
author: UX Writer
created: 2026-06-15
---

> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-17 — "Where your money went" (spending vs. last week)

## Voice and tone

The same calm, plain, non-judgmental voice as the rest of the recap. Spending more than last week is **never** framed as a failure or scolding — it's just what happened, stated plainly. Direction (more/less) is always in **words**, never color or an arrow alone. No jargon. Category labels are humanized (title case), never raw merchant strings. Money is locale-formatted via the shared formatter; copy carries the slot only.

## Strings

| Location / ID | Final copy | Rationale |
|---|---|---|
| `spend.heading` | Where your money went | The section heading; answers the user's literal question |
| `spend.thisWeek` | Spent {total} this week | The headline figure, plain |
| `spend.less` | {amount} less than last week | Down — gentle, not congratulatory |
| `spend.more` | {amount} more than last week | Up — plain fact, never scolding |
| `spend.same` | About the same as last week | Flat |
| `spend.noComparison` | We'll compare this to last week once there's a bit more history. | First-week honest state — no fabricated delta |
| `spend.topLabel` | Top | Prefix for the category list ("Top: Groceries …") |
| `a11y.spend` | Where your money went: spent {total} this week, {comparison}. Top categories: {categories}. | SR summary for the block |

## Terminology consistency

- **"Where your money went"** — the section's name; concrete, second-person, answers "where did it go". Never "spending analysis" / "expense report".
- **"Spent … this week"** / **"{amount} more/less than last week"** — plain, in words; never "overspent", "over budget", "you're up X%".
- Category labels are **humanized** ("Groceries", "Dining", "Transport"), never raw Plaid codes or merchant names.
- The only figures this section adds: **this week's spend, the week-over-week delta, and top category amounts.** No budgets, no anomalies (later stories) — don't introduce their labels here.

## DRI Log

### Decisions
- [2026-06-15] [UX Writer] **"Where your money went" as the heading** — rationale: it's the user's literal question (the breakdown they asked for); warmer + clearer than "Spending" or "Expenses" — area: tone
- [2026-06-15] [UX Writer] **Higher spend stated plainly ("{amount} more than last week"), no scolding** — rationale: the anxious persona must not feel judged for spending; the product reflects, it doesn't lecture — area: tone
- [2026-06-15] [UX Writer] **First-week shows this-week-only + an honest "no comparison yet" line** — rationale: real-or-absent; never a fabricated week-over-week delta — area: honesty

### Risks
- [2026-06-15] [UX Writer] **{total}/{amount} interpolation** must be locale-formatted currency; category labels humanized — likelihood: low — impact: low — mitigation: Engineer formats via the shared money formatter + a category-humanize helper — area: i18n

### Issues
- _none_
