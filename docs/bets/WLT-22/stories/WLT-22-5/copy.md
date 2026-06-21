# Copy: WLT-22-5 — Transfers & payments don't count as spending

## Voice and tone

Plain, factual, reassuring-without-fuss. The app did the right thing by default; the copy explains *what* and *why* in one breath and hands control back. No alarm (these aren't errors), no celebration (it's just correct), no judgment about the user's money. Same register as the rest of Budget & Spending. Never imply we moved the user's actual transactions or money — we only changed what **counts** as spending.

## Strings

### The protected "Transfers & Payments" group
- **groupLabel:** `Transfers & Payments`
- **groupCaption:** `Not counted as spending`
- **groupHelp:** `Money moved between your accounts and credit-card payments — counting these would double-count what you already spent.`
- **groupTotalA11y:** `Transfers & Payments, {amount}, not counted as spending`

### The review nudge
- **nudgeOne:** `We set aside 1 transfer or payment so it doesn't inflate your spending.`
- **nudgeMany:** `We set aside {count} transfers & payments so they don't inflate your spending.`
- **nudgeReview:** `Review`
- **nudgeDismiss:** `Dismiss`

### The move control (in the drill-down picker, extends WLT-22-2)
- **excludeOption:** `Transfers & Payments (exclude from spending)`
- **includeHint:** `This is spending`
- **savedExcluded:** `Moved to Transfers & Payments — excluded from spending`
- **savedIncluded:** `Moved to {category} — counts as spending again`
- **saving:** `Saving…`
- **error:** `We couldn't save that just now — try again.`
- **errorNetwork:** `You appear to be offline — try again when you're back.`
- **errorInvalid:** `That didn't go through — give it another try.`
- **retry:** `Try again`

### Accessibility labels
- **groupHeading:** `Transfers & Payments — not counted as spending`
- **excludeAction:** `Move {merchant} ({amount}) to Transfers & Payments — exclude from spending`
- **includeAction:** `Move {merchant} ({amount}) back to a spending category`
- **nudgeRegion:** `Transfers set aside`

## Terminology consistency
- **"Transfers & Payments"** — one bucket name covering both internal transfers and credit-card payments; the same name in the group, the nudge, the picker, and the help text.
- **"Not counted as spending" / "exclude from spending" / "counts as spending again"** — always frame the effect as *counting*, never as deleting or hiding; we never touch the transaction itself.
- **"Set aside"** (not "removed", "ignored", "hidden") — implies deliberate, reversible, visible — matches the design's visible group.
- **"Double-count"** in the help text — names the actual reason plainly (the user raised exactly this), so the feature reads as fixing a real problem, not editorializing their spending.
- **"Move / Moved to {category}"** — reuses WLT-22-2's verb so the picker behaves identically whether moving between spend categories or in/out of Transfers & Payments.
- Money via the app's currency formatter; counts pluralized (`nudgeOne` / `nudgeMany`); merchant/category names rendered as elsewhere (`humanizeCategory`).

## DRI Log

### Decisions
- [2026-06-20] [UX Writer] **Name the reason ("would double-count what you already spent") in the help text** — rationale: the user surfaced the double-count themselves; saying it plainly makes the exclusion obviously correct rather than mysterious — area: copy/trust — reversibility: easy
- [2026-06-20] [UX Writer] **"Set aside", not "removed/hidden/ignored"** — rationale: the dollars are visible and the action is reversible; "removed" would imply destruction, "hidden" would imply we're obscuring — area: copy — reversibility: easy
- [2026-06-20] [UX Writer] **Effect-framed action + success copy ("excluded from spending" / "counts as spending again")** — rationale: the user must know the consequence of the move (does it count?), not just that something saved — matches the WLT-22-2 "name the visible effect" decision — area: copy/ux — reversibility: easy
- [2026-06-20] [UX Writer] **Nudge informs, never instructs** — rationale: the default is already correct, so the nudge is FYI + an optional review, not a task — area: ux — reversibility: easy

### Risks
- _none_

### Issues
- [2026-06-20] [UX Writer] **"Transfers & Payments" must not collide with a user's own same-named custom category** — severity: low — owner: Engineer — status: open — area: copy/data — the protected category is `source='system'`; the create/duplicate check (WLT-22-2 case-insensitive unique) should reserve the name so a user can't create a clashing one.
