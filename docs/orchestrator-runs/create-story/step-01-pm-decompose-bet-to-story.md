---
workflow: create-story
step: 1
agent: pm
task: decompose-bet-to-story
generated: 2026-06-28 18:01
---

Done. Here's what was produced:

---

**TL;DR:** 6 story files written to `docs/bets/WLT-27/stories/`. All stories have `status: ready`, complete Standard Experience Checklists, and data-cleanup ACs where data is mutated.

**Files created:**

| File | Summary |
|------|---------|
| `docs/bets/WLT-27/stories/WLT-27-1/story.md` | Currency-awareness fix — `SpendingTxn.currency` + `dedupKey` null fix (prerequisite, P1) |
| `docs/bets/WLT-27/stories/WLT-27-2/story.md` | Manual account backend — `GET/POST /api/accounts`, `DELETE /api/accounts/[id]`, DB helpers (P1) |
| `docs/bets/WLT-27/stories/WLT-27-3/story.md` | Manual account form UI — `ManualAccountForm`, accounts page extension, copy tokens (P1) |
| `docs/bets/WLT-27/stories/WLT-27-4/story.md` | CSV import backend — `csv-import.ts` pure module, `POST /api/accounts/[id]/import` (P1) |
| `docs/bets/WLT-27/stories/WLT-27-5/story.md` | CSV import wizard UI — 6-step `CsvImportWizard`, papaparse client-side, copy tokens (P2) |
| `docs/bets/WLT-27/stories/WLT-27-6/story.md` | Currency region switcher — `readUserCurrencies`, `CurrencyRegionTabs`, 3 spending surfaces (P2) |
| `docs/role-activity/pm.md` | PM activity log (new file) |

**Next recommended command:** Build stories serially in dependency order: `/build WLT-27-1` first (the regression suite must pass before any subsequent story merges).