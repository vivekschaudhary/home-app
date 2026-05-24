# Changelog

All notable changes to Compass itself (the framework, not project artifacts).

Project work-shipping changelog lives at `docs/changelog.md` — that's for user-visible product changes. This file tracks framework evolution.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

-

### Fixed

-

### Added

-

## [0.1.0] — 2026-05-22

Initial release. 72 files. 12 roles, 13 workflows, 10 templates, 3 cross-cutting principles.

## [0.1.4] — 2026-05-24

### Added

- Documentation in SETUP.md and README.md explaining how AI tool memory persists across folder deletion at the same path, with cleanup instructions per tool.

## [0.1.8] — 2026-05-24

### Added
- Researcher role gained 6-category source guide (user pain, competitive, technical, quantitative, trends, moat).
- Moat / defensibility analysis added as mandatory step for foundational product bets — all 9 classic moat types must be evaluated (network effects, switching costs, data, scale, brand, regulatory, distribution, talent, speed).
- `docs/foundation/product.md` template includes a Defensibility / Moat section.
- Brief template includes optional Defensibility section for feature bets.
- AI tools (Claude, ChatGPT, Codex with browser) acknowledged as first-class research tools across all categories.

### Changed
- Researcher role's "Where to research" section completely rewritten with current (2025-2026) sources, replacing generic guidance.

### Fixed
- Source quality hierarchy now explicit; AI summaries placed below primary sources to discourage AI-only research.

## [0.1.9] — 2026-05-24

### Changed
- `/setup-product` step 3 now explicitly bans "log-and-walk-away" — Researcher must produce evidence in at least User pain, Competitive, and Moat categories. Filing missing research as open DRI Issues is no longer a valid substitute for doing the research.
- `/setup-product` verification checklist tightened: empty moat rows fail; Researcher DRI must include ≥1 Decision AND ≥1 Risk (Issues-only no longer satisfies); findings must cite evidence, not point at TBDs.
- HITL approval gate cannot pass while any verification item is unchecked — made explicit.

### Added
- Researcher role gained "When the source is vision-only" subsection: vision-only sources are the normal starting state for foundational bets, not a reason to defer research.

### Fixed
- Closed an enforcement gap surfaced by a real `/setup-product` run where vision-only source material allowed the Researcher to ship Issues-as-deliverable rather than evidence-as-deliverable.

## [0.1.10] — 2026-05-24

### Changed
- Completed the architecture rename: `compass/workflows/setup-architecture.md` → `setup-foundation-architecture.md` (file + skill directory). The earlier rename had updated docs and the create-architecture half but left this half on the old name.
- All command references standardized on hyphen-slug form (`/setup-product`, `/setup-foundation-architecture`, `/create-bet-architecture`) across README, AGENTS, CLAUDE, PROJECT, SETUP, docs/status, and every role + workflow file. Space-form (`/setup product`, `/setup architecture`) eliminated.

### Fixed
- `.claude/skills/setup-foundation-architecture/SKILL.md` had `name: setup-architecture` while pointing at a workflow path that didn't exist — would have failed silently on first invocation. Skill name now matches its directory and the workflow file it executes.
- Removed duplicate `compass/improvements.md`; merged its contents into the canonical `compass/workflows/improvements.md`.

## [0.1.11] — 2026-05-24

### Changed
- `/setup-foundation-architecture` split into two explicit phases separated by a HITL approval gate. Phase A decides and documents the architecture; Phase B scaffolds the repo. **Scaffolding now waits on explicit human approval of the architecture document — previously it ran before HITL.**
- Enterprise/Solution Architect role now owns a canonical 6-category architecture-research framework (prior art / benchmarks / vendor health / failure modes / pillar fit / reversibility honesty), mirroring the Researcher's 6-category guide.
- Every stack choice in the foundational architecture template must be scored on all 6 AWS Well-Architected pillars (reliability, security, performance efficiency, cost optimization, operational excellence, sustainability) with per-row rationale + cited research. "Smart default" / "team preference" no longer satisfies.
- Alternatives table in the architecture template evaluated against declared fitness functions and pillar tradeoffs — generic Pros / Cons columns dropped; strawmen explicitly disallowed.

### Added
- **Fitness Functions** section in the foundational architecture template — ≥1 measurable target per Well-Architected pillar (6 minimum). These are the architecture bet's falsification criteria.
- **Per-row pillar evaluation + research citations** subsection per stack choice in the template.
- **Architecture Research** section in the template (or pointer to standalone `docs/foundation/architecture-research.md`).
- **"When the product bet is vision-only on workloads"** subsection in the Enterprise/Solution Architect role — workload-shape derivation is the architect's job, not a reason to ask the user or punt.
- Phase A Verification gate (mirrors `/setup-product`'s pattern): empty pillar cells fail; every choice cites research; alternatives tied to fitness functions; EA DRI has Decision + Risk breadth; HITL cannot pass with any unchecked item.
- Phase B Verification gate: scaffold plan listed before write; user confirms; written-files summary produced.
- State-detection table at the top of the workflow routes between Phase A, refusal (proposed-pending-approval), and Phase B based on artifact status.

### Fixed
- Closed the parallel anti-pattern to the Researcher fix: Architect could pick stack choices from "smart defaults" without deriving them from product constraints. The workflow now requires fitness-function derivation, pillar scoring, and cited research before any stack row is accepted.
- Closed the scaffolding-before-approval bug: the prior workflow's HITL gate was the last step, running after the repo had already been scaffolded — backwards.

## [0.1.12] — 2026-05-24

### Added
- **Foundational Data Model** section in the architecture template and a matching Phase A workflow step (#7). Covers core entities (traced to product bet — no inventions), identity strategy, tenancy model, audit / event-sourcing posture, delete posture, PII handling, timestamps convention, migration strategy, and a Mermaid `erDiagram`. Decided **before** the DB choice so the stack is informed by data shape, not the reverse.
- "Deriving the foundational data model" subsection in the Enterprise/Solution Architect role — explains how each data-model decision is derived from the product bet (entities from nouns, tenancy from personas + moats, audit from compliance, PII from user segment, migration from Reliability + Ops fitness functions).
- Phase A Verification items: data model section present; every entity traces back to product bet; identity / tenancy / audit / delete / PII / timestamps / migration all decided; Mermaid ERD with cardinality; Database row in Stack cites the data model.

### Changed
- Phase A workflow step ordering: research → **data model** → stack choices (was: research → stack choices). Database row in the Stack table now must cite the foundational data model — DB choice that ignores entity shape, tenancy, or audit posture fails verification.
- Phase B step numbers shifted (13–16) to accommodate the new Phase A step. Enterprise Architect role's process list renumbered to match.

### Fixed
- Closed the same decide-before-derive anti-pattern at the data-modeling layer: DB choice was being made as a stack preference rather than derived from the data shape it has to hold. Same pattern as fitness-functions-before-stack and HITL-before-scaffold, now applied at one finer grain.

## [0.1.13] — 2026-05-24

### Added
- **`/create-bet-portfolio` workflow** (bootstrap-only). Runs once per project after foundation product + architecture are approved. PM + Researcher draft the MVP wedge as 3-6 stub briefs with a Mermaid dependency graph and parallel-build candidates. After portfolio HITL approval, individual stubs are promoted to full briefs via `/create-brief <bet-id>`.
- **MVP forcing question** in the new workflow: "What does this product need to do for one real user to complete the core value loop once?" Verbatim user answer becomes the load-bearing scope statement.
- **"Deliberately out of MVP" section** in the portfolio doc — captured one-liners for post-MVP items so they aren't lost, but no stub briefs created. Empty section logs a DRI Risk (MVP scope probably padded).
- New template `compass/templates/portfolio.md`.
- New skill `.claude/skills/create-bet-portfolio/SKILL.md`.
- New brief frontmatter fields: `portfolio_stub` (boolean), `depends_on` (list of bet IDs), `parallel_with` (list of bet IDs).

### Changed
- `/create-brief` gained a **promote-stub mode**: when invoked with a bet ID that has a `portfolio_stub: true` brief, it fills in the full content and clears the flag (rather than refusing or creating fresh). Original "create fresh from source" mode is unchanged.
- `/setup-foundation-architecture` final note now points at `/create-bet-portfolio` as the next step for new projects (with `/create-brief` as the path for non-bootstrap single-bet additions).
- AGENTS.md workflow count: 13 → 14. New workflow inserted in the table between `/setup-foundation-architecture` and `/create-brief`.
- SETUP.md "First run" section renumbered (new step 3 = portfolio; old step 3 = step 4; etc.) to slot the bootstrap portfolio between foundation arch and bet-level work.

### Fixed
- Closed the serialization gap during project bootstrap: PM was previously forced to decompose bets one-at-a-time, which meant foundational architecture had to decide knowing only bet 1's needs, teams sat idle waiting for the previous bet to clear, and cross-bet dependencies stayed invisible. The MVP portfolio surfaces the wedge upfront with a dependency graph so parallel build streams can start as soon as portfolio HITL passes.
