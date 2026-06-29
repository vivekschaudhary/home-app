---
workflow: create-story
step: 1
agent: pm
task: decompose-bet-to-story
generated: 2026-06-28 22:44
---

All postconditions pass. Here's the summary:

---

**TL;DR:** 6 story files written to disk under `docs/bets/WLT-27/stories/`. All are `status: ready`, none self-approved. Every Standard Experience Checklist category is covered (AC reference or explicit `n/a — reason`). All data-mutating stories include an E2E hard-delete cleanup AC.

**Files created:**

| Story | Path | Key deliverable |
|---|---|---|
| WLT-27-1 | `stories/WLT-27-1/story.md` | `SpendingTxn.currency` fix + currency filter on all 4 spending reads + anomaly scan user-listing fix + regression suite |
| WLT-27-2 | `stories/WLT-27-2/story.md` | `POST /api/accounts` route handler + migration widening `kind` constraint + `ManualAccountForm` |
| WLT-27-3 | `stories/WLT-27-3/story.md` | `POST /api/accounts/[id]/import` route handler + `dedupKey` null fix + `NormalizedTransaction` type widen |
| WLT-27-4 | `stories/WLT-27-4/story.md` | `CsvImportWizard` (4-step UI: upload → column map → preview → confirm) + `papaparse` dependency |
| WLT-27-5 | `stories/WLT-27-5/story.md` | `RegionSwitcher` UI + `?currency=` param wired into all 4 spending pages |
| WLT-27-6 | `stories/WLT-27-6/story.md` | Apple Card preset finalized against real iOS export + full E2E suite (idempotency, multi-currency isolation, anomaly scan, cross-user RLS) |

**Next recommended command:** `/build WLT-27-1` — the currency-awareness fix is the prerequisite for everything else and has no dependencies.