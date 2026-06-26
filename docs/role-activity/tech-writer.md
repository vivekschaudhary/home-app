# Tech Writer role activity log

Append-only · specific · cite bet + PR number per [fractal-retro] (canon v0.3.17).

---

## 2026-06-23 · fix run / PR #107

**Pattern:** /fix flow reached accumulate-changelog without a `bet_id` in workflow context. Provisional id `passkey-2fa-aal2` used; canonical bet_id unknown. **Convention candidate:** fix-flow contract should propagate `bet_id` to tech-writer step.

---

## 2026-06-25 · fix run fix--no-bet--20260624T220818 / PRs #115 + #116

**Pattern (recurring):** /fix flow reached accumulate-changelog without a `bet_id` for the second time (first: PR #107 run). Both PRs are standalone defect fixes (sign-in heading + stale aggregation balance) with no linked bet. Provisional id `fix--20260624` used.

**Architecture doc:** not present for either fix — expected, as these are defect-only changes, not bets.

**Convention candidate (escalate):** The /fix workflow contract does not pass a `bet_id` when the fix is not linked to a bet. Two consecutive runs hit this gap. Recommend adding an optional `linked_bet` field to the /fix workflow input schema so tech-writer can route the changelog correctly rather than defaulting to provisional paths each time.
