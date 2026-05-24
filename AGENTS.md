# AGENTS.md

Read by every AI tool working in this repo (Claude Code, OpenAI Codex CLI, Cursor, Cline, Windsurf, GitHub Copilot, Aider, future tools). The **source of truth** for Compass rules. If a tool-specific config conflicts with this file, this file wins.

## What this project uses

**Compass** — a product development framework where every initiative is a measurable bet. Work flows: brief → architecture → story → build → review → release → measure. Roles load context per phase. One tool implements; another tool reviews.

The framework lives in `compass/`:

- `compass/roles/` — 12 role definitions
- `compass/workflows/` — phase flows
- `compass/templates/` — artifact templates
- `compass/config.yaml` — team decisions

Artifacts the framework produces live in `docs/`:

- `docs/foundation/` — foundational product & architecture bets
- `docs/bets/<bet-id>/` — all bets, parent linkage via frontmatter
- `docs/sprints/` — weekly release comms
- `docs/metrics/` — cached snapshots
- `docs/ops/`, `docs/fixes/`, `docs/incidents/` — standalone (hygiene, etc.)

## Tool division of labor

| Tool   | Plays the role of                                          |
| ------ | ---------------------------------------------------------- |
| Claude | All roles EXCEPT Reviewer and Security Reviewer            |
| Codex  | Reviewer, Security Reviewer (independent model on purpose) |

Reviewer findings are real. Disputes go to PM, not auto-resolved by either tool.

## The 12 roles

| Role                                       | Where defined                           |
| ------------------------------------------ | --------------------------------------- |
| Product Manager (merged PM + PO)           | `compass/roles/pm.md`                   |
| Researcher                                 | `compass/roles/researcher.md`           |
| Support                                    | `compass/roles/support.md`              |
| Designer                                   | `compass/roles/designer.md`             |
| UX Writer                                  | `compass/roles/ux-writer.md`            |
| Architect (per-bet)                        | `compass/roles/architect.md`            |
| Enterprise/Solution Architect              | `compass/roles/enterprise-architect.md` |
| Engineer (writes unit/API/component tests) | `compass/roles/engineer.md`             |
| Reviewer (Codex; writes E2E + automation)  | `compass/roles/reviewer.md`             |
| Security Reviewer (Codex)                  | `compass/roles/security-reviewer.md`    |
| Tech Writer                                | `compass/roles/tech-writer.md`          |
| Project Manager                            | `compass/roles/project-manager.md`      |

Load the role's full definition when playing it. Do not pattern-match — read the file.

## The 14 workflows

| Workflow                            | Command                 | Where defined                                        |
| ----------------------------------- | ----------------------- | ---------------------------------------------------- |
| Setup foundational product bet      | `/setup-product`                  | `compass/workflows/setup-product.md`                 |
| Setup foundational architecture bet | `/setup-foundation-architecture`  | `compass/workflows/setup-foundation-architecture.md` |
| Create MVP bet portfolio (bootstrap) | `/create-bet-portfolio`          | `compass/workflows/create-bet-portfolio.md`          |
| Create a new bet (brief)            | `/create-brief`                   | `compass/workflows/create-brief.md`                  |
| Create bet-level architecture       | `/create-bet-architecture`        | `compass/workflows/create-bet-architecture.md`       |
| Create a story under a bet          | `/create-story`         | `compass/workflows/create-story.md`                  |
| Build a story                       | `/build <story-id>`     | `compass/workflows/build.md`                         |
| Fix a bug                           | `/fix <ticket-or-text>` | `compass/workflows/fix.md`                           |
| Respond to an incident              | `/triage <alert>`       | `compass/workflows/triage.md`                        |
| Make a non-code/ops change          | `/ops <description>`    | `compass/workflows/ops.md`                           |
| Advance work to next phase          | `/advance`              | `compass/workflows/advance.md`                       |
| Project status                      | `/status`               | `compass/workflows/status.md`                        |
| Top-down metrics                    | `/metrics`              | `compass/workflows/metrics.md`                       |
| Measure a bet (cron)                | `/measure <bet-id>`     | `compass/workflows/measure.md`                       |

## Bet hierarchy

All bets live in `docs/bets/<bet-id>/` (flat by ID, Jira-style). Hierarchy via `parent:` frontmatter field.

```
Foundational Product Bet
  └─ OKR Bets (quarterly)
        └─ Feature Bets
              └─ Stories
                    ├─ implementation
                    ├─ tests
                    ├─ fixes
                    ├─ ops
                    └─ incidents

Foundational Architecture Bet
  └─ Architectural Initiative Bets
        └─ Stories
```

Every bet has a `type` field: `foundational-product | foundational-architecture | okr | feature | architectural-initiative | tech-debt | continuous-improvement`.

Every bet has an outcome: `won | learning | inconclusive`.

## Cross-cutting principles (always)

1. **Every artifact has a status field** — drives lifecycle and workflow gates
2. **Traceability end-to-end** — every output links back to its source
3. **No silent skips** — declined engagement or skipped phases logged as DRI decisions
4. **DRI logging at every stage** — Decisions, Risks, Issues (rationale + area tag + likelihood/impact + severity + owner all mandatory)
5. **Cron jobs owned by Enterprise/Solution Architect**
6. **Configuration as data** — all team decisions in `compass/config.yaml`
7. **Framework upgrades are explicit and versioned** — `compass/` changes are events
8. **Discipline holds under pressure** — no reduced review during incidents or P0 work
9. **HITL approval at every milestone** — configurable level but mandatory at brief approval, design + copy approval, tech design approval, merge, release
10. **Claude implements, Codex reviews** — independent models, PM arbitrates disputes
11. **No silent writes** — when a workflow writes files outside the primary artifact it's producing, it must: (a) list every file before writing, (b) wait for user confirmation, (c) summarize what was written at the end. Drafting the named artifact is expected; everything else is a side effect requiring visibility.
12. **Structured, scannable responses** — every workflow output to the user follows this shape:
    - **TL;DR** at the top (2-3 bullets max)
    - **What I did** — brief list of actions taken / files created
    - **What's next** — single clear instruction for the user (approve / edit / run command X)
    - **Open questions or risks** (only if applicable)

    No walls of prose. No multi-paragraph narration. Use tables for lists, bullets for steps, code blocks for commands. The user should be able to scan the response in under 10 seconds and know exactly what to do next.

## HITL levels

Set in `compass/config.yaml` under `hitl_level`:

- `every_phase` — approve at every role handoff (heaviest)
- `milestones` — approve at major milestones (default, recommended)
- `merge_only` — approve only at PR merge (lightest)

## Two paths for work

**Bet-driven** (default) — any user-facing change, feature work, tech debt, continuous improvement, architectural initiative. Requires a brief.

**Hygiene** — `hygiene: true` tag on `/ops` or `/fix`. Dependency patches, CI fixes, doc typos, secret rotations, dev-experience tweaks. Skips brief, still gets full review.

## When you're unsure

- What role am I playing? → check the active workflow + load `compass/roles/<role>.md`
- What artifact should I produce? → see the role file + matching template in `compass/templates/`
- What rules apply to this bet? → read the bet's brief, architecture (if any), parent bet, foundation docs
- Do I need approval? → check `compass/config.yaml` and the HITL gates in the active workflow
- What did past decisions say? → check the relevant artifact's `## DRI Log` section
