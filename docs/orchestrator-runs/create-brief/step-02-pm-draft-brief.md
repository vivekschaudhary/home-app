---
workflow: create-brief
step: 2
agent: pm
task: draft-brief
generated: 2026-06-28 20:39
---

The draft-brief task is complete. Here is the output summary:

---

**TL;DR**

- `docs/bets/WLT-27/brief.md` was re-authored from scratch — the prior file contained PM step-2 response text rather than brief content (flagged in the HITL rejection and the delivery-manager step). The brief is now a full artifact consuming all 6 research evidence categories, the approved architecture, and 9-moat evaluation.
- Status is `proposed`; the brief has **not been self-approved**.
- `docs/role-activity/pm.md` updated with a draft-brief entry logging the HITL pattern (step-output-in-artifact-file, instance 1 for WLT-27).

**Files created/modified**

- `docs/bets/WLT-27/brief.md` — complete re-author (problem · user · why · hypothesis · defensibility · 6-category research summary with n/a items · scope in/out · architecture pointer · stories table · DRI log with 5 decisions + 3 risks + 3 issues); `status: proposed`
- `docs/role-activity/pm.md` — draft-brief entry prepended with HITL pattern note

**Next recommended command:** Review `docs/bets/WLT-27/brief.md`, then flip `status: proposed → status: approved` to continue to `/build WLT-27`.

**Open questions / risks**

1. First-party demand signal is still missing — decision to build WLT-27 rests on structural/proxy evidence only. Mitigating action: instrument Plaid link-failure events before WLT-27-2 merges.
2. `dedupKey` null `providerAccountId` edge case must be confirmed in WLT-27-3 before the CSV import API ships.
3. Apple Card CSV format must be validated against a real iOS export before the preset in WLT-27-6 is hardcoded.