---
workflow: triage
step: 1
agent: support
task: classify-intake
generated: 2026-06-21 22:57
---

Before I classify this, I need to flag something: this report is thin, and classification quality depends on impact/urgency signals I don't have yet. Let me work with what's here and call out the gaps.

## Intake Classification

**Raw item:** "As a user when I go to the accounts page, I see that my US bank account says error"

### Classification: `bug` (tentative — pending impact signal)

**Rationale:** A specific user is seeing defective behavior in shipped code — a bank account displaying "error" on the accounts page. There's no signal this is an active outage (only one reporter, no scope/blast-radius data), so it doesn't meet the `incident` bar. It's defective behavior in a shipped feature → `bug`.

**But this classification is fragile.** The category could shift based on answers to the questions below:

| If… | Then category becomes… |
|---|---|
| Many users / all US accounts are erroring right now | `incident` (production degraded) |
| It's working-as-intended (e.g. bank requires re-auth) | `not-an-issue` |
| It's a known recurring failure with an upstream cause | `problem` |

### Recommended route: `/fix`

Standalone bug, no outage signal → triage and fix path.

---

## Why I'm not escalating further yet (`[refuse-escalate]`)

I cannot reproduce or assess impact from this report. To firm up the classification and route, I need:

1. **Scope** — is this one account, all your US accounts, or are other users reporting it? (single-user vs. widespread = bug vs. incident)
2. **The actual error** — what exact text/code does it show? "error" alone isn't reproducible.
3. **When it started** — first time, or worked before? Recent change on your end (new bank connection, password change)?
4. **Severity signal** — can you still transact / see balances, or is the account fully unusable?

I'm classifying by **observed impact, not reporter framing** — and right now the observed impact is "one account shows an error string," which is P2/P3 territory absent wider scope.

---

## TL;DR
- Classified incoming item as **`bug`** (tentative); not an incident — no widespread-impact signal.
- Severity unknown — needs scope + error detail before it can be set.
- **Next action:** human confirms/overrides route at the gate; reporter to supply the 4 details above.

**Files created/modified:** none (no ticketing tool connected — see below).

**Next recommended command:** `/fix` once route is confirmed and reproduction details are gathered.

**Open questions/risks:** classification may flip to `incident` if scope is wide, or `not-an-issue` if working-as-intended. Cannot reproduce yet.

---

⚠️ **Tools missing — discipline applied:** No `mcp_jira` / `mcp_linear` (intake summary written here in chat — you create the ticket manually), no `mcp_sentry` / `mcp_pagerduty` (no error/alert data — I'm relying on your manual report; absence noted). **This run halts at the routing gate — confirm `/fix` or override the category before I proceed.**