# Workflow: /setup-foundation-architecture

Creates the **foundational architecture bet** — the platform's load-bearing technical decisions as a bet. Requires foundational product bet to be `approved` first.

## Trigger

`/setup-foundation-architecture` after `/setup-product` is approved.

## Process

1. **Verify gate:** `docs/foundation/product.md` exists with `status: approved`. If not, **refuse** and tell user to run `/setup-product` first.
2. **Check state:** if `docs/foundation/architecture.md` exists with `status: approved`:
   - Ask user: amend (creates v2) or abort?
   - If amend: rename existing to `architecture-v<N>.md`, mark `superseded`
3. **Load Enterprise/Solution Architect role context** (`compass/roles/enterprise-architect.md`)
4. **Read foundational product bet** for product context (constraints, target users, regulatory needs)
5. **Make project-level choices** by asking user (with smart defaults):
   - Repo shape (monorepo / polyrepo)
   - Backend language & framework
   - Frontend framework (if any)
   - Mobile framework (if any)
   - Database
   - Contracts format (OpenAPI / tRPC / GraphQL / none)
   - Auth model
   - Deployment target & CI/CD platform
   - Observability stack
   - Secrets management
   - Infrastructure-as-code approach
   - Sprint length (default 1 week)
   - Connectors (GitHub/GitLab, Jira/Linear, Sentry/Datadog, Figma, Confluence/Notion, Slack/PagerDuty)
   - HITL level (every_phase / milestones / merge_only)
6. **Document constraints:** regulatory, team skill, performance, cost
7. **Draft `docs/foundation/architecture.md`** using `compass/templates/foundation-architecture.md`:
   - This IS a bet (architecture as a wager)
   - Hypothesis, measurement window (typically multi-year), check-in cadence
   - Frontmatter: `type: foundational-architecture`, `status: proposed`
8. **Plan scaffolding** — present to user:
   - List every file that will be created
   - Group by purpose (entrypoints, configs, CI, etc.)
   - Wait for explicit user confirmation before writing
9. **Scaffold the repo** (after confirmation):
   - Boundary folders, CI/CD configs, base configs
10. **Summarize what was written** — table of files + purpose, BEFORE marking workflow complete
11. **Populate `compass/config.yaml`** with team decisions from step 5
12. **DRI log** seeded with technology decisions (rationale + alternatives + reversibility)
13. **Mirror to Confluence** as strategic technical doc
14. **HITL gate** — human reviews and marks `status: approved`

## Output

- `docs/foundation/architecture.md` with status `proposed` → `approved` after HITL
- Repo scaffolded with boundary folders, CI/CD config
- `compass/config.yaml` updated with team decisions
- Mirrored to docs system per config

## Refusal cases

- `docs/foundation/product.md` missing or not approved
- `docs/foundation/architecture.md` exists with `status: proposed` (in review)
- User refuses to make any technology choices

## Notes

- This is the most consequential setup — technology choices here are hard to reverse
- Enterprise Architect documents reversibility honestly on every choice
- After this, `/create-brief` can run
