---
id: WLT-25-2
bet: WLT-25
type: story
status: ready
priority: P2
created: 2026-06-23
author: PM
design_link: docs/bets/WLT-25/stories/WLT-25-2/design.md
area_tags: [frontend, backend, data]
dependencies:
  - WLT-25-1   # the followup flag + soft-delete resolve (dismissed_at) this slice surfaces
---

# See your resolved follow-ups — and re-open one

# Description

The closing slice of the Follow-up bet. WLT-25-1 shipped flag / resolve (a "Done" is a **soft-delete** via `dismissed_at`, kept as history) + the **Open** Follow-ups filter. This slice surfaces the **Done** side: the Follow-ups filter gains an **Open / Done** toggle so the user can see what they've **handled**, and a resolved follow-up can be **re-opened** (back to Open) if it turns out it still needs attention. No new substrate — it reads the dismissed (`dismissed_at is not null`) flags WLT-25-1 already writes, and re-open reuses the WLT-25-1 mark path (which already clears `dismissed_at`). Still **per-charge**, still **orthogonal** to category and subscription. See [WLT-25 architecture](../../architecture.md).

# Acceptance Criteria

- [ ] **AC1 — read Done + per-row status (`packages/db/followups.ts` + the ledger read):** a `readFollowupStatuses(client, userId)` (or extend `readFollowupFlags`) exposes each flagged charge's state — **open** (`dismissed_at is null`) vs **done** (`dismissed_at is not null`) — paginated, owner-scoped. The transactions read exposes an additive per-row **`followupStatus: "open" | "done" | null`** (replacing/superseding the WLT-25-1 boolean `isFollowup`, which becomes `followupStatus === "open"`). No schema change.
- [ ] **AC2 — the Open / Done toggle:** when the **"Follow-ups"** filter is active, a segmented **Open | Done** control appears (default **Open** = the WLT-25-1 behavior). **Done** filters the ledger to resolved follow-ups (`dismissed_at is not null`), owner-scoped, **paginated (`readAllPaged`)**, composing with the WLT-23-2 account/category/search filters via the same bounded scan. The `followup` query param carries the status (`open` | `done`).
- [ ] **AC3 — re-open a resolved follow-up:** a **Done** row's popover offers **"Re-open"** → re-uses `POST /api/transactions/followup` (the WLT-25-1 mark path, which clears `dismissed_at`); the row returns to Open (and drops out of the **Done** filter live). Emits a funnel event (`transaction_followup_reopened`). AAL2-guarded; discriminated; per single `dedup_key`.
- [ ] **AC4 — honest indicators + states:** an **open** row keeps the amber ⚑ "Follow up" indicator; a **done** row (in the Done view) reads as resolved (a muted "Done" treatment, distinct from open). Honest states: loading; **empty** Done ("nothing resolved yet"); re-open saving/success/discriminated-error+retry; the row + the filtered list reconcile on success.
- [ ] **AC5 — orthogonality preserved:** the Done read + re-open touch **only** `transaction_flags` — never the category resolver, budget, spend, or subscription state. The WLT-25-1 `followups.guard.test.ts` stays green (extended if new follow-up files are added).

# Standard Experience Checklist

- [x] **Navigation** — no new surface; the Open/Done toggle + Re-open live on the existing ledger + its row popover — covered by AC2, AC3.
- [x] **States** — Open list / Done list / empty-Done / re-open saving·success·error+retry / the open vs done indicator — covered by AC2, AC3, AC4.
- [x] **Feedback** — the Open/Done toggle shows which set you're viewing; "Re-opened" toast; the row leaves the Done list on re-open — covered by AC3, AC4.
- [x] **Accessibility** — the Open/Done toggle is a labelled segmented control with a clear pressed state; the Re-open control has a screen-reader label ("Re-open {merchant} follow-up"); the done indicator is text/labelled, not colour-only — covered by AC2, AC3, AC4 (design.md).
- [x] **Edge cases** — re-open a done charge → returns to Open + drops from Done (AC3); a charge resolved then re-synced by Plaid keeps its done state (dedup_key-keyed); the Done filter composing with account/category/search (AC2); empty Done state (AC4) — covered by AC2, AC3, AC4.
- [x] **Cross-surface consistency** — single web surface: `n/a — web only`. The orthogonality invariant (AC5) is the load-bearing consistency.

# Tech notes

Build on WLT-25-1. Reuse, don't rebuild:
- **DB:** `readFollowupStatuses` mirrors `readFollowupFlags` (paginated) but selects `dedup_key, dismissed_at` and maps to a status. **Re-open is `markFollowup`** (it already upserts `dismissed_at=null`) — no new writer; the route's existing `POST` already does it, so AC3 may need only the UI to call it on a done row + the reopened funnel event.
- **Read/filter:** the ledger read already has the `followup` bounded-scan (WLT-25-1); generalize the predicate from `isFollowup` (open) to `followupStatus === wantedStatus`. The `followup` param goes from `"1"` to `"open" | "done"`.
- **UI:** the WLT-25-1 Follow-ups filter button gains the Open/Done segmented toggle (only shown when the filter is on); the row popover's follow-up action reads "Re-open" on a done row.
- **Funnel:** add `TRANSACTION_FOLLOWUP_REOPENED` (or reuse `_flagged` with a source tag — prefer a distinct event for the metric).
- **Out of scope:** notes / reminders / due-dates (the bet's standing out-of-scope); a dedicated Follow-ups nav surface; bulk re-open / clear-all-done.

# PRs

_Auto-populated as PRs open._

# Tests

- **Engineer:** unit/db (`readFollowupStatuses` maps open vs done; re-open via `markFollowup` clears `dismissed_at`); component (the Open/Done toggle filters; a Done row offers Re-open and leaves the Done list on success; empty-Done state; a11y); the orthogonality guard stays green.
- **Codex (separate handoff):** confirm the `flag_type='followup'` RLS still covers the Done read + re-open (owner reads its own done flags; clearing `dismissed_at` is the owner UPDATE already covered; cross-tenant deny) — likely **no RLS delta** beyond WLT-25-1; + the gated E2E extension (resolve a flag → it appears under **Done** → re-open → returns to **Open** → second-user isolation).

# Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

# DRI Log

## Decisions
- [2026-06-23] [PM] **An Open/Done toggle on the existing filter, not a new surface** — rationale: the resolved set is the same ledger filtered differently; a toggle reuses the WLT-25-1 filter plumbing + keeps follow-ups in one place — area: ux — alternatives: a dedicated Done nav page (heavier, deferred) — reversibility: easy
- [2026-06-23] [PM/Engineer] **Re-open reuses the WLT-25-1 mark path (clears `dismissed_at`)** — rationale: `markFollowup` already upserts `dismissed_at=null`; re-open is the same write, so no new writer/route — keeps the slice tiny — area: data — alternatives: a dedicated reopen endpoint (unnecessary) — reversibility: easy

## Risks
- [2026-06-23] [PM] **Resolved follow-ups accumulate in the Done view over time** — likelihood: low — impact: low — mitigation: Done is opt-in (off by default); a "clear done" is a clean fast-follow if it ever bites — area: ux
- [2026-06-23] [PM] **An orthogonality regression via the new Done read** — likelihood: low — impact: medium — mitigation: the guard test + the read never crossing axes — area: correctness

## Issues
- _none_

---

_Story under bet: docs/bets/WLT-25/brief.md_
