---
status: approved
approved: 2026-06-29
source_run: create-story--WLT-27--20260628T223807
---

All 6 files present. Here's the summary:

---

**TL;DR** — Copy written for all 6 WLT-27 stories. 3 stories had no UI surface (WLT-27-1, -3, -6) and received documented no-copy files. 3 stories received full copy: 15 strings for WLT-27-2 (manual account form), 26 strings for WLT-27-4 (CSV wizard), and 4 strings for WLT-27-5 (region switcher). All files are `status: draft` — not self-approved.

**Files created:**
- `docs/bets/WLT-27/stories/WLT-27-1/copy.md` — no copy (backend fix only)
- `docs/bets/WLT-27/stories/WLT-27-2/copy.md` — 15 strings, 4 discriminated errors
- `docs/bets/WLT-27/stories/WLT-27-3/copy.md` — no copy (API layer only)
- `docs/bets/WLT-27/stories/WLT-27-4/copy.md` — 26 strings, 3 discriminated step-4 errors
- `docs/bets/WLT-27/stories/WLT-27-5/copy.md` — 4 strings (switcher label + option format)
- `docs/bets/WLT-27/stories/WLT-27-6/copy.md` — no copy (preset + E2E tests only)

**Copy decisions log (key):**
- "Add account" (not "Create account") — matches trigger verb; less ceremony
- "Account type" not "Kind" — user-facing term vs internal column name
- "Currency" label on switcher (not "Region") — internal name is RegionSwitcher but users select currencies, not regions
- `{name} ({code})` display format — unambiguous, familiar from banking apps
- "Already in your history" not "already seen" — user-facing concept, not API jargon
- Three discriminated error keys on wizard step 4 (row-limit / network / server)
- `manual-account-error-network` covers network+server — only one key exists in design; flagged for Designer if server errors need distinct messaging

**Next recommended command:** `/build WLT-27-1`
