---
id: WLT-27-2
bet: WLT-27
type: story
status: in_review
priority: P1
created: 2026-06-28
author: PM
design_link: n/a — form layout specified in architecture.md; no Figma required for MVP form
area_tags: [accounts, backend, frontend, multi-currency]
dependencies:
  - WLT-27-1
---

# Manual Account Entry API + UI

## Description

Users who rely on Apple Card, Cash App, Venmo, PayPal, or Plaid-unsupported credit unions for a material portion of their spending have no way to represent those accounts today. This story adds a `POST /api/accounts` route handler that creates a `financial_accounts` row with `connection_id = null` (the schema's designated "manual account" signal), along with a `ManualAccountForm` UI that lets users name the account, pick a type (checking / savings / credit / investment / other), and select a currency. USD accounts can be created immediately; non-USD accounts remain gated behind `MULTI_CURRENCY_ACCOUNTS_ENABLED` until WLT-27-1's regression suite has been verified in production. A database migration widens the `financial_accounts.kind` check constraint to admit `investment` and `other`, which are valid for manual-only accounts not expressible via Plaid's depository/credit classification.

## Acceptance Criteria

- [x] AC-1: Migration `supabase/migrations/0020_financial_accounts_kind.sql` widens the `kind` check constraint from `('depository','credit')` to `('depository','credit','investment','other')`. Constraint name verified on ephemeral PG before `DROP CONSTRAINT IF EXISTS` is executed (expected name: `financial_accounts_kind_check`).
- [x] AC-2: `POST /api/accounts` route handler (`app/api/accounts/route.ts`) is AAL2-gated via `getAal2UserId()`. Returns `401` for an AAL1 session or unauthenticated request.
- [x] AC-3: Route handler reads `MANUAL_ACCOUNTS_ENABLED` from env. If the flag is absent or false, the endpoint returns `403` with `{ error: 'MANUAL_ACCOUNTS_DISABLED' }`.
- [x] AC-4: Route handler rejects `currency !== 'USD'` with `400` when `MULTI_CURRENCY_ACCOUNTS_ENABLED` is off. When the flag is on, any valid ISO 4217 currency code (from the defined allowlist) is accepted.
- [x] AC-5: Route handler maps user-facing `kind` to DB `kind`: `checking → depository`, `savings → depository`, `credit → credit`, `investment → investment`, `other → other`. Returns `400` on an unrecognized kind.
- [x] AC-6: Route handler writes a `financial_accounts` row with `connection_id = null`, `provider_account_id = null`, and the mapped `kind`, `currency`, `name`, and optional `institution_name`. Returns `{ account: { id, name, kind, currency } }` on success.
- [x] AC-7: Integration test confirms PostgreSQL `unique(connection_id, provider_account_id)` allows two `(null, null)` rows for the same user (NULLs are treated as distinct in a unique index). Test fails loudly if the constraint rejects a second manual account, blocking the PR until resolved.
- [x] AC-8: `ManualAccountForm` (`app/(app)/accounts/ManualAccountForm.tsx`) renders only when `MANUAL_ACCOUNTS_ENABLED` is true. The form is not present in the DOM (not just hidden) when the flag is off.
- [x] AC-9: Form fields: account name (required, text), institution name (optional, text), kind picker (radio or select: checking / savings / credit / investment / other), currency picker (ISO 4217 single-select; USD pre-selected; picker disabled and locked to USD when `MULTI_CURRENCY_ACCOUNTS_ENABLED` is off).
- [x] AC-10: Form shows a loading state (button disabled, spinner or text change) while the `fetch('/api/accounts', { method: 'POST' })` request is in-flight.
- [x] AC-11: On success, the form shows a success message (e.g., "Account created") and triggers accounts-list revalidation so the new account appears without a full page reload.
- [x] AC-12: On API error, the form shows a discriminated error message: `MANUAL_ACCOUNTS_DISABLED` → "Manual accounts are not available yet", `currency` rejection → "Multi-currency accounts are not available yet", validation error → field-level inline error, network error → "Something went wrong — please try again". Error is associated with the relevant field or displayed as a form-level banner.
- [x] AC-13: All form controls are keyboard-navigable (Tab order: name → institution name → kind → currency → submit). The kind picker and currency picker are operable via keyboard. Submit button receives focus on mount-equivalent (first field focused on modal/panel open).
- [x] AC-14: RLS smoke test: a `financial_accounts` row created by user A (with `connection_id = null`) is visible to user A and invisible to user B via the `financial_accounts_select_own` policy.
- [x] AC-15: E2E test creates a manual USD checking account, verifies the row in `financial_accounts` with `connection_id = null` and `kind = 'depository'`, then **hard-deletes the created row** so no residual test records remain.

## Standard Experience Checklist

- [x] **Navigation** — covered by AC-11 (success revalidates accounts list, returning user to the account list view) and AC-12 (errors keep the user in the form with actionable feedback). Cancel path via onCancel prop closes the modal.
- [x] **States** — loading (AC-10), error (AC-12), success (AC-11), disabled (AC-8 flag-off, AC-9 currency picker disabled).
- [x] **Feedback** — covered by AC-10 (in-flight "Adding…"), AC-11 (success via Toast), AC-12 (discriminated error messages).
- [x] **Accessibility** — covered by AC-13 (autoFocus, Tab order, keyboard-operable pickers, aria-describedby on error).
- [x] **Edge cases** — AC-4 (non-USD blocked), AC-7 (second manual account allowed), AC-3 (flag-off 403), AC-12 (network error).

## Tech notes

Architecture ref: `docs/bets/WLT-27/architecture.md` — "Sub-feature A — WLT-27-2" section.

Key files created/modified:
- `supabase/migrations/0020_financial_accounts_kind.sql` (new) — constraint widen.
- `app/api/accounts/route.ts` (new) — `POST /api/accounts`.
- `app/api/accounts/route.test.ts` (new) — 14 unit tests.
- `app/(app)/accounts/ManualAccountForm.tsx` (new) — form component.
- `app/(app)/accounts/AccountsClient.tsx` (modified) — integrates form.
- `app/(app)/accounts/page.tsx` (modified) — passes feature flags.
- `app/lib/copy.ts` (modified) — adds `manualAccount` copy block.

## PRs

- https://github.com/vivekschaudhary/home-app/pull/127 — feat(WLT-27-2): manual account entry API + UI

## Tests

- Unit (14 tests, `app/api/accounts/route.test.ts`, `regression: false`, `e2e: false`): AC-2 (401), AC-3 (403), AC-4 (400 non-USD), AC-5 (all 5 kind mappings + bad kind), AC-6 (success shape), currency allowlist, server error.
- E2E (`e2e/manual-account.spec.ts`, 6 tests, gate: `E2E_PASSKEY=1 + SUPABASE_DB_URL`):
  - AC-8 (flag-off): CTA absent from DOM when `MANUAL_ACCOUNTS_ENABLED` is off (gate: flag unset).
  - AC-9/10/11/15 (happy path, gate: `MANUAL_ACCOUNTS_ENABLED=true`): form fields present; loading state (`Adding…`, disabled); success message (`Account added`); DB row verified (`connection_id=null`, `kind=depository`, `currency=USD`); hard-deletes created row.
  - AC-12 (errors, gate: same): empty-name field error; cancel closes form without creating row.
  - AC-13 (keyboard, gate: same): Tab order name→institution→kind→currency→submit→cancel; Arrow keys in radio group.
  - AC-14 (RLS, gate: same): user A's account visible to A, invisible to B via real auth→RLS→RSC path (separate browser context).

## Fixes (post-merge)

_None yet._

## DRI Log

### Decisions

- **[2026-06-28] [PM]** Ship USD-only manual account creation before `MULTI_CURRENCY_ACCOUNTS_ENABLED` is verified — the existing USD-only spending pipeline is unaffected by `connection_id = null`; no currency-mixing risk for users who add USD manual accounts before WLT-27-1's regression suite completes. Two flags enable independent rollout. Area: release strategy. Reversibility: high.
- **[2026-06-28] [PM]** Expand `financial_accounts.kind` constraint in this story (not deferred) — the constraint blocks `investment` and `other` kinds at the DB level; manual account creation is meaningless without the types that are only valid for non-Plaid accounts. Blocking the PR on this migration is correct. Area: data. Reversibility: easy (additive).
- **[2026-06-29] [Automation]** E2E suite written in `e2e/manual-account.spec.ts` (6 tests, 5 suites). Per-surface vertical test for AC-15 exercises the full real-auth → AAL2-gated POST /api/accounts → financial_accounts insert (RLS write) → RSC re-read path on a prod-like build. Mocked-auth / service-role substitutes explicitly excluded. RLS test (AC-14) uses a separate Playwright browser context for user B to avoid cookie contamination. AC-8 flag-off suite uses a complementary skip gate (requires flag UNSET) so it runs independently from the flag-on suites. All data-mutating tests hard-delete via `financial_accounts.id` first, then cascade via `auth.users` delete. Area: testing. Reversibility: n/a.
- **[2026-06-29] [Engineer]** Re-implemented on clean branch `feat/WLT-27-2-work` after prior PR #125 was contaminated by build-branch-stacking bug (#173) which included other WLT-27 stories' changes. This PR (#127) contains only WLT-27-2 scope: migration, route handler, form component, AccountsClient integration, page RSC props, copy block, and 14 unit tests. Area: release strategy. Reversibility: n/a.
- **[2026-06-29] [Engineer]** Added `GET /api/accounts` to return the user's manual accounts (BLOCKER fix — Reviewer finding). The original POST-only route left no way to read back created accounts; `fetchConnections()` hits `/api/aggregation/connections` which only returns Plaid-linked connections. Fix: GET handler queries `financial_accounts` where `connection_id IS NULL`, returning `{ accounts: [...] }`. Added `ManualAccountView` type + `fetchManualAccounts()` in `aggregation-client.ts`. `AccountsClient` now fetches both on mount and after form success via `Promise.all`, maintains separate `manualAccounts` state, and renders manual accounts as `AccountCard` rows (no balance, no mask, no disconnect action) appended to the Plaid connections list. Swept all consumers: no other callsites reference the old fetch-only pattern. Area: accounts, backend, frontend. Reversibility: additive.

### Risks

- **[2026-06-28] [PM]** PostgreSQL `unique(null, null)` behavior must be confirmed before this story ships — if the constraint rejects a second manual account, the feature is broken for any user who wants more than one manual account. AC-7 is the gate. Area: data.

### Issues

- **[2026-06-28] [PM]** Plaid link-failure instrumentation not yet in place (inherited from brief DRI) — severity: medium. Owner: Engineer. Status: open.

---

_Story status: in_review. PR: https://github.com/vivekschaudhary/home-app/pull/127_
_Brief: docs/bets/WLT-27/brief.md_
