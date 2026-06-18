---
id: WLT-22-2
bet: WLT-22
type: story
status: shipped
priority: P1
created: 2026-06-17
author: PM
design_link: docs/bets/WLT-22/stories/WLT-22-2/design.md
copy_link: docs/bets/WLT-22/stories/WLT-22-2/copy.md
area_tags: [frontend, spending, budgets, data, security]
dependencies:
  - WLT-22-1 # shipped — the drill-down this correction flow lives inside
---

# WLT-22-2 — Recategorize a transaction (correct the number, and it sticks)

## Description

From the WLT-22-1 drill-down, let a user **fix a mis-categorized transaction** — move it to the right category, **creating a new category inline** when the right one doesn't exist yet (so they can finally split Plaid's lumped "Rent & Utilities" into their own Rent + Utilities). The correction is **saved as the user's own** — keyed to the stable `dedup_key` so it **survives Plaid re-syncs** — and every surface (budget, the WLT-17 recap, WLT-18 anomalies) reflects it through **one shared resolver** (`saved ?? Plaid`), so the moment the user moves a transaction the numbers reconcile and nothing else goes stale. Plaid's category stays the **cold-start default** for anything the user hasn't touched. This is the **manual** correction layer; "remember this merchant" (rules that auto-apply to past + future) is the deliberately-separate **WLT-22-3**.

## Acceptance Criteria

- [ ] **AC1 — Recategorize a transaction.** In a category's drill-down, each line item exposes its **current category** as a control that opens a **picker** of the user's categories (current one marked). Choosing a different one **saves** the assignment and the item reflects the new category. Keyboard-operable; the current category is always visible before changing it.
- [ ] **AC2 — Saved, and it survives re-sync (the guardrail).** The assignment persists in `transaction_categories` keyed by **`dedup_key`** with `assigned_by: 'user'`; a Plaid **CDC re-sync** that writes a new revision of that transaction does **NOT** revert the user's category. `transactions.category` (Plaid's) is **never mutated**.
- [ ] **AC3 — Create a custom category (split a coarse group).** From the picker, **"+ New category"** (name + `essential`/`discretionary`) creates an **owner-scoped** category, immediately selectable for the transaction — so "Rent & Utilities" can be split into a new "Rent". A **case-insensitive duplicate** name is rejected with a clear message; an empty name is rejected.
- [ ] **AC4 — Consistency through ONE resolver (load-bearing).** Category is read everywhere via a **single shared helper** (`saved ?? Plaid`): after a recategorization the **budget table**, the **recap "where it went" (WLT-17)**, and **anomalies (WLT-18)** all reflect the user-resolved category — no surface shows a stale or contradictory value. The drill total + budget rows **reconcile**: the source category drops by the amount, the destination rises by it, and items still sum to the shown total. A **guard test** asserts no grouping consumer reads `transactions.category` raw.
- [ ] **AC5 — Plaid stays the cold-start default.** A transaction the user **hasn't** touched still resolves to Plaid's category (the indication). A user with **no** saved assignments sees exactly today's behaviour — **ships dark-safe**.
- [ ] **AC6 — Honest states + discriminated feedback.** Recategorize has a **saving** state (`aria-busy`), a **success** acknowledgment (the number visibly moves), and an **error** that discriminates **network / validation / server** + retry — and the item **keeps its prior category until a save succeeds** (no optimistic-then-revert). Create-category has empty-name + duplicate-name validation, a saving state, and an error + retry.
- [ ] **AC7 — Accessibility.** The category control is a labelled button (`aria-haspopup` / `aria-expanded`) whose accessible name carries the current category; the picker is a keyboard-navigable menu (arrows / Enter / Esc) with the current option marked; **focus moves into the picker on open and returns to the control on close/select**; the create-form is labelled; validation errors are announced; WCAG AA.
- [ ] **AC8 — Owner-scoped (load-bearing security).** `categories` + `transaction_categories` are **owner-CRUD under RLS** (the `intents`/`budgets` 4-policy pattern, **hard-delete** on clear); a user can only read/write their **own**; **composite FKs `(category_id, user_id)`** block a forged cross-tenant `category_id`. Proven by the RLS suite **and** a gated real-path E2E — a **second user cannot read or affect** the first user's categories or assignments.
- [ ] **AC9 — WLT-21 budgets carry over.** Existing budgets carry over **automatically**: categories are **name-keyed** (`categories.name` is canonical; seeded names == the provider strings WLT-21 budgets were keyed on), so an untouched transaction resolves to its Plaid string and a custom "Rent" resolves to "Rent" — both match their saved budget by name, **no budgets-table migration**. The recommendation/essentials logic reads `category.kind` (a custom category marked essential isn't trimmed). _The rename-safe `budgets.category_id` migration is deferred to ship with category rename/delete (also deferred) — approved scope decision 2026-06-17._
- [ ] **AC10 — Instrumentation.** Additive funnel events **`transaction_recategorized`** and **`category_created`**, each emitted once per action.

## Standard Experience Checklist

- [ ] **Navigation** — the picker opens/closes inline; **cancel/dismiss** = Esc or pick-away returns focus to the item's control (no route change); create-form has an explicit Cancel: **AC1, AC7**.
- [ ] **States** — resting · picker-open · creating · **saving** · **success** · **error** · new-user/no-assignments: **AC1, AC3, AC5, AC6**.
- [ ] **Feedback** — discriminated errors (network / validation / server) + a "Moved to {category}" success ack; **no destructive confirm** — recategorize is reversible (re-pick), so a confirm is `n/a — reversible action`: **AC6**.
- [ ] **Accessibility** — labelled `aria-haspopup` control carrying current category, keyboard-navigable picker, focus-into-picker + focus-return, labelled create-form, announced errors, AA: **AC7**.
- [ ] **Edge cases** — offline/slow network → the discriminated error + the keeps-prior-category-until-success rule (AC6); a brand-new user with no saved assignments → today's behaviour (AC5); a transaction whose category the user already overrode → the override shows as current (AC1); duplicate/empty category name (AC3): **AC3, AC5, AC6**.
- [ ] **Cross-surface consistency** — `n/a — web-only at Phase 1` (the foundational stack ships `deploy_targets: [web]`); the **cross-screen** consistency that matters here (budget/recap/anomaly agreeing) is the resolver contract in **AC4**.

## Tech notes

Per `docs/bets/WLT-22/architecture.md` (the saved-category model). **This slice = the spine + per-transaction override + custom categories; merchant rules (`category_rules`, apply-on-create/sync) are DEFERRED to WLT-22-3.**

- **Data model (`00NN_categories.sql`)** — add **two** of the architecture's three tables this slice: `categories` (owner-scoped; `name`, `kind ('essential'|'discretionary')`, `source ('seed'|'custom')`; `unique(user_id, lower(name))`; `unique(id, user_id)` for the composite FK) and `transaction_categories` (the saved assignment; `dedup_key`, `category_id`, `assigned_by` — only `'user'` this slice, `rule_id` nullable + unused; `unique(user_id, dedup_key)`; FK `(category_id, user_id) → categories(id, user_id)`). **`category_rules` is NOT created here** — WLT-22-3. Owner-CRUD RLS (the `intents` 4-policy pattern), **hard-delete** on clear, composite FKs. `transactions.category` untouched.
- **The one shared resolver** — `effectiveCategory(transaction, savedAssignment) → saved ?? plaidDefault`, in `packages/core` (string-agnostic, pure). Wire it into **all three** readers: `app/lib/budget.ts`, `app/lib/recap.ts`, `packages/jobs/recap/anomaly-scan.ts` — each `LEFT JOIN transaction_categories ON (user_id, dedup_key)` and passes the **resolved** string into the unchanged pure compute (`packages/core/{budget,recap,anomaly}.ts` stay as-is). A **guard test** asserts no grouping consumer selects/groups `transactions.category` raw.
- **Seed + migration** — on first use, **seed each user's `categories` from the distinct provider categories present in their data** (so the picker isn't empty + WLT-21 budgets map 1:1), `kind` seeded from the WLT-21 essential allowlist, `source: 'seed'`. Migrate `budgets.category` (provider string) → **`budgets.category_id`** (rename-safe) — the architecture's open question; lean `category_id`. Display seeded names via `humanizeCategory`.
- **API (new, AAL2-guarded, `runtime = "nodejs"`)** — `GET /api/categories` (the user's set); `POST /api/categories` `{name, kind}` (create custom); `POST /api/categories/recategorize` `{dedupKey, categoryId}` (writes the `'user'` assignment — **no** `applyToMerchant` this slice). Client helpers in `app/lib/budget-client.ts` (or a `categories-client.ts`), discriminated `{ok}|{error}` returns (the established pattern).
- **UI** — extend the WLT-22-1 `CategoryTransactions.tsx` line item with the recategorize control + picker + inline create-form; wire the writes through `BudgetClient.tsx` (which owns the drill cache — invalidate/refetch the affected categories on a successful move so totals reconcile). Reuse `@wealth/ui` primitives; keyboard + focus per AC7.
- **Funnel** — add `TRANSACTION_RECATEGORIZED` + `CATEGORY_CREATED` to `packages/core/funnel.ts` (additive); emit client-side, once per action (the WLT-22-1 `drilldown-viewed` pattern).
- **Forward-compat** — `transaction_categories.assigned_by`/`rule_id` already shaped for WLT-22-3's rules; the recategorize endpoint's `applyToMerchant` is simply not sent yet.

## PRs

- **PR #61** — `feat(WLT-22-2): recategorize a transaction + custom categories — the saved-category spine` — **merged** 2026-06-17 (squash `a7d95b0`).

## Tests

_Engineer: **unit** (the `effectiveCategory` resolver — saved wins; untouched → Plaid; `null` → "Other"; `kind` read by the recommendation), **integration (read layer)** (budget/recap/anomaly all reflect a saved assignment consistently — the AC4 reconcile: source drops, destination rises, drill total still equals the row), **component (jsdom)** (recategorize → POST `{dedupKey, categoryId}` + the item updates; create-category → validation empty/duplicate + POST; saving/success/discriminated-error states; focus into/out of the picker; `transaction_recategorized` + `category_created` once each), **migration** (budgets `category` → `category_id` maps; seed from distinct provider categories). Codex: the **RLS suite** (`supabase/tests/rls.test.ts` — both tables: owner CRUD, cross-tenant denied, composite-FK blocks a forged cross-tenant `category_id`, hard-delete) + the **gated real-path E2E** (`E2E_PASSKEY=1`): seed transactions → recategorize one (incl. creating a category to split a group) → reload → budget + drill reflect the saved category through session→RLS→render; **re-insert a CDC revision** of that transaction → the assignment **survives** (AC2); and a **second user cannot read/affect** the first's categories/assignments (AC8)._

Tags applied to test files:

- `regression: false`
- `e2e: true`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions

- [2026-06-17] [PM] **Slice WLT-22-2 = recategorize + custom categories (the spine); DEFER merchant rules to WLT-22-3** — rationale: this is the smallest increment that fully solves the headline complaint (split a coarse group) AND lands the load-bearing spine (saved-`dedup_key` assignment + the one shared resolver + budget migration); merchant-rule automation is a clean, lower-risk follow-on on top of the same spine — area: scope — alternatives: minimal recategorize-into-existing-only (rejected — can't split Rent/Utilities, the literal complaint), full correction layer incl. rules in one story (rejected by one-smallest-slice discipline + review/merge risk; product owner agreed to split per recommendation) — reversibility: easy
- [2026-06-17] [PM] **Custom-category creation is IN this slice; category management (rename/delete/merge) is OUT** — rationale: creating a category is what enables the split (core value); managing them is secondary and delete-semantics is still an open architecture question — create + assign now, manage later — area: scope — reversibility: easy
- [2026-06-17] [PM] **The budget→`category_id` migration ships in this slice** — rationale: once budget reads through the resolver, the old provider-string budgets must map or they break; it's load-bearing for "WLT-21 budgets carry over" (AC9), not deferrable — area: data — reversibility: medium
- [2026-06-17] [PM] **`category_rules` table NOT created this slice** — rationale: keep the migration to the two tables this story needs; the rules table + its write paths are WLT-22-3, and `transaction_categories` is already shaped to accept rule-written rows later — area: scope/data — reversibility: easy

### Risks

- [2026-06-17] [PM] **A category read bypasses the shared resolver → surfaces disagree** — likelihood: medium — impact: high — mitigation: the single `effectiveCategory` helper wired into all three readers + a guard test that no grouping consumer reads `transactions.category` raw (the brief's #1 guardrail) — area: correctness
- [2026-06-17] [PM] **The budget migration mis-maps a WLT-21 budget → a user loses a budget they set** — likelihood: low — impact: medium — mitigation: seed categories from the exact distinct provider strings present, map `budgets.category` 1:1 to the seeded row, migration test asserts every existing budget resolves to a category — area: data
- [2026-06-17] [PM] **A correction ripples confusingly across recap/anomaly (past numbers shift)** — likelihood: medium — impact: medium — mitigation: the shift is intended + consistent (one resolver, no cached category); the design's live reconcile makes it legible; stored anomalies keep their point-in-time snapshot (accepted edge per architecture) — area: ux/correctness
- [2026-06-17] [PM] **Scope creep toward rules/management** — likelihood: medium — impact: medium — mitigation: the design + copy explicitly avoid implying auto-apply; management deferred; the "don't over-build" brief guardrail — area: scope

### Issues

- [2026-06-17] [PM] **Delete-a-category / delete-an-assignment semantics** — severity: low — owner: PM/Designer — status: deferred — area: product — not in this slice (create + assign only); resolve when category management is storied.
- [2026-06-17] [PM] **Seeded-category essentials mapping** — severity: low — owner: Engineer — status: **resolved** — area: product — `category.kind` seeded from the essential allow-list; `computeRecommendedBudgets` takes an `isEssential` predicate backed by the user's kinds (falls back to the built-in set). Covered by a core unit test.

### Decisions (Engineer — build)
- [2026-06-17] [Engineer] **Shared resolver = pure `effectiveCategory` (@wealth/core) + `readCategoryAssignments` (@wealth/db) in all three readers; resolution in-memory (two owner-scoped selects joined by `dedup_key`), pure compute untouched** — rationale: keeps `packages/core/{budget,recap,anomaly}` source-agnostic; avoids PostgREST embedding ambiguity on the composite FK; one helper both the RLS app client and the service-role job can call — area: architecture/correctness — alternatives: a SQL view / PostgREST embed (rejected — brittle on the composite FK) — reversibility: easy
- [2026-06-17] [Engineer] **Name-keyed categories; NO budgets migration** (the approved scope decision) — rationale: seeded names == provider strings, so WLT-21 string-keyed budgets carry over with zero migration; `category_id` rename-safety ships with rename/delete — area: data/scope — reversibility: medium
- [2026-06-17] [Engineer] **Drill read resolves-then-filters** (fetch the month's debits + the assignment map, resolve, filter to the target) instead of `.eq("category", …)` — rationale: a transaction MOVED into a category must appear in its drill + one moved OUT must drop, so the drill total stays equal to the budget row (AC4) — area: correctness — reversibility: easy
- [2026-06-17] [Engineer] **Recategorize/create funnel events emitted server-side inside the write routes** (not client fire-and-forget like the WLT-22-1 GET) — rationale: deliberate non-idempotent writes fire once per action; no double-count, simpler than a gated client emit — area: instrumentation — reversibility: easy
- [2026-06-17] [Engineer] **The WLT-21 "+ Add a category" picker stays on `BUDGETABLE_CATEGORIES`** (not unified with user categories this slice) — rationale: no AC depends on it; budgets are string-keyed + independent of the categories table; unifying it would change tested WLT-21 behaviour for no slice gain — area: scope — status: deferred — reversibility: easy

### Risks (Engineer — build)
- [2026-06-17] [Engineer] **The resolver runs per reader on every load** (an extra owner-scoped read of the assignment map) — likelihood: high (by design) — impact: low — mitigation: the map is bounded (only touched transactions), indexed on `(user_id)`; an unassigned user resolves to today's behaviour (dark-safe) — area: performance
- [2026-06-17] [Engineer] **Migration `0011` not applied locally** (no local PG) — likelihood: n/a — impact: medium if malformed — mitigation: mirrors the `intents`/`budgets` shape exactly; Codex's RLS suite applies + exercises it against real Postgres before merge — area: data

---

### Review (post-build)
- [2026-06-17] [Codex] **Round 1 — 2 BLOCKERs** on `da77eec`, both Codex-owned test deliverables (not app-code defects): the RLS suite for the two new tables, and the gated real-path E2E. Routed back to Codex per the story's test division + security-proof independence (the WLT-22-1 precedent).
- [2026-06-17] [Codex] **Both BLOCKERs cleared** in `b571dee` (`test: cover category RLS and recategorize e2e`): RLS suite for `categories` + `transaction_categories` (owner CRUD, cross-tenant deny, **forged cross-tenant `category_id` rejected at the composite-FK boundary**, hard-delete) + the gated E2E (recategorize through the UI + reconcile; **CDC-revision survival** keyed by `dedup_key`, AC2; **second-user isolation**, AC8). `0011_categories.sql`'s first real-Postgres exercise.
- [2026-06-17] [Codex] **CLEAR** — tied to HEAD `b571dee` (per `[reverify-after-blocker-fix-commit]`). Merged squash `a7d95b0`.

_Story status: **shipped** (PR #61, squash `a7d95b0`, 2026-06-17). Standard Experience Checklist has no empty category (Cross-surface consistency `n/a — web-only at Phase 1`; the load-bearing cross-screen agreement is AC4). The correction half of WLT-22; **WLT-22-3** (remember-the-merchant rules) follows on the same spine._
