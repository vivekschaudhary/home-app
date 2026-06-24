---
workflow: triage
step: 1
agent: support
task: classify-intake
generated: 2026-06-23 13:25
---

## Intake Classification

**Item read:** User reports being logged off "after every few hours" and speculates about cookie/JWT storage as the cause. They flag it as "looks like an enhancement but need to triage first."

### Classification: `bug`

**Category:** `bug` — defective behavior in shipped code (not an active outage).

**Rationale (impact/urgency, not framing):**
- The reporter frames it as an enhancement and speculates about a technical root cause (cookies/JWT). I'm classifying by *observed behavior*, not their guess. Being unexpectedly logged off after a few hours is **defective behavior in shipped code**, not a missing capability.
- This isn't an `enhancement`: the user isn't asking for a new capability — they're describing existing auth/session behavior that is broken or misbehaving. A session that silently expires every few hours is almost certainly an unintended token-lifetime/refresh defect, not a feature request.
- This isn't an `incident`: no evidence of production-wide degradation, data loss, or security breach. Single-reporter, intermittent, app remains usable. **Severity: not P0.**
- This isn't `not-an-issue`: short forced re-auth cycles are plausibly a real refresh-token/sliding-session defect, not working-as-intended. (If a confirmed short session TTL turns out to be an intentional security policy, the Engineer's reproduction-from-code step will surface that — that's their call now, not mine to pre-judge.)

**Note on routing the cause:** This *touches* WLT-1 (Identity & MFA onboarding) functionally, but I am **not** matching it to a bet — bets are for enhancements/problems. A defect goes to `/fix`, where the tool-capable Engineer reproduces from the code and diagnoses whether it's a JWT expiry, refresh-token, or cookie-persistence issue. I do **not** diagnose the cookie-vs-JWT question myself — that's the Engineer's reproduction job (`triage-and-fix`, v0.3.50).

### Intake summary (for hand-off)
- **Classification:** `bug` (defective session/auth behavior in shipped code)
- **Impact:** intermittent forced logout every few hours; single reporter; app remains usable; no data loss/security breach observed
- **Severity:** not P0 — annoyance-level, no outage
- **Recommended command:** `/fix` (Engineer reproduces from code; do **not** prejudge cookie vs JWT)
- **Override available:** if recurrence pattern points to a systemic session-lifetime design flaw across many users, this could be re-cast as a `problem` for planned investigation — human's call at the gate.

---

**Tool note:** No `mcp_sentry` / `mcp_pagerduty` / `mcp_jira` connected this session. I have no error-rate or session-telemetry data to confirm scope (one user vs. many), and no ticket was created. Discipline applied: classified on the single report only and flagged scope as an open question rather than inflating severity. Please confirm whether other users are affected — that could shift this toward `problem`.

**Open question / risk:** Is this isolated to one user or widespread? Scope changes the route (isolated `bug` → `/fix`; widespread session-expiry pattern → `problem` for planned investigation).

---

**TL;DR**
- Reporter's "enhancement" guess overridden → classified as a **`bug`** (broken session behavior in shipped code).
- **Severity: not P0** — intermittent, single reporter, no outage/data loss.
- Routing to Engineer for reproduction-from-code; I do not diagnose cookie-vs-JWT.

**Files created/modified:** none (no ticketing tool connected; intake summary recorded inline above).

**Halting at the routing gate** — confirm or override the category/route before I hand off.

**Next command:** fix