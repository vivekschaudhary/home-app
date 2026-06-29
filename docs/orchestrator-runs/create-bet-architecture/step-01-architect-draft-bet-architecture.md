---
workflow: create-bet-architecture
step: 1
agent: architect
task: draft-bet-architecture
generated: 2026-06-28 22:18
---

`docs/bets/WLT-27/architecture.md` is on disk at `status: proposed`, 254 lines.

---

**TL;DR**

- `docs/bets/WLT-27/architecture.md` drafted and written (`status: proposed`).
- `docs/role-activity/architect.md` appended with the `dedupKey` null-source-type pattern.
- **Foundational-stack deviation gate: PASS** — `papaparse` is a client-side parsing utility; CSV import was already named in ADR-002's Stack row. No amendment needed.

**Files created/modified**
- `docs/bets/WLT-27/architecture.md` — created (proposed)
- `docs/role-activity/architect.md` — appended (pipeline keying assumption pattern)

**Next recommended command**
Review the architecture, then flip `status: proposed → status: approved` in `docs/bets/WLT-27/architecture.md` **and** set `architecture_status: approved` in `docs/bets/WLT-27/brief.md`. Then run `/build WLT-27`.

**Open questions / risks for your review**
- **DRI Issue 3** (unique constraint on `(null, null)` in `financial_accounts`) — verify on ephemeral PG before WLT-27-2 ships; PostgreSQL typically allows multiple `(null, null)` rows, but worth confirming.
- **DRI Issue 2** (Apple Card CSV header) — needs an actual iOS export to validate before the preset is hardcoded.
- **Anomaly scan user-listing fix** (manual-account-only users) — included in WLT-27-1 scope but not in the original story brief; confirm it stays in WLT-27-1 or moves to WLT-27-2.