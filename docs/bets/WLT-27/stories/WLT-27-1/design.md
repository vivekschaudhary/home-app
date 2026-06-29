---
id: WLT-27-1-design
story: WLT-27-1
status: draft
type: design-spec
created: 2026-06-28
author: Designer
---

# Design Spec — Currency-Awareness Fix (SpendingTxn.currency)

## Summary

No user-visible UI surface. This story is a backend correctness fix and regression suite. All spending reads gain a `.eq("currency", activeCurrency)` filter; the anomaly scan's user-listing step extends to cover manual-account-only users. Existing users see zero behavioral change.

## Flows

No new flows. The fix is transparent to all current users: existing USD-only accounts hit the same data through a filter that is a no-op for USD rows.

## Screens & States

None. The story's states are API-layer:

| Path | State | Behavior |
|------|-------|----------|
| All spending reads | `activeCurrency = 'USD'` (default) | Filter `.eq("currency", "USD")` — no-op for all existing rows |
| All spending reads | `activeCurrency = 'EUR'` (future, flag-gated) | Returns only EUR rows |
| Anomaly scan user-listing | User has only manual accounts | User now included in fan-out |

## Interactions

None — no interactive UI surface.

## Copy Needs

None — no user-facing copy changes.

## Accessibility

n/a — no UI surface.

## Standard Experience Checklist

- **Navigation:** n/a
- **States:** See table above; handled at the data-read layer
- **Feedback:** n/a — fix is transparent
- **Accessibility:** n/a
- **Edge cases:** mixed-currency DB rows (AC-7), manual-account-only user in anomaly scan (AC-8), USD-only regression (AC-10)
- **Cross-surface consistency:** n/a

## Figma

No Figma required — no UI surface. Logged as DRI Decision below.

## DRI Decisions

- **[2026-06-28] [Designer] Figma skip — no UI surface** — this story contains zero user-facing UI changes. The currency filter is an invisible correctness fix. No Figma frame is needed or useful; engineering can proceed directly from the architecture spec and story ACs. Area: tooling. Reversibility: n/a.

## AC Coverage for PM

No story ACs map to visible UI states. PM: confirm no Standard Experience items are missing from the story ACs before marking shipped.
