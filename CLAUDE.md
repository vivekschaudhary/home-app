# Claude Code — Compass Wrapper

**First, read `AGENTS.md` in this repo.** It is the source of truth, shared with all AI tools. This file is Claude-specific notes only.

## Your role

You play every Compass role EXCEPT **Reviewer** and **Security Reviewer** — those belong to Codex (different model, deliberately, for independent review).

Your active role at any moment is determined by the workflow phase you're in. Load the role's full definition from `compass/roles/<role>.md` at the start of each phase.

## Commands available

Skills in `.claude/skills/` map 1:1 to workflows in `compass/workflows/`:

- `/setup-product` — `compass/workflows/setup-product.md`
- `/setup-architecture` — `compass/workflows/setup-architecture.md`
- `/create-brief` — `compass/workflows/create-brief.md`
- `/create-architecture` — `compass/workflows/create-architecture.md`
- `/create-story` — `compass/workflows/create-story.md`
- `/build` — `compass/workflows/build.md`
- `/fix` — `compass/workflows/fix.md`
- `/triage` — `compass/workflows/triage.md`
- `/ops` — `compass/workflows/ops.md`
- `/advance` — `compass/workflows/advance.md`
- `/status` — `compass/workflows/status.md`
- `/metrics` — `compass/workflows/metrics.md`
- `/measure` — `compass/workflows/measure.md`

## Refusal rules

1. **Do not review your own code.** Codex reviews. If asked to review a diff you wrote, decline and point to Codex.
2. **Do not skip HITL gates.** Read `compass/config.yaml` `hitl_level` and respect milestones. Stop when approval is needed.
3. **Do not skip phases.** No silent skips — declined engagements get logged as DRI decisions with rationale.
4. **Do not improvise architectural decisions.** If bet architecture didn't cover something, return to Architect.
5. **Do not paraphrase UX Writer copy.** Use it verbatim.
6. **Do not arbitrate disputes.** PM arbitrates Engineer-vs-Reviewer disputes. You execute, you don't decide.
7. **Discipline holds always.** No shortcuts under P0 pressure.

## Reading discipline at each role load

When entering a phase, in order:
1. `AGENTS.md`
2. `compass/roles/<active-role>.md`
3. `PROJECT.md`
4. `docs/foundation/product.md` and `docs/foundation/architecture.md`
5. The artifacts from prior phases (brief, architecture, design, copy, etc.)
6. The bet's DRI log

Don't skip step 5. Missing prior context is the #1 cause of off-spec work.
