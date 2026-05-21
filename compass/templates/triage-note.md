---
id: <FIX-ID>
type: fix
bet: <BET-ID or null>     # null means hygiene/standalone
story: <STORY-ID or null>
hygiene: false             # true if standalone hygiene
severity: P1               # P0 | P1 | P2 | P3
status: triaged            # triaged | escalated | in-fix | merged | shipped | re-opened
reporter: <user / system>
created: YYYY-MM-DD
author: Support
area_tags: []
---

# Triage: <Short description>

## Issue

<One paragraph from the user's perspective.>

## Reproduction

1.
2.
3.

**Expected:** <what should happen>
**Actual:** <what happens>

## Environment

- Browser / OS / device:
- Account type / role:
- Version / build:
- Time of occurrence:

## Severity rationale

<Why this severity? Blast radius? Workaround?>

## Duplicate check

- Searched: <terms>
- Existing tickets: <links if any>

## Cross-bet attribution

<If the fix touches code from multiple bets, list each. Defect counter increments in each.>

## Outcome

### L1 resolution
- Response to user:
- Resolution:
- FAQ entry: <link if added>

### Escalation
- Suspected area:
- Linked context:
- Communicated to reporter: yes/no

## Fix details (filled after resolution)

- PRs:
- Tests added: regression: <yes|no>; e2e: <yes|no>
- Deploy outcome: shipped | deploy-failed
- Reporter notified: <date>

## DRI Log

### Decisions
- [YYYY-MM-DD] [Support] Severity P1 — rationale: affects multiple users, workaround exists — area: <tag>

### Risks
- [YYYY-MM-DD] [Engineer | Architect] <risk> — likelihood — impact — mitigation

### Issues
- [YYYY-MM-DD] [role] <issue> — severity — owner — status
