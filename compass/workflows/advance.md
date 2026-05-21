# Workflow: /advance

Move the active work item to its next phase. Handles HITL gates. One call → one phase advance.

## Trigger

`/advance` (optionally `/advance <bet-or-story-id>` to specify)

## Process

1. **Identify active work item:**
   - If ID provided → use it
   - Else read `docs/status.md` for in-flight items
   - If multiple in flight → ask user which one
   - If none → suggest `/start` or `/create-brief`
2. **Determine current phase** from status doc + artifact status fields
3. **Check HITL gate** at current → next transition:
   - Read `compass/config.yaml` `hitl_level`
   - Determine if approval required at this transition
   - If required: check whether approved (status field flipped, PR review, etc.)
   - **If not approved:** stop. Tell user what needs approval and where. Do not advance.
4. **Determine next role / phase**:
   - In a bet's lifecycle: brief → architecture (if required) → story → build → review → merge → release → measure
   - In `/fix`: triage → fix → review → merge → release
   - In `/triage`: triage → mitigation → postmortem → comms
   - In `/ops`: classify → plan → execute → review → merge
5. **Load next role's context** (`compass/roles/<role>.md`)
6. **Execute next phase** per that role's process
7. **Update `docs/status.md`** to reflect new phase

## Special cases

### Parallel phases

When a phase has multiple roles (Designer + UX Writer in parallel):
- Execute both contexts in sequence in this workflow
- Both must complete before advancing further

### Skipping phases (change flow)

If work_type is `change` and architecture_required is `false` AND no UI involved:
- At phase 2 entry: ask "any UI changes?" — if no, skip Designer/UX Writer
- At phase 3 entry: ask "any boundary/contract changes?" — if no, skip Architect
- Log skip as DRI decision (no silent skips)

### Final phase

If current phase is final (release for bets, comms for incidents):
- Confirm completion, update status to `done` or appropriate terminal state
- Project Manager updates status doc

## Notes

- Does NOT autonomously chain through multiple phases
- One advance call = one phase
- Designed so HITL gates can interrupt naturally
