# PROJECT.md

<!--
Compass populates this file via `/setup-product` and `/setup-foundation-architecture`.
This file is a thin overview pointing to the foundation docs.
-->

## What we're building

_See `docs/foundation/product.md` for the foundational product bet._

## How we're building it

_See `docs/foundation/architecture.md` for the foundational architecture bet._

**Stack:** TypeScript + Vercel · Next.js (App Router, Turbopack, Tailwind) · REST/OpenAPI · **Supabase** (Postgres + Auth + Storage + Vault — MFA + RLS via `auth.uid()`) · **Inngest** durable jobs · **Sentry** observability · pnpm-workspace monorepo (`/app` + `/packages/*` + `/supabase`).

## Where things live

- Foundation: `docs/foundation/`
- All bets: `docs/bets/<bet-id>/`
- Standalone ops/fixes/incidents: `docs/ops/`, `docs/fixes/`, `docs/incidents/`
- Sprint comms: `docs/sprints/<year>/sprint-<n>.md`
- Metrics snapshots: `docs/metrics/`
- Rolling status: `docs/status.md`
- Changelog: `docs/changelog.md`
- Framework: `compass/`
- AI tool wrappers: `.claude/`, `.codex/`

## Status

_Run `/status` to see current state of work._
