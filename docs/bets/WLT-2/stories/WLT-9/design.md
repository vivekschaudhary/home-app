---
bet: WLT-2
story: WLT-9
author: Designer
created: 2026-06-08
figma: n/a — no Figma MCP on host; this spec is the source of truth for v1
area_tags: [frontend, payments]
---

# Design: WLT-9 — Connect first bank account via Plaid OAuth + initial sync

## Overview

The first moment the product touches real money. A signed-in user (post-WLT-1) connects a bank through Plaid and, within ~30s, sees their actual transactions. Tone: **calm, trustworthy, transparent** — this is the highest-trust action in the product, so consent is explicit and honest, and nothing is hidden. We **do not wrap Plaid Link** — it opens as Plaid's own modal (its a11y + institution UX are better than anything we'd reinvent and users recognize it). Our surfaces are the **consent screen before it** and the **connected-accounts list after it**.

Builds on the WLT-1 dashboard. New surfaces: **Security/Accounts consent + connect**, **connected-accounts list**, **disconnect confirm**.

## User flows

### Flow: Connect first account (happy path)
1. Dashboard / Accounts (empty) → **"Connect your first account"**
2. **Consent screen** — what we access (accounts, balances, 90 days of transactions), why (to power your workflows + insights), retention (until you disconnect). **"Connect account"** (primary) · **"Not now"** (returns to dashboard, nothing linked).
3. **Plaid Link modal** opens (Plaid's UI) → user picks institution + authenticates.
4. On success the modal closes → account appears immediately with balance + a **"Syncing transactions…"** state → transactions fill in as the 90-day backfill completes (≤30s p95).
5. Connected-accounts list shows the account: logo, mask, type, balance, **Connected** chip, last-synced.

### Flow: Cancel / error
- User closes Plaid Link without finishing → return to the consent/empty surface with a gentle "No account connected — try again when ready" (not an error).
- Institution unavailable / network / server → discriminated inline message (copy.md), retry CTA. Never a dead end.

### Flow: Add another / Disconnect
- **Add another account** → re-enters consent → Plaid Link (re-link same institution = upsert, no dupe row).
- **Disconnect** (per account row) → confirm dialog ("Disconnect [Institution]? Your transaction history is kept but stops updating; you can reconnect anytime.") → on confirm, row removed optimistically; behind it: revoke at Plaid → Vault delete → soft-delete history.

## Screens & states

### Screen: Consent (`/settings/accounts` connect step)
| State | Description | Copy |
|---|---|---|
| Default | Heading + the 3 honest disclosures (what/why/retention) + **Connect account** / **Not now** | `consent.*` |
| Preparing | After "Connect account" → CTA spinner + disabled while the link session is created | `connect.preparing` |
| Error (link-session) | Couldn't start → inline error + retry | `errors.server` |

### Screen: Connected-accounts list (`/settings/accounts`)
| State | Description | Copy |
|---|---|---|
| Empty | "No accounts connected yet" + **Connect your first account** CTA | `accounts.empty.*` |
| Syncing | Account card present (institution, mask, balance) + **"Syncing transactions…"** progress on the card | `accounts.syncing` |
| Connected | Card: logo · mask · type badge · current balance · **Connected** chip · "Updated {last_synced}" · **Disconnect** | `accounts.row.*` |
| Needs re-auth *(future story)* | reserved — chip + re-auth CTA (connection-health is a later story) | — |
| Error (load) | banner + retry | `errors.server` |

### Component: Disconnect confirm (`ConfirmDialog`)
- Destructive confirm; **"Disconnect"** + **"Cancel"**; Esc cancels. `disconnect.confirm.*`

## Interactions
- **Plaid Link** is launched via the Plaid SDK and rendered as its own modal — **do not intercept, wrap, or restyle it**. On exit we read the result (success / user-exit / error) and route accordingly.
- **Optimistic UI** on disconnect (row removed immediately; reconciled on server response; restored + toast on failure).
- **Backfill progress** is a calm indeterminate indicator on the syncing card — not a blocking spinner over the page (the user can navigate away; transactions appear when ready).
- Balances are display-only here (no reconciliation against transactions in this story — `balance_updated_at` is the snapshot time).

## Accessibility
- Keyboard-completable end-to-end (consent → connect → list). The Plaid modal carries its own a11y.
- Focus: opening consent → focus the heading; after the Plaid modal closes → focus returns to **"Add account"** (or the new account card); errors `role="alert"`; the syncing indicator + success use `aria-live="polite"`.
- Account cards have descriptive labels ("Chase Checking ending 4242 — Connected — balance $1,234.00").
- WCAG AA contrast; status chips carry text + icon (never color-only); reduced-motion respected on the progress indicator.

## Design system components used
Reuses `Button`, `Banner`, `Toast`, `ConfirmDialog`, `AuthCard`/card shell from `@wealth/ui`. **Establishes:** `AccountCard` (logo · mask · type badge · balance · status chip · disconnect), `StatusChip` (connected / syncing / error states), and a `ConsentPanel` layout. All Tailwind; seeds `/packages/ui`.

## DRI Log

### Decisions
- [2026-06-08] [Designer] **Don't wrap Plaid Link** — render Plaid's own modal — rationale: its institution UX + a11y are stronger and users recognize/trust it; wrapping adds risk + maintenance — area: trust/a11y
- [2026-06-08] [Designer] **Explicit consent screen before Link**, with honest what/why/retention — rationale: this is the highest-trust action; transparency is the moat prerequisite (and the brief's consent requirement) — area: trust
- [2026-06-08] [Designer] **Backfill is non-blocking** (account shows immediately, transactions fill in) — rationale: perceived speed + the user isn't trapped on a spinner during a ≤30s sync — area: UX

### Risks
- [2026-06-08] [Designer] Some institutions return an empty/failed Plaid Link (coverage gaps) — likelihood: medium — impact: medium — mitigation: discriminated error + a clear path back; CSV is the next story for the long tail — area: UX

### Issues
- [2026-06-08] [Designer] No `AccountCard`/`StatusChip` design-system components yet; this story seeds them in `/packages/ui` — severity: low — owner: Designer — status: open
