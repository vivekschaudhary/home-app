---
bet: WLT-2
story: WLT-9
author: UX Writer
created: 2026-06-08
---

> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-9 — Connect first bank account

## Voice and tone

Calm, trustworthy, plain. This is the highest-trust moment in the product — the user is handing over a view of their money. Be **transparent and specific** about what's accessed and why; never breezy, never salesy. Teach one idea ("connect your bank"); avoid jargon (**no "OAuth", "Plaid item", "token", "vault", "aggregation"** in UI). Reassure on control ("you can disconnect anytime").

## Strings

| Location / ID | Final copy | Rationale |
|---|---|---|
| `accounts.title` | Accounts | Page heading |
| `accounts.empty.title` | No accounts connected yet | |
| `accounts.empty.body` | Connect a bank to see your real transactions and let the platform work for you. | The why, plainly |
| `accounts.empty.cta` | Connect your first account | Says what it does |
| `consent.title` | Connect your bank | |
| `consent.body` | We use Plaid to securely connect your bank — we never see or store your bank login. | Names the trusted broker; states the zero-knowledge promise |
| `consent.access.heading` | What we'll access | |
| `consent.access.item1` | Your account names and balances | Specific, honest |
| `consent.access.item2` | Your transactions from the last 90 days | |
| `consent.why.heading` | Why | |
| `consent.why.body` | To show your real money picture and power your workflows and insights. | |
| `consent.retention.heading` | How long | |
| `consent.retention.body` | Until you disconnect. You can remove an account anytime, and we'll stop updating it. | Control + honesty |
| `consent.cta` | Connect account | Primary |
| `consent.notNow` | Not now | Honest skip; returns to dashboard |
| `connect.preparing` | Opening your bank… | While the link session starts |
| `accounts.syncing` | Syncing your transactions… | On the account card during backfill |
| `accounts.row.connectedStatus` | Connected | Status chip |
| `accounts.row.syncingStatus` | Syncing | Status chip |
| `accounts.row.lastSynced` | Updated {time} | e.g. "Updated just now" / "Updated 2m ago" |
| `accounts.row.disconnect` | Disconnect | |
| `accounts.addAnother` | Add another account | Visible once ≥1 connected |
| `connect.success` | Account connected — importing your last 90 days of transactions. | Past-tense + sets expectation |
| `disconnect.confirm.title` | Disconnect this account? | Destructive confirm |
| `disconnect.confirm.body` | We'll stop updating it and keep your existing history. You can reconnect anytime. | Reassures: history kept, reversible |
| `disconnect.confirm.cta` | Disconnect | |
| `disconnect.confirm.cancel` | Cancel | |
| `errors.cancelled` | No account connected — try again when you're ready. | Not an error; gentle |
| `errors.institutionUnavailable` | Your bank is temporarily unavailable — try again in a few minutes. | Discriminated: institution down |
| `errors.network` | Connection lost — check your internet and try again. | Discriminated: network |
| `errors.server` | Something went wrong on our side — your information is safe. Try again in a minute. | Discriminated: server; reassures (reused from WLT-6) |
| `a11y.accountCard` | {institution} {type} ending in {mask} — {status}, balance {balance} | Screen-reader label for a card |
| `a11y.syncing` | Importing your transactions, this can take up to 30 seconds. | aria-live hint |

## Terminology consistency
- **"Connect / connect your bank"** (never "link via OAuth", "aggregate", "Plaid Link").
- **"Account"** for a financial account; **"transactions"** for the activity.
- **"Disconnect"** (never "unlink", "revoke", "remove item").
- **"Plaid"** is named once in consent (it's a trust signal users recognize) — but never the technical nouns ("item", "token").

## DRI Log

### Decisions
- [2026-06-08] [UX Writer] Name **Plaid** in the consent line + state "we never see or store your bank login" — rationale: Plaid is a recognized trust signal and the zero-knowledge promise is the single most reassuring fact for an anxious user — area: trust
- [2026-06-08] [UX Writer] Consent is **specific** (account names, balances, 90 days) not vague ("your financial data") — rationale: specificity reads as honesty; vagueness erodes trust on the highest-trust screen — area: trust
- [2026-06-08] [UX Writer] User-cancel is framed as **not an error** — rationale: closing the bank modal is a normal choice, not a failure — area: tone

### Risks
- [2026-06-08] [UX Writer] "Plaid" is unfamiliar to some users — likelihood: low — impact: low — mitigation: the same line explains it ("we use Plaid to securely connect your bank") — area: comprehension

### Issues
- _none_
