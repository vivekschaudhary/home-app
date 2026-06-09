---
bet: WLT-2
story: WLT-10
author: Designer
created: 2026-06-08
figma: n/a — extends the WLT-9 connected-accounts surface; this spec is source of truth
area_tags: [frontend]
---

# Design: WLT-10 — Full-history import state

## Overview
No new screens — this enriches the **connected-accounts list** from WLT-9. The only visible change is the **sync lifecycle**: a connection now imports up to 24 months *asynchronously*, so the "syncing" state must persist honestly through the historical pull (seconds → a couple of minutes), then settle. Tone stays calm and patient — the user should feel it's working, not stuck.

## States (on the existing `AccountCard` / list)
| State | When | Surface |
|---|---|---|
| **Importing history** | just connected; historical pull in progress (`last_synced_at` still moving / not yet stable) | `StatusChip` = "Importing…" (syncing style) + a one-line note under the list: *"Importing your history — this can take a minute."* (`aria-live="polite"`) |
| **Connected** | history complete; `last_synced_at` stable | `StatusChip` = "Connected" + "Updated {time}" (WLT-9) |
| **Needs sign-in** | `health_status = needs_reauth` (AC5) | `StatusChip` = "Needs sign-in" (WLT-9 reserved state, now reachable) — re-auth *action* is a later story; chip is informational here |
| **Error** | refresh failed (`health_status = error`) | `StatusChip` = "Error" |

## Interactions
- The list **keeps polling** `connectionsList` after connect until the connection's `last_synced_at` stabilizes (no change across ~2 polls) — then flips "Importing…" → "Connected". (Extends WLT-9's short post-connect poll into a longer, gentler one; non-blocking — the user can navigate away and come back.)
- New transactions arriving later (webhook/cron) update silently — no toast, no interruption; the list reflects them on next view.
- Reduced-motion respected on the syncing indicator (no spinner churn).

## Accessibility
- The importing note is `aria-live="polite"` so it's announced once, not repeatedly.
- Status conveyed by chip **text + glyph**, never color alone (carried from WLT-9 `StatusChip`).

## DRI Log
### Decisions
- [2026-06-08] [Designer] **Honest, patient "Importing your history…" over a fake progress bar** — rationale: Plaid's historical latency is unpredictable; a determinate bar would lie. A calm indeterminate state + "this can take a minute" sets the right expectation — area: UX/trust
### Risks
- [2026-06-08] [Designer] User leaves before history completes — likelihood: high — impact: low — mitigation: it's non-blocking + resumes silently; the list is correct whenever they return — area: UX
### Issues
- _none_
