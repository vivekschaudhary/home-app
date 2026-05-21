# Workflow: /create-brief

Creates a new bet — feature, OKR, tech debt, continuous improvement, or architectural initiative. PM-led, Researcher always engaged.

## Trigger

`/create-brief <source-link>` (Confluence, GDrive, Notion, ticket URL)
OR
`/create-brief <free text description>`
OR
`/create-brief <source-link> <free text>` (both — combine source with additional context)

## Process

1. **Verify gate:** `docs/foundation/product.md` and `docs/foundation/architecture.md` both exist with `status: approved`. If not, refuse.
2. **Load PM role context** (`compass/roles/pm.md`)
3. **Engage Researcher** (always — `compass/roles/researcher.md`)
4. **Gather source material:**
   - If source link: read via MCP (Confluence / GDrive / Notion / Linear / Jira)
   - If free text: use as primary source
   - Multiple sources allowed
5. **Researcher gathers context** in parallel:
   - Existing tickets via MCP
   - Sentry data, analytics
   - Support pain input (load Support role context briefly)
   - Asks PM clarifying questions for any gaps (Researcher always asks questions — that's its job)
6. **Generate bet ID** (Jira-style — create the epic in Jira, get the ID, e.g. PROJ-42)
7. **Draft brief** at `docs/bets/<bet-id>/brief.md` using `compass/templates/brief.md`:
   - Frontmatter: id, type (feature/okr/tech-debt/etc.), parent (optional — link to OKR or foundation bet), status: `proposed`, created date, author, source links
   - Problem, user, why-this-matters
   - Hypothesis (the bet)
   - Primary metric (name, baseline, target, source)
   - Guardrail metrics (what shouldn't degrade)
   - Measurement window (default 30 days, configurable)
   - Check-in cadence (weekly / biweekly / monthly)
   - Scope: in vs. out
   - Architecture required flag (`true | false | auto`)
   - DRI Log section
8. **Mirror to Jira/Trello/Confluence** as an epic
9. **HITL gate** — human reviews and marks `status: approved`
10. **Project Manager updates `docs/status.md`**

## Output

- `docs/bets/<bet-id>/brief.md` with `status: proposed` → `approved`
- Mirrored to ticketing/docs system
- `docs/status.md` updated

## Notes

- PM decomposes into stories **one at a time** via `/create-story <bet-id>` after this brief is approved
- If brief has `architecture_required: true` or `auto` → Architect engages next via `/create-architecture <bet-id>`
- Researcher findings live in the brief itself or `docs/bets/<bet-id>/research.md` if substantial
