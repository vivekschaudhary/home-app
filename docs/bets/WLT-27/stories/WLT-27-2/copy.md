---
id: WLT-27-2-copy
story: WLT-27-2
status: draft
type: copy
created: 2026-06-28
author: UX Writer
---

# Copy: WLT-27-2 — Manual Account Entry API + UI

## Voice and tone

Plain, useful, quietly in-control. The user is adding an account that doesn't connect through Plaid — Apple Card, Cash App, a credit union. They already know what they're doing; don't over-explain the situation or celebrate the action. Account creation is infrastructure, not a milestone. Labels are minimal. Errors are honest and specific: each one tells the user what happened and what to do next. Never say "something went wrong" without naming the problem.

Voice guidelines: `n/a — product.md has no dedicated voice/tone section; register follows plain, useful, quietly in-control standard established in WLT-24/25 copy`.

## Strings

### Accounts page — entry point

- **accounts-add-manual-cta:** `Add account manually`

### Dialog — labels and fields

- **manual-account-form-title:** `Add account manually`
- **manual-account-name-label:** `Account name`
- **manual-account-name-placeholder:** `My Apple Card`
- **manual-account-institution-label:** `Institution` _(optional)_
- **manual-account-kind-legend:** `Account type`
- **manual-account-currency-label:** `Currency`
- **manual-account-currency-locked-hint:** `USD only for now`

### Dialog — actions

- **manual-account-submit-cta:** `Add account`
- **manual-account-cancel:** `Cancel`

### Feedback

- **manual-account-success:** `Account added`

### Errors

Each error names its type and gives the user a next action.

- **manual-account-error-disabled** _(permissions — feature flag off):_ `Manual accounts aren't available yet.`
- **manual-account-error-currency** _(permissions — non-USD gated):_ `Only USD accounts are supported right now.`
- **manual-account-error-name-required** _(validation — blank name field):_ `Account name is required.`
- **manual-account-error-network** _(network / server):_ `We couldn't add that account just now — try again.`

## Terminology consistency

- **"Add account manually"** — the action phrase, used on the CTA button and dialog title. Mirrors the natural verb the user would use ("I want to add an account"). Not "Create manual account" (inside-out, not the user's phrase) or "Manual add" (fragment).
- **"Account name"** — the field label. Preferred over "Name" alone (in a form about accounts, "Name" is ambiguous). The placeholder `My Apple Card` is a concrete suggestion, not a pattern the user must follow.
- **"Institution"** — the field label for the bank/provider name. Preferred over "Bank name" (some accounts are not at banks — Cash App, Venmo) or "Provider" (technical). "Institution" is the word used in the rest of the app's account model.
- **"Account type"** — the legend for the kind radio group. Preferred over "Kind" (technical, internal term) or "Type" alone (ambiguous outside of account context).
- **"Add account"** — the submit CTA. Matches the trigger CTA verb ("Add") and is more direct than "Create account" (which implies more ceremony). Consistent with how the rest of the platform refers to adding things ("Add transaction", "Add account" in future views).
- **"USD only for now"** — the currency-locked hint. Factual; does not promise a date. Preferred over "Only USD is supported right now" (too wordy) or "Multi-currency coming soon" (a promise we're not making here).

## Character limits

n/a — no explicit character limits specified in design spec (WLT-27-2-design). Hint text and error banners should be reviewed against actual rendered widths during implementation.

## DRI Log

### Decisions

- [2026-06-28] [UX Writer] **"Add account" (submit) not "Create account"** — "Add" matches the trigger CTA verb and is the natural follow-through from "Add account manually". "Create" implies more ceremony than warranted for this utility form. Area: copy. Reversibility: easy.
- [2026-06-28] [UX Writer] **"Account type" not "Kind" for the radio group legend** — "Kind" is the internal column name; users don't think of account types as "kinds". "Account type" maps to the user's mental model (checking account type, credit account type). Area: copy/terminology. Reversibility: easy.
- [2026-06-28] [UX Writer] **`manual-account-error-network` covers network AND server failures** — the design spec defines a single error key for "fetch failed / network error". In practice, a server 500 reaches the same catch handler. The copy ("We couldn't add that account just now — try again") is true for both without misattributing the failure to a network connection the user might not have lost. A dedicated `manual-account-error-server` key was not defined in WLT-27-2-design; flag for Designer if server errors need distinct user messaging. Area: copy/error-discrimination. Reversibility: easy.
- [2026-06-28] [UX Writer] **Confluence/Jira mirror skipped** — neither MCP is connected on this host. Area: tooling. Reversibility: high.

### Risks

- _none_

### Issues

- _none_
