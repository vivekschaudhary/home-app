> **Status:** Early. Used by the author on real projects. Public for transparency, not actively soliciting users. Feedback welcome via Discussions; no support promises.

# Compass

> Product development with direction.

A vendor-neutral product development framework. Compass holds the shape of work from problem → ship → measure → learn, with AI tools playing roles across the lifecycle.

## What Compass is

A markdown-based framework that any AI tool can read. The framework lives in `compass/`. Tool-specific wrappers (Claude Code, OpenAI Codex CLI, others) are thin and point at the same source of truth.

## Core ideas

- **Every initiative is a bet.** Foundation product, OKRs, features, architectural initiatives — all measurable bets with a hypothesis, key metric, and an outcome: **won / learning / inconclusive**.
- **Bets contain stories.** Stories contain implementation, tests, fixes, ops.
- **Roles, not job titles.** 12 product roles played by AI tools loading the right context at each phase.
- **Two tools, separated jobs.** Claude implements. Codex reviews. Independent models catch what one would miss.
- **Discipline holds always.** Full review on every PR, no shortcuts under pressure.
- **Decisions, Risks, Issues** logged at every stage (DRI logs).

## The flow

```
/setup-product                  → Foundation product bet (PM)
/setup-foundation-architecture  → Foundation architecture bet (Enterprise/Solution Architect)

/create-brief                   → A new bet (PM + Researcher)
/create-bet-architecture        → Bet-level technical strategy (Architect + Enterprise Arch)
/create-story        → A shippable slice under the bet (PM)
/build <story>       → Implement (Engineer + Codex review + Architect compliance)
/fix <ticket>        → Bug flow (Support → Engineer → Codex)
/triage <alert>      → Incident response (Engineer + Support + PO awareness)
/ops <change>        → Infra / config / non-code changes (Enterprise Arch + Codex)

/advance             → Move current work to next phase
/status              → Project Manager's rolling status
/metrics             → Top-down view: foundation → OKR → feature → engineering
/measure <bet>       → Cron-driven check-ins toward bet outcome
```

## Get started

## Heads-up: AI tool memory persists across folder deletion

If you reuse a folder path for a new Compass project (delete + recreate at the same path), AI tools may carry stale context from the prior project. See `SETUP.md` → "Starting fresh at the same folder path" for the cleanup steps.

Read `SETUP.md`.
