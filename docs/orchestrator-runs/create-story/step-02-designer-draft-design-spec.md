---
workflow: create-story
step: 2
agent: designer
task: draft-design-spec
generated: 2026-06-28 22:51
---

All 6 design.md files are on disk. Postconditions check:

| Postcondition | Status |
|---|---|
| `docs/bets/WLT-27/stories/<story-id>/design.md` exists for all 6 stories | ✅ |
| All flows covered | ✅ (happy path, cancel, error, edge cases per story) |
| All states per screen | ✅ (state tables in WLT-27-2, 4, 5; explicit n/a for non-UI stories) |
| All interactions specified | ✅ (tab order, keyboard, focus management, step transitions) |
| Copy needs flagged for UX Writer | ✅ (named `[copy: ...]` keys with context in each UI story) |
| Figma linked or skip logged as DRI Decision | ✅ (all 6 specs log Figma skip as a DRI Decision with reason) |
| ≥1 DRI Decision per spec | ✅ (2–3 DRI Decisions per file) |
| Accessibility documented | ✅ (ARIA roles, focus management, keyboard, reduced motion in WLT-27-4) |
| Standard Experience Checklist items identified for PM | ✅ (explicit checklist + AC coverage table per story) |
| Not self-approved | ✅ (`status: draft` on all files; no `status: approved` set) |

---

**TL;DR:** Design specs drafted and on disk for all 6 WLT-27 stories. WLT-27-1, WLT-27-3, and WLT-27-6 are marked n/a (no UI surface) with Figma skip DRI Decisions. Full specs for WLT-27-2 (ManualAccountForm modal dialog), WLT-27-4 (4-step CsvImportWizard modal), and WLT-27-5 (RegionSwitcher native select in page headers) — each covering all flows, states, interactions, copy keys, and accessibility requirements.

**Files created:** 6 × `docs/bets/WLT-27/stories/WLT-27-{1–6}/design.md`

**Copy needs list for UX Writer:** WLT-27-2 has 14 copy keys; WLT-27-4 has 24 copy keys; WLT-27-5 has 4 copy keys (full lists in each design.md).

**Next recommended command:** `/build WLT-27-1` (currency-awareness fix — no UI, safe to build immediately; no design approval gate needed for a backend-only story).