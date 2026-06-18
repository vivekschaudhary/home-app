---
id: WLT-22-3
bet: WLT-22
type: story
status: ready
priority: P1
created: 2026-06-17
author: PM
design_link: docs/bets/WLT-22/stories/WLT-22-3/design.md
copy_link: docs/bets/WLT-22/stories/WLT-22-3/copy.md
area_tags: [frontend, spending, budgets, data, aggregation, security]
dependencies:
  - WLT-22-2   # shipped — the recategorize flow + the saved-category spine this rides on
---

# WLT-22-3 — Remember the merchant (a rule that categorizes past + future)

## Description

The automation on top of WLT-22-2's manual correction: when a user recategorizes a transaction, they can **"remember the merchant"** so **every** transaction from that merchant — **past and future** — takes the new category automatically. Checking **"Always categorize [merchant] this way"** creates a merchant rule that **backfills** the user's existing matching transactions immediately (writing `'rule'` assignments) and is **applied at sync** to new transactions as they arrive. The user's explicit **one-off override always wins** — a rule only writes to transactions the user hasn't set by hand, and never clobbers a `'user'` assignment. This completes the WLT-22 correction layer: the saved-category spine + per-transaction override (WLT-22-2) now gains the merchant-rule write path the architecture reserved (`transaction_categories.assigned_by` / `rule_id` are already shaped for it). Rule **management** (a "your rules" view / edit / delete) is the next follow-on.

## Acceptance Criteria

- [ ] **AC1 — Remember the merchant (create + backfill).** In the WLT-22-2 recategorize picker, when the transaction has a **known merchant**, a **"Always categorize [merchant] this way"** checkbox is offered. Checked + picking a category **creates/updates a merchant rule** (`category_rules`, one per `(user, merchant_norm)`) and **writes `'rule'` assignments to ALL the user's transactions matching that merchant** — except ones with a `'user'` override. The drill/budget reflect the whole batch (not just the one row).
- [ ] **AC2 — Past AND future.** Creating the rule **backfills past** matches immediately; the **sync applies the rule to newly-ingested transactions** (post-ingest), so future transactions from that merchant arrive already categorized + saved (not resolved-on-the-fly). _The brief's elicited "past + future" promise._
- [ ] **AC3 — The user's override always wins.** A rule writes `'rule'` assignments **only** to transactions **without** a `'user'` assignment, and **never overwrites** one. A transaction the user later moves by hand (a one-off `'user'` override) keeps that category even though a rule exists for its merchant.
- [ ] **AC4 — Consistency through the ONE resolver (load-bearing).** A `'rule'` assignment is just another saved assignment — reads stay the single `saved ?? Plaid` helper, no reader change. After "remember," the **budget table, recap (WLT-17), and anomalies (WLT-18)** all reflect the user-resolved category for **every** affected transaction; the drill totals reconcile (each moved row leaves its old category, joins the new).
- [ ] **AC5 — Honest states + feedback.** Merchant **known** → the checkbox; merchant **null** (`description`-only) → **no** checkbox (a one-off override only — WLT-22-2). Applying state (`aria-busy`) during the bulk write; a success acknowledgment that **names the count** ("Now categorizing [merchant] as [category] — updated N transactions", singular/plural correct); a discriminated **error** (network / server) + retry; the prior state is kept until the apply succeeds.
- [ ] **AC6 — Owner-scoped (load-bearing security).** `category_rules` is **owner-CRUD under RLS** (the `intents`/`budgets`/`categories` pattern, **hard-delete**) with a **composite FK `(category_id, user_id)`** blocking a forged cross-tenant `category_id`. The backfill and the sync-apply **only ever write the user's own transactions** (`user_id`-scoped). Proven by the RLS suite **and** a gated real-path E2E — a second user's rule/assignments are isolated.
- [ ] **AC7 — Accessibility.** The checkbox is a labelled control whose accessible name carries the merchant + intent; `aria-busy` during apply; the count + discriminated errors are announced; focus management consistent with the WLT-22-2 picker; WCAG AA.
- [ ] **AC8 — Instrumentation.** Additive funnel event **`category_rule_created`**, emitted once per rule create/update.
- [ ] **AC9 — Merchant matching is normalized.** A shared normalization (lowercase + trim + collapse whitespace) keys the rule and the match, so "STARBUCKS #123" and "Starbucks #123" are the same merchant; **last-write-wins** per `merchant_norm` (re-running "remember" with a different category replaces the rule + re-backfills).

## Standard Experience Checklist

- [ ] **Navigation** — the checkbox lives in the existing WLT-22-2 picker; open/close/cancel are unchanged (no new surface): **AC1, AC7**.
- [ ] **States** — picker (merchant) · picker (no-merchant, no checkbox) · applying · success (counted) · error: **AC1, AC5**.
- [ ] **Feedback** — count-naming success ("updated N transactions") + discriminated error + retry; a bulk + future-affecting edit is **reversible** (per-transaction override / future rule management) so `no destructive confirm — n/a — reversible + escape hatch`, but **always transparent about breadth**: **AC5**.
- [ ] **Accessibility** — labelled checkbox carrying merchant + intent, `aria-busy` apply, announced count + errors, focus, AA: **AC7**.
- [ ] **Edge cases** — merchant null → no rule, override only (AC5); a `'user'`-overridden transaction inside the matched set → skipped (AC3); re-running "remember" for a merchant → last-write-wins replace + re-backfill (AC9); a new synced transaction from a remembered merchant → auto-categorized (AC2): **AC2, AC3, AC5, AC9**.
- [ ] **Cross-surface consistency** — `n/a — web-only at Phase 1`; the load-bearing cross-screen agreement (budget/recap/anomaly reflect the rule batch) is **AC4**.

## Tech notes

Per `docs/bets/WLT-22/architecture.md` (the saved-category model — this slice ships the **third** table + the rule write paths the architecture reserved).

- **Data model (`0012_category_rules.sql`)** — add `category_rules` (owner-scoped; `merchant_norm text`, `category_id uuid`; `unique (user_id, merchant_norm)`; FK `(category_id, user_id) → categories(id, user_id)`; `updated_at` trigger). Owner-CRUD RLS (4 policies), **hard-delete**, composite FK. `transaction_categories` is unchanged — its `assigned_by='rule'` + `rule_id` (added in `0011`) now get used.
- **Merchant normalization** — a pure `normalizeMerchant(merchant): string` in `packages/core` (lowercase + trim + collapse internal whitespace). Used by BOTH rule create/match and the sync-apply, so the keys can't drift. Unit-tested.
- **Rule write path** (`app/lib/categories.ts`) — wire the **already-stubbed `applyToMerchant`** on `recategorizeTransaction`: when `true` + a known merchant → (1) upsert `category_rules(user_id, merchant_norm, category_id)` on the `(user_id, merchant_norm)` conflict (last-write-wins); (2) **bulk-upsert** `transaction_categories(..., assigned_by='rule', rule_id)` for every owner transaction whose normalized merchant matches and that has **no `'user'` assignment**; (3) return the **count** written. Emit `category_rule_created`. The single-transaction `'user'` path (unchecked) is unchanged.
- **Apply-on-sync** (`packages/aggregation` / the Plaid sync job) — after new transactions ingest, apply the user's rules to the new rows: for each new transaction whose normalized merchant matches a rule and that has no `'user'` assignment, write a `'rule'` assignment. Keeps the provider-neutral mapper clean (the apply is a post-ingest step, per the architecture's EA note). Idempotent on `(user_id, dedup_key)`.
- **API/contract** — `POST /api/categories/recategorize` accepts `{dedupKey, categoryId, applyToMerchant?: boolean}` (the architecture's shape; `applyToMerchant` now honoured) and returns `{ ok, count }`. `DELETE` of a rule is **deferred** (rule management).
- **Reads — NO change.** `'rule'` assignments are saved assignments; the WLT-22-2 resolver + the three readers already pick them up. The guard test still holds.
- **UI** (`CategoryPicker.tsx`) — add the "Always categorize [merchant] this way" checkbox (only when `merchant` is non-null), thread `applyToMerchant` into the pick call, and render the counted success / applying / error states. Copy verbatim from `copy.md`.
- **Funnel** — add `CATEGORY_RULE_CREATED: "category_rule_created"` to `packages/core/funnel.ts` (additive).

## PRs

_Auto-populated as PRs open._

## Tests

_Engineer: **unit** (`normalizeMerchant`; the rule-apply logic — writes `'rule'` to matches without a `'user'` row, **skips `'user'` rows**, correct count; last-write-wins replace), **integration (read layer)** (a rule + backfill reflected via the resolver across budget/recap consistently — the AC4 batch reconcile), **component (jsdom)** (the checkbox appears only with a merchant; checked → `recategorize {applyToMerchant: true}` + counted success copy singular/plural; merchant-null → no checkbox; applying/error states). Codex: the **RLS suite** (`category_rules`: owner CRUD, cross-tenant deny, composite-FK rejection, hard-delete) + the **gated real-path E2E** (`E2E_PASSKEY=1`): remember a merchant → past transactions backfilled (budget/drill reflect it) → **insert a NEW transaction from that merchant** (sync-apply) → it arrives auto-categorized; a **`'user'` override survives** a rule; a **second user's rule/assignments are isolated**._

Tags applied to test files:
- `regression: false`
- `e2e: true`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [2026-06-17] [PM] **WLT-22-3 = full rules: create + backfill past + apply-on-sync (future)** — rationale: the brief's elicited decision is "remember the merchant, applying to past + future"; shipping backfill-only would be a half-promise ("remember" implies future too) — area: scope — alternatives: backfill-only, defer apply-on-sync (rejected — incomplete value) — reversibility: medium
- [2026-06-17] [PM] **Rule management (view / edit / delete) is DEFERRED** — rationale: create + apply deliver the core "remember" value; the per-transaction `'user'` override is the exception escape hatch; a "your rules" surface (incl. delete-rule → revert its `'rule'` assignments) is a clean, lower-stakes follow-on — area: scope — reversibility: easy
- [2026-06-17] [PM] **A `'user'` override always outranks a `'rule'`; a rule never clobbers a hand-set transaction** — rationale: the architecture's `assigned_by` precedence; the user's explicit intent must win over an automation — area: correctness — reversibility: n/a
- [2026-06-17] [PM] **Last-write-wins, one rule per merchant (no conflict UX)** — rationale: simplest mental model ("this merchant is X"); re-remembering replaces + re-backfills; conflict resolution would over-build — area: product — reversibility: medium

### Risks
- [2026-06-17] [PM] **A bulk rule surprises the user** (touched many rows / future ones unexpectedly) — likelihood: medium — impact: medium — mitigation: explicit unchecked-by-default checkbox; success copy names the count + going-forward behaviour; the override escape hatch — area: ux/trust
- [2026-06-17] [PM] **No undo-a-rule this slice** — likelihood: medium — impact: medium — mitigation: per-transaction overrides fix exceptions now; rule management is the next follow-on — area: scope
- [2026-06-17] [PM] **Apply-on-sync hook adds a post-ingest step to the sync path** — likelihood: medium — impact: medium — mitigation: a bounded, idempotent post-ingest apply keyed on `(user_id, dedup_key)`; keep the provider-neutral mapper clean; integration test the new-transaction path — area: integration/correctness
- [2026-06-17] [PM] **Backfill bulk-write cost on a large history** — likelihood: low — impact: low — mitigation: bounded to one merchant's matches; indexed; a single bulk upsert — area: performance

### Issues
- [2026-06-17] [PM] **Rule management surface (view/edit/delete + delete→revert)** — severity: medium — owner: PM — status: open — area: product — the top deferred follow-on; resolve when storied.
- [2026-06-17] [PM] **Merchant normalization edge cases** — severity: low — owner: Engineer — status: open — area: data — confirm lowercase + trim + collapse-whitespace is sufficient (store IDs like "#123" stay part of the key → per-store rules; acceptable, the override handles exceptions).

---

_Story status: **ready** — Standard Experience Checklist has no empty category (Cross-surface consistency `n/a — web-only at Phase 1`; the load-bearing cross-screen agreement is AC4). The automation that completes the WLT-22 correction layer; **shipping it makes the WLT-22 bet COMPLETE** (all three slices: verify → correct → remember). Rule management is a separate follow-on, not part of this bet._
