# Compass Improvements Log

Real friction encountered while using Compass, with the change made to fix it. This file is the institutional memory of why the framework is shaped the way it is.

Each entry: what happened → what changed → what to watch for.

## Template

```
### YYYY-MM-DD — Short title naming the friction

**Friction:** What hurt, where, and how it surfaced.

**Change:**
- Bullets describing the specific edits.

**Files touched:** comma-separated paths.

**Watch for:** future risks, follow-ups, things that could regress.
```

---

### 2026-05-24 — Researcher needed 6-category structure with defensibility as first-class

**Friction:** Researcher role had vague "gather data" guidance. Inconsistent engagement. Moat analysis (defensibility) was missing entirely from foundational product research — the single most important question on a company-level bet.

**Change:**
- 6-category research framework: user pain, competitive, technical, quantitative, trends, moat.
- Moat analysis mandatory on foundational product bets; 9 classic moat types evaluated explicitly.
- AI tools elevated to first-class research mode across all categories.
- Defensibility section added to foundation-product.md template.
- Verification checklist enforces mandatory completion.

**Files touched:** `compass/roles/researcher.md`, `compass/templates/foundation-product.md`, `compass/templates/brief.md`, `compass/workflows/setup-product.md`.

**Watch for:**
- Similar gaps for other "always engages" roles (e.g., Architect joining on every PR — is that actually happening?).
- Domain-specific moat patterns may need extension (e.g., healthcare network effects work differently).

---

### 2026-05-24 — Researcher could log-and-walk-away on vision-only sources

**Friction:** First real `/setup-product` run (flow / Agent Orchestrator brief) revealed that the v0.1.8 changes were *necessary but not sufficient*. The vision-only source doc gave the Researcher cover to log three open Issues (R-1, R-2, R-3) flagging missing user pain, persona, and competitive data — and the workflow accepted it. No evidence was produced. No moat analysis was attempted. The brief reached "ready for HITL" with placeholders everywhere and the verification gate would have passed because:
- Defensibility section was absent (template predated v0.1.8 — would have been an empty table on re-run, which the old gate allowed)
- Researcher DRI was Issues-only and the gate said "entries from PM AND Researcher" without specifying breadth
- "Findings present" was satisfied by literally any text, including TBDs

**Change:**
- Workflow step 3: explicit ban on log-and-walk-away. Vision-only sources are not a reason to defer.
- Verification: empty moat rows fail; Researcher needs Decisions + Risks (not just Issues); findings need cited evidence (not TBD or "see R-N"); HITL gate cannot pass with any unchecked item.
- Role doc: new "When the source is vision-only" subsection — vision-only is the *normal* starting state, not an exception.

**Files touched:** `compass/workflows/setup-product.md`, `compass/roles/researcher.md`, `CHANGELOG.md` (0.1.9), `compass/workflows/improvements.md`.

**Watch for:**
- Other workflows with "MUST engage" roles that don't enforce *what* the engagement produces (Architect on every PR — what's the deliverable?).
- Researcher may now over-rotate and produce thin evidence across all three categories just to clear the gate. If that happens, tighten on *quality of evidence* (citations, primary sources) rather than just presence.

---

### 2026-05-24 — Bootstrap forced bets serial; teams idle, deps invisible

**Friction:** The methodology said "PM decomposes bets one at a time." That's correct in steady state — ship a bet, learn, file the next. But for new projects, the MVP is rarely one bet — it's typically a wedge of 3-6 bets (auth + core capability + persistence + engagement loop, etc.) that together form a viable product slice. Forcing them serial during bootstrap meant: foundational architecture got decided knowing only bet 1's needs (bets 2-6 then kept breaking it); teams sat idle waiting for the previous bet to clear; cross-bet dependencies stayed invisible until they bit; no parallel build streams were possible.

The user observed the real-world pattern: "create the bets across all and then have the build start in parallel." But this needed to be **bootstrap-only** to avoid becoming a waterfall mini-roadmap, and **strictly MVP** to avoid scope padding.

**Change:**
- New workflow `/create-bet-portfolio` — bootstrap-only, runs once per project after foundation product + architecture are approved.
- Workflow elicits MVP definition via a forcing question ("what does this product need to do for one real user to complete the core value loop once?"). Verbatim user answer becomes the load-bearing scope statement at the top of the portfolio doc.
- Drafts 3-6 stub briefs (MVP bets only) with new frontmatter fields `portfolio_stub`, `depends_on`, `parallel_with`. Each stub traces its one-line hypothesis back to a specific line in the product bet.
- Drafts `docs/foundation/portfolio.md` with Mermaid `flowchart` dependency graph + explicit parallel-build candidates + a "Deliberately out of MVP" section for the user's "tempted to include but actually post-MVP" items.
- `/create-brief` gained a promote-stub mode: `/create-brief <bet-id>` fills in the full content for a portfolio stub and clears the flag. Fresh-bet creation mode is unchanged.
- State detection prevents re-bootstrapping: once any stub has been promoted, `/create-bet-portfolio` refuses re-invocation. New bets after MVP go through `/create-brief` fresh.
- Two distinct HITL approvals per bootstrap bet: portfolio approval ("yes, this is the wedge") + per-brief approval after promotion ("yes, this is what bet N specifically should be"). Deliberate.
- Researcher engagement is mandatory in the new workflow (same enforcement as setup-product) — surfaces MVP wedge patterns from comparable products as a sanity check on the user's MVP definition.

**Files touched:** new — `compass/workflows/create-bet-portfolio.md`, `compass/templates/portfolio.md`, `.claude/skills/create-bet-portfolio/SKILL.md`. Edited — `compass/workflows/create-brief.md` (promote-stub mode), `compass/workflows/setup-foundation-architecture.md` (next-step pointer), `compass/templates/brief.md` (new frontmatter fields), `compass/roles/pm.md`, `compass/roles/researcher.md`, `AGENTS.md`, `CLAUDE.md`, `SETUP.md`, `README.md`, `CHANGELOG.md` (0.1.13), `compass/workflows/improvements.md`.

**Watch for:**
- **Scope creep at the MVP line.** The "Deliberately out of MVP" section is where this gets tested. If users keep proposing 7-10 MVP bets, the forcing question isn't biting. Consider tightening to a hard cap of 6 (warning today is soft).
- **Re-bootstrap requests** — users may want to re-run `/create-bet-portfolio` mid-project for a new strategic batch (post-PMF expansion, new vertical). The current refusal is intentional, but if it becomes a common pain, the answer is probably an OKR bet that decomposes via `/create-brief`, not a re-bootstrap. Watch for the request and resist building the wrong escape hatch.
- **Promotion order vs. dependency graph.** If users promote stubs out of dependency order (e.g., promote a dependent bet before its prerequisite), nothing in the workflow stops them — the dependency graph is informational. If misuse becomes common, add a refusal in `/create-brief` promote-mode that checks `depends_on` status.
- **Stub brief content drift before promotion.** If users hand-edit stub briefs between portfolio approval and `/create-brief` promotion, the promotion may overwrite their edits. Watch for this and consider an "extend rather than overwrite" mode if it bites.

---

### 2026-05-24 — DB was being picked without a data model

**Friction:** Review of the just-shipped 0.1.11 foundational-architecture work surfaced a gap: Phase A went from architecture research straight to the 13 stack choices, with no derivation of the data model the DB choice should depend on. Same decide-before-derive anti-pattern as fitness-functions-before-stack and HITL-before-scaffold, in microcosm. The DB row was effectively chosen by preference, then the data model would have been retrofitted by per-bet Architects — meaning every bet would have to live with a DB chosen before anyone knew the entity shape, tenancy, audit posture, or PII posture.

**Change:**
- New Phase A step (#7): **Derive foundational data model.** Covers core entities (each traced to a product bet line — no invented entities), identity strategy, tenancy, audit posture, delete posture, PII handling, timestamps, migration strategy, and a Mermaid `erDiagram` with cardinality.
- Step runs **before** stack choices. The Database row in the Stack table must cite the foundational data model — DB choice that ignores entity shape, tenancy, or audit fails verification.
- New "Deriving the foundational data model" subsection in the EA role explains how each decision is derived from product bet content (entities from nouns, tenancy from personas + moats, audit from compliance, PII from user segment, migration from Reliability + Ops fitness functions).
- Phase A Verification gate extended with data-model items. Phase B numbering bumped 12-15 → 13-16 to accommodate.
- Mermaid `erDiagram` adopted as the canonical ERD format — renders inline in GitHub + Confluence, plain text in source.

**Files touched:** `compass/workflows/setup-foundation-architecture.md`, `compass/templates/foundation-architecture.md`, `compass/roles/enterprise-architect.md`, `CHANGELOG.md` (0.1.12), `compass/workflows/improvements.md`.

**Watch for:**
- The trace-back-to-product-bet rule is the load-bearing enforcement here. If users hit a case where the product bet genuinely doesn't imply a needed entity (e.g., billing entities in a product bet that focuses on the user experience), they'll either invent the entity (bypassing the rule) or amend the product bet. Amending is correct; if invention becomes common, the rule needs softening with an explicit "system-required entity" carve-out.
- Mermaid ERD may grow stale faster than the rest of the doc — refreshing it should be a step in any `/setup-foundation-architecture` amend flow (creates v2).
- Per-bet `/create-bet-architecture` should be the next place to audit: does it inherit + extend the foundational data model cleanly, or does it duplicate decisions? Probably needs a "delta from foundation" enforcement.

---

### 2026-05-24 — Foundational architecture was "picked" not "derived"; scaffolded before HITL

**Friction:** Same anti-pattern as the Researcher fix, but in a new role. The `/setup-foundation-architecture` workflow jumped from "load product bet" straight to "ask 13 stack questions with smart defaults." Stack rows landed as personal preference; the Alternatives table got filled retroactively to justify the choice. No derivation evidence linked any stack row to the product bet's constraints. The Enterprise Architect had no analog to the Researcher's 6-category framework — "smart defaults" was hand-waving at research that should have been explicit. Compounding it: the HITL approval gate was the *final* step, after scaffolding had already written files to the repo. Architecture got approved *after* the repo was committed to it — backwards.

**Change:**
- Workflow split into two explicit phases separated by a hard HITL stop:
  - **Phase A — Decide & Document.** Derive fitness functions (≥1 per Well-Architected pillar, measurable in numbers), do research across the 6 architecture-research categories, score every stack choice on all 6 pillars with rationale + cited research. Draft the doc. No code written.
  - **HITL gate.** Hard stop. Human approves the architecture document.
  - **Phase B — Scaffold.** Only runs after approval. Lists files before writing, confirms with user, scaffolds.
- New 6-category architecture-research framework baked into the Enterprise/Solution Architect role: prior art, benchmarks, vendor health, failure modes, pillar fit, reversibility honesty.
- AWS Well-Architected pillars (6) adopted verbatim as the per-choice rubric. Canonical, externally validated, hard to fake.
- Fitness Functions section added to the template — falsifiable architectural targets that the stack must satisfy.
- Alternatives table rebuilt to evaluate against fitness functions, not generic pros/cons. Strawmen banned.
- New "When the product bet is vision-only on workloads" subsection in the EA role — workload-shape derivation is the architect's job.
- State-detection table at the workflow top routes between Phase A / refusal / Phase B based on artifact status.

**Files touched:** `compass/workflows/setup-foundation-architecture.md`, `compass/roles/enterprise-architect.md`, `compass/templates/foundation-architecture.md`, `CHANGELOG.md` (0.1.11), `compass/workflows/improvements.md`.

**Watch for:**
- The next instance of this anti-pattern is likely `/create-bet-architecture` — the per-bet Architect role has the same "make decisions" shape and currently no derivation framework. If/when it surfaces, mirror the Phase-A/Phase-B split with bet-scoped fitness functions instead of foundational ones.
- The pillar scoring may become rote check-the-box. If that happens, tighten on *evidence quality* (specific citations, primary sources, comparable workloads) rather than presence.
- The HITL split adds friction — measure whether users complete both phases or get stuck after Phase A. If stuck, the rejection rationale should be a real DRI Risk, not an abandoned workflow.

---

### 2026-05-24 — Architecture rename was half-applied; skill pointed at a missing file

**Friction:** The intended rename (`setup-architecture` → `setup-foundation-architecture`; `create-architecture` → `create-bet-architecture`) had been applied to *documentation* (AGENTS.md, SETUP.md, CLAUDE.md) and to the create-architecture file/skill — but the `setup-architecture` workflow file and skill directory still used the old name. The `.claude/skills/setup-architecture/SKILL.md` told the runtime to execute `compass/workflows/setup-foundation-architecture.md`, a file that did not exist on disk. The skill would have failed silently on first invocation. Stale `/setup architecture` (space-form) and `/create-architecture` command references were scattered across role docs, README, PROJECT.md, and docs/status.md. A duplicate `compass/improvements.md` had also been created next to the canonical `compass/workflows/improvements.md`.

**Change:**
- `git mv` for `compass/workflows/setup-architecture.md` → `setup-foundation-architecture.md` and the matching skill directory.
- Updated `name:` field in the renamed SKILL.md.
- Standardized all command references on hyphen-slug form (`/setup-product`, `/setup-foundation-architecture`, `/create-bet-architecture`) across README, AGENTS, CLAUDE, PROJECT, SETUP, docs/status, and all role + workflow files.
- Merged the duplicate improvements log into the canonical `compass/workflows/improvements.md`; deleted the duplicate at `compass/improvements.md`.

**Files touched:** `compass/workflows/setup-foundation-architecture.md` (renamed), `.claude/skills/setup-foundation-architecture/SKILL.md` (renamed dir + content), `compass/workflows/setup-product.md`, `compass/workflows/create-bet-architecture.md`, `compass/workflows/create-brief.md`, `compass/roles/architect.md`, `compass/roles/enterprise-architect.md`, `compass/roles/pm.md`, `AGENTS.md`, `CLAUDE.md`, `PROJECT.md`, `README.md`, `SETUP.md`, `docs/status.md`, `compass/workflows/improvements.md`, `CHANGELOG.md` (0.1.10).

**Watch for:**
- Future renames: do them with `git mv` + `grep -rn` sweep + skill `name:` field check, all in one PR. The half-applied state here was nearly invisible because docs and skill name diverged silently.
- The canonical improvements log lives at `compass/workflows/improvements.md`, not `compass/improvements.md` — easy mistake to repeat from a glance at the file tree.
