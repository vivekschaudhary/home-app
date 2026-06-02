# AGENTS.md

Read by every AI tool working in this repo (Claude Code, OpenAI Codex CLI, Cursor, Cline, Windsurf, GitHub Copilot, Aider, future tools). The **source of truth** for Compass rules. If a tool-specific config conflicts with this file, this file wins.

## What this project uses

**Compass** — a product development framework where every initiative is a measurable bet. Work flows: brief → architecture → story → build → review → release → measure. Roles load context per phase. One tool implements; another tool reviews.

The framework lives in `compass/`:

- `compass/roles/` — 12 role definitions
- `compass/workflows/` — phase flows
- `compass/templates/` — artifact templates
- `compass/config.yaml` — team decisions

Artifacts the framework produces live in `docs/`:

- `docs/foundation/` — foundational product & architecture bets
- `docs/bets/<bet-id>/` — all bets, parent linkage via frontmatter
- `docs/sprints/` — weekly release comms
- `docs/metrics/` — cached snapshots
- `docs/ops/`, `docs/fixes/`, `docs/incidents/` — standalone (hygiene, etc.)

## Tool division of labor

**Configurable per role; default = Claude implements, Codex reviews.** Per `[agent-agnostic-role-assignment]` (`compass/framework/canon.md`, v0.3.8). The actual per-role agent picks live in `compass/config.yaml` under `tool_assignments:`, validated against the `agents:` registry. To use a different agent for any role, edit the value — no other framework files need to change at the consumer level.

**Supported agents (registry in `compass/config.yaml`):**

| Agent | Invocation | Production-ready? |
| ----- | ---------- | ----------------- |
| `claude` (Claude Code) | CLI / IDE plugin; reads local files automatically | Yes |
| `codex` (Codex CLI) | CLI; reads `.codex/prompts/<role>.md` | Yes |
| `openai` (ChatGPT / GPT API) | API call with role file as system prompt; Custom GPT; manual paste | API mature |
| `gemini` (Google Gemini CLI) | CLI; mirrors codex with `.gemini/prompts/<role>.md` | Yes |
| `deepseek` | DeepSeek API | API mature |
| `codestral` (Mistral) | Mistral API | API mature |
| `apple` | Manual paste into Apple Intelligence | ⚠ Marked `unsupported: true` — system-level features only, no open API for arbitrary role-playing |
| `custom` | User-defined invocation | Escape valve |

**Default configuration (out of the box):**

| Role category | Default agent | Why |
| ------------- | ------------- | --- |
| Implementer roles (engineer, architect, etc.) | `claude` | Claude Code's local-file reading + IDE integration is mature for code work |
| Reviewer roles (reviewer, security_reviewer) | `codex` | **Independent model** — different from implementer; see structural rationale below |
| Product roles (pm, researcher, designer, ux_writer, etc.) | `claude` | Default; user often overrides to `openai` or `gemini` for varied perspective |
| Tech writer | `claude` | Default; can swap to any other agent without risk |

Reviewer findings are real. Disputes go to PM, not auto-resolved by either tool.

**Why the reviewer split is structurally load-bearing, not procedural.** Same-model reviewer + same-model author share aesthetic priors — blind spots, assumptions about "clean code," default architectural patterns, "looks right" intuitions. A reviewer with identical priors can miss what an independent-model reviewer catches. **Empirically validated during aura-app CB-1.4 (2026-06-01):** user ran the same diff through both Codex (different model than Engineer) and Claude (same model as Engineer) as reviewers; Codex outperformed. This is not "pick whichever reviewer is cheaper" — switching to a same-model reviewer for cost reasons re-introduces the blind-spot overlap the framework exists to close. **The `tool_assignments.reviewer` value must be a different agent than `tool_assignments.engineer`** — this is enforced semantically by the agent-pairing constraint, not by a config validator (yet). The `compass/scripts/agent-handoff.yml` template ships Codex default-enabled for this structural reason, not ergonomic preference; the Claude-headless block is documented as a fallback for teams without Codex access, **not an equivalent alternative**. Same logic applies to any future role-pairing — Engineer + Reviewer is the canonical instance; Architect-pair, Researcher-pair, or other multi-agent reviews inherit the same constraint.

**How to override defaults.** Edit `compass/config.yaml` `tool_assignments:` — any agent key from the `agents:` registry is valid for any role (subject to the independent-model constraint above). Example overrides:

```yaml
tool_assignments:
  pm:                  openai     # ChatGPT for PM work
  researcher:          openai     # ChatGPT for research
  designer:            gemini     # Gemini for design decisions
  engineer:            claude     # Claude for engineering (default)
  reviewer:            codex      # MUST differ from engineer
  ...
```

**Honest scope of v0.3.8.** The registry + defaults + per-role assignments are **declarative** today. `compass/config.yaml` is the source of truth; downstream prose still hardcodes the Claude+Codex split in ~10 files (this AGENTS.md section being the first to derive from config). v0.3.9 ships per-agent adapter docs at `compass/agents/<agent>.md`; v0.3.10 ships a `compass/scripts/setup-agent.py` propagation script that generates per-agent prompt directories from `tool_assignments`. Until then, picking a non-default agent for a role still requires manual setup of that agent's prompt files / invocation pattern (see registry `note:` for each agent).

## The 13 roles

| Role                                       | Where defined                           |
| ------------------------------------------ | --------------------------------------- |
| Product Manager (merged PM + PO)           | `compass/roles/pm.md`                   |
| Researcher                                 | `compass/roles/researcher.md`           |
| Support                                    | `compass/roles/support.md`              |
| Designer                                   | `compass/roles/designer.md`             |
| UX Writer                                  | `compass/roles/ux-writer.md`            |
| Architect (per-bet)                        | `compass/roles/architect.md`            |
| Enterprise/Solution Architect              | `compass/roles/enterprise-architect.md` |
| Engineer (writes unit/API/component tests) | `compass/roles/engineer.md`             |
| Reviewer (Codex; writes E2E + automation)  | `compass/roles/reviewer.md`             |
| Security Reviewer (Codex)                  | `compass/roles/security-reviewer.md`    |
| Tech Writer                                | `compass/roles/tech-writer.md`          |
| Project Manager                            | `compass/roles/project-manager.md`      |
| Scanner (read-only; produces findings)     | `compass/roles/scanner.md`              |

Load the role's full definition when playing it. Do not pattern-match — read the file.

## Workflow structure

Every v0.3+ workflow follows the canonical shape defined in `compass/templates/workflow-template.md`. This is the structural instantiation of Principle #14 — making the constraint that "load-bearing checks must be mechanically verifiable" structural rather than aspirational.

The template enforces:

- **Header** — `status` (active / deprecated / experimental), `owner` role, `auto_invokes`, `invoked_by`, `version`.
- **Framework grounding** — cites the canonical frameworks the workflow operationalizes (industry standards with year + source; books with author/title/year; Compass-originals honestly labeled; cross-cutting principles enforced). Anchors each workflow's gates in auditable lineage rather than ad-hoc invention. Citations use short-form pointing at `compass/framework/canon.md`.
- **Purpose** — one sentence naming what the workflow does and the artifact it produces.
- **Preconditions (workflow-level GATE)** — mechanically-checkable conditions checked once at start; each failure case has an explicit refuse-and-redirect.
- **Roles invoked** — role files loaded during execution.
- **Steps as gate/work/postcondition triplets** — every step has (a) a Precondition gate before the work runs, (b) the Work itself with a specific output contract, (c) a Postcondition gate that's mechanically checkable.
- **Verification checklist (final GATE)** — mirrors every step's postcondition + workflow invariants; references cross-cutting principles (#14, #15, #16) specifically where applicable; the workflow cannot complete until every item is checked.
- **Output summary contract** — same shape across all workflows (per principle #12); TL;DR + files-modified table + next-recommended-command + open-questions.
- **Notes** — named anti-patterns + edge cases + migration notes.

**Hardening rollout:** workflows translate to the template one at a time, deliberate pace. `/setup-product` was hardened first (v0.3.0-alpha) — already the most disciplined workflow, ideal for validating the template on the easy case before harder workflows (`/build`, `/create-brief`) translate. Each translation is structural-only by rule — same steps, same artifacts, same gates, same refusal cases.

**Hardening budget — measured by load-bearing density, not raw length.** A hardened workflow can grow significantly in line count if the growth is **load-bearing content** (preconditions, postconditions, Verification items, anti-patterns, framework citations, specific principle scoping). The check isn't "is it longer?" — it's: **does each line earn its place by adding mechanically-checkable constraint, named convention, or auditable lineage?** Heuristic: load-bearing density should be ≥ 1 per ~4 lines (original `/setup-product` was 1 per 3.6; hardened `/setup-product` with framework grounding is 1 per 3.2 — *denser*). If density drops materially below the original, the template is adding ceremony, not constraint — flag in the workflow's Notes → Edge cases and propose template adjustment.

**Elicitation pattern — when a workflow surfaces choices to the user, use [elicitation-with-options].** Named Compass-original pattern in `compass/framework/canon.md`. When the workflow's job at a step is to capture a genuine user decision (stack picks, configuration choices, posture declarations), present **3 widely-used options + "Other (specify)" escape valve** rather than drafting with "smart defaults" and asking the user to approve. First decision is **static** (anchor — same 3 options regardless of context); subsequent decisions **cascade** (options biased by prior picks for coherent combinations). Each pick is captured with rationale. Replaces the rationalization surface that "smart defaults" leaves open (per principle #14). First instance: `/setup-foundation-architecture` v0.3.2 (anchor + 4 cascading stack-layer elicitations).

**Freshness pattern — when a workflow depends on a doc that references external-tool formats / APIs / conventions, use [freshness-check].** Named Compass-original pattern in `compass/framework/canon.md`. The referenced doc gets frontmatter markers (`last_verified`, `freshness_window_days`, `external_source`); the workflow adds a Precondition that refuses if the doc is stale, pointing the user at the external source + the file to update. Closes the soft-spec-rationalization surface where Compass docs silently go stale against evolving external tools. **Pull-bridge round 1** of three: v0.3.3 = workflow-side date check (current); **round 2 — shipped v0.3.7** (after 3 consecutive slips): framework-side detection via `compass/scripts/check-freshness.py` + `.github/workflows/freshness-check.yml` runs weekly on Compass repo, auto-bumps `last_verified` where external source is unchanged, flags otherwise, opens PR/Issue for review. **Round 3 (v0.4+):** distribution — Compass framework updates auto-propagate to consuming repos as PRs (still deferred; multi-consumer reality observed in v0.3.7 cycle strengthens the case). First instance of workflow-side: Codex review format in `/build` Phase 5 (reads `compass/roles/reviewer.md` freshness). v0.3.6 added **review-time application** — Codex re-verifies load-bearing framework claims in stories against current primary docs at review time.

**Role-boundary pattern — when a workflow transitions between roles, mark the transitions with [role-boundary] HTML-comment anchors.** Named Compass-original pattern in `compass/framework/canon.md`. Markers shape: `<!-- COMPASS_ROLE_BOUNDARY: <enter|exit> | role=<name> | workflow=<id> | step=<N> -->`. The markers serve two purposes — documentation for translators (explicit role transitions) and parser anchors for the reference token-usage parser at `compass/scripts/token-usage.py` (attributes Claude Code session tokens to roles for cost transparency, role optimization, debugging, team reporting). **PM-owned by convention** (matches existing `/status` + `/plan` ownership). First instance: `/build` (Engineer + Codex + Tech Writer markers across Phase 1–7). Accuracy is rough, not exact — Round 1 is workflow-marker + parser; richer attribution lands when AI-tool integration matures.

**Agent-handoff pattern — when a workflow routes work between AI agents, document the handoff per [agent-handoff] and ship CI automation.** Named Compass-original pattern in `compass/framework/canon.md`. 5-piece shape: **trigger artifact · trigger event · context window · output medium · loop signal** — names every piece so the user is not the bridge. Compass ships a reference GitHub Actions template at `compass/scripts/agent-handoff.yml` parameterized over the reviewer agent (Codex / Claude headless / Gemini / generic); consuming repos copy to `.github/workflows/`, pick one reviewer block, set the matching API-key secret. **Agent-agnostic by design** — pattern abstracts over which AI plays the reviewer role. Manual fallback always stays documented; automation is opt-in per repo. First instance: `/build` Phase 5 step 13 (Engineer → Codex via PR + GitHub Actions; manual fallback retained). Vendor CLI install commands + flags are drift-prone — sibling README tracks `last_verified` per `[freshness-check]`.

**Mechanical-output-verification pattern — when a workflow requires a build, deploy, or framework-discovery step, the postcondition is inspection of the build OUTPUT, not just the build PROCESS exit code.** Named Compass-original pattern in `compass/framework/canon.md` (v0.3.6). Source intent and build output can diverge silently — the build process completes cleanly while the runtime configuration drops what the source declared. **Inspect the artifact that actually runs.** Framework-specific anchors: Next.js 16 (`.next/server/functions-config-manifest.json` — `/_middleware` entry; routes/app-paths/prerender manifests); pre-v16 Next (legacy `middleware-manifest.json` — empty by design on 16.x); Vercel Functions (`.vercel/output/functions/`); Expo prebuild native config + bundle. General principle: when runtime configuration is data-driven (manifests, bundle indexes, config JSON written by the build), reading source ≠ reading runtime — inspect the runtime. Closes the **`polished-but-broken`** anti-pattern (tests pass + build green + narrative coherent + behavior wrong). **4th enforcement-class Compass-original** (joining cite-or-mark-n/a · refuse-escalate · soft-spec-hardening). Applied: `/build` Phase 2 step 7 (Engineer self-check) + `compass/roles/reviewer.md` Step 0 (Codex review process — framework-registration check before functional analysis). Compass-originals catalog now spans **five shapes**, balance **4 enforcement : 4 usability** (interaction · freshness · observability · handoff).

**Scope-discipline patterns govern Compass's own scope at framework design time** (release planning, codification decisions, roadmap deferrals), distinct from the 5 workflow-execution shapes (enforcement · interaction · freshness · observability · handoff). **Catalog now spans 6 shapes / 11 patterns:** enforcement (4) · interaction (1) · freshness (1) · observability (1) · handoff (2) · **scope-discipline (2)**. Workflow-execution patterns total 9; scope-discipline patterns total 2. Ratio: 9 workflow-execution : 2 scope-discipline. **The scope-discipline shape is now structurally validated, not a one-off** — v0.3.9 introduced the shape with `[declare-not-implement]`; v0.3.10 grew it to 2 members with `[hard-line-declaration]`.

**`[declare-not-implement]` (v0.3.9) — when Compass would build an integration with external tools/agents/services, declare the pattern + registry + manual fallback instead of writing the integration.** Two instances: (1) v0.3.5 `[agent-handoff]` declared 5-piece handoff shape + template with commented reviewer blocks; consumer wires per-CLI integration. (2) v0.3.8 same-day correction — declared `agents:` registry + delegated API-based-agent adapter layer to upstream libraries (LiteLLM / Vercel AI SDK / OpenRouter / LangChain); refused per-agent adapter docs duplicating upstream. **Anti-pattern: `integration-creep`** — integration scope grows linearly with integration count; Compass-maintainer scope does not. **Load-bearing oversight is the user** — v0.3.8's same-day correction was caught by user, not framework alone.

**`[hard-line-declaration]` (v0.3.10) — when Compass commits to shipping something in a future release, the commitment gets explicit slip-counters + named consequences in CHANGELOG entries and improvements.md headers.** Mechanical structure: (1) counter visibility in load-bearing place; (2) named consequence at N+1 slip; (3) structural pressure overcomes the diffuse "next substantive release is more important" rationalization. Two instances: (1) freshness detection 3-slip → v0.3.7 ship (v0.3.6 CHANGELOG hard line worked). (2) Retro cadence 2-slip → Retro #005 on time (Retro #004 hard line worked). **Anti-pattern: `commitment-drift`** — each individual slip is defensible; the cumulative pattern is rationalization. Applied at framework design time, not workflow execution. Distinct from Principle #16 refuse-escalate (within-workflow scope) — hard-line-declaration creates structural pressure on roadmap commitments across releases.

**New framework directory: `compass/scripts/`.** Reference utility scripts and templates that complement workflows. Each script/template single-file + stdlib-only + operator-friendly. Current entries: `token-usage.py` (per-role token rollup, PM-owned); `agent-handoff.yml` (GitHub Actions reviewer template). Add entries here only when problems are structurally hard to solve with markdown docs alone.

If a step genuinely resists clean triplet separation, document the friction in the workflow's Notes → Edge cases (don't bend the triplet to fit). Template ergonomics get re-evaluated periodically based on accumulated friction.

## The 17 workflows

| Workflow                            | Command                 | Where defined                                        |
| ----------------------------------- | ----------------------- | ---------------------------------------------------- |
| Setup foundational product bet      | `/setup-product`                  | `compass/workflows/setup-product.md`                 |
| Setup foundational architecture bet | `/setup-foundation-architecture`  | `compass/workflows/setup-foundation-architecture.md` |
| Create MVP bet portfolio (bootstrap) | `/create-bet-portfolio`          | `compass/workflows/create-bet-portfolio.md`          |
| Create a new bet (brief)            | `/create-brief`                   | `compass/workflows/create-brief.md`                  |
| Create bet-level architecture       | `/create-bet-architecture`        | `compass/workflows/create-bet-architecture.md`       |
| Refresh the living project plan     | `/plan`                           | `compass/workflows/plan.md`                          |
| Continuous quality scanner          | `/scan`                           | `compass/workflows/scan.md`                          |
| Generate single-file HTML dashboard | `/dashboard`                      | `compass/workflows/dashboard.md`                     |
| Batch retro of improvements         | `/retro`                          | `compass/workflows/retro.md`                         |
| Create a story under a bet          | `/create-story`         | `compass/workflows/create-story.md`                  |
| Build a story                       | `/build <story-id>`     | `compass/workflows/build.md`                         |
| Fix a bug                           | `/fix <ticket-or-text>` | `compass/workflows/fix.md`                           |
| Respond to an incident              | `/triage <alert>`       | `compass/workflows/triage.md`                        |
| Make a non-code/ops change          | `/ops <description>`    | `compass/workflows/ops.md`                           |
| Project status                      | `/status`               | `compass/workflows/status.md`                        |
| Top-down metrics                    | `/metrics`              | `compass/workflows/metrics.md`                       |
| Measure a bet (cron)                | `/measure <bet-id>`     | `compass/workflows/measure.md`                       |

## Bet hierarchy

All bets live in `docs/bets/<bet-id>/` (flat by ID, Jira-style). Hierarchy via `parent:` frontmatter field.

```
Foundational Product Bet
  └─ OKR Bets (quarterly)
        └─ Feature Bets
              └─ Stories
                    ├─ implementation
                    ├─ tests
                    ├─ fixes
                    ├─ ops
                    └─ incidents

Foundational Architecture Bet
  └─ Architectural Initiative Bets
        └─ Stories
```

Every bet has a `type` field: `foundational-product | foundational-architecture | okr | feature | architectural-initiative | tech-debt | continuous-improvement`.

Every bet has an outcome: `won | learning | inconclusive`.

## Cross-cutting principles (always)

1. **Every artifact has a status field** — drives lifecycle and workflow gates
2. **Traceability end-to-end** — every output links back to its source
3. **No silent skips** — declined engagement or skipped phases logged as DRI decisions
4. **DRI logging at every stage** — Decisions, Risks, Issues (rationale + area tag + likelihood/impact + severity + owner all mandatory)
5. **Cron jobs owned by Enterprise/Solution Architect**
6. **Configuration as data** — all team decisions in `compass/config.yaml`
7. **Framework upgrades are explicit and versioned** — `compass/` changes are events
8. **Discipline holds under pressure** — no reduced review during incidents or P0 work
9. **HITL approval at every milestone** — configurable level but mandatory at brief approval, design + copy approval, tech design approval, merge, release
10. **Claude implements, Codex reviews** — independent models, PM arbitrates disputes
11. **No silent writes** — when a workflow writes files outside the primary artifact it's producing, it must: (a) list every file before writing, (b) wait for user confirmation, (c) summarize what was written at the end. Drafting the named artifact is expected; everything else is a side effect requiring visibility.
12. **Structured, scannable responses** — every workflow output to the user follows this shape:
    - **TL;DR** at the top (2-3 bullets max)
    - **What I did** — brief list of actions taken / files created
    - **What's next** — single clear instruction for the user (approve / edit / run command X)
    - **Open questions or risks** (only if applicable)

    No walls of prose. No multi-paragraph narration. Use tables for lists, bullets for steps, code blocks for commands. The user should be able to scan the response in under 10 seconds and know exactly what to do next.

13. **Continuous quality scanning with confidence levels** — Compass runs a **Snyk-style scanner** across six SDLC phases. The scanner produces **findings, not failures**: each finding has severity (Critical / High / Medium / Low) + confidence (High / Medium / Low) + location + reason + fix. Suppressions, not overrides — every suppression logged in DRI with rationale; some Critical findings are non-suppressible (e.g., PII without privacy review, missing legal review on T&C changes). **All measurement is automatic** — derived from artifact existence, content depth, CI data, or MCP corroboration. No manual self-assessment.

14. **Soft spec → AI rationalization is a vulnerability surface, not flexibility.** Anywhere an agent has interpretive room, it will exercise judgment that diverges from intent under load. Constraints described as "implied," "obvious," "best practice," "ensure," "consider," or "verify" get rationalized away. **The fix is never "tell the agent to be better."** Every load-bearing constraint requires three structural elements in the workflow file:

    1. **Explicit imperative language** — "do NOT" / "must" / "required" — with the failure mode spelled out concretely (not "be careful with X" but "do NOT X; X is a spec violation, not an optimization")
    2. **Mechanical verification gate** — a checklist item in Verification (mandatory) that blocks status advance and cannot be hand-waved
    3. **Named anti-pattern** — the failure mode gets a short, memorable name in the workflow's Notes or Anti-patterns section so future agents reading the workflow inherit the vocabulary

    Specs that depend on agent judgment will eventually be wrong. Specs with these three elements survive contact with the next invocation. **This is the foundational principle that the other hardening principles (#15, #16) instantiate.** Periodic retros (`/retro` every 5 improvements) exist precisely to surface where the framework still has interpretive room that recurred across multiple patches.

15. **N-category `cite-or-mark-n/a` enforcement for structured consultation.** When a role's deliverable depends on consulting multiple kinds of evidence (research sources, architectural pillars, signal sources, UX coverage dimensions), the spec enumerates N named categories and requires each to produce **either a citation OR an explicit `n/a — <reason>` note**. **Empty cells fail. Unjustified `n/a` fails.** Current instances: Researcher 6-category (user pain / competitive / technical / quantitative / trends / moat); Architect 6 Well-Architected pillars + 6 architecture-research categories; Architect 5-category signal consultation; Story 6-category Standard Experience checklist. New roles that gather structured evidence should adopt this shape — N varies by domain, but the cite-or-n/a-with-reason enforcement is invariant.

16. **Refuse + escalate to upstream artifact.** When a workflow detects an attempt to silently widen the scope of an upstream decision (foundational stack, foundational data model, foundational fitness function, portfolio scope, etc.), it **refuses to proceed** and **escalates to the workflow that owns that decision** — with a clear pointer telling the user which upstream workflow to run first. No silent in-place widening; no quietly adding a foundational decision inside a bet artifact. Current instances: Researcher refuses log-and-walk-away (escalates to filling the gap in the brief); `/setup-foundation-architecture` HITL hard gate before scaffold (escalates to user approval); foundational data model derived before DB choice (escalates DB row to cite data model); `/create-bet-architecture` deviation gate (escalates to foundational amend with ADR); `/create-story` Standard Experience checklist gates `status: ready`. Foundational decisions live at foundational level by design — refuse mechanisms make this structurally enforceable.

    The **six phases** the scanner covers:

    1. **Product** (Discovery) — brief, research, defensibility, HITL approval
    2. **Architecture** — decision, alternatives, reversibility, cross-system review, test strategy, rollout
    3. **Build** — AC↔test mapping, layer coverage, E2E, BLOCKERs, security review, architect compliance, perf budget
    4. **Production Ready** *(new in v0.2 — previously silent in Compass)* — runbook, SLO, monitoring, rollback, on-call, backup, cost, compliance
    5. **GTM** — user docs, API docs, sales, support, pricing, launch comms, customer comms, legal
    6. **Operate** — measurement cron, SLO breach, incident rate, adoption, cost actuals, defect rate, outcome resolved

    Phases are NOT strictly sequential — a bet can be "Built" but not yet "Production Ready"; the scanner tracks each phase independently. Check catalog lives in `compass/workflows/scan.md` (single source of truth). Owners decide; the scanner informs.

## HITL levels

Set in `compass/config.yaml` under `hitl_level`:

- `every_phase` — approve at every role handoff (heaviest)
- `milestones` — approve at major milestones (default, recommended)
- `merge_only` — approve only at PR merge (lightest)

## Two paths for work

**Bet-driven** (default) — any user-facing change, feature work, tech debt, continuous improvement, architectural initiative. Requires a brief.

**Hygiene** — `hygiene: true` tag on `/ops` or `/fix`. Dependency patches, CI fixes, doc typos, secret rotations, dev-experience tweaks. Skips brief, still gets full review.

## When you're unsure

- What role am I playing? → check the active workflow + load `compass/roles/<role>.md`
- What artifact should I produce? → see the role file + matching template in `compass/templates/`
- What rules apply to this bet? → read the bet's brief, architecture (if any), parent bet, foundation docs
- Do I need approval? → check `compass/config.yaml` and the HITL gates in the active workflow
- What did past decisions say? → check the relevant artifact's `## DRI Log` section
