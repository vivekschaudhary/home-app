# Support Inbox

The single front door for everything users (and dogfooding) surface — feedback, requests, bugs, confusion, incidents. Raw items land here, get **triaged**, and get **routed** into the existing Compass loop. Nothing is enhanced directly from a hunch; enhancements have a source, and that source is this inbox.

Owner: **Support role** (`compass/roles/support.md`). Per `[user-first-intent-first]` and the dogfood discipline that surfaced #36 / #39 / WLT-14 / OPS-1, real pain drives the next round — not top-down planning.

## The rhythm (capture → triage → route → close)

1. **Capture.** Anyone adds a row to the table below with a `SUP-N` id, the date, the source, and the raw report **in the user's words** (don't pre-diagnose). Status `new`.
2. **Triage** (on arrival, plus a weekly sweep of any `new` rows). The Support role:
   - **Classifies type** — `bug` · `enhancement` · `incident` · `question`.
   - **Reproduces** if it's a bug (or gathers more info from the reporter); **checks for duplicates** (link them).
   - **Sets severity** (see scale). Severity is by *impact*, never by frustration.
   - Status → `triaged`.
3. **Route** by type — this is the whole point of the inbox; it feeds the loop, it doesn't replace it:

   | Type | Route to | Produces |
   |---|---|---|
   | **bug** | `/fix <SUP-N or text>` | a triage note + fix PR (`docs/fixes/<id>.md` or under a bet) |
   | **enhancement** | `/create-brief <text>` | a new bet brief (this inbox becomes its *User pain input*) |
   | **incident** (prod down / data / security) | `/triage <alert>` | an incident artifact + stop-the-bleed (human-driven) |
   | **question / confusion** | answer the reporter; if recurring → an enhancement (docs/UX) or FAQ | a closed loop + maybe a follow-on item |

   Record where it went in **Routed to**. Status → `routed`.
4. **Close.** When the routed work ships (or the question is answered), status → `closed` — **and the reporter is told** (no silent closes; an anti-pattern in the Support role). Keep the row for history.

> Small-team note: several of these steps collapse — the operator often *is* the reporter, triager, and Engineer. The discipline that matters is **capture-before-fix** (log the item before touching code, so coverage + priority are deliberate, not reactive) and **route-don't-freelance** (a bug becomes a `/fix`, an enhancement becomes a brief — so every change still gets the full review/measure treatment).

## Severity scale

- **P0** — prod down, data loss, security exposure, or auth broken for users → `/triage` now.
- **P1** — a core-loop step is broken or a high-value user is blocked (the #36 / #40 class).
- **P2** — a real rough edge or a wanted enhancement; not blocking.
- **P3** — minor polish, nice-to-have, cosmetic.

## Inbox

| ID | Date | Source | Summary (user's words) | Type | Sev | Status | Routed to |
|---|---|---|---|---|---|---|---|
| SUP-1 | 2026-06-14 | dogfood | "added the account, moved back to dashboard, accounts shows an empty state" | bug | P1 | closed | `/fix` → #36 (reconcile-on-load; PR #38) |
| SUP-2 | 2026-06-14 | dogfood | "refreshed the app, it showed the accounts but still says importing" | bug | P2 | closed | `/fix` → #39 (settle-sweep cron) |
| SUP-3 | 2026-06-14 | dogfood | "trying to log in but it keeps saying the password is incorrect, even though it's right" | bug | P1 | closed | `/fix` → #40 (sign-in error discrimination) + admin reset |
| SUP-4 | 2026-06-14 | dogfood | "is there a story to reset the password" (no self-serve recovery) | enhancement | P1 | closed | `/create-brief` → WLT-14 (forgot-password; shipped) |
| SUP-5 | 2026-06-14 | dogfood | "nothing left to do after setting a target" — the loop goes static | enhancement | P1 | closed | `/create-brief` → WLT-15 (the engagement bet; shipped) |
| SUP-6 | 2026-06-15 | ops/dogfood | recap showed only 1 Inngest function → durable jobs never ran in prod since 6/8 | incident | P1 | closed | `/ops` → OPS-1 (auto-sync wired; proven live) |
| SUP-7 | 2026-06-15 | dogfood | "change password page… enter the password and save, gives a 502 on the post" | bug | P1 | closed | `/fix` → #52 (error discrimination) **then** the real cause from prod logs: `insufficient_aal` (MFA account needs AAL2) → v2 adds the authenticator step to recovery (PR #54). **Confirmed live by the reporter.** |
| SUP-8 | 2026-06-15 | engineering | the "blanket error code" anti-pattern has now hit 2 auth handlers (signIn #40, updatePassword SUP-7) — audit the rest (MFA / TOTP enroll + challenge) for the same collapse | enhancement | P3 | new | _triage pending_ |

_SUP-1…6 are the dogfood trail (MVP loose-ends + WLT-14/WLT-15/OPS-1), captured retroactively for precedent. SUP-7 was the first live item through the inbox end-to-end (capture → triage → `/fix` → shipped). SUP-8 is the follow-up the SUP-7 triage surfaced._

## DRI Log

### Decisions
- [2026-06-15] [Support] **Stand up a single inbox as the front door for all user-surfaced items** — rationale: enhancements should have a durable source (the dogfood trail already proved real pain drives the best bets); the inbox feeds the existing `/fix` · `/create-brief` · `/triage` paths rather than replacing them — area: process — reversibility: easy
- [2026-06-15] [Support] **Capture-before-fix + route-don't-freelance** as the two load-bearing rules — rationale: the #36 retro showed reactive fixes miss coverage; logging first makes priority + test-coverage deliberate, and routing keeps every change under full review/measure — area: process — reversibility: easy

### Risks
- [2026-06-15] [Support] **Inbox rots if nothing is captured** (solo team, low inbound pre-launch) — likelihood: medium — impact: low — mitigation: the weekly triage sweep doubles as a dogfood prompt; pre-launch, the operator's own friction IS the inbox — area: process

### Issues
- _none_
