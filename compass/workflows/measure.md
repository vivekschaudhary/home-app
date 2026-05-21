# Workflow: /measure

Cron-driven measurement of a bet's metrics. Pulls data via MCP, updates the brief, transitions outcome status when measurement window closes.

## Trigger

- Cron: framework auto-runs per bet's `check_in_cadence` (weekly / biweekly / monthly)
- Manual: `/measure <bet-id>` to check a specific bet on demand

## Owner

Enterprise/Solution Architect is accountable for cron health (per `compass/config.yaml` cron_owner).

## Process

### Phase 1 — gate

1. **Verify bet eligible:**
   - Bet status is `shipped` or `measuring` (all stories shipped + CI/CD complete)
   - Brief has measurement plan (primary metric, source, target, window, cadence)
2. **If not eligible:** skip silently (cron) or report (manual)

### Phase 2 — pull data

3. **Read primary metric** via MCP source (Sentry / analytics / DB query / etc.)
4. **Read guardrail metrics** via same sources
5. **If data unavailable:**
   - Log issue in brief DRI
   - Per config (`measurement.data_unavailable_action`):
     - `hitl_flag` (default): flag to human, hold status as `measuring`
     - `extend`: extend window by 50%, retry next cron
     - `mark_inconclusive`: flip status to `inconclusive` with reason

### Phase 3 — interim check-in

If measurement window not yet closed:
6. **Append check-in entry** to brief's "Check-in log" section:
   ```
   - [DATE] Check-in #N
     - Primary metric: <current> (was <baseline>, target <target>)
     - Guardrails: <status of each>
     - Trend: on-track / at-risk / off-track
   ```
7. **Update `docs/metrics/<bet-id>-<date>.json`** snapshot
8. **If trend `off-track` or guardrails breached:** flag to PM via configured channel

### Phase 4 — final measurement

If measurement window closes:
9. **Compute final outcome:**
   - **Won** — primary metric met or exceeded target; no guardrail breached
   - **Learning** — primary metric did not meet target (or guardrail breached); requires "what we learned" entry
   - **Inconclusive** — data quality insufficient (sample too small, confounding factors, etc.)
10. **Flip bet status** to `won` / `learning` / `inconclusive`
11. **Prompt PM** for "what we learned" entry if status is `learning`:
    - Mandatory paragraph
    - Becomes input to surfacing-recent-learnings in `/metrics`
12. **DRI log** final decision with rationale (data → outcome)
13. **Notify** stakeholders via configured channel (sprint comms next cycle will surface)
14. **Roll up** to parent bet's metrics (if `parent:` set in frontmatter)

## Output

- Brief updated with check-in log entries OR final outcome
- `docs/metrics/<bet-id>-<date>.{json,md}` snapshot
- Notifications dispatched
- Parent bet metrics updated (rollup)

## DRI logging

- **Decisions:** outcome classification, "what we learned" entry — rationale
- **Risks:** of misclassification (false won/learning), data quality — likelihood + impact
- **Issues:** broken telemetry, missing instrumentation — severity + owner

## Notes

- Cron failures escalate to Enterprise/Solution Architect (cron owner)
- "Learning" is positive language — losses aren't shameful, they're data
- "Inconclusive" is different from "learning" — it means we couldn't tell, not that we tried and didn't win
- Check-in cadence is faster than measurement window — long bets get short check-ins
