# Design: WLT-21-1 — The Budget & Spending table

## Design intent

A calm, honest **control surface** — not a report and not a scold. The page answers two questions per category at a glance: _"what's a sensible limit?"_ (Recommended, from the user's own history) and _"where am I this month?"_ (This month so far), then lets the user **set their own cap** and see whether they're under or over. Every number is real; where there isn't enough data we say "—", never a fabricated figure. The tone is supportive ("$120 left"), never punitive.

## Surfaces & flow

Single page inside the shell (the shell provides nav/chrome — no back link here):

1. **Heading + one intro line** — "Budget & Spending" + a plain subtitle.
2. **The category table** — one row per category, sorted by this-month spend (desc). Columns: **Category · Recommended · This month so far · Your budget** (the under/over status renders inline on the budget cell).
3. **Inline per-row edit** — the "Your budget" cell is the editor: a **$ / % segmented toggle** + a number field + Save / Clear. No modal — set, edit, and clear happen in place. A muted Recommended figure carries a **"Use this"** affordance that pre-fills the dollar amount.
4. **"+ Add a category"** — opens a picker of bank categories (Plaid-primary, humanized) not already in the table; choosing one adds a budgetable row (its actual reflects real spend, "—"/$0 if none this month).

## States (every state ships — load-bearing)

| State | What renders |
|---|---|
| **Empty — no account/txns** | No table. An honest nudge: "Connect an account to start budgeting" → the connect path (reuse the Accounts empty pattern). No fake rows, no "$0 budget". |
| **Cold-start — connected, <~1 month history** | The table renders with real actuals where present; **Recommended shows "—"** + a one-line "we need about a month of history to suggest a number". Budgets are still settable. |
| **Populated** | Rows with Recommended + This month so far; categories the user spends in, sorted by spend. |
| **Editing** | The budget cell expands to the $/% toggle + number field + Save/Clear; percent shows its resolved cap inline ("20% ≈ $480/mo"). |
| **Under budget** | A calm labeled indicator + "$X left". |
| **Over budget** | A labeled indicator (text/glyph, **not color-only**) + "$X over". Firm, not alarming — never "fraud"/red-scare. |
| **Saving** | The row's Save shows a pending state; on success a "Saved" Toast. |
| **Save error** | An inline Banner with a retry; the user's entered value is **preserved**, not cleared. |
| **Added category, no spend this month** | A row with This month so far "—"/$0 and the budget the user set — honest (it's their choice). |

## Layout & responsive

- **Desktop ≥1280 / tablet ~768–1024:** a 4-column table; comfortable column widths; the budget cell holds the editor; the status sits with the budget value. No horizontal scroll.
- **Phone ≤640:** each category becomes a **stacked card** — the humanized category as the card title; **Recommended**, **This month so far**, and **Your budget** as labeled rows inside; the editor expands within the card. Touch targets ≥44px. The "+ Add a category" control is full-width.
- The IA + behavior are identical across surfaces; only the table↔card presentation differs.

## Recommended + percent presentation

- **Recommended** is a muted/secondary figure (it's a suggestion, not a commitment) with a one-tap **"Use this"** that fills the dollar field.
- **Percent budgets** resolve to an effective dollar cap shown inline so the user always sees the real number they're being measured against ("% of your typical monthly spending → ≈ $X/mo"). If there's no spend history yet to resolve a percent, prompt for a dollar amount instead (honest — we can't resolve a percent of nothing).

## Accessibility

- A semantic `<table>` with `<th scope>` headers (cards on mobile keep label↔value associations); the number field + $/% toggle are labeled and keyboard-operable, the toggle's state announced.
- The under/over indicator pairs a glyph/text with the amount — **never color alone**.
- `aria-live="polite"` on the save confirmation; focus returns sensibly after Save/Clear.
- WCAG AA contrast throughout.

## Honest / reduced-design notes

- **No chart this story.** The 12-month "spread across the year" view is WLT-21-2 — this slice is deliberately the table only.
- **"—" everywhere data is genuinely absent** (cold-start recommendations, no-spend-this-month actuals) — consistent with the real-data principle that has governed every surface (WLT-10/12/16/18).
- No category is silently dropped — `null`/unknown Plaid category surfaces as **"Other"**.

## DRI Log

### Decisions
- [2026-06-16] [Designer] **Inline per-row edit, no modal** — rationale: setting a cap is a single field; a modal is friction for a table the user scans + tweaks repeatedly — area: ux — reversibility: easy
- [2026-06-16] [Designer] **Mobile = stacked cards, not a scrolling table** — rationale: a 4-col financial table is illegible <640; cards keep label↔value pairing + ≥44px targets (consistent with the shell's mobile discipline) — area: ux — reversibility: easy
- [2026-06-16] [Designer] **Over-budget is firm, not alarming** (labeled, not red-scare; never "fraud") — rationale: the supportive, never-scolding tone; an alarming budget surface erodes trust — area: ux/trust — reversibility: easy

### Risks
- [2026-06-16] [Designer] **The 4-state budget cell (recommended / empty / editing / set-with-status) is dense** — likelihood: medium — impact: low — mitigation: the States table above is the build contract; each state has explicit copy — area: ux

### Issues
- [2026-06-16] [Designer] **Percent-of-what legibility** — severity: low — owner: UX Writer — status: open — area: copy — the inline "≈ $X/mo" resolution must make the percent base unambiguous; finalize in copy.md.
