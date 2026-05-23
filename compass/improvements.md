### 2026-05-24 — Researcher could log-and-walk-away on vision-only sources

**Friction:** First real `/setup-product` run (flow / Agent Orchestrator brief) revealed that the v0.1.8 changes were *necessary but not sufficient*. The vision-only source doc gave the Researcher cover to log three open Issues (R-1, R-2, R-3) flagging missing user pain, persona, and competitive data — and the workflow accepted it. No evidence was produced. No moat analysis was attempted. The brief reached "ready for HITL" with placeholders everywhere and the verification gate would have passed because:
- Defensibility section was absent (template predated v0.1.8 — would have been an empty table on re-run, which the old gate allowed)
- Researcher DRI was Issues-only and the gate said "entries from PM AND Researcher" without specifying breadth
- "Findings present" was satisfied by literally any text, including TBDs

**Change:**
- Workflow step 3: explicit ban on log-and-walk-away. Vision-only sources are not a reason to defer.
- Verification: empty moat rows fail; Researcher needs Decisions + Risks (not just Issues); findings need cited evidence (not TBD or "see R-N"); HITL gate cannot pass with any unchecked item.
- Role doc: new "When the source is vision-only" subsection — vision-only is the *normal* starting state, not an exception.

**Files touched:** `compass/workflows/setup-product.md`, `compass/roles/researcher.md`, `CHANGELOG.md` (0.1.9), `compass/improvements.md`.

**Watch for:**
- Other workflows with "MUST engage" roles that don't enforce *what* the engagement produces (Architect on every PR — what's the deliverable?).
- Researcher may now over-rotate and produce thin evidence across all three categories just to clear the gate. If that happens, tighten on *quality of evidence* (citations, primary sources) rather than just presence.

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
