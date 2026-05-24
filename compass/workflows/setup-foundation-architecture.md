# Workflow: /setup-foundation-architecture

Creates the **foundational architecture bet** — the platform's load-bearing technical decisions as a bet. Requires foundational product bet to be `approved` first.

This workflow runs in **two phases separated by a HITL approval gate**:

- **Phase A — Decide & Document.** Derive fitness functions, do architecture research, score every stack choice against the Well-Architected pillars, draft the architecture document. **No code is written. Nothing in the repo changes except docs.**
- **HITL approval gate** — human reviews and approves the architecture document.
- **Phase B — Scaffold.** Runs only after Phase A is approved. Plans the scaffold, confirms with user, writes boundary folders + CI/CD + base configs.

Scaffolding is hard to reverse. It must wait on explicit approval of the architecture itself.

## Trigger

`/setup-foundation-architecture` after `/setup-product` is approved.

## State detection (before any step)

| State                                                  | Action                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `docs/foundation/architecture.md` missing              | Run Phase A                                                             |
| arch doc exists, `status: proposed`                    | **Refuse.** Tell user to approve, reject, or amend before re-invoking.  |
| arch doc `approved`, scaffold not done                 | Run Phase B                                                             |
| arch doc `approved`, scaffold done                     | No-op. If user wants changes, run amend flow (creates v2).              |

Scaffold-done is detected by presence of boundary folders matching the approved architecture + `compass/config.yaml` entries from this round.

---

## Phase A — Decide & Document

### Process

1. **Verify gate:** `docs/foundation/product.md` exists with `status: approved`. If not, **refuse** and tell user to run `/setup-product` first.
2. **Check state:** if `docs/foundation/architecture.md` exists with `status: approved`:
   - Ask user: amend (creates v2) or abort?
   - If amend: rename existing to `architecture-v<N>.md`, mark `superseded`
3. **Load Enterprise/Solution Architect role context** (`compass/roles/enterprise-architect.md`)
4. **Read foundational product bet** for product context: target users, market positioning, defensibility moats, north-star metric, guardrails, measurement window, regulatory needs.
5. **Derive fitness functions** from the product bet. **≥1 per Well-Architected pillar (6 minimum), each measurable in numbers — not adjectives.** Examples per pillar:
   - **Reliability:** target uptime, MTTR, RPO/RTO
   - **Security:** auth model, data-at-rest posture, compliance posture (HIPAA / SOC 2 / FedRAMP / none)
   - **Performance efficiency:** p95 latency, concurrent users, throughput
   - **Cost optimization:** cost-per-user ceiling, year-1 infra budget
   - **Operational excellence:** deploy frequency, on-call burden, observability coverage
   - **Sustainability:** carbon-per-request budget or hosting-region constraints (if applicable; "not load-bearing" is a valid answer for early-stage)
   These are the architecture bet's falsification criteria.
6. **Architecture research.** EA produces evidence across all 6 architecture-research categories (see `compass/roles/enterprise-architect.md` → "Where to research"). **"Smart default" / "team preference" is NOT a substitute** — mirrors the ban on Researcher's log-and-walk-away. Findings live in `docs/foundation/architecture.md` under "Architecture Research" OR in a standalone `docs/foundation/architecture-research.md` if substantial.
7. **Make project-level choices.** For every stack row (repo shape, backend language & framework, frontend framework, mobile framework, database, contracts format, auth model, deployment target, CI/CD platform, observability, secrets management, IaC), score against all 6 Well-Architected pillars with per-row rationale + **≥1 cited research reference**. Empty pillar cells fail verification.
8. **Document constraints** explicitly: regulatory, team skill, performance, cost.
9. **Draft `docs/foundation/architecture.md`** using `compass/templates/foundation-architecture.md`. **Alternatives table evaluated against the declared fitness functions, not generic pros/cons. Strawmen explicitly disallowed.** Status: `proposed`. Frontmatter: `type: foundational-architecture`.
10. **DRI log seeded** with technology decisions (rationale + alternatives + reversibility), risks (vendor lock-in, scaling, compliance, cost), issues (open unknowns).
11. **Mirror to Confluence** as strategic technical doc (per config).

### Phase A Verification (mandatory — must pass before HITL gate)

- [ ] Fitness functions declared — ≥1 per pillar (6 minimum), each measurable (numbers, not adjectives)
- [ ] Every stack row scored on all 6 pillars with per-row rationale — empty cells fail
- [ ] Every stack row cites ≥1 architecture-research reference — "smart default" / "team preference" does not satisfy
- [ ] Alternatives evaluated against the declared fitness functions (not generic pros/cons, not strawmen)
- [ ] Enterprise/Solution Architect DRI has ≥1 Decision AND ≥1 Risk entry
- [ ] Architecture-research findings present (in arch doc or `docs/foundation/architecture-research.md`)
- [ ] Status: `proposed`

If any unchecked, Phase A is NOT complete. **HITL approval cannot pass while any verification item is unchecked.**

### HITL Gate — hard stop between phases

Workflow **halts here**. Human reviews the architecture document(s) and flips status `proposed` → `approved`.

**No scaffolding has been written. No `compass/config.yaml` populated. Nothing in the repo has changed except the docs.** This is deliberate — scaffolding creates the project's bones and is hard to reverse, so it waits on explicit approval of the architecture itself.

If HITL rejects: amend (creates v2) or abort. **No scaffold runs on a rejected or pending architecture.**

---

## Phase B — Scaffold

Runs only when `docs/foundation/architecture.md` has `status: approved` AND scaffold has not yet been written (per State detection above).

### Process

12. **Plan scaffolding** — present every file that will be created, grouped by purpose (entrypoints, configs, CI, etc.). **Wait for explicit user confirmation before writing** (the "no silent writes" pattern from `AGENTS.md` #11).
13. **Scaffold the repo** (after confirmation): boundary folders, CI/CD configs, base configs.
14. **Populate `compass/config.yaml`** with team decisions from Phase A.
15. **Summarize what was written** — table of files + purpose.

### Phase B Verification

- [ ] All files in the scaffold plan were listed before any write
- [ ] User explicitly confirmed the plan
- [ ] Written-files summary table produced
- [ ] `compass/config.yaml` populated with Phase A decisions

---

## Output

**After Phase A:**
- `docs/foundation/architecture.md` with `status: proposed` (or `approved` after HITL)
- Optionally `docs/foundation/architecture-research.md`
- Mirrored to docs system per config

**After Phase B:**
- Repo scaffolded with boundary folders, CI/CD config
- `compass/config.yaml` populated with team decisions

## Refusal cases

- `docs/foundation/product.md` missing or not approved → refuse Phase A
- `docs/foundation/architecture.md` exists with `status: proposed` → refuse re-invocation; user must approve, reject, or amend
- User refuses to make any technology choices → refuse Phase A
- Phase B invoked before Phase A approved → refuse

## Notes

- This is the most consequential setup — technology choices here are hard to reverse.
- Enterprise/Solution Architect documents reversibility honestly on every choice; the architecture-research framework requires evidence-backed reversibility claims (category 6).
- After Phase B, `/create-brief` can run.
