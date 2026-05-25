# Workflow: /build

Engineer implements an approved story. Codex reviews. Architect compliance enforced on every PR (no shortcuts — prevents tech debt). Story may have multiple PRs.

## Trigger

`/build <story-id>`

## Process

### Phase 1 — readiness check

1. **Verify story is `ready`:**
   - AC present (required)
   - Design link present (required if UI work)
   - Tech notes present
   - Bet brief is `approved`, architecture (if required) is `approved`
2. **If missing → refuse and flag to HITL.** Do not proceed.

### Phase 2 — implement

3. **Load Engineer role context** (`compass/roles/engineer.md`)
4. **Engineer reads** in order: AGENTS.md, brief, bet architecture, story, copy doc, foundation architecture, existing code
5. **Engineer plans** smallest viable diff
6. **Engineer implements:**
   - Code in appropriate boundary
   - Unit + API + component tests (co-located with code)
   - Copy verbatim from copy doc
   - All states (default, empty, loading, error, success)
   - Accessibility checks if UI
7. **Engineer runs local checks:** typecheck, lint, all test suites, format. Fix anything before opening PR.

### Phase 3 — Codex writes E2E

8. **Load Reviewer role context** (`compass/roles/reviewer.md`) — Codex
9. **Codex writes E2E tests** for AC user flows (top-level `e2e/` folder)
10. **Codex commits with `test:` prefix**

### Phase 4 — open PR

11. **Engineer opens PR** via GitHub MCP using `.github/PULL_REQUEST_TEMPLATE.md`
    - Links: brief, architecture, story, copy doc
    - Description: what changed, test plan, AC mapping
    - Auto-labels: `area:*`, `type:*` (feature / tech-debt / continuous-improvement / etc.)
    - Draft or ready — both supported (Codex reviews drafts too)
12. **Story status → `in-build` → `in-review`**

### Phase 5 — review

13. **CI runs.** Codex review begins ONLY after CI is green.
14. **Codex reviews** — posts structured findings on PR (BLOCKER / ISSUE / NIT)
15. **Architect compliance check** is part of Codex review (bet architecture as reference)
16. **Security Reviewer (Codex)** auto-engages if diff touches auth/PII/payments/secrets/external input/sessions
17. **Engineer addresses findings:**
    - All BLOCKERs and most ISSUEs
    - Disputes → `## Dispute` section in PR, PM arbitrates
    - Pushes fixes as commits → auto re-request review
18. **Loop until no blockers and no unresolved disputes**

### Phase 6 — merge

19. **HITL gate** — human approves merge
20. **Merge mechanically blocked unless:**
    - CI green
    - Zero Codex BLOCKERs
    - Zero security CRITICALs
    - Zero unresolved disputes
    - Human approval recorded
21. **Squash merge** to main (per config)
22. **CI/CD pipeline triggered** automatically (per `compass/config.yaml` ci_cd settings)

### Phase 7 — post-merge

23. **Story status → `merged`** (still under brief's tracking)
24. **Tech Writer engages** — updates `docs/changelog.md` accumulator entry for this brief
25. **If deploy succeeds:** story status → `shipped`
26. **If deploy fails:** story status → `deploy-failed`, alert via configured channel
27. **Brief stays `in-build`** until ALL stories of the brief have shipped
28. **When all stories ship:** brief status → `shipped`, Tech Writer finalizes consolidated changelog entry for the brief

### Scanner at phase boundaries

Invoke `/scan <bet-id>` at each phase boundary so the bet enters the next phase with a fresh findings snapshot:

- **Build → Production Ready:** triggered when all stories of the brief ship (step 28). Surfaces runbook / SLO / monitoring / rollback / on-call / backup / cost / compliance gaps before the bet is treated as production-bound.
- **Production Ready → GTM:** triggered when the Production Ready findings are resolved or suppressed. Surfaces user-docs / API-docs / sales / support / pricing / launch-comms / customer-comms / legal gaps.
- **GTM → Operate:** triggered when GTM findings are clear. Surfaces measurement-cron / SLO-met / incident-rate / adoption / cost-actuals / defect-rate / outcome-resolved gaps.

If `compass/config.yaml` `scanner.per_phase` is `strict` for the upcoming phase, any open Critical finding blocks the transition (matching `/advance` behavior). The point is to catch missing production-readiness work *before* the bet is treated as shipped, not after an incident reveals it.

## Story → multiple PRs

A story may produce multiple PRs (implementation, tests, defect fixes). Each PR gets the SAME full review treatment. No shortcuts on subsequent PRs.

## Post-merge bugs

If bug found post-merge on this story → reopen story, fix it right. Don't create a separate "fix" story for the same defect.

## DRI logging

Engineer logs:
- **Decisions:** implementation choices, library use — rationale + area tag
- **Risks:** regression, performance, integration — likelihood + impact
- **Issues:** AC ambiguities, missing context — severity + owner

Codex logs:
- **Decisions:** review interpretation
- **Risks:** uncovered gaps
- **Issues:** repeated drift patterns

## Discipline always

No shortcuts under pressure. Full Codex review + Architect compliance + Security review (if applicable) on every PR including drafts and hotfixes.
