# Workflow: /triage

Incident response. Engineer + Support + PO engage (PO for awareness). Stop-the-bleed actions are HUMAN-DRIVEN (framework does not auto-rollback). Discipline still holds — full review on any code change.

## Trigger

- Manual: `/triage <description>`
- Auto: alert routed from configured tool (PagerDuty / Slack / Sentry / Linear — per `compass/config.yaml` connectors.incident_alert)

## Process

### Phase 1 — first response

1. **Load Support role context** for triage classification
2. **Load Engineer role context** — engaged immediately for technical investigation
3. **PO awareness** — notified, does not block (Engineer doesn't wait for PO before acting)
4. **Acknowledge alert** in configured channel
5. **Initial severity classification** (P0 / P1 / P2 / P3)
6. **Create incident artifact:**
   - If incident tied to a known bet: `docs/bets/<bet-id>/incidents/<incident-id>/triage.md`
   - If unknown / cross-system: `docs/incidents/<incident-id>/triage.md`
   - Use `compass/templates/incident.md`

### Phase 2 — investigate

7. **Engineer investigates:**
   - Read Sentry / observability data via MCP
   - Identify recent deploys, ops changes, related incidents
   - Form hypothesis about cause
8. **DRI log:** Engineer logs hypotheses, ruled-out options, current best theory

### Phase 3 — stop the bleed (HUMAN-DRIVEN)

9. **Framework drafts** possible mitigation actions:
   - Rollback (last deploy)
   - Feature flag toggle
   - Traffic shift
   - Hotpatch (still requires full review per discipline rule)
10. **Human chooses** which action to take. Framework does NOT auto-act.
11. **Human executes** the action (or instructs Engineer to execute via standard tools)
12. **Status update** drafted by framework, HITL approval before publishing to customers / status page

### Phase 4 — fix forward

13. If mitigation was a rollback / flag toggle (no code change) → skip to postmortem
14. If mitigation needs a code fix → enter `/fix` flow for the code change
    - Full Codex review applies (discipline holds even under P0 pressure)
    - Architect compliance check applies
    - Security review if applicable

### Phase 5 — postmortem

15. **After incident resolved, generate postmortem** at `docs/bets/<bet-id>/incidents/<incident-id>/postmortem.md` or `docs/incidents/<incident-id>/postmortem.md`
16. **Postmortem contents:**
    - Timeline (with timestamps)
    - Root cause analysis
    - Contributing factors
    - What went well / what didn't
    - Action items (each becomes a story or tech-debt bet)
    - DRI Log
17. **HITL gate** — human reviews postmortem before it's marked `complete`
18. **Action items spawned as bets or stories** via `/create-brief` or `/create-story`

### Phase 6 — comms

19. **External comms** (status page, customer email, social) — framework drafts, HITL approves
20. **Internal comms** (Slack channel, all-hands summary) — framework drafts, HITL approves
21. **Tech Writer** adds incident to changelog if user-visible

## DRI logging

Throughout:
- **Decisions:** mitigation chosen, classification changes, scope of fix-forward — rationale
- **Risks:** of recurrence, of customer impact spreading, of related systems — likelihood + impact
- **Issues:** missing observability, gaps in runbook, untested rollback — severity + owner (Enterprise Architect for systemic)

## Discipline always

Even during a P0 incident:
- Full Codex review on any code change
- Full Architect compliance check
- Security review if applicable
- HITL approval for comms

The framework's speed makes this practical. No exceptions.

## Cross-cutting

- Incident artifacts get `area:*` tags for filtering
- Recurring incidents auto-flagged as systemic issues → escalate to Enterprise Architect for foundational review
- Postmortem action items roll up into `/metrics` as "incident-driven work" — visible category
