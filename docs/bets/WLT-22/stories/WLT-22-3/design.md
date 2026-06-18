# Design: WLT-22-3 — Remember the merchant (a rule that categorizes past + future)

## Design intent

WLT-22-2 let the user fix **one** transaction. This slice lets them fix it **once and for all**: when they recategorize a transaction, they can **"remember the merchant"** — every transaction from that merchant, **past and future**, takes the new category automatically. A recurring mis-tag (Plaid keeps calling the gym "General Merchandise") gets corrected one time instead of every month. The promise is **past + future**: the rule **backfills** the user's existing transactions immediately, and the **sync applies it** to new ones as they arrive — so the budget just stays right.

The user's **explicit one-off override always wins** — a rule never clobbers a transaction the user deliberately set by hand (the `'user'` assignment from WLT-22-2). That's the escape hatch: if "Amazon" is usually Household but this one was a gift, the user moves that single transaction and the rule leaves it alone.

## Surfaces & flow

Builds on the WLT-22-2 recategorize picker (inside the WLT-22-1 drill-down):

1. The picker gains, **below the category list, a checkbox**: **"Always categorize [merchant] this way."** It appears **only when the transaction has a known merchant** (a rule needs a merchant to match on; a `description`-only transaction gets a one-off override, no checkbox).
2. **Checked + pick a category** → the move applies to **all** of that merchant's transactions (a rule is created/updated + backfilled), not just this one. **Unchecked** → exactly WLT-22-2's single-transaction override.
3. **Feedback names the breadth**: "Now categorizing [merchant] as [category] — updated **N** transactions." The user sees that more than one row moved.
4. **The numbers reconcile across all affected rows** (same AC4 contract as WLT-22-2, now for a batch): every transaction the rule touched leaves its old category and joins the new one; the budget table + drills reconcile.
5. **Future is silent + automatic** — new transactions from that merchant simply arrive under the right category (applied at sync). No prompt, no surprise; the budget is just correct next time.

## States (every state ships)

| State | What renders |
|---|---|
| **Picker (merchant known)** | The category list + the **"Always categorize [merchant] this way"** checkbox beneath it. |
| **Picker (merchant null)** | No checkbox — a `description`-only transaction can only take a one-off override (WLT-22-2). |
| **Applying** | After pick-with-checkbox: a calm pending state (`aria-busy`) while the rule backfills (a bulk write — may touch many rows). |
| **Success** | "Now categorizing [merchant] as [category] — updated N transactions"; the affected rows reconcile. |
| **Error** | A discriminated inline message (network / server) + retry; **no partial-apply shown** — the user keeps their prior state until the apply succeeds. |
| **Override beats rule** | A transaction the user later sets by hand keeps that `'user'` category even though a rule for its merchant exists (the rule doesn't re-clobber it). |

## The honesty contract (carried + extended)

- **A rule writes SAVED assignments — it never resolves-at-read.** Backfill writes `'rule'` assignments to the matching transactions now; the sync writes them for new ones. Reads stay the same one resolver (`saved ?? Plaid`) — a rule is just another way a saved assignment gets written.
- **`'user'` always outranks `'rule'`.** A rule writes only to transactions **without** a user override, and never overwrites one. The escape hatch is always honoured.
- **Breadth is visible.** "Remember the merchant" changes many rows; the feedback says how many, so the user is never surprised by a silent bulk edit.

## Accessibility

- The checkbox is a labelled control; its label names the merchant + intent ("Always categorize [merchant] this way").
- `aria-busy` during the backfill; the success count is announced; discriminated errors are announced; focus management consistent with the WLT-22-2 picker.
- WCAG AA; transitions `motion-safe`.

## Honest / reduced-design notes

- **No rule-management UI this slice** (view / edit / delete the list of rules). The per-transaction `'user'` override is the exception escape hatch; full rule CRUD is a clean follow-on. _If a user creates a rule they regret, they can still re-fix individual transactions by hand; they can't yet "delete the rule" in one move — called out as the top open issue._
- **Last-write-wins per merchant.** Re-running "remember" for a merchant with a different category replaces the rule (and re-backfills). No conflict UX, no multiple rules per merchant.
- **Merchant matching is normalized** (lowercase + trim + collapse whitespace) — "STARBUCKS #123" and "Starbucks #123" are the same merchant for the rule. (Exact match semantics resolve in the story's tech notes.)
- **No split-transaction, no ML** (unchanged bet guardrails).

## DRI Log

### Decisions
- [2026-06-17] [Designer] **"Remember the merchant" is a checkbox in the recategorize picker, not a separate rules screen** — rationale: the rule is born from the exact correction the user is already making; promoting "this one" to "all of these" in the same gesture is the whole point — area: ux — reversibility: easy
- [2026-06-17] [Designer] **The checkbox only appears when the merchant is known** — rationale: a rule matches on merchant; offering it for a `description`-only transaction would promise something that can't match — honest affordance — area: ux — reversibility: easy
- [2026-06-17] [Designer] **Feedback names the count ("updated N transactions")** — rationale: a bulk edit must be visible; the user should see that more than the one row moved — area: ux/trust — reversibility: easy
- [2026-06-17] [Designer] **Future application is silent (no per-sync prompt)** — rationale: the user already opted in once ("remember"); re-prompting on every new matching transaction would be noise — the budget just staying right is the reward — area: ux — reversibility: medium

### Risks
- [2026-06-17] [Designer] **A bulk rule surprises the user (they didn't realize it touched many rows / future ones)** — likelihood: medium — impact: medium — mitigation: the checkbox is explicit + unchecked by default; the success copy names the count + the going-forward behaviour; the `'user'` override escape hatch always wins — area: ux/trust
- [2026-06-17] [Designer] **No way to undo a rule this slice** — likelihood: medium — impact: medium — mitigation: per-transaction overrides still fix exceptions; rule management is the next follow-on — flagged as the top open issue — area: scope

### Issues
- [2026-06-17] [Designer] **Rule management (view / edit / delete) deferred** — severity: medium — owner: PM — status: open — area: product — create + apply ship now; a "your rules" management surface (incl. delete-rule → revert its `'rule'` assignments) is the clean follow-on.
