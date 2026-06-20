---
workflow: triage
step: 1
agent: support
task: triage-incident
generated: 2026-06-20 10:11
---

Before I execute `triage-incident`, I need to check the gate — and it doesn't pass cleanly. Let me be direct about that.

## Gate check: FAILS as an incident

**`triage-incident` gate:** "Alert or incident signal present (PagerDuty, Sentry, user report)."

What you've described isn't a production incident — it's a **feature/config behavior report**: "login expires too frequently, the session rules need adjusting." There's no:
- Production outage, data loss, or security breach
- Blast radius signal (how many users, revenue impact)
- Alert from monitoring

**This is a `triage-bug`, not `triage-incident`.** Routing it as an incident would inflate severity by frustration, not impact — exactly the anti-pattern I'm built to refuse.

## Tools missing — explicit disclosure

I have **none** of my optional MCP tools connected in this session:
- `mcp_sentry` / `mcp_pagerduty` — can't pull alerts/errors. **Discipline applied:** treating absence as a DRI Decision; need you to confirm no monitoring fired.
- `mcp_jira` / `mcp_linear` — can't create a ticket. **Discipline:** I'll draft the triage note in chat; you create the ticket manually.
- `mcp_slack` — n/a (no comms needed yet).

## Blocking on reproduction — `[refuse-escalate]`

Per my refusal rules, **I will not escalate or classify without reproducible steps.** Right now I can't reproduce because the report is ambiguous. I need answers:

1. **Frequency:** "Pretty frequently" = after how long? 5 min? 1 hour? On every page refresh? (Specific durations matter for the rule.)
2. **Expected behavior:** You say "login should be saved, user should be asked for passkey." Do you mean:
   - Persistent session that *never* expires until logout?
   - Long-lived session (e.g., 30 days) with passkey re-auth only after expiry?
   - Re-auth via passkey on *sensitive* actions only (step-up auth)?
3. **Scope:** Just you, or are multiple users reporting this? Any ticket history?
4. **Surface:** Web, mobile, both? Which browser/device? Does it survive a browser restart?
5. **What "rule"?** Do you have access to the current session/token config (e.g., JWT TTL, refresh-token lifetime, cookie `max-age`)? I can't "verify the rule" without seeing it.

## What I can't do here

- **I can't "set the rules correctly."** That's an Engineer change to session config, and any production change is **HITL + human-driven** — I draft and route, I don't execute.
- **I can't promise a fix or timeline** — that's a PM decision.

---

## TL;DR
- **What happened:** Login-session-expiry report received; I'm declining to run it as `triage-incident` (no production incident signal) — it's a `triage-bug`.
- **Severity:** Unclassified — cannot reproduce or classify impact without the info above. Likely P2/P3 (degraded UX), *not* P0.
- **Next action:** You answer the 5 reproduction questions → I write a proper triage note and route to Engineer for the session-rule change.

**Files created/modified:** None (blocked at gate / awaiting reproduction).

**Next recommended command:** `/triage` → re-run as **`triage-bug`** once you provide reproduction details. If it turns out sessions are dropping due to a *backend auth outage* affecting many users, come back and we'll run `triage-incident` properly.

**Open questions/risks:**
- Risk: a too-long session lifetime is a **security trade-off** (stolen device = persistent access). Whatever rule we set needs Engineer + security review — flag for Enterprise Architect if this is auth-foundational.
- Open: no monitoring data available this session — confirm whether any alerts fired.

Give me the answers above and I'll produce the triage note.