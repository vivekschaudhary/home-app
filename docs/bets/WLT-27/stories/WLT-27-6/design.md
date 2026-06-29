---
id: WLT-27-6-design
story: WLT-27-6
status: draft
type: design-spec
created: 2026-06-28
author: Designer
---

# Design Spec — Apple Card CSV Preset + End-to-End Integration Test

## Summary

No new UI surface. This story finalizes the Apple Card preset definition in `packages/aggregation/csv/apple-card.ts` and delivers the full E2E test suite for the entire WLT-27 bet. The only user-facing effect is that the Apple Card preset auto-detection (designed in WLT-27-4) fires correctly when confirmed headers are used. All wizard UI behavior is specified in WLT-27-4.

## Flows

No new flows. This story validates and completes the Apple Card path within the CSV wizard flow already specified in WLT-27-4:

```
Step 2 (Column Mapping) → detectPreset(headers) → 'apple-card' match
  → dropdowns pre-populated + [copy: csv-wizard-preset-detected-banner] shown
```

The only design implication: the preset banner copy (`[copy: csv-wizard-preset-detected-banner]`) must be correct and dismissible, as specified in WLT-27-4's step 2 design. No additional copy or UI is introduced here.

## Screens & States

None new. AC-5's Apple Card full-flow E2E exercises all 4 wizard steps already designed in WLT-27-4. AC-6's multi-currency isolation test exercises the RegionSwitcher already designed in WLT-27-5.

## Interactions

None new — E2E tests exercise existing interactions from WLT-27-2, WLT-27-4, WLT-27-5.

## Copy Needs

None new — all copy for the Apple Card preset banner and wizard steps is flagged in WLT-27-4.

## Accessibility

n/a — no new UI surface.

## Standard Experience Checklist

- **Navigation:** n/a
- **States:** n/a — no new states; tests exercise existing wizard states
- **Feedback:** n/a — no new feedback surface
- **Accessibility:** n/a
- **Edge cases:** AC-5 idempotent re-import, AC-6 cross-currency isolation, AC-7 manual-account-only anomaly scan, AC-8 cross-user RLS, AC-9/AC-10 RLS validation
- **Cross-surface consistency:** n/a

## Figma

No Figma required — no UI surface. Logged as DRI Decision below.

## DRI Decisions

- **[2026-06-28] [Designer] Figma skip — test and preset story only** — this story's deliverables are a preset descriptor and an E2E test suite. All user-visible UI for the wizard and preset banner is specified in WLT-27-4. No independent design artifact is needed. Area: tooling. Reversibility: n/a.
- **[2026-06-28] [Designer] Apple Card preset banner copy flagged to UX Writer** — if Apple changes their CSV format after the preset is shipped, the preset auto-detection silently fails and users fall back to manual column mapping (wizard still works). The banner dismissal copy should be neutral enough that removing the banner (future format drift) does not confuse users. Flag for UX Writer: keep `[copy: csv-wizard-preset-detected-banner]` factual (detected, not promised). Area: UX. Reversibility: easy.

## AC Coverage for PM

All AC in this story are test coverage items. PM: verify that AC-5 through AC-10 are gating criteria before any feature flag is turned on in production — this story is the quality gate for the entire WLT-27 bet, as noted in the brief and architecture.
