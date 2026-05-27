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

   **Signal consultation (load-bearing on amend; mostly n/a on initial draft).** In addition to *external* prior-art research above, consult **existing project signal**. Especially load-bearing for amend flows (v2+) — on the initial v1 draft, most categories will be trivially "n/a — greenfield" and that's expected. The 4 canonical categories:

   1. **Production observability (if applicable)** — current baselines via configured MCP (Sentry / Datadog / etc.). Current p95 / error rate / throughput for services in the foundational scope. Cite source URL or note "n/a — greenfield / no MCP configured".
   2. **Recent PR feedback** — Codex BLOCKERs / ISSUEs in foundational scope across the last ~10 PRs. Drift patterns? Repeated mistakes? Cite PR numbers or note "n/a — no PRs yet in this scope".
   3. **Prior architectural decisions across all bets** — search `docs/bets/*/architecture.md` for prior decisions that touch foundational scope. Reversibility flags honored? Any contradictions to flag? Cite the bet IDs or note "n/a — no bets yet".
   4. **Bet-architecture deviation pressure** — any open bet that triggered the deviation gate (step 7 of `/create-bet-architecture`) and is waiting on this foundational amend? Cite those bet IDs. On amend, the triggering bet usually appears here.
   5. **Team playbooks** — search `docs/playbooks/*` for prior stack-specific learnings relevant to this foundational scope (initial draft) or this amendment (amend flow). Match by `stack_combo` tags and topic. Each relevant playbook gets a citation in the Decision rationale. **"n/a — empty `docs/playbooks/` directory" is valid for first-project bootstrap.** Once the team has accumulated playbooks across projects, citing them is **mandatory** when stack overlap exists — playbooks are how hard-won learnings transfer between projects and Architects. Future-you reading this directory should never have to re-discover something a past sprint already learned the hard way.

   **Each consultation produces a citation in the Decision rationale OR an explicit "n/a — <reason>" note.** Empty findings are fine; uncited consultation is the violation (same enforcement shape as Researcher 6-category and Architect 6-pillar). Anti-pattern: "n/a" without a reason — must explain why the category doesn't apply.
7. **Derive foundational data model.** *Runs BEFORE stack choices — the DB choice should be informed by the data shape, not the reverse.* Establish the conventions every bet inherits:
   - **Core entity noun-set** — extracted from the product bet (who, what, when, transactions). Each entity traces back to a line in `docs/foundation/product.md`. Don't invent entities the product bet doesn't imply.
   - **Identity strategy** — UUID v7 / ULID / sequential / external IDs — with rationale.
   - **Tenancy model** — single-tenant / pooled / siloed / hybrid — derived from product bet personas and defensibility moats.
   - **Audit / event-sourcing posture** — full event log / change-data-capture / created-updated-only — derived from compliance + defensibility moats.
   - **Soft vs hard delete convention.**
   - **PII / sensitive-data handling** — what counts as PII, encryption at rest, retention windows. Links to Security pillar in the Fitness Functions table.
   - **Timestamps convention** — UTC, `created_at` / `updated_at` columns, etc.
   - **Migration strategy** — online / offline / blue-green / expand-contract — derived from Reliability and Operational excellence fitness functions.
   - **High-level ERD** — Mermaid `erDiagram` block showing entities + key relationships. Cardinality marked.
   No invented entities. No "we'll figure out tenancy later" — it shapes the DB choice, so decide now.
8. **Make project-level choices.** For every stack row (repo shape, backend language & framework, frontend framework, mobile framework, database, contracts format, auth model, deployment target, CI/CD platform, observability, secrets management, IaC), score against all 6 Well-Architected pillars with per-row rationale + **≥1 cited research reference**. Empty pillar cells fail verification. The **Database** row in particular must cite the foundational data model from step 7 — DB choice that doesn't reference the data model fails verification.
9. **Document constraints** explicitly: regulatory, team skill, performance, cost.
10. **Draft `docs/foundation/architecture.md`** using `compass/templates/foundation-architecture.md`. **Alternatives table evaluated against the declared fitness functions, not generic pros/cons. Strawmen explicitly disallowed.** Status: `proposed`. Frontmatter: `type: foundational-architecture`.
11. **DRI log seeded** with technology decisions (rationale + alternatives + reversibility), risks (vendor lock-in, scaling, compliance, cost), issues (open unknowns).
12. **Mirror to Confluence** as strategic technical doc (per config).

### Phase A Verification (mandatory — must pass before HITL gate)

- [ ] Fitness functions declared — ≥1 per pillar (6 minimum), each measurable (numbers, not adjectives)
- [ ] Foundational data model section present
- [ ] Every entity in the noun-set traces back to a line in the product bet (no invented entities)
- [ ] Identity strategy, tenancy model, audit posture, delete convention, PII handling, timestamps convention, migration strategy all decided (not "TBD")
- [ ] Mermaid `erDiagram` present with cardinality marked
- [ ] Every stack row scored on all 6 pillars with per-row rationale — empty cells fail
- [ ] Every stack row cites ≥1 architecture-research reference — "smart default" / "team preference" does not satisfy
- [ ] Database row in the Stack table cites the foundational data model
- [ ] Alternatives evaluated against the declared fitness functions (not generic pros/cons, not strawmen)
- [ ] Enterprise/Solution Architect DRI has ≥1 Decision AND ≥1 Risk entry
- [ ] Architecture-research findings present (in arch doc or `docs/foundation/architecture-research.md`)
- [ ] **Signal consultation present** — all 5 categories (production observability, recent PR feedback, prior architectural decisions across bets, bet-architecture deviation pressure, team playbooks) have either a citation OR an explicit "n/a — <reason>" note. Blank cells fail. "n/a" without a reason fails.
- [ ] **If `version > 1` (amend flow):** the `ADR / Amendments` section in `docs/foundation/architecture.md` has at least one new ADR entry for this amendment, with the triggering bet (or other source) cited.
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

13. **Plan scaffolding** — present every file that will be created, grouped by purpose (entrypoints, configs, CI, etc.). **Wait for explicit user confirmation before writing** (the "no silent writes" pattern from `AGENTS.md` #11).
14. **Scaffold the repo** (after confirmation): boundary folders, CI/CD configs, base configs.
15. **Populate `compass/config.yaml`** with team decisions from Phase A.
16. **Deploy canaries (load-bearing — one per target).** For **each deploy target** named in the foundational architecture's Stack table — web (URL), mobile (dev-build artifact link), container (registry image), service endpoint, or other — produce a canary that proves the stack actually composes for *that target*. Capture each in `compass/config.yaml` `ci_cd.canary_artifacts[]` with `{kind, url, verified_at, notes?}`. Kinds: `web` | `mobile` | `container` | `other`.

    **Multi-target projects need one entry per target.** A typical full-stack consumer app (web + mobile) needs both a web URL and a mobile dev-build link. A backend service needs both a deployed endpoint and (if shipping client SDKs) a published-package link. Single-target projects need exactly one entry.

    **If any target's canary fails, treat as a Phase A blocker** — that target's architecture choice doesn't actually deploy yet, which means a downstream feature bet on that target will discover the same failure at the worst possible time (e.g., AC blocked on missing dev-build mid-sprint). Loop: fix the Phase A architecture (additional ADR / Amendments entry naming what changed), re-scaffold the affected pieces for that target, re-canary. Don't proceed to step 17 until **all targets** are green.

    *Why this is load-bearing:* foundational architecture choices that look fine on paper (Turborepo + pnpm + Vercel + Next.js; or Expo SDK 52 + EAS + dev-build + AASA + assetlinks; or Postgres + region X + extension Y) often don't compose on first contact with the actual deploy pipeline — and the failure can hide on one target while another target ships fine. Multi-round deploy debugging mid-project is the most expensive class of failure this gate prevents. A stack that doesn't deploy on every claimed target isn't a stack.
17. **Summarize what was written** — table of files + purpose, plus the deploy canary URL.

### Phase B Verification

- [ ] All files in the scaffold plan were listed before any write
- [ ] User explicitly confirmed the plan
- [ ] Written-files summary table produced
- [ ] `compass/config.yaml` populated with Phase A decisions
- [ ] **Deploy canaries green for every target** — every deploy target named in the foundational architecture's Stack table has a corresponding entry in `compass/config.yaml` `ci_cd.canary_artifacts[]` with `{kind, url, verified_at}` populated. Multi-target projects (web + mobile + service + …) must have one entry per target — partial coverage fails. If any target's canary failed, returned to Phase A with an ADR entry naming the cause; did not proceed.

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
- **After Phase B, for new projects: run `/create-bet-portfolio`** to draft the MVP bet wedge (3-6 stubs + dependency graph) before any single bet is fully scoped. For mid-project additions of a single bet, use `/create-brief` directly.
