---
workflow: fix
step: 1
agent: support
task: triage-bug
generated: 2026-06-21 23:01
---

# triage-bug — Execution

**Gate check:** Bug report present ✅. Ticketing system **not** accessible (no `mcp_jira` / `mcp_linear`) — proceeding with report text provided, writing triage note in chat. Sentry/PagerDuty absent — no error telemetry to correlate.

**Inherited context:** classify-intake produced a tentative `bug` (P2/P3 territory, no widespread-impact signal), route `/fix` confirmed by the prior step. I'm continuing on that route.

---

## ⛔ Cannot complete triage — blocked at reproduction (`[refuse-escalate]`)

`triage-bug` requires: reproduce → classify severity → check duplicates → decide L1-vs-escalate. **Step one fails.** I cannot reproduce, and per my refusal rules I will not escalate to Engineer or assign a final severity without reproduction steps or impact data.

Here is the triage note in its current (incomplete) state. It cannot be marked done until the gaps close.

---

## Triage Note (DRAFT — would write to `docs/fixes/<fix-id>.md`)

**Report (verbatim):** "As a user when I go to the accounts page, I see that my US bank account says error"

| Field | Status |
|---|---|
| **Reproducible steps** | ❌ Cannot reproduce — no account context, no error text, no environment |
| **Expected behavior** | Accounts page shows US bank account with balance/status |
| **Actual behavior** | Account row displays "error" (string/code unknown) |
| **Severity** | ⏸️ **Cannot classify** — needs scope + transactability. Tentative P2 (single account, degraded display) pending data |
| **Symptom vs cause** | Symptom: "error" label. Cause: unknown — could be upstream bank-link failure, stale token, or render bug |
| **Duplicate check** | ❌ Cannot perform — no ticketing/Sentry access |
| **Decision** | ⏸️ Cannot decide L1-vs-escalate without reproduction |

---

## What I need before this triage can complete

The four gaps from intake still stand. Concretely, to reproduce + classify:

1. **The exact error** — full text or error code on the account row. ("error" alone is not reproducible.)
2. **Scope** — one account? all your US accounts? other users reporting? (single = bug, widespread = re-classify `incident`)
3. **Transactability** — can you still see balance / move money, or is the account fully dead? (sets P1 vs P2/P3)
4. **Timeline + recent change** — first occurrence? Did a bank reconnection, password change, or MFA prompt happen recently? (distinguishes our-bug vs. bank-side re-auth → possible `not-an-issue`)

**One strong signal to watch:** "US bank account + error" is a classic **stale-credential / re-auth-required** pattern from the aggregator (Plaid/MX/Finicity-style). If that's the cause, this flips to `not-an-issue` (working-as-intended; user must re-link) — which is why I won't burn an Engineer escalation on it yet.

---

## DRI Decision (logged — severity & escalation)

> **Decision:** Triage held at reproduction stage. Severity **not finalized** (tentative P2). **No escalation to Engineer** issued — escalating an unreproduced single-user "error" string would be noise per `[refuse-escalate]`. Decision will be revisited once reporter supplies error text + scope.
> **Owner:** Support. **Reversible:** yes — escalate immediately if scope data shows widespread impact (→ re-triage as incident).

---

## Reporter acknowledgement (DRAFT — HITL required before sending)

> Thanks for flagging this. I can see your US bank account is showing an error on the accounts page. To get this fixed quickly, could you tell me: (1) the exact error message shown, (2) whether your balance is still visible, and (3) when this started? In many cases a bank connection just needs to be re-linked, and I can walk you through that. — Support

⚠️ **This is a draft. I will not send it until you approve.** I also did **not** promise a fix or a timeline (that's a PM call, not Support's).

---

## TL;DR
- `triage-bug` **blocked at reproduction** — cannot reproduce or finalize severity from current report; will not escalate noise (`[refuse-escalate]`).
- Tentative **P2** (single-account, degraded display); strong hypothesis = bank re-auth required → may resolve as `not-an-issue`.
- **Next action:** reporter supplies error text + scope + transactability + timeline; I re-run triage and either close (re-link guidance), keep as P2 bug, or re-classify as incident.

**Files created/modified:** none — no `mcp_jira`/`mcp_linear`; triage note drafted in chat for you to create the ticket manually.

**Next recommended command:** `/fix` once reproduction details land **and** the bug holds (not working-as-intended). If scope turns out wide → `/triage` incident branch instead.

**Open questions/risks:**
- Classification may flip to `not-an-issue` (re-auth) or `incident` (widespread) — severity is provisional.
- No Sentry/PagerDuty correlation possible — relying entirely on manual reporter data.

⚠️ **Tools missing — discipline applied:** no `mcp_jira`/`mcp_linear` (triage note + ticket in chat, you create manually), no `mcp_sentry`/`mcp_pagerduty` (no telemetry — absence logged as DRI context). **Reporter acknowledgement is drafted, not sent — needs your HITL approval before it goes out.**