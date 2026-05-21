---
id: <STORY-ID>          # e.g., PROJ-43 (sub-ticket of bet)
bet: <BET-ID>           # parent bet
type: story
status: ready           # needs-design | ready | in-build | in-review | merged | shipped | deploy-failed | re-opened
priority: P1
created: YYYY-MM-DD
author: PM
design_link: <Figma URL or docs/bets/<bet-id>/stories/<story-id>/design.md>
area_tags: []
dependencies:
  - <other story id>
---

# <Story Title>

## Description

<One paragraph: what this story delivers, from the user's perspective.>

## Acceptance Criteria

- [ ] AC 1: <specific, testable>
- [ ] AC 2:
- [ ] AC 3:

## Tech notes

<Reference bet architecture for the load-bearing decisions. Capture story-specific implementation notes here.>

## PRs

_Auto-populated as PRs open. A story may have multiple PRs (implementation, tests, defect fixes)._

- PR #N — <description> — status

## Tests

_Engineer writes unit/API/component tests co-located with code._
_Codex writes E2E tests in top-level `e2e/`._

Tags applied to test files:
- `regression: true|false`
- `e2e: true|false`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [YYYY-MM-DD] [Engineer | Designer | UX Writer] <decision> — rationale — area — alternatives

### Risks
- [YYYY-MM-DD] [role] <risk> — likelihood — impact — mitigation — area

### Issues
- [YYYY-MM-DD] [role] <issue> — severity — owner — status — area

---

_Story closed: <date>, brief link: docs/bets/<bet-id>/brief.md_
