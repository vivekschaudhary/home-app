# Workflow: /create-bet-architecture

Drafts bet-level technical strategy. Architect leads; Enterprise/Solution Architect always engages for cross-system input.

## Trigger

`/create-bet-architecture <bet-id>` — after the bet's brief is `approved`.

## Process

1. **Verify gate:** `docs/bets/<bet-id>/brief.md` has `status: approved`. If not, refuse.
2. **Check architecture_required field** in brief:
   - If `false` → log decision in brief DRI ("Architect declined; rationale: <why>"), exit
   - If `true` or `auto` → proceed
3. **Load Architect role context** (`compass/roles/architect.md`)
4. **Load Enterprise/Solution Architect role context** (`compass/roles/enterprise-architect.md`) — joins always
5. **Architect reads:**
   - Brief
   - Foundation product + architecture docs
   - Researcher findings
   - Existing code (read-only) for current architecture in relevant boundaries
   - Prior bet architectures (if any)
6. **If `auto`**, Architect first decides whether architecture is needed:
   - Small change, no new boundaries, no contract change → mark `architecture_required: false` in brief, log decision, exit
   - Touches boundaries, contracts, dependencies, or invariants → proceed
7. **Joint draft of `docs/bets/<bet-id>/architecture.md`** using `compass/templates/architecture.md`:
   - Decision (clear, unambiguous statement)
   - Context (technical situation, constraints)
   - Approach (file/module names, interfaces, data flow)
   - Data model changes
   - API / contract changes
   - Dependencies (justified)
   - **Enterprise Architect section:** cross-system implications, standards compliance, any drift flags
   - Alternatives considered (≥1, real not strawman)
   - Consequences (positive, negative, reversibility)
   - Test strategy (categories)
   - Rollout (feature flag, migration, staged)
   - DRI Log
8. **Status `proposed`** on architecture doc
9. **HITL gate** — human reviews and marks `status: approved`
10. **Update brief frontmatter:** `architecture_status: approved`

## Output

- `docs/bets/<bet-id>/architecture.md` with `status: approved`
- Brief's `architecture_status: approved`
- DRI log seeded with technical decisions (rationale + alternatives + reversibility)

## Notes

- Architecture is an **artifact, not a hard gate** — small bets can skip
- Engineer can start as soon as architecture is approved (no waiting for "perfect")
- Architect will engage on every PR for this bet to verify compliance (prevents tech debt drift)
- If Enterprise Architect flags standards drift, that's a BLOCKER for approval
