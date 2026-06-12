---
bet: WLT-5
story: WLT-13
author: Designer
created: 2026-06-12
---

# Design: WLT-13 — The instrument panel (/admin/metrics)

## Design intent

An **operator surface, not a product surface**: dense, scannable, zero decoration. The reader is the DRI answering three questions in ten seconds — *is TTFV under target? what's WAWU this week? where does the funnel leak?* Honesty over polish: every number wears its **n**, and a tiny n is announced, not hidden. No charts in this slice — tables and big stats read faster at n<100 and ship in a server component with no client JS.

## Layout (single page, three sections + header)

```
┌──────────────────────────────────────────────────────────┐
│ Metrics — internal                 generated {timestamp}  │
│ [pre-launch banner when n < 5: "Too little traffic…"]     │
├──────────────────────────────────────────────────────────┤
│ 1 · TTFV  (signup → first action)                         │
│   p80: 14m 32s   ✗ above 3m target      n=3               │
│   Splits (medians): → connected 6m 10s · → plan 7m 02s ·  │
│                     → action 8m 44s                       │
├──────────────────────────────────────────────────────────┤
│ 2 · WAWU  (weekly active wealth-building users)           │
│   Week of {date}: 1        prior weeks table (week | n)   │
├──────────────────────────────────────────────────────────┤
│ 3 · Funnel  (per-stage users + conversion)                │
│   stage        users   conv%                              │
│   signup         12      —                                │
│   mfa            11     92%                               │
│   connected       4     36%                               │
│   intent          6     55%*   (*independent of connect)  │
│   plan            3     50%                               │
│   action          3    100%                               │
└──────────────────────────────────────────────────────────┘
```

## States

| State | Trigger | What shows |
|---|---|---|
| **populated** | data exists | the three sections; every stat with n |
| **empty / pre-launch** | n=0 overall | the sections render with zeros + the pre-launch banner (copy.md) — never blank, never implying signal |
| **error** | a view/query fails | a single plain error line (copy.md), no stack traces/SQL |
| **gate** | non-admin / signed out | **404** — indistinguishable from a nonexistent route |
| loading | server-rendered | none beyond navigation (no client fetch) |

## Honesty rules (load-bearing)
- **n everywhere** — every aggregate is suffixed `n=…`; the pre-launch banner appears when total funnel n < 5.
- **Target hit/miss is text + symbol**, not color alone ("✗ above 3m target" / "✓ under 3m target") — AA + not-color-only.
- **Intent-stage conversion is footnoted** — intent doesn't depend on connect (intent-first ordering), so stage order ≠ strict prerequisite chain; the footnote prevents misreading the funnel as linear.

## Accessibility
- Each section is an `<h2>`-led region; tables use `<caption>`, `<th scope="col">`.
- Times rendered as `14m 32s` (readable) with full ISO duration in `title`/SR text.
- AA contrast on the muted n labels; the page is fully keyboard-traversable (no interactive controls beyond links).

## DRI Log

### Decisions
- [2026-06-12] [Designer] **Tables + big stats, no charts** — rationale: at pre-launch n, charts imply trends that don't exist; tables read honestly and ship with zero client JS — area: UX — reversibility: easy
- [2026-06-12] [Designer] **Pre-launch banner below n<5** — rationale: the most likely misuse of this page is reading noise as signal; the surface itself should resist that — area: honesty — reversibility: easy

### Risks
- [2026-06-12] [Designer] Operator pages rot (nobody owns polish) — likelihood: medium — impact: low — mitigation: deliberately minimal; the views are the source of truth, the page is a thin renderer — area: maintenance

### Issues
- _none_
