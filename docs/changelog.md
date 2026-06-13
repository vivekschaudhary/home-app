# Changelog

User-visible changes. One entry per shipped bet (not per PR — PRs accumulate, finalize when brief ships).

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Identity & MFA onboarding (WLT-1, story WLT-6):** create an account with email + password and a **mandatory passkey** enrolled in the same flow; sign in with a passkey challenge. Sessions persist across reloads; the second factor is enforced server-side. Unsupported browsers get an honest block. _(Supabase Auth + a custom WebAuthn 2FA layer — architecture ADR-001.)_
- **Connect your bank (WLT-2, story WLT-9):** link a bank account through Plaid from an explicit consent screen, then see your real transactions imported (last 90 days) within seconds; view connected accounts with balances and sync status, and disconnect anytime (history kept, updates stop). Bank credentials are never seen or stored; access tokens live encrypted in Supabase Vault, never in app tables. _(Provider-neutral `@wealth/aggregation` pipeline — Plaid via ADR-002, swappable by design.)_
- **Tell us what you want (WLT-3, story WLT-11):** right after sign-in — before connecting anything — declare what you'd like help with across six plain, first-person choices (worried about overspending, saving for something, making sense of it all, and more). Your intent is saved and used to set up the right plan; "not sure yet" lets you look around with no dead-end. _(Intent-first, user-first onboarding; intents/goals owner-scoped with same-user enforcement at the DB.)_
- **Your full history, kept fresh (WLT-2, story WLT-10):** connecting a bank now imports up to **24 months** of history (not just the recent window), and an honest "Importing your history…" state stays until it's actually all in — even if you leave and come back. After that, new transactions and balance changes sync automatically. _(Plaid `days_requested:730` + a signature-verified webhook with a scheduled fallback; the "done" signal is real sync stabilization, not a timer.)_
- **Your plan starts working (WLT-4, story WLT-12):** tell us what you want and connect your bank, and the platform turns it into a real plan — your actual net worth ("Your money, right now": assets, debts, the number) with one clear next move: **set your target**, one tap on a suggested figure or your own. From then on it reads "Running — tracking toward your target," and it's still there every time you come back. Until you connect, it says so honestly — your plan is ready, never a made-up number. _(The workflow engine: goal → archetype → personalization on real balances → an immutable action record; the first turn of the product's core loop.)_
- **The loop measures itself (WLT-5, story WLT-13 — internal):** an internal, admin-only instrument panel computes **TTFV** (signup → first action, p80 vs the 3-min target, with split times), **WAWU** (the weekly north star), and **stage-by-stage funnel conversion** from the events the loop already emits — recorded as dated snapshots for the review cadence. No user-facing change; this is the instrumentation that makes the foundational hypothesis falsifiable. _(Read-only Postgres views, privilege-revoked; an AAL2 + allow-list page that 404s for everyone else; aggregates only, no PII. **Completes the MVP bet portfolio.**)_

### Changed
-

### Fixed
-

### Deprecated
-

### Removed
-

### Security
-

<!--
When a brief ships:
1. Move accumulated entries from Unreleased into a versioned section below
2. Start a fresh Unreleased section
3. Sprint comms (docs/sprints/<year>/sprint-<n>.md) lists all briefs shipped that sprint
-->
