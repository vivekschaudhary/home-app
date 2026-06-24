---
id: WLT-25-ARCH
bet: WLT-25
status: approved
created: 2026-06-23
authors: [Architect, Enterprise/Solution Architect]
area_tags: [frontend, backend, data]
---

# Technical Design: Follow up on a transaction (the second overlay)

## Decision

Add a **`followup`** flag type to the existing **`transaction_flags`** overlay table — a per-transaction, owner-CRUD flag keyed by the stable **`dedup_key`** (survives Plaid CDC re-syncs), orthogonal to both category and subscription. The only schema change is **one expand-only migration** widening the `flag_type` check constraint from `in ('subscription')` to `in ('subscription','followup')`. **Resolve = soft-delete** (operator decision): "Done" sets `dismissed_at = now()` (the column already exists from migration 0016), so a resolved follow-up is **kept as history**; the Follow-ups view distinguishes **Open** (`dismissed_at is null`) vs **Done**, and re-opening clears `dismissed_at`. Unlike subscriptions, a follow-up is **per-charge, not per-merchant** — no clustering, no merchant fan-out: mark/resolve operate on the single `dedup_key`. Mark/resolve happen from the **WLT-23 ledger row popover** (the generic `extraActions` slot); the surface for "see all flagged" is a story decision (lean: a Follow-ups filter on the ledger). Everything is **within the foundational stack** (Postgres + RLS + Route Handlers) — no new tooling.

## Context

The `transaction_flags` substrate was deliberately built (WLT-24-1) to carry this second overlay: owner-CRUD RLS (`auth.uid() = user_id`), `dedup_key`-keyed survival, `source`, `unique(user_id, dedup_key, flag_type)`, the `(user_id, flag_type)` index, and — from WLT-24-2/3 — a `dismissed_at` soft-delete column with a partial active index `(user_id, flag_type) where dismissed_at is null` and the WLT-21 RLS-soft-delete lesson already encoded (the dismissed filter lives in the **query**, not the SELECT policy). The `flag_type` check is the only thing still locked to `'subscription'`; the column comment already says "admits 'followup' later." The mark/resolve mechanics the operator chose (mark = upsert clearing `dismissed_at`; resolve = set `dismissed_at`; readers filter `dismissed_at is null`) are **identical to the shipped subscription dismissal path** — so this bet is overwhelmingly reuse, with the one genuinely new primitive being the widened constraint + the `'followup'` literal.

## Approach

### Components affected

- **`supabase/migrations/0017_transaction_flags_followup.sql`** (new) — drop + re-add the `flag_type` check constraint, widened to `('subscription','followup')`. Expand-only; OPS-2 auto-applies. Verify the constraint name on an ephemeral Postgres (the default is `transaction_flags_flag_type_check`).
- **`packages/db/followups.ts`** (new — mirrors the subscription db layer, `flag_type='followup'`): `readFollowupFlags(client, userId)` → `Set<dedup_key>` of **open** follow-ups (`dismissed_at is null`, paginated) for the ledger indicator; `markFollowup(client, userId, dedupKey)` → upsert `(flag_type='followup', source='user', dismissed_at=null)` (re-flagging a resolved one re-opens it); `resolveFollowup(client, userId, dedupKey)` → `update … set dismissed_at = now()` (the soft-delete); `reopenFollowup` → clear `dismissed_at`; `readFollowups(client, userId, status)` → the Open/Done list joined to the active transactions, **paginated (`readAllPaged`)**, owner-scoped. All per single `dedup_key` (no merchant fan-out).
- **`app/lib/followups.ts`** (new) — the RSC/route-facing wrappers (AAL2 session) + funnel emits, mirroring `app/lib/subscriptions.ts`.
- **`app/api/transactions/followup/route.ts`** (new) — `runtime="nodejs"`, AAL2-guarded, discriminated `{ok}|{ok:false,error}`: `POST {dedupKey}` mark, `DELETE {dedupKey}` resolve, (optional) re-open. Mirrors the WLT-24-1 mark route.
- **`app/(app)/transactions/TransactionsClient.tsx`** — add a **"Follow up" / "Done"** action to the row popover via the existing generic `extraActions` slot (the same slot the subscription mark uses); a per-row **indicator** (a small "Follow up" tag/dot, like the subscription ★) when the row has an open follow-up. The ledger read exposes a per-row `isFollowup` (a flagged-set read, like `isSubscription`).
- **The Follow-ups view** (story decision — lean: a filter on the WLT-23 ledger, "Follow-ups: Open / Done", reusing WLT-23-2's filter plumbing; alternatively a small dedicated list). Owner-scoped, paginated.
- **`packages/core/funnel.ts`** — `TRANSACTION_FOLLOWUP_FLAGGED`, `TRANSACTION_FOLLOWUP_RESOLVED` (+ optionally `_REOPENED` / `FOLLOWUPS_VIEWED`).
- **`app/lib/followups.guard.test.ts`** (new) — the orthogonality guard for the follow-up path (mirrors `subscriptions.guard.test.ts`): the follow-up files must not reference the category/budget/spend tokens (`effectiveCategory`, `readCategoryAssignments`, `counts_as_spending`, `countsAsSpending`) — a follow-up never crosses an axis.

### Data model changes

One expand-only migration (`0017`): widen the `transaction_flags.flag_type` check to `('subscription','followup')`. **No new table, no new column** (`dismissed_at` already exists). The follow-up row: `(flag_type='followup', source='user', dismissed_at null⇒open / set⇒done)`, `unique(user_id, dedup_key, 'followup')` ⇒ one follow-up per transaction. The existing owner-CRUD RLS policies + the partial active index cover it unchanged.

### API / contract changes

Additive: one new route (`/api/transactions/followup`, POST mark / DELETE resolve / optional re-open). No change to existing routes, the transactions read contract gains an additive per-row `isFollowup` boolean.

### Dependencies

None new. Reuses `@wealth/db` (`readAllPaged`, the Supabase client), `@wealth/core` (funnel), Supabase (Postgres + RLS + AAL2), the WLT-23 ledger UI + its `extraActions`/filter plumbing.

## Enterprise/Solution Architect input

### Cross-system implications

None. No new service, no third-party, no new boundary — a second `flag_type` on a shipped table, written by the user's own RLS session. The Plaid/aggregation path is untouched (a follow-up is a pure user overlay).

### Standards compliance

Conforms fully to the foundation architecture: the overlay-table pattern, owner-CRUD RLS, `dedup_key` survival, the `saved`-decision-is-truth posture, and the orthogonality discipline are all the shipped WLT-22/23/24 standards. **No drift flagged.**

### Cost / capacity / vendor lock-in

None. No new variable cost (no aggregation calls — a follow-up is a local write). No vendor lock-in. The migration is a constraint widening (instant, no table rewrite).

## Alternatives considered

| Option                                                                   | Pros                                                                                                                     | Cons                                                                                                                | Why not chosen                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Chosen: `followup` flag on `transaction_flags` + soft-delete resolve** | Reuses the whole shipped substrate (RLS, survival, surface, dismissal mechanics); keeps a "resolved" history; orthogonal | One migration (constraint widen); a Done-state filter to build                                                      | —                                                                                                               |
| Hard-delete resolve                                                      | Simplest; nothing lingers                                                                                                | No resolved history / no Done list; re-flag loses the prior record                                                  | Operator chose soft-delete for the resolved-history + Open/Done view (the `dismissed_at` column makes it ~free) |
| A dedicated `transaction_followups` table                                | Isolated                                                                                                                 | Duplicates the substrate (RLS, survival, readers) the table already provides; two overlay tables to keep consistent | Defeats the deliberate shared-substrate design                                                                  |
| A column on `transactions`                                               | No join                                                                                                                  | Not orthogonal — pollutes the provider-owned table; lost on CDC re-sync unless re-derived                           | Violates the overlay/orthogonality invariant                                                                    |

## Consequences

- **Positive:** the planned overlay-pair is complete on one substrate (investment amortized); the implementation is almost entirely reuse of shipped, reviewed patterns (low blast radius); the `dismissed_at` mechanics are already proven; the resolved-history gives the user a sense of progress; forward-compatible with future overlays (a third `flag_type` is now trivially precedented).
- **Negative:** a small amount of net-new surface (the Follow-ups view + the Open/Done filter); resolved follow-ups accumulate (mitigated — they're filtered out of the default Open view; a future "clear done" is a fast-follow if needed).
- **Reversibility:** easy — additive table-constraint widening + an additive surface; nothing in the category/budget/subscription paths changes; the flag can be ignored or removed without touching other axes.

## Test strategy

- **Unit/component (Engineer):** the db readers/writers (mark → open; resolve → `dismissed_at` set, dropped from the open set; re-flag/re-open clears it; the Open/Done read filters correctly; per-charge, no merchant fan-out); the ledger row popover gains Follow up/Done + the indicator reconciles; the Follow-ups view renders Open/Done + honest empty/error states; the **orthogonality guard** (the follow-up files never touch the category/budget axis).
- **Codex (separate handoff):** the RLS coverage for `flag_type='followup'` (owner CRUD + `dismissed_at` owner set/clear + cross-tenant deny — likely an extension of the existing `transaction_flags` suite, which already covers the table generically) + the gated real-path E2E (flag a charge from the ledger → indicator + appears in Follow-ups Open → resolve → moves to Done + drops from Open → survives a Plaid CDC revision → second-user isolation).

## Rollout

- Migration `0017` (expand-only; OPS-2 auto-applies on deploy; verified on an ephemeral Postgres first). **No feature flag** — an additive surface; the Follow-ups view/filter goes live when its slice ships (gate the nav/filter on the slice, not the migration). Staged by stories: the substrate + mark/resolve + the ledger indicator first, the Follow-ups view second (or together if small).

## DRI Log

### Decisions

- [2026-06-23] [Architect/operator] **Resolve = soft-delete via `dismissed_at` (keep resolved history), not hard-delete** — rationale: the column already exists (no schema cost), it gives an Open/Done view + a sense of progress (to-do-app ergonomics), and it reuses the exact shipped subscription dismissal mechanics; follow-ups have no detector, so the soft-delete is purely for history, not precedence — area: data/ux — alternatives: hard-delete (simpler, no history) — reversibility: easy
- [2026-06-23] [Architect] **Per-charge, not per-merchant** — rationale: a follow-up is about THIS specific transaction (a charge you don't recognize / a dispute), unlike a subscription which is a recurring merchant series; so mark/resolve operate on the single `dedup_key` with no clustering or fan-out — area: data/ux — alternatives: merchant fan-out (rejected — wrong unit for a to-do) — reversibility: easy
- [2026-06-23] [Architect] **One expand-only migration (widen the `flag_type` check), reuse everything else** — rationale: the substrate was built for this; a new table or a `transactions` column would either duplicate the substrate or break orthogonality — area: data — alternatives: in the table above — reversibility: easy
- [2026-06-23] [Enterprise Architect] **No foundational-stack deviation** — rationale: Postgres + RLS + Route Handlers only; no new tool/service/dependency/cost; standards-compliant with the shipped overlay pattern — area: architecture/standards — reversibility: n/a

### Risks

- [2026-06-23] [Architect] **An orthogonality regression couples the follow-up to category/budget/subscription** — likelihood: low — impact: medium — mitigation: the new `followups.guard.test.ts` + the read never crossing axes; the path mirrors the guarded subscription path — area: correctness
- [2026-06-23] [Architect] **Resolved follow-ups accumulate and clutter** — likelihood: low — impact: low — mitigation: filtered out of the default Open view; a "clear done" is a clean fast-follow if it ever bites — area: ux

### Issues

- [2026-06-23] [Engineer] **Confirm the `flag_type` check constraint's exact name before the migration** — severity: low — owner: Engineer — status: open — area: data — the inline unnamed check defaults to `transaction_flags_flag_type_check`; verify on an ephemeral PG and use `drop constraint if exists` + re-add (the WLT-22-5 migration-verification discipline).

---

_Approved by: operator on 2026-06-23._
