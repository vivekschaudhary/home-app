# Workflow: /setup product

Creates the **foundational product bet** — the company / product mission as a measurable bet. Must run before `/setup architecture`.

## Trigger

`/setup product` on a new repo (or to amend foundation with versioning).

## Process

1. **Check state.** If `docs/foundation/product.md` exists:
   - Ask user: amend (creates v2, supersedes v1) or abort?
   - If amend: rename existing to `product-v<N>.md`, mark status `superseded`
2. **Load PM role context** (`compass/roles/pm.md`)
3. **Researcher MUST engage — always.** Load `compass/roles/researcher.md`.
   - For a foundational product bet, mandatory research categories:
     - User pain
     - Competitive
     - **Moat / defensibility (ALL 9 classic moat types evaluated, even if some are "not applicable")**
   - Researcher's job: verify source material covers users, market positioning, success metrics, AND defensibility
   - Mandatory output: research findings (in brief or standalone `docs/foundation/research.md`)
   - **No silent skip on moat analysis.** Foundational bets without defensibility analysis are reckless.
4. **Gather source material:**
   - Ask user for sources (Confluence link, Google Drive doc, notes, free text)
   - Read via MCP
5. **Draft foundational product bet** using `compass/templates/foundation-product.md`:
   - Vision / mission
   - Target users / personas
   - Market positioning
   - North-star metric(s)
   - Strategic OKRs (quarterly + annual)
   - Out-of-scope (what we're NEVER building)
   - Hypothesis (the foundational bet)
   - Measurement window (typically annual for foundational)
   - Check-in cadence (typically quarterly)
   - Frontmatter: `type: foundational-product`, `status: proposed`
6. **DRI log** with initial decisions, risks, issues
7. **Mirror to Confluence/Jira** as a strategic epic (optional, per config)
8. **HITL gate** — human reviews and marks `status: approved`
9. **Project Manager updates `docs/status.md`** noting foundation product bet exists

## Output

- `docs/foundation/product.md` with status `proposed` → `approved` after HITL
- Mirrored to Confluence/Jira per config
- `docs/status.md` updated

### Verification (mandatory)

Before marking workflow complete:
- [ ] `docs/foundation/product.md` exists with all required sections, including Defensibility / Moat
- [ ] All 9 moat types evaluated in the Defensibility section (yes / no / partial + rationale)
- [ ] Primary moat(s) being bet on are named
- [ ] Researcher findings present
- [ ] DRI Log has entries from PM AND Researcher
- [ ] Status: proposed

If any unchecked, workflow is NOT complete.

## Refusal cases

- `docs/foundation/product.md` exists with `status: proposed` (still in review) — abort, tell user to approve or reject existing first
- User provides no source material AND no free text — ask for at least a vision sentence

## Notes

- This bet's metrics roll up everything else. Treat it carefully.
- Architecture cannot run until this is `approved`.
