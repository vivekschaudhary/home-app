# Design: WLT-24-3 — One vendor, several subscriptions

## Design intent

When a vendor bills more than one subscription, **show them as what they are: separate recurring charges** — each with its own price, cadence, and removal — instead of one blended (and often vanished) row. The change is almost entirely *correctness you can see*: the same calm Subscriptions surface, but Sony now shows its two subscriptions as two honest rows that sum into the headline. No new controls, no new ceremony — the price column does the disambiguating, and everything WLT-24-2 shipped (the "detected" tag, the review nudge, one-tap durable removal) just works per series.

## Surfaces & flow

No new surface — the existing `/subscriptions` list + the ledger mark. What changes:

1. **The list splits a multi-sub vendor into one row per price-series.** Sony PlayStation becomes two rows — "Sony PlayStation · $9.99 · every month" and "Sony PlayStation · $17.99 · every month" — each with its own cadence, monthly figure, "detected"/user state, and unmark. The headline total now **sums both** (previously the blended row was `irregular` and excluded — the vendor effectively contributed $0 or vanished).
2. **Removal is per-series.** Removing one Sony row dismisses **only** that price-series (durably, per WLT-24-2); the other stays. Marking from the ledger still captures the whole vendor (the user recognizes "Sony," not a price tier) and the list then presents the series separately.

Flow: detection (or a ledger mark) surfaces each of a vendor's recurring price-series as its own row → the user keeps/removes each independently → the headline reflects the real per-series total.

## States (every state ships)

| State | Behavior |
|---|---|
| **Multi-sub vendor (resting)** | One row per price-cluster, same vendor name, distinguished by the amount column; each row carries its own cadence + monthly-equivalent + (if auto) the "detected" tag. |
| **Price creep within one sub** | Stays **one** row (e.g. Netflix $15.49 → $16.99) — a single sub whose price drifts is not split; typical amount is the median, as today. |
| **Remove one series** | Dismisses only that cluster's charges (durable); the sibling row remains; existing "Removed from subscriptions" toast. |
| **Same price twice (irreducible)** | Two distinct subs at the identical price merge into one row — we don't invent a split we can't justify from amount + date (documented limitation, not surfaced as an error). |
| **Variable-spend merchant** | Still **not** a subscription — a vendor with scattered amounts is rejected by the amount-stability gate, exactly as before; clustering never promotes it. |

## The honesty contract (carried + extended)

- **Each row is a real recurring price** we can stand behind — the headline only sums confidently-inferred per-series cadences (unchanged rule, now applied per cluster).
- **We split only when the prices clearly differ** — a single sub's price increase stays one row; we'd rather under-split (show one row) than fabricate a second subscription that isn't there.
- **Removal stays precise and durable** — taking one series off your list never silently removes the other, and a removed series doesn't come back (the WLT-24-2 dismissal, now per series).

## Accessibility

- Two rows share a vendor name, so the **row's accessible name must carry the amount + cadence** ("Sony PlayStation, $9.99, billed every month" vs "…$17.99…") — wire the existing `rowA11y` / `rowDetectedA11y` labels onto the row (they exist but aren't currently applied). This disambiguates for screen-reader users with no visual change.
- The unmark control keeps its WLT-24-1 accessible name; optionally append the amount so "Remove {vendor} from subscriptions" is unambiguous across the two rows.

## Honest / reduced-design notes

- **No invented plan names.** We don't have "PS Plus" vs "PS Now" from the data — only amounts. The price column is the honest disambiguator; showing a fabricated label would be guessing.
- **No new control, no grouping header, no nested rows.** Two flat rows is simpler and matches the existing list; a "Sony (2)" expander would be more chrome for two items.
- **No confidence/threshold surfaced** — the 1.25 cluster ratio is an internal tuning constant, never user copy (same posture as the WLT-24-2 detector).

## DRI Log

### Decisions
- [2026-06-22] [Designer] **Two flat rows distinguished by the amount column, not a nested vendor group** — rationale: simplest honest presentation; the amount is the real differentiator and the list already leads with it — area: ux — alternatives: a "Sony (2)" expandable group (more chrome for ≤ a few items) — reversibility: easy
- [2026-06-22] [Designer] **No invented plan/tier names** — rationale: we only have amounts, not product names; labelling a $9.99 row "PS Plus" would be a guess that could be wrong — area: design/honesty — alternatives: heuristic naming (rejected — fabrication) — reversibility: easy
- [2026-06-22] [Designer] **Row-level a11y carries amount + cadence** — rationale: two same-named rows are indistinguishable to AT without it; reuses labels that already exist in copy — area: a11y — reversibility: easy

### Risks
- [2026-06-22] [Designer] **Two same-named rows read as a duplicate/bug to a sighted user** — likelihood: low — impact: low — mitigation: the distinct amounts (and cadences) make the two series legible; this is the same pattern any subscriptions app uses for multi-plan vendors — area: design

### Issues
- _none_
