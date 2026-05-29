---
name: setup-product
status: active
owner: pm
auto_invokes: []
invoked_by: []
version: 0.3.0-alpha
---

# Workflow: /setup-product

## Framework grounding

What this workflow operationalizes. Full entries in `compass/framework/canon.md`.

- **Strategy / discovery foundations:** [working-backwards] · [lean-mvp] · [continuous-discovery] · [jtbd]
- **Competitive position:** [porter-5-forces] · [helmer-7-powers] (Compass extends to 9-type) · [blue-ocean]
- **Bet-based commitment:** [shape-up] · [helmer-bet-portfolio]
- **Communication discipline:** [pyramid-principle] · [stripe-2-page] · [amazon-6-page]
- **Goal-setting:** [okrs] · [north-star]
- **Compass-originals operationalized:** [cite-or-mark-na] (Researcher 6-category + moat 9-type) · [refuse-escalate] · [soft-spec-hardening]
- **Verifies adherence to:** Principle #14 (soft spec → AI rationalization, fix = constraint + verification + named anti-pattern) · Principle #15 (N-category cite-or-mark-n/a enforcement) · Principle #16 (refuse + escalate to upstream)

## Purpose

Creates the **foundational product bet** — the company / product mission as a measurable bet, captured in `docs/foundation/product.md`. Must run before `/setup-foundation-architecture`.

## Preconditions (workflow-level GATE — checked once at start)

- **No in-review foundation** — if `docs/foundation/product.md` exists with `status: proposed`, **refuse with:** "Existing product.md is in review (status: proposed). Approve or reject it before re-invoking `/setup-product`." (Amend of an `approved` foundation is allowed — see Step 1.)
- **Source material provided** — user must provide at least one source (Confluence link, GDrive doc, notes, free text). **On failure, refuse with:** "Provide at least a vision sentence or a source link to begin."

## Roles invoked

- `compass/roles/pm.md` — primary role throughout
- `compass/roles/researcher.md` — mandatory engagement during Step 3
- `compass/roles/project-manager.md` — final status update (Step 9)

## Steps

### 1. Check state and handle amend

**Precondition (GATE):** Workflow invoked; workflow-level Preconditions pass.

**Work (Claude):** If `docs/foundation/product.md` exists with `status: approved`, ask user: amend (creates v2, supersedes v1) or abort? If amend: rename existing to `docs/foundation/product-v<N>.md`, flip its frontmatter to `status: superseded`.

**Postcondition (GATE):** Either no `docs/foundation/product.md` exists, OR existing approved file is renamed `product-v<N>.md` with `status: superseded` and user has confirmed amend intent.

### 2. Load PM role context

**Precondition (GATE):** Step 1 postcondition holds.

**Work (Claude):** Load `compass/roles/pm.md` as active role context for the rest of the workflow.

**Postcondition (GATE):** PM role active.

### 3. Researcher engages (mandatory — no log-and-walk-away)

**Precondition (GATE):** PM role loaded.

**Work (Claude):** Load `compass/roles/researcher.md`. Researcher produces **cited evidence** in the mandatory categories: **User pain**, **Competitive**, **Moat (all 9 classic types)** — per the 6-category framework in `compass/roles/researcher.md`. Findings land in the eventual `product.md` Defensibility / Moat section AND/OR standalone `docs/foundation/research.md` for substantial findings. **Filing missing research as DRI Issues is NOT a substitute for producing the research** — if source is vision-only, Researcher's job is to fill the gap, not record it. **No silent skip on moat analysis.**

**Postcondition (GATE):** Cited evidence exists for each mandatory category (each citation a real source — no "TBD" / "see R-N"). Researcher DRI Log has **≥1 Decision AND ≥1 Risk** entry (Issues-only does not satisfy).

### 4. Gather source material

**Precondition (GATE):** Researcher engaged.

**Work (Claude):** Read user-provided sources via MCP (Confluence / GDrive / Notion etc.) and/or capture free-text input.

**Postcondition (GATE):** At least one source artifact loaded into working context.

### 5. Draft foundational product bet

**Precondition (GATE):** Source material loaded; Researcher findings present.

**Work (Claude):** Draft `docs/foundation/product.md` using `compass/templates/foundation-product.md`. Populate: Vision/mission · Target users/personas · **Access & Data Posture (3 fields — see explicit elicitation below)** · Market positioning · North-star metric(s) · Strategic OKRs (annual + current quarter) · Out-of-scope (what we're NEVER building) · Hypothesis · **Defensibility / Moat (all 9 types with verdict yes/no/partial + rationale; primary moat(s) explicitly named)** · Measurement window (typically annual) · Check-in cadence (typically quarterly). Frontmatter: `type: foundational-product`, `status: proposed`.

**Access & Data Posture (mandatory — explicitly elicit; do not infer or defer):**
- Ask the user: *"What's the auth posture? (anonymous · registered · authenticated · MFA-required · regulated-identity)"*
- Ask the user: *"What's the data sensitivity scope? (none · public · PII · sensitive · regulated)"*
- Ask the user: *"What's the regulatory regime? (none · GDPR · HIPAA · SOC 2 · PCI DSS · sector-specific — name it · combination — name each)"*
- These are **product decisions architecture derives from** — don't defer to `/setup-foundation-architecture`. Capture answers in the template's Access & Data Posture section. **Per Principle #14 — silent skipping is the failure mode; this is named explicitly because foundational-product bets have historically failed to surface auth.**

**Postcondition (GATE):** `docs/foundation/product.md` exists. All required sections populated. Defensibility / Moat section has all 9 moat-type rows filled. **Access & Data Posture section has all 3 fields populated (auth posture, data sensitivity, regulatory regime) with a value OR explicit `n/a — <reason>`.** Frontmatter `status: proposed`.

### 6. PM seeds DRI log

**Precondition (GATE):** product.md drafted.

**Work (Claude):** PM seeds the DRI Log section with initial Decisions, Risks, Issues per `compass/roles/pm.md` DRI conventions.

**Postcondition (GATE):** product.md DRI Log has **≥1 PM Decision** entry. Risks and Issues populated as applicable.

### 7. Mirror to Confluence/Jira (optional — config-gated)

**Precondition (GATE):** DRI log seeded; `compass/config.yaml` `connectors.docs` and/or `connectors.ticketing` set.

**Work (Claude):** If mirroring enabled, push product.md as a strategic epic to configured docs/ticketing system. If disabled, skip — and log the skip explicitly as a DRI Decision in product.md ("mirroring not configured; skipped").

**Postcondition (GATE):** Either (a) epic exists in configured system with link captured, OR (b) skip logged as DRI Decision (per "no silent skips" — AGENTS.md principle #3).

### 8. HITL gate (hard stop)

**Precondition (GATE):** Every Verification item below passes.

**Work (Claude):** Halt. Tell user: "product.md is ready for review. Verification items all pass. Flip `status: proposed` → `status: approved` in frontmatter when ready."

**Postcondition (GATE):** product.md frontmatter `status: approved` (set by human, not Claude).

### 9. Project Manager updates docs/status.md

**Precondition (GATE):** product.md `status: approved`.

**Work (Claude):** Load `compass/roles/project-manager.md`. Append note to `docs/status.md` recording that the foundation product bet exists and is approved (with date).

**Postcondition (GATE):** `docs/status.md` mentions foundation product bet with approval date.

## Verification (final GATE — workflow cannot complete until all checked)

- [ ] (Step 1) State handled — no existing product.md, OR existing approved version renamed `product-v<N>.md` with `status: superseded`
- [ ] (Step 3) **Per Principle #14:** Researcher produced cited evidence (not log-and-walk-away) in **User pain**, **Competitive**, **Moat** — each citation is a real source (no "TBD" / "see R-N")
- [ ] (Step 3) **Per Principle #15** (cite-or-mark-n/a, 6-category Researcher framework): the remaining 3 categories (Technical, Quantitative, Trends) either cited OR explicit `n/a — <reason>`
- [ ] (Step 3) **Per Principle #15** (9-moat sub-framework): all 9 classic moat types evaluated — each row has verdict (yes / no / partial) AND rationale; empty rows fail; "not applicable" requires rationale
- [ ] (Step 3) Researcher DRI: **≥1 Decision AND ≥1 Risk** (Issues-only does not satisfy)
- [ ] (Step 5) `docs/foundation/product.md` exists with all required sections (Vision, Personas, Positioning, North-star, OKRs, Out-of-scope, Hypothesis, Defensibility/Moat, Measurement window, Cadence)
- [ ] (Step 5) **Primary moat(s) being bet on are explicitly named** in the Defensibility / Moat section
- [ ] (Step 5) **Access & Data Posture section populated** — all 3 fields (auth posture, data sensitivity, regulatory regime) have a value OR explicit `n/a — <reason>`. Empty values fail. Unjustified `n/a` fails. **Per Principle #15** (cite-or-mark-n/a enforcement) — and **Per Principle #14**, this is named explicitly because foundational-product bets have historically failed to surface auth (the auth gap that drove v0.3.1).
- [ ] (Step 5) Frontmatter: `type: foundational-product`, `status: proposed`
- [ ] (Step 6) PM DRI has ≥1 Decision entry
- [ ] (Step 7) Mirroring completed (epic linked) OR skip logged as DRI Decision
- [ ] (Step 8) **HITL gate:** human flipped `status: approved`. **Per Principle #16:** if any item above is unchecked, HITL gate cannot pass — refuse to proceed; tell user which item needs work
- [ ] (Step 9) `docs/status.md` mentions foundation product bet with approval date

Workflow is NOT complete until every item is checked.

## Output summary contract (mandatory to user)

- **TL;DR** — 3 lines max: product.md drafted / current status / HITL pending
- **Files created / modified** — table with path + change type
- **Next recommended command** — once approved: `/setup-foundation-architecture` (for new projects)
- **Open questions or risks** — surfaced during research / drafting (only if applicable)

## Notes

### Anti-patterns

- **Researcher log-and-walk-away** — filing missing research as DRI Issues instead of producing it. The deliverable is evidence, not "we should research X." (Closed by Step 3 postcondition + Verification principle #14 reference.)
- **Empty moat verdicts** — leaving any of the 9 moat types unevaluated. "Not applicable" is valid only with rationale. (Closed by Verification principle #15 reference.)
- **Vision-only without filling gaps** — if source material is vision-only, the Researcher must fill personas / market / metrics gaps, not log them as outstanding Issues.

### Edge cases

- **Amend mode** — if product.md exists with `status: approved`, user can amend (creates v2, supersedes v1). Existing file renamed `product-v<N>.md`, `status: superseded`. New v2 starts at `status: proposed` and goes through full HITL gate again. Handled in Step 1.
- **Mirroring disabled** — if `compass/config.yaml` connectors don't include docs/ticketing, Step 7 skipped and logged as DRI Decision (per "no silent skips").

### Migration (v0.3.0-alpha hardening)

- Translated to gate/work/postcondition template per v0.3.0-alpha. **Behavior preserved; structure only.**
- **Implicit preconditions made explicit:** "source material required" was inline in Step 4 free-text — now in workflow-level Preconditions with explicit refuse-and-redirect.
- **Postconditions added** where previously implicit: each step now has a mechanically-checkable output (the v0.2.x "Verification (mandatory)" section was the only mechanical checkpoint).
- **Verification items now reference principles #14, #15, #16 specifically** — each cite points at the exact output it enforces (not generic ceremony).
- Notes section now names anti-patterns explicitly (closes the convention-discovery-lag observation from retros).
- **No new steps. No removed steps. No new refusal cases beyond what was implicit. No removed refusal cases.**

---

_Workflow hardened 2026-05-26 (v0.3.0-alpha) per `compass/templates/workflow-template.md`. First workflow translated; template validation observations in `compass/workflows/improvements.md`._
