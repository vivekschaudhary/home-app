# Design: WLT-22-2 — Recategorize a transaction (correct the number, and it sticks)

## Design intent

WLT-22-1 let the user **see** what's in a category. This slice lets them **fix it**. From the same drill-down, a line item that's mis-tagged (Plaid called a restaurant "Groceries") can be moved to the right category — and if the right category doesn't exist yet (Plaid lumps Rent + Utilities into one), the user **creates it inline and splits the group**. The correction is **saved as the user's own** — it survives Plaid re-syncs — and the moment it's made, **the numbers visibly move**: the category it left drops, the one it joined rises. That live reconciliation is the trust payoff — the budget becomes *theirs*, not the provider's guess.

This is the **manual** correction layer. Automating it ("remember this merchant, apply to all past + future") is the clean follow-on, **WLT-22-3** — deliberately out of this slice.

## Surfaces & flow

Builds directly on the WLT-22-1 drill-down panel (the line-item list under a budget row):

1. **Each line item gains a recategorize affordance.** The item's category is shown as a small, tappable control on the row (the current category is visible — the user always knows what it's tagged as now). Tapping it opens a **category picker**.
2. **The picker** lists the user's categories (their seeded set + any they've created), with the line item's **current category marked**. Picking a different one **saves immediately** and closes the picker.
3. **At the foot of the picker: "+ New category."** Choosing it reveals an inline mini-form (name + a single _essential / discretionary_ toggle), creates the category owner-scoped, and selects it for this transaction in one step — so splitting "Rent & Utilities" into a new "Rent" is one flow, not a detour to a settings screen.
4. **On save, the numbers reconcile live.** The drill total for the category the transaction **left** drops by its amount; if the destination category is visible (or once the table re-reads), its row rises by the same amount. The honesty contract from 22-1 holds across the move — items always sum to the shown total.
5. **A brand-new custom category becomes a budgetable row** in the table (it can be budgeted like any other, per WLT-21's "+ Add a category").
6. **Plaid stays the cold-start default.** Untouched transactions still show Plaid's category (the indication). Nothing the user hasn't touched changes.

## States (every state ships)

| State | What renders |
|---|---|
| **Item (resting)** | The line item (date · merchant · amount) + its current category as a tappable control. |
| **Picker open** | The user's categories listed, current one marked; "+ New category" at the foot. Keyboard-operable; focus moves into the picker. |
| **Creating a category** | Inline form: name field + essential/discretionary toggle + Save/Cancel. Validates empty + duplicate (case-insensitive) name. |
| **Saving** | The picked row shows a calm pending state (`aria-busy`); the picker is non-interactive until it resolves. |
| **Success** | Picker closes, the item shows its new category, the totals reconcile (source drops / destination rises), focus returns to the item's control. |
| **Error** | A calm inline message that **discriminates** (couldn't reach the network vs. server vs. invalid) + retry; the item keeps its prior category until a save succeeds (no optimistic corruption). |
| **New / untouched user** | No saved assignments → every category resolves to Plaid's exactly as today (ships dark-safe). |

## Layout & responsive

- **Desktop/tablet:** the category control sits inline on the line-item row (after merchant, before amount, or as a subtle chip under the merchant). The picker is a popover/menu anchored to the control.
- **Phone ≤640:** the category control is a full-width tappable row beneath the merchant; the picker opens as a bottom-anchored sheet (≥44px targets); the create-form stacks. No horizontal scroll.

## The honesty contract (carried from WLT-22-1, extended)

- **A correction never silently corrupts the rest.** The category is read through **one shared resolver** (`saved ?? Plaid`) that budget, recap (WLT-17), and anomalies (WLT-18) all call — so a recategorization shifts every surface **consistently**, never leaving one stale. This is the load-bearing invariant; if two surfaces disagree it's a bug.
- **The user's category always wins; Plaid never clobbers it.** The saved assignment hangs off the stable `dedup_key`, so a Plaid CDC re-sync that rewrites the transaction row does **not** revert the user's correction.
- **Real data only**, same posture as 22-1 — the user's own transactions, their own categories.

## Accessibility

- The category control is a real, labelled button (`aria-haspopup`, `aria-expanded`); its accessible name includes the current category so a screen-reader user knows the starting state.
- The picker is a keyboard-navigable menu/listbox (arrow keys, Enter to select, Esc to dismiss); the selected category is `aria-checked`/marked.
- Focus moves into the picker on open and returns to the control on close/select; the create-form fields are labelled; validation errors are announced.
- `aria-busy` during save; WCAG AA; transitions `motion-safe`.

## Honest / reduced-design notes

- **Manual correction only this slice.** "Remember this merchant" (a rule that auto-applies to past + future from that merchant) is **WLT-22-3** — the architecture's `category_rules` write path. Here, each correction is a single-transaction override (`assigned_by: 'user'`). We do **not** imply auto-apply in the UI (no "applied to 12 transactions" — that's the rule story).
- **Create + assign only; no category management yet.** Renaming, deleting, or merging a category is deferred (delete-category semantics is an open architecture question). The escape hatch for a mistake is to re-pick the transaction's category; an unwanted empty custom category simply sits unused. Management is a small follow-on.
- **No split-one-transaction-across-categories** (out of scope per the brief), **no ML auto-categorization**, **no bulk editor**.
- **Plaid `detailed` seed is optional** and not in this slice — the seeded set is the user's distinct *primary* categories present in their data; finer defaults can come later.

## DRI Log

### Decisions
- [2026-06-17] [Designer] **Recategorize lives inside the WLT-22-1 drill-down, on the line item** — rationale: the user is already looking at the receipts when they spot the mis-tag; correcting it in place (vs. a separate categories screen) is the most direct fix-what-you-see flow — area: ux — reversibility: easy
- [2026-06-17] [Designer] **Create-a-category is inline in the picker, not a separate settings trip** — rationale: the headline job is *splitting* a coarse group; making "+ New category" one step inside the same flow is what lets the user split Rent from Utilities without a detour — area: ux — reversibility: easy
- [2026-06-17] [Designer] **No optimistic-then-revert; the item keeps its category until the save succeeds** — rationale: a correction that flickers back on error would erode the exact trust this builds; show a pending state, commit on success — area: ux/correctness — reversibility: medium
- [2026-06-17] [Designer] **The UI never implies auto-apply this slice** — rationale: "remember the merchant" is WLT-22-3; promising it here and not delivering would mislead — single-transaction correction is honestly scoped — area: scope — reversibility: easy

### Risks
- [2026-06-17] [Designer] **The numbers not reconciling after a move** (drill total / budget row drift) would destroy trust — likelihood: low — impact: high — mitigation: every surface reads the one shared resolver; an explicit test that source-drops + destination-rises by the same amount and the drill total still equals the row — area: correctness/trust
- [2026-06-17] [Designer] **Picker feels heavy on a long category list** — likelihood: low — impact: low — mitigation: the seeded set is the user's own (small); ordered, current marked; defer search/typeahead until a list grows large — area: ux

### Issues
- [2026-06-17] [Designer] **Category management (rename/delete/merge) deferred** — severity: low — owner: PM/Architect — status: open — area: product — create + assign ship now; management + delete-semantics resolve in a follow-on.
