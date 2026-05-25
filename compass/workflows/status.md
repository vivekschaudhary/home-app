# Workflow: /status

Surfaces current state of all in-flight work. Invokes Project Manager role.

## Trigger

`/status`

## Process

1. **Load Project Manager role context** (`compass/roles/project-manager.md`)
2. **Gather state:**
   - Last `docs/status.md`
   - **`docs/foundation/plan.md`** if it exists — the living project plan owns the time-bound schedule. `/status` reads it to populate ETAs / in-flight / next-up. Don't recompute schedule data here; `/plan` does that.
   - All bets in `docs/bets/` and their statuses
   - Open PRs via GitHub MCP
   - Open Linear/Jira tickets via MCP
   - `docs/changelog.md` for recent shipped
   - Stale items (phase > 5 days, awaiting approval > 2 days, plan `last_refreshed` > 3 days)
   - Open P0/P1 issues across all bets
3. **Update `docs/status.md`** following Project Manager's template:
   - In flight (per-bet phase, owner, awaiting, ETA from `plan.md`)
   - Next up (unblocked bets from `plan.md`)
   - Awaiting human approval
   - Recently shipped (last 5)
   - Blockers
   - Risks
   - Health metrics (including plan freshness — `last_refreshed` age)
4. **Output summary in chat** (not full doc — concise):
   - In-flight count and key items
   - What needs human attention (approvals, blockers)
   - Notable risks
   - Plan freshness flag if `last_refreshed` is stale
   - Brief health summary

## Output

- Updated `docs/status.md` committed
- Inline summary in chat

## Notes

- Read-mostly. Doesn't advance work or make decisions.
- Run regularly (daily / weekly) for visibility.
- Different from `/metrics` — `/status` is operational (what's happening now); `/metrics` is analytical (outcomes, trends).
- Different from `/plan` — `/plan` writes the schedule (and refines per-bet `estimate` frontmatter); `/status` reads `plan.md` for the time-bound view. If `plan.md` is stale, run `/plan` first or `/advance` (which auto-runs `/plan`).
