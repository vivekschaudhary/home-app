# docs/ — Artifacts

Outputs of Compass. Populated as work flows through the framework.

## Structure

```
docs/
├── foundation/
│   ├── product.md              ← foundational product bet
│   └── architecture.md         ← foundational architecture bet
│
├── bets/
│   └── <BET-ID>/
│       ├── brief.md
│       ├── architecture.md     (optional)
│       ├── research.md         (optional)
│       ├── stories/
│       │   └── <STORY-ID>/
│       │       ├── story.md
│       │       ├── design.md   (if UI)
│       │       ├── copy.md     (if UI)
│       │       └── fixes/      (post-merge bug fixes for this story)
│       ├── ops/                (bet-related ops)
│       ├── fixes/              (bet-related bug fixes not tied to one story)
│       └── incidents/          (bet-related incidents)
│
├── ops/                        ← standalone hygiene ops
├── fixes/                      ← standalone hygiene fixes
├── incidents/                  ← standalone incidents
│
├── sprints/
│   └── <year>/
│       └── sprint-<n>.md       ← weekly comms
│
├── metrics/                    ← cached snapshots (json + md)
├── status.md                   ← rolling project status (PM-maintained)
└── changelog.md                ← user-visible changes (Tech Writer)
```

## Bet ID format

Jira-style — `PROJ-42`, `PROJ-43`, etc. Stories are sub-tickets of bet epics (e.g., `PROJ-43` under `PROJ-42`).

## Status fields

Every artifact has `status` in frontmatter. Drives lifecycle and workflow gates.

- **Brief:** proposed → approved → in-build → shipped → measuring → won | learning | inconclusive
- **Architecture:** proposed → approved → superseded
- **Story:** needs-design → ready → in-build → in-review → merged → shipped → deploy-failed | re-opened
- **Fix:** triaged → escalated → in-fix → merged → shipped → re-opened
- **Incident:** open → mitigated → resolved → postmortem-pending → closed
- **Ops:** planned → approved → in-execution → shipped → rolled-back | deploy-failed

## Traceability

Everything links back to its source:
- Story → bet (folder location + `bet:` frontmatter)
- PR → story (in PR description)
- Brief → source material (in `sources:` frontmatter)
- Architecture → bet
- Incident → bet (if linked)
- Fix → bet + story (if linked)

`grep -r PROJ-42 docs/` finds everything related to that bet.

## Lifecycle

Artifacts are not deleted. They are versioned via git. Superseded artifacts keep history:
- Foundation amendments → `product-v1.md`, `product-v2.md`
- Superseded decisions in DRI → SUPERSEDES entries (append-only)
- Rejected briefs → `status: rejected`, file stays
- This is the project's institutional memory.
