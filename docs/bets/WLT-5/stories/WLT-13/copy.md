---
bet: WLT-5
story: WLT-13
author: UX Writer
created: 2026-06-12
---

> Engineer note: use these strings **verbatim** (PM refusal rule: no paraphrasing UX Writer copy).

# Copy: WLT-13 — The instrument panel (/admin/metrics)

## Voice and tone

**Operator voice** — this is an internal panel, so the product-surface jargon ban is lifted: TTFV, WAWU, p80, and conversion are the *correct* words here. Terse, factual, zero marketing. The one tonal obligation is **honesty about thin data**: small n must be called out plainly, never dressed up.

## Strings

| Location / ID | Final copy | Rationale |
|---|---|---|
| `metrics.title` | Metrics — internal | Names the audience |
| `metrics.generatedAt` | Generated {timestamp} | Snapshot honesty |
| `metrics.preLaunchBanner` | Too little traffic to read as signal yet (total n = {n}). Baselines only — no KR verdicts. | The anti-noise guardrail, AC7 |
| `metrics.ttfv.heading` | TTFV — signup → first action | The elicited clock, stated |
| `metrics.ttfv.p80Label` | p80 | KR1 framing |
| `metrics.ttfv.targetHit` | ✓ under 3m target | Text, not color-only |
| `metrics.ttfv.targetMiss` | ✗ above 3m target | |
| `metrics.ttfv.splitsHeading` | Split medians | |
| `metrics.ttfv.splitConnected` | → connected | signup→account_linked |
| `metrics.ttfv.splitPlan` | → plan | →workflow_assembled |
| `metrics.ttfv.splitAction` | → action | →action_completed |
| `metrics.wawu.heading` | WAWU — weekly active wealth-building users | North star, spelled out once |
| `metrics.wawu.weekOf` | Week of {date} | |
| `metrics.funnel.heading` | Funnel — per-stage users + conversion | |
| `metrics.funnel.colStage` | Stage | Table header |
| `metrics.funnel.colUsers` | Users | |
| `metrics.funnel.colConv` | Conv % | |
| `metrics.funnel.stageSignup` | Signed up | |
| `metrics.funnel.stageMfa` | MFA enrolled | |
| `metrics.funnel.stageConnected` | Account connected | |
| `metrics.funnel.stageIntent` | Intent declared | |
| `metrics.funnel.stagePlan` | Plan assembled | |
| `metrics.funnel.stageAction` | First action | The WAWU unit |
| `metrics.funnel.intentFootnote` | * Intent is declared before connecting (intent-first) — stages aren't a strict prerequisite chain. | Prevents linear misreading |
| `metrics.nLabel` | n={n} | Suffix on every aggregate |
| `metrics.empty` | No events yet. | n=0 cell state |
| `metrics.error` | Couldn't load metrics. Check the server logs. | No internals leaked |

## Terminology consistency
- **TTFV / WAWU / p80 / n** — used as-is (operator surface; these ARE the precise terms).
- Stage names match the user-journey vocabulary ("Account connected", "Plan assembled", "First action") — same nouns the product surfaces use, so funnel rows map 1:1 to what users experienced.
- **"signal" / "baseline" / "verdict"** — the banner's hierarchy: thin data gives baselines, never verdicts.

## DRI Log

### Decisions
- [2026-06-12] [UX Writer] **Jargon ban lifted for the operator surface** — rationale: TTFV/WAWU/p80 are the precise terms for this audience; euphemisms would reduce accuracy — area: tone
- [2026-06-12] [UX Writer] **The banner names the failure mode** ("no KR verdicts") — rationale: the realistic misuse is over-reading thin data; the copy itself is the guardrail — area: honesty

### Risks
- _none — internal surface, no end-user exposure._

### Issues
- _none_
