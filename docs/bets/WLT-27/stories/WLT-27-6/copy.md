---
id: WLT-27-6-copy
story: WLT-27-6
status: draft
type: copy
created: 2026-06-28
author: UX Writer
---

# Copy: WLT-27-6 — Apple Card CSV Preset + End-to-End Integration Test

## Voice and tone

n/a — no new user-facing copy. The preset banner (`csv-wizard-preset-detected-banner`) used in this story's Apple Card flow is defined in WLT-27-4 copy.md.

## Strings

None new. This story finalizes the Apple Card preset descriptor and delivers the WLT-27 E2E test suite. The only user-visible effect is that the preset banner in the WLT-27-4 wizard fires correctly — and that banner's copy is owned by WLT-27-4. No additional strings are introduced here.

**Cross-reference:** `csv-wizard-preset-detected-banner` → see WLT-27-4 copy.md.

Design note (WLT-27-6 DRI Decision): the preset banner should be factual — "detected", not a promise. If Apple changes their CSV format and preset auto-detection silently fails, users fall back to manual column mapping. The copy must not over-promise. The WLT-27-4 string satisfies this constraint.

## Terminology consistency

n/a — no user-facing strings.

## DRI Log

### Decisions

- [2026-06-28] [UX Writer] **No copy deliverable for WLT-27-6** — design spec confirms preset + E2E test story only; the sole user-visible string (`csv-wizard-preset-detected-banner`) is already covered in WLT-27-4. Voice guidelines: `n/a — product.md has no dedicated voice/tone section`. Area: copy/tooling. Reversibility: n/a.

### Risks

- _none_

### Issues

- _none_
