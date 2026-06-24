# Wealth — financial intelligence for everyone

> Give every person — regardless of income, net worth, or financial literacy — the orchestration layer of private wealth management: **watching, flagging, planning, and acting** on their real financial data. Automated infrastructure, not advice.

`wealth-platform` is a personal-finance platform that automates the *orchestration* layer the wealthy pay advisors for — on top of a user's real, aggregated accounts — rather than replacing human judgment. The user's own decisions are always the source of truth; providers and detectors only ever *signal*.

> **Status:** Phase 1 (Foundation). Dogfooded by the author on real accounts; not yet open for sign-ups.

---

## What's shipped

**Authentication & onboarding**
- Passkey (WebAuthn) + TOTP **two-factor**, MFA-required — AAL2 enforced on every app route, sliding session renewal.
- Intent-first onboarding + a workflow engine (declare a goal → an assembled, running workflow).

**Accounts & data**
- **Plaid** account aggregation (OAuth / zero-knowledge — bank credentials are never stored), 24-month history, **background auto-sync** via Inngest with CDC-safe re-syncs.

**Budget & Spending**
- Per-category budgets with a **recommended figure from your own history**, this-month actuals, over/under, and a 12-month year-spread.
- **Honest totals:** transfers and credit-card payments are excluded from spending (no double-counting), via a region-pluggable transaction `kind` seam.
- **Category correction that sticks:** recategorize a charge or "remember the merchant"; your choice survives Plaid re-syncs and every surface (budget, recap, anomalies) reads the same resolved category.

**Transactions ledger**
- A searchable, account/category-filterable, keyset-paginated **all-accounts ledger** — see, find, and correct every transaction in place.

**Subscriptions** (a transaction overlay)
- **Auto-detected** recurring charges across weekly / monthly / **every 2·3·6 months** / annual cadences, **per price** (a vendor with two plans shows two rows), with a typical amount, monthly-equivalent, **last-charged date**, and a **"may have ended"** hint. Every auto-mark is a signal you can override or dismiss durably.

**Follow-ups** (a transaction overlay)
- **Flag** any charge to revisit, see your open list, mark it **Done**, and **re-open** it later — orthogonal to category and subscription.

**Insight**
- Weekly **recap** + **anomaly** surfacing (high-precision, never alarming).

**Coming next:** Debt · Goals · Investments.

---

## Architecture

| Layer | Choice |
|---|---|
| Web | **Next.js 15** App Router · **React 19** · Tailwind · deployed on **Vercel** |
| Data | **Supabase Postgres** with **Row-Level Security** (owner-scoped on every table) + Supabase Auth **AAL2** |
| Aggregation | **Plaid** behind a swappable provider adapter (OAuth, no stored credentials) |
| Background | **Inngest** (account sync, rule/overlay re-apply, recap) |
| Repo | **pnpm** monorepo |

**Packages** (`packages/`):
- `@wealth/core` — pure, unit-tested compute (budgets, cadence/subscription detection, recap, anomalies — no I/O)
- `@wealth/db` — owner-scoped data access (paginated reads, the saved-decision resolvers)
- `@wealth/aggregation` — Plaid behind a swappable adapter (classification at the provider boundary)
- `@wealth/jobs` — Inngest functions (sync, re-apply, recap)
- `@wealth/ui` · `@wealth/contracts` · `@vc1023/passkey-2fa` (reusable passkey + 2FA for Next.js + Supabase)

**Design principles in the data model**
- **Providers signal, humans decide** — provider data (Plaid taxonomy, detectors) sets a *default*; the user's overridable decision is the persisted truth, resolved at read.
- **Orthogonal transaction overlays** — category, subscription, and follow-up are independent axes on one `transaction_flags` substrate; a charge can be all three at once and they never leak into each other.
- **Schema is expand-only** and auto-applied on deploy; reads are paginated/keyset (no unbounded fetches); writes survive Plaid CDC re-syncs via a stable `dedup_key`.

---

## Security & compliance

MFA-required · sensitive financial data · targeting **PCI DSS / SOC 2 / GDPR**. Aggregation is OAuth / zero-knowledge (no bank credentials stored). Every table is owner-scoped under RLS; the second-factor (AAL2) boundary is enforced once for every app route. RLS policies are proven by a live-Postgres test suite, and access-controlled flows by gated real-path E2Es, on every change.

---

## Built with Compass

This product is developed with **[Compass](compass/)** — an embedded, AI-native product-development framework (it lives in `compass/`). Every change is a **bet → stories → PRs**, with:
- **Cross-model review independence** — one model implements, an *independent* model reviews each PR (RLS suites + gated E2Es are authored by the reviewer, not the implementer).
- **Decisions / Risks / Issues** logged at every stage, and each merge's clearance tied to an exact commit.
- A continuous, Snyk-style quality **scanner** across the SDLC phases.

See `SETUP.md` and `compass/` for the framework itself.

---

## Repo layout

```
app/                     Next.js App Router — the (app) shell + routes
  (app)/dashboard · accounts · budget · transactions · subscriptions · settings   (live)
  (app)/debt · goals · investments                                                (coming)
packages/                pnpm monorepo — core · db · aggregation · jobs · ui · contracts · passkey-2fa
supabase/migrations/     Postgres schema — RLS, expand-only, auto-applied on deploy
docs/                    foundation (product · architecture) · bets · status
compass/                 the Compass dev framework
```

---

_Built in the open, dogfooded on real money. Foundation product: "Wealth at Your Fingertips."_
