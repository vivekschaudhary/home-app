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

## [0.1.14] — 2026-05-24

### Added
- **`/plan` workflow** + **living `docs/foundation/plan.md`** artifact. Derived from per-bet artifacts (portfolio, briefs, architectures, stories, build state). Refreshed on every `/advance`. Sections: Currently in flight / Next up / Blocked / Done / Full schedule / Calendar view / Refinement log. Status is `living` — never `proposed` or `approved`.
- **Estimate model** that sharpens as phases complete: stub → brief approval (scope) → architecture approval (effort) → stories (count) → build PRs (actuals). Each refinement writes a new `estimate` block to the bet's `brief.md` frontmatter (`duration_weeks`, `confidence`, `refined_by`, `refined_at`).
- **Refinement log** in `plan.md` — every date that moves writes a row naming the triggering artifact. This is the audit trail for "output → input" causality.
- New template `compass/templates/plan.md`.
- New skill `.claude/skills/plan/SKILL.md`.
- `estimate` block added to `compass/templates/brief.md` frontmatter.
- Project Manager role gained `/plan` ownership (alongside `/status` and sprint comms).

### Changed
- `/advance` now auto-runs `/plan` as its final step. This is the load-bearing mechanic that makes "each phase's output is an input to the next phase's plan" real instead of aspirational — users don't have to remember to refresh the plan.
- `/status` now reads `docs/foundation/plan.md` for ETAs / in-flight / next-up rather than recomputing schedule data. Adds a plan-freshness signal (`last_refreshed` age) to the health metrics.
- `/create-bet-portfolio` Output section now points at `/plan` as the next step after portfolio HITL approval (seeds the initial schedule).
- AGENTS.md workflow count: 14 → 15.

### Fixed
- Closed the time-planning gap: the portfolio had a *logical* plan (dependency graph) but no *temporal* plan (dates, calendar, parallel streams visible on a timeline). "When can we ship the MVP?" was unanswerable in concrete dates; parallel-build candidates sat unused; estimates never tightened; slip detection was reactive. `/plan` makes the schedule first-class and refines it as each phase's output lands.

## [0.2.0] — 2026-05-24

> Major: continuous quality scanner for the product lifecycle. Modeled on Snyk / Semgrep / GitHub Advanced Security.

### Added
- **New `/scan` workflow** + **Scanner role** + **`scan-report.md` template**. Snyk-style continuous quality scanner across six SDLC phases (Product, Architecture, Build, **Production Ready** (new), GTM, Operate). Findings, not failures. Severity (Critical / High / Medium / Low) + confidence (High / Medium / Low) + location + reason + fix per finding. Read-only role — owners decide; the scanner informs.
- **Production Ready phase formally introduced** — previously silent in Compass. Eight checks covering runbook, SLO, monitoring, rollback, on-call, backup, cost, compliance.
- **Cross-cutting principle #13** in AGENTS.md: continuous quality scanning with confidence levels. Names the six phases, the finding shape, and the "measurement is automatic — no manual self-assessment" rule.
- **Check catalog** (44 checks across six phases) lives in `compass/workflows/scan.md` as the single source of truth. New checks added there, not improvised by the role.
- **Confidence derivation** is canonical: content depth + source freshness + cross-artifact corroboration. Each finding's Reason field states the reasoning briefly.
- **Suppression policy** in `compass/config.yaml`: HITL-approval-required for Critical (with non-suppressible carve-outs for PII / legal); DRI-justification for High; owner-acceptance-logged for Medium; silent-dismissal-logged for Low.
- **Open Findings section** in `/metrics` output — total by severity, top patterns, suppressions, time-to-remediate, trends.
- **Scan summary section** in brief template — points at the latest `scan-report.md`, shows current open-findings count.
- New skill `.claude/skills/scan/SKILL.md`.
- Role count: 12 → **13** (Scanner). Workflow count: 15 → **16**.

### Changed
- **`/advance` now runs `/scan` before any phase transition.** In `strict` mode (default for Product / Architecture / Build / Production Ready), open Critical findings block advancement. In `advisory` mode (default for GTM / Operate), Critical findings warn loudly and auto-log as DRI Risks. Non-suppressible Critical findings always block.
- **`/build` invokes `/scan` at phase boundaries** — Build → Production Ready, Production Ready → GTM, GTM → Operate. Catches missing production-readiness work *before* the bet is treated as shipped.
- **`/metrics` reads all `docs/bets/*/scan-report.md`** for the new Open Findings posture roll-up.
- **`compass/config.yaml`** gained a `scanner:` section: mode (strict/advisory), per-phase overrides, suppression policy, cron schedule.
- **AGENTS.md** workflow count 15 → 16; role count 12 → 13; principle count 12 → 13.
- **README.md** principles updated with the scanner framing; flow diagram includes `/scan`.

### Fixed
- Closed the "what gates production?" gap. Compass v0.1 had no explicit Production Ready phase — runbook, SLO, monitoring, rollback, backup, on-call, cost, compliance lived as vague intentions across role docs or in nobody's responsibility. v0.2 makes Production Ready a first-class scanned phase with eight checks, several non-suppressible for regulated data.
- Closed the "rubric vs scanner" framing gap. Previous quality-checklist patterns in workflow verification gates were checklists the owner self-applies (boolean: did I do this?). The scanner replaces that for SDLC-wide quality with a Snyk-shaped output engineers already trust — findings with locations, fixes, severity, confidence, suppression with rationale.

## [0.2.1] — 2026-05-24

### Added
- **`/dashboard` workflow** + **`docs/dashboard.html`** single-file browser view of all living Compass artifacts (foundation, plan, portfolio, scan reports, metrics, status). One self-contained HTML file. Opens via `file://`. Shareable as an attachment. Six tabs, marked.js + mermaid.js via jsDelivr CDN. CORS-safe — markdown content inlined at generation time, no `fetch()` of local files.
- New template `compass/templates/dashboard.html.template` with `<!-- COMPASS-INSERT:* -->` markers the `/dashboard` workflow fills in.
- New skill `.claude/skills/dashboard/SKILL.md`.
- Project Manager role gained `/dashboard` ownership (fits the rolling-visibility mandate alongside `/status` and `/plan`).

### Changed
- **`/scan`, `/metrics`, `/plan`, `/status` auto-invoke `/dashboard`** as their final step. `/advance` triggers it transitively via its `/plan` step. Browser view never goes stale during normal workflow usage.
- AGENTS.md workflow count: 16 → **17**.
- README.md flow diagram + SETUP.md "Anytime" section mention `/dashboard` for stakeholder sharing.

### Notes
- **Zero-toolchain.** No Node, no Python, no Pandoc, no `node_modules`. AI agent (Claude running `/dashboard`) reads markdown reports and inlines them into the HTML template via the Write tool. Browser renders client-side from CDN-loaded dependencies.
- **Mermaid diagrams** (dependency graphs, ERDs, future Gantt) inside the inlined markdown render as actual diagrams in the dashboard — same Mermaid that GitHub/Confluence render.

## [0.2.2] — 2026-05-24

### Changed
- **`docs/dashboard.html` now gitignored by convention.** Added to the Compass framework's root `.gitignore` and documented the same recommendation in `SETUP.md` for consuming projects. First real `/dashboard` run produced a ~2500-line HTML file inlining 9 artifacts; every `/scan`, `/plan`, `/metrics`, `/status` rewrites it. Committing produced large, non-meaningful diffs that grow linearly with project size and risked review fatigue masking real template bugs.

### Added
- Explicit rule in the dashboard workflow notes + improvements log: **gitignore only pure views derived from other tracked files with no user-relevant state of their own.** Dashboard fits; other living artifacts (`plan.md` with refinement log, `scan-report.md` with suppressions, dated metrics snapshots, `status.md` history) stay tracked because they carry user state.
- Root `.gitignore` created (didn't exist before).

## [0.2.3] — 2026-05-25

### Changed
- **`/dashboard` workflow now forbids silent summarization.** First real `/dashboard` run in a consuming project (aura-app) produced a 42 KB HTML file with 4 of 9 artifacts silently summarized ("executive summaries of the larger sections") to "keep file size manageable." That's a spec violation, not an optimization — summaries make the dashboard a second source of truth that drifts from the underlying markdown. Workflow step 7 now says verbatim is **load-bearing**: do NOT summarize, do NOT truncate, do NOT reword (even for clarity). The only permitted transformation is escaping `</script>` to `<\/script>` inside inlined content.

### Added
- New Verification item in `/dashboard`: every inlined artifact must match source byte-for-byte. Spot-check by `diff`-ing inlined blocks against source `.md` files.
- New anti-pattern in dashboard workflow Notes: "Silent summarization is the failure mode." Names the framing trap ("small file is reviewable") and points at `/dashboard --summary` as a future opt-in if size genuinely becomes a problem.

### Notes
- **No `--summary` flag added yet.** Deferred until real friction emerges at very large project scale (30+ bets, hundreds of artifacts). Don't pre-build escape hatches before the constraint has been tested.
- **No other workflows touched.** `/scan`, `/metrics`, `/plan`, `/status`, `/advance`, `/create-bet-portfolio` are unaffected; the fix is strictly inside `dashboard.md`.

## [0.2.4] — 2026-05-26

> Two fixes from real-world aura-app friction, both same anti-pattern shape (load-bearing checks that weren't load-bearing in the spec).

### Changed
- **`/build` Phase 2 step 7 + Engineer Definition of Done now require a green production build** (`pnpm build` or framework-equivalent) before opening a PR. Typecheck + unit tests genuinely can't see bundling errors, dead-import elimination, env-var requirements, asset pipeline issues, or monorepo workspace resolution. Real PR from aura-app shipped because these checks weren't required.
- **`/create-bet-architecture` gained a foundational-stack deviation gate** (new step 7). If a bet introduces tools/services/frameworks/data stores/runtimes/dependencies not in `docs/foundation/architecture.md` Stack table, the Architect **must refuse to draft bet architecture** and tell the user to run `/setup-foundation-architecture` in amend mode first. Foundational scope decisions live at foundational level by design; bet architecture is constrained to operate within the foundational stack.
- **`/setup-foundation-architecture` Phase A gained a 4-category signal-consultation step** (production observability / recent PR feedback / prior architectural decisions across bets / bet-architecture deviation pressure). Especially load-bearing for amend flows. Each category produces a citation OR explicit "n/a — <reason>" note. Mirrors Researcher 6-category and Architect 6-pillar enforcement shape.
- **Architect role's Input and Definition of Done** updated to reference the foundational Stack table as canonical and require an explicit "no deviation from foundational stack" assertion (or escalation note).

### Added
- New **`ADR / Amendments` section in `foundation-architecture.md` template** — Architecture Decision Record entries with structured shape (Triggered by / What changed / Why / Reversibility / Cited signal). Required to have ≥1 entry for any foundational version > 1. The foundational arch IS the ADR ledger; no separate ADR file convention.
- Phase A Verification gate items: signal consultation present across all 4 categories; ADR / Amendments entry required when version > 1.

### Fixed
- Closed the "Architect quietly widened the foundational stack inside a bet doc" failure mode. Bets that need new tooling now hit a refuse-and-escalate path that produces a proper foundational ADR — drift becomes structurally impossible without a recorded decision.
- Closed the "Architect made recommendations without consulting available signal" failure mode. Same anti-pattern shape as Researcher v0.1.9 (log-and-walk-away) and dashboard v0.2.3 (silent summarization): soft spec → agent rationalization → fix is making the constraint load-bearing + adding verification + naming the anti-pattern.

## [0.2.5] — 2026-05-26

> Three fixes from real-world aura-app friction (13 issues triaged → 3 Compass-relevant gaps; the other 10 were app-specific Expo/pnpm/Metro tooling concerns).

### Added
- **`/build` step 7 + Engineer DoD gained a runtime-config audit.** All public-namespace env vars (`*_PUBLIC_*` / `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` / `VITE_*` / etc.) must have explicit values for the target deploy environment. Dev-only defaults (`localhost`, mock-mode toggles) must **fail loudly at module load** rather than silently fall back. Catches the "default works in dev, app boots into broken state on real device / deployed function" failure mode that prod-build can't see.
- **`/setup-foundation-architecture` Phase B gained a deploy-canary gate** (new step 16). After scaffolding completes, deploy a hello-world from the freshly scaffolded repo to the target environment. URL captured in `compass/config.yaml` under `ci_cd.deploy_canary_url`. If deploy fails, return to Phase A with an ADR entry naming the cause — the architecture doesn't actually deploy yet. Catches the "Turborepo + pnpm + Vercel doesn't compose; doubled output path; missing pnpm-lock; no Next.js detected" multi-round-debug failure mode that burns days mid-project.
- **New scanner check `PROD_READY-09`: Vendor capability claims unverified for deployment context** (High severity, suppressible with DRI). Every vendor feature the architecture depends on — DB extensions, region-specific services, plan-tier features, SDK capabilities — needs a doc citation that confirms availability for the *specific* deployment context (region, SKU, plan-tier, runtime version). Not "Supabase has it" if you mean "Supabase US-East has it." Catches the `pg_uuidv7 missing in ap-south-1` class of failure.
- `compass/config.yaml` `ci_cd` section gained `deploy_canary_url` field.

### Changed
- Phase B Verification gate updated to require deploy-canary green before workflow completes.
- Production Ready scanner check count: 8 → 9.

### Notes
- **Out of scope (per user):** the other 10 aura-app issues — Babel runtime / Metro module resolution / React 18 vs 19 / Expo SDK pinning / pnpm strict isolation interactions — are app-specific tooling choices, not Compass's concern.
- **Deferred:** "stack composition matrix" (issues #1, #2, #4, #5, #8 reveal a meta-pattern of foundational stack choices not composing). The deploy-canary gate catches most of this at integration time; revisit if it doesn't catch enough.
- **Same anti-pattern as v0.2.4:** load-bearing checks that weren't load-bearing in the spec. Fix shape is consistent — explicit constraint + verification gate + named anti-pattern.

## [0.2.6] — 2026-05-26

> Story template gained a Standard Experience Checklist after a missed back-button shipped in aura-app and led to a UX-cleanup mini-bet. Surfaced a Compass gap I initially miscategorized as "app-specific" — user correctly identified it as a story-AC structural omission.

### Added
- **`compass/templates/story.md` gained a "Standard Experience Checklist" section** between Acceptance Criteria and Tech notes. Six categories that PM must address when writing the story — each either covered by ≥1 AC item OR explicitly marked `n/a — <reason>`:
  - **Navigation** — back / exit / cancel / dismiss paths for every navigable surface
  - **States** — loading / empty / error / success / disabled each has an AC
  - **Feedback** — error type discrimination + success acknowledgment + destructive confirmation
  - **Accessibility** — focus management + keyboard nav + screen reader labels
  - **Edge cases** — offline / slow network / permissions-denied / missing-data
  - **Cross-surface consistency** (multi-target stacks) — behavior matches across surfaces
- Same `cite-or-mark-n/a` enforcement shape as Researcher 6-category, Architect 6-pillar, signal-consultation 5-category.

### Changed
- **`/create-story` step 7 now requires the Standard Experience Checklist filled** before the story can reach `status: ready`. Empty categories (no AC reference AND no `n/a` note) block the gate.
- **New refusal case in `/create-story`:** "Standard Experience Checklist has any empty category."
- **Designer role DoD** gained explicit "coordinate with PM on Standard Experience Checklist" — design completeness and story-AC completeness must match. If something's in the Figma but not in the AC, it ships missing.
- **UX Writer role DoD** gained explicit "error copy discriminates error type" — generic "something went wrong" or mislabelling validation as "network errors" fails the Feedback category.

### Fixed
- Closed the **story-AC-omission failure mode**: Designer drew the back button; the story's AC didn't say "back navigation present"; Engineer didn't implement; Codex E2E didn't test; shipped without. The new checklist makes "covered in design but missing from AC" structurally impossible at story-creation time.
- Closed the **error-message-quality omission**: aura-app's Passkey screen showed misleading "network" errors when the actual failure was passkey-specific. New checklist's Feedback category forces error-type discrimination in the AC, which forces Engineer to implement type-specific handling and UX Writer to draft type-specific copy.

### Notes
- **Aura-app trigger:** PM was correct that the UX cleanups weren't just "app-specific" — they revealed a structural gap in story AC completeness. I initially miscategorized; user corrected.
- **Out of scope (deferred from earlier triage rounds):** team playbooks signal-consultation category, stack-aware canary artifact, cross-story E2E pattern. Each warrants its own focused patch.

## [0.2.7] — 2026-05-26

> Two improvements promoted from earlier deferrals after the aura-app 2026-05-26 state-of-play update gave direct evidence both gaps were real.

### Added
- **Stack-aware canary artifacts.** `compass/config.yaml` `ci_cd.deploy_canary_url` (single string) → `ci_cd.canary_artifacts[]` (list of `{kind, url, verified_at, notes?}`). Kinds: `web | mobile | container | other`. Multi-target projects (web + mobile + service + …) now require one canary entry per target. Catches the "web canary green, mobile canary missing" failure mode that blocked aura-app's AC4 on the first feature bet.
- **Team playbooks signal-consultation category.** `/setup-foundation-architecture` step 6 signal consultation gained a 5th category — search `docs/playbooks/*` for prior stack-specific learnings; cite or mark `n/a — empty directory` (valid for first-project bootstrap). Mandatory citation once the team has accumulated playbooks across projects. Same `cite-or-mark-n/a` enforcement shape as the prior 4 categories (Researcher 6, Architect 6, signal-consultation now 5, story standard-experience 6 — **5th instance of the pattern; codify in AGENTS.md when a 6th lands**).
- **New `docs/playbooks/` convention** — per-stack-combo or per-topic learnings, distinct from per-bet runbooks and per-incident postmortems. Living artifacts; `last_validated` date bumped each re-use.
- **New template `compass/templates/playbook.md`** — frontmatter with `stack_combo` tags, `related_bets`, `last_validated`; sections: When this applies / Symptoms / Steps / Gotchas / References / Maintainer note.
- **`/measure` Phase 4 step 11a soft prompt** — when a bet's outcome resolves with notable technical learnings, prompt for playbook capture while the learning is freshest. Soft prompt, not gate.
- **Foundation architecture template** Boundaries/Scaffolding now creates `docs/playbooks/` as an empty directory (with a README pointing at the template). Stays empty until learnings accumulate.

### Changed
- **`/setup-foundation-architecture` Phase B step 16** rewritten from single-URL deploy-canary to **multi-target deploy canaries** — one per deploy target in the foundational stack. Phase B Verification updated to require every target in `canary_artifacts[]` with `verified_at` populated; partial coverage fails.
- **`/setup-foundation-architecture` Phase A Verification** updated: signal consultation is now 5 categories (was 4).

### Notes
- **aura-app evidence** for both improvements: AC4 dev-build sprint (Improvement 1); proposed 3 runbooks (`pnpm-monorepo-rn`, `vercel-pnpm-monorepo`, `expo-go-vs-dev-build`) framed as "captures today's learnings for the next Compass project" (Improvement 2).
- **Out of scope (still deferred):** cross-story E2E pattern; stack composition matrix; playbook-coverage scanner check.

## [0.2.8] — 2026-05-26

> **Framework self-instrumenting.** First patch about Compass's own learning cadence rather than a specific workflow gap. Codifies the foundational pattern shaping ~70% of the framework's 15 prior improvements; institutes retro cadence; backfills 3 retros covering all prior work.

### Added
- **New `/retro` workflow + Scanner-role skill + `compass/templates/retro.md`.** Periodic batch retro of improvements, fires every 5 entries in `compass/workflows/improvements.md`. Reports patterns (positive), recurring anti-patterns (soft-spec-rationalization surfaces), convention candidates, drift signals, watch-for list. **Reports — does not prescribe.** No HITL gate.
- **New `compass/workflows/retros/` directory convention** — archived retros (`status: archive`, immutable once written).
- **Three backfilled retros covering improvements 1-15:**
  - Retro #001 (v0.1.8 → v0.1.12) — surfaced N-category, refuse-escalate, soft-spec-recipe as convention-ready at improvement #5.
  - Retro #002 (v0.1.13 → v0.2.2) — surfaced `status: living`, state-detection-table, auto-trigger-chain. Major capability expansion.
  - Retro #003 (v0.2.3 → v0.2.7) — confirmed soft-spec-rationalization at 18+ cumulative instances; flagged `/advance: 0 uses` drift signal; flagged aura-app trigger-origin concentration risk.
- **Three new cross-cutting principles in AGENTS.md** (now 16 principles, was 13):
  - **#14 (foundational): Soft spec → AI rationalization is a vulnerability surface, not flexibility.** User's verbatim formulation: *"Anywhere an AI agent has interpretive room, it will exercise judgment that diverges from intent. The fix is never 'tell the AI to be better' — it's explicit constraint + mechanical verification gate + named anti-pattern in the workflow file."* This is the foundational principle that #15 and #16 instantiate. ~18 instances across the framework's history. Worst convention-discovery lag observed (17 improvements between visible and codified).
  - **#15: N-category `cite-or-mark-n/a` enforcement** for structured consultation. 5+ instances (Researcher 6, Architect 6-pillar + 6-research, Architect signal 5-category, Story standard-experience 6, playbook frontmatter).
  - **#16: Refuse + escalate to upstream artifact.** 5+ instances (Researcher refuse, HITL before scaffold, data model before DB, bet-arch deviation gate, Story Standard Experience gates `status: ready`).
- **`compass/workflows/improvements.md` header** now tracks retro cadence + next-retro-fires-after counter (currently #20).

### Changed
- **AGENTS.md workflow count:** 17 → 18 (`/retro` added). Cross-cutting principle count: 13 → 16.

### Notes
- **Meta-observation:** The convention-discovery lag of v0.1.8 → v0.2.8 (17 improvements to name the dominant pattern) was the worst it will ever be. Every retro from here forward should shrink it.
- **The user's verbatim formulation is preserved in Principle #14.** The user crystallized the pattern more precisely than the framework had named it; honoring the wording maintains attribution and accuracy.
- **First *live* retro fires after improvement #20** (v0.2.8 is improvement #16; 4 more entries needed before automatic fire). The retro workflow as-written will meet reality then; today's backfilled retros are the proof-of-shape.
- **No new role added.** Retros are owned by Project Manager (for project retros) or framework-Architect persona (for framework retros — Compass on Compass). Existing roles cover the work.

## [0.3.0] — 2026-05-26

> **`/advance` deprecated.** First action on a retro-surfaced drift signal. Convention-discovery lag = hours, not 17 improvements. Principle #14 applied recursively to framework design.

### Changed
- **`/advance` workflow deprecated.** Retro #003 (shipped in v0.2.8) flagged `/advance: 0 uses in aura-app over 4 days of active dev` as a drift signal. The framework was over-engineering a "canonical phase advance" command that real users don't invoke — phase transitions happen naturally via status-field flips, and the auto-trigger chain (`/advance` → `/plan` → `/scan` → `/dashboard`) was load-bearing in the spec but irrelevant in practice. **This is itself an instance of Principle #14 applied to framework design** — the framework designer rationalized that a canonical advance command was needed; reality showed it wasn't.
- **`compass/workflows/advance.md`** rewritten with deprecation notice at top + migration table + historical Process section preserved for archaeology. Skill registered (don't fail silently) but the workflow now prints the migration table on invocation rather than performing any phase advance, scan, or refresh.
- **Auto-chain references removed** from active surface across `/plan`, `/scan`, `/dashboard`, `/status`, `/create-bet-portfolio`, `/build`, Project Manager role, Scanner role, scan-report template, brief template, plan template, and `/plan` + `/scan` skill descriptions. What remains independent of `/advance`: `/build` phase-boundary auto-invocation of `/scan`; `/dashboard` auto-refresh from `/scan` + `/plan` + `/metrics` + `/status`; cron-driven `/scan` per `compass/config.yaml`.
- **AGENTS.md workflow table:** 18 → 17 (removed `/advance` row).
- **README.md flow diagram:** removed the "Navigate" bucket (which had `/advance` as its only member); now 4 buckets (Bootstrap / Plan / Execute / Observe). Added note: phase transitions are direct `status:` field flips — no canonical "advance" command.
- **CLAUDE.md + SETUP.md:** removed `/advance` references.

### Migration

| What you used to do | What to do now |
|---|---|
| `/advance` to move to next phase | Flip the artifact's `status:` field directly (`proposed` → `approved` → `in-build` → `shipped` → etc.) |
| `/advance` to refresh the plan | `/plan` directly |
| `/advance` to run the scanner | `/scan <bet-id>` directly (auto-invoked at `/build` phase boundaries) |
| `/advance` to refresh the dashboard | `/dashboard` directly (auto-invoked by `/scan`, `/plan`, `/metrics`, `/status`) |
| `/advance` to see current state | `/status` directly (auto-refreshes `/dashboard`) |

### Notes
- **No replacement command.** The whole insight from the drift signal is that this command was unneeded. Replacing it with a renamed equivalent would re-introduce the same loophole.
- **Drift-signal-to-action lag = hours.** Retro #003 (shipped 2026-05-26) → v0.3.0 (same day). The retro cadence's promised lag-shrinking is real on its first try.
- **Files NOT touched:** all 3 retro archives, historical CHANGELOG entries (v0.1.14 through v0.2.8), historical improvements.md entries — they reference `/advance` as an active workflow because it *was* active when they were written. Editing history retroactively would violate the archive-immutability convention established for retros.
- **`scanner.per_phase` config + `blocking_advance` field on scan reports retained** — they're informational signal for users reading scan reports, not enforcement mechanisms tied to `/advance`. The user (or `/build`) consumes them to decide whether to advance.
