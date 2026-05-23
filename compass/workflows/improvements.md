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
