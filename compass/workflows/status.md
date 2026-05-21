# Workflow: /status

Surfaces current state of all in-flight work. Invokes Project Manager role.

## Trigger

`/status`

## Process

1. **Load Project Manager role context** (`compass/roles/project-manager.md`)
2. **Gather state:**
   - Last `docs/status.md`
   - All bets in `docs/bets/` and their statuses
   - Open PRs via GitHub MCP
   - Open Linear/Jira tickets via MCP
   - `docs/changelog.md` for recent shipped
   - Stale items (phase > 5 days, awaiting approval > 2 days)
   - Open P0/P1 issues across all bets
3. **Update `docs/status.md`** following Project Manager's template:
   - In flight (per-bet phase, owner, awaiting, ETA)
   - Awaiting human approval
   - Recently shipped (last 5)
   - Blockers
   - Risks
   - Health metrics
4. **Output summary in chat** (not full doc — concise):
   - In-flight count and key items
   - What needs human attention (approvals, blockers)
   - Notable risks
   - Brief health summary

## Output

- Updated `docs/status.md` committed
- Inline summary in chat

## Notes

- Read-mostly. Doesn't advance work or make decisions.
- Run regularly (daily / weekly) for visibility.
- Different from `/metrics` — `/status` is operational (what's happening now); `/metrics` is analytical (outcomes, trends).
