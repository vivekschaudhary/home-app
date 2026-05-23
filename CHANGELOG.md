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
