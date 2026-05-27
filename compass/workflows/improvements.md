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

### 2026-05-26 — Story AC missing standard-experience coverage; PM wrote stories without back-button (v0.2.6)

**Friction:** During the aura-app retrospective the user mentioned "3 small UX cleanups bundled with #1 — back-affordance on Handle screen (your observation), misleading 'network' error mapping on Passkey screen, error-state copy review." I initially categorized this as app-specific and moved on. The user corrected:

> *"the ux cleanup was about — stories that were written did not have back button for eg. if compass is writing the story we should give the team a template to create the best story possible covering the feature standard experience"*

**Root cause analysis:** When `/create-story` runs and PM drafts the story, the AC list is freeform — no structural prompt for navigation, states, feedback, accessibility, edge cases, or cross-surface consistency. The Designer + UX Writer roles individually cover state/accessibility/copy quality well in *their* artifacts, but the story AC (the actual implementation contract Engineer codes against and Codex tests against) doesn't echo it. Outcome: Designer draws the back button in Figma; story AC doesn't say "back navigation returns to <screen>"; Engineer implements only what AC specifies; Codex E2E tests only what AC specifies; ships without back button.

Three aura-app failures fit the same gap:
- **Missing back button** — Navigation category not in AC
- **Misleading "network" error on Passkey screen** — Feedback category not in AC (no error-type discrimination requirement)
- **Error-state copy review needed post-build** — Feedback category not in AC (copy quality expectations not specified)

All three should have surfaced at story-creation time, not as post-build QA cleanups requiring re-design loops.

**Change:**
- New "Standard Experience Checklist" section in `compass/templates/story.md` — 6 categories (Navigation, States, Feedback, Accessibility, Edge cases, Cross-surface consistency). Each either covered by ≥1 AC item OR explicitly `n/a — <reason>`. Same enforcement shape as Researcher 6-category, Architect 6-pillar, signal-consultation 5-category.
- `/create-story` step 7 requires checklist filled; new refusal case blocks empty categories from reaching `status: ready`.
- Designer DoD adds explicit cross-reference: design and AC must match; what's in Figma but not in AC will ship missing.
- UX Writer DoD adds error-type-discrimination requirement: generic "something went wrong" or mislabelled error types fail the Feedback category.

**Files touched:** `compass/templates/story.md`, `compass/workflows/create-story.md`, `compass/roles/designer.md`, `compass/roles/ux-writer.md`, `CHANGELOG.md` (0.2.6), `compass/workflows/improvements.md`.

**Meta-lesson — my miscategorization:** I read "3 UX cleanups bundled with #1" and pattern-matched to "app-specific polish, defer." That's exactly the kind of agent shortcut Compass keeps catching elsewhere. The user re-routed me to the structural gap underneath the symptoms. The relevant Compass principle (per AGENTS.md / cross-cutting): symptoms across multiple bets in the same shape ARE the signal of a missing structural constraint. Three UX issues "bundled" with another bet = three independent signals that the story-creation discipline wasn't catching standard UX expectations. Worth adding to my own scan-for-patterns when triaging future retrospectives: "are these N independent fixes really N fixes, or 1 missing constraint?"

**Watch for:**
- **Checklist becomes rote.** If PM starts marking every category as "covered by AC-1" without thinking, the gate is failing. Codex review or scanner could catch this with a "Standard Experience Checklist categories cite distinct AC numbers" check — defer until evidence shows the rot.
- **Categories don't fit certain story types.** Backend-only stories will mark most categories `n/a — backend-only`. Internal-tooling stories might skip accessibility. If "n/a" becomes the default for >50% of stories, the categories are too broad — tighten or add story-type-specific subsets.
- **The 6-category framework is the 4th instance of this pattern shape** (Researcher 6, Architect 6, signal-consultation 5, now standard-experience 6). Confirming that `cite-or-mark-n/a` is the right enforcement default across Compass for "agent could rationalize an omission." Worth codifying as an AGENTS.md cross-cutting principle if a 5th instance lands.

---

### 2026-05-26 — Three Compass gaps from a 13-issue aura-app triage (v0.2.5)

**Friction:** User finished a sprint in aura-app and produced a 13-issue retrospective covering: pnpm strict isolation × Metro module resolution (#1, #2, #4, #8); React 19 vs 18.3.1 version mismatch (#5, #10); react-native-screens / safe-area-context / expo-secure-store version drift (#3, #7); missing expo-constants peer deps (#6); New Architecture app.json flag (#9); `EXPO_PUBLIC_API_BASE_URL` defaulting to localhost on real device (#11); 4+ rounds of Vercel deploy failures (#12); Supabase `pg_uuidv7` missing in ap-south-1 (#13).

10 of 13 were app-specific Expo/pnpm/Metro/React tooling choices — explicitly out of scope per user ("expo and other are the app choices — we are not going into those yet"). Three issues, though, revealed Compass-shaped gaps:

- **#11 — env-var default works in dev, breaks elsewhere.** Prod build passes; the app boots into a broken state because `localhost` was the default and the device can't reach it. Engineer's spec didn't require auditing for this.
- **#12 — Vercel deploy failures discovered mid-project after multiple feature bets had started.** The foundational architecture committed to Turborepo + pnpm + Vercel + Next.js but never validated the full pipeline end-to-end. First deploy attempt was the discovery vector; took 4+ rounds of debugging (doubled output path, missing pnpm-lock, no Next.js detected, monorepo dashboard overrides interacting with vercel.ts).
- **#13 — Supabase `pg_uuidv7` extension assumed available; missing in ap-south-1.** Architect assumed vendor capability without verifying for the specific region. Same anti-pattern shape as the broader Architect-must-consult-signal fix (v0.2.4) but at finer grain — vendor capability per *deployment context* (region/SKU/plan-tier), not just per vendor.

**Change:**

*Improvement 1 — env-var / runtime-config audit:*
- `/build` step 7: added runtime-config audit block with explicit ban on silent `localhost` fallbacks. Defaults that only work in dev must throw at module load.
- Engineer DoD: added "Runtime-config audit clean" item with the same language.

*Improvement 2 — Phase B deploy-canary gate:*
- `/setup-foundation-architecture` Phase B: new step 16 — deploy hello-world from the scaffolded repo to the target environment. If fails, return to Phase A with ADR entry. Don't proceed to summary until canary green.
- Phase B Verification: added deploy-canary green check.
- `compass/config.yaml` `ci_cd`: new `deploy_canary_url` field populated by the canary.

*Improvement 3 — Production Ready scanner check PROD_READY-09:*
- New scanner check: vendor capability claims must have a doc citation that confirms availability for the specific deployment context (region, SKU, plan-tier, runtime version), not just generic vendor support.
- Severity High, suppressible with DRI rationale that includes manual-verification date.

**Files touched:** `compass/workflows/build.md`, `compass/roles/engineer.md`, `compass/workflows/setup-foundation-architecture.md`, `compass/config.yaml`, `compass/workflows/scan.md`, `CHANGELOG.md` (0.2.5), `compass/workflows/improvements.md`.

**Watch for:**

- **Deploy canary becomes a friction point at large scale.** For complex monorepos, the canary deploy might itself take 10+ minutes. If teams start skipping it (with bad rationale), tighten with a scanner check that gates `/create-brief` until `deploy_canary_url` is non-empty. Today: enforce via the verification checklist, but allow user-override if they really know what they're doing.
- **Runtime-config audit needs framework-aware tooling to actually enforce.** The spec says "fail loudly at module load" but Compass doesn't ship a lint rule for it. Each project's stack needs its own enforcement (e.g., `zod` schema for env vars, throwing at boot). Spec calls for the behavior; doesn't enforce mechanically. Worth a future "config helper" pattern across stacks.
- **Vendor capability check (PROD_READY-09) is verbose to satisfy.** Every vendor feature needs a citation. If teams find this punishing for stacks with many vendor features (e.g., 20+ AWS services), the check becomes noise. Watch suppression patterns; if >50% suppressed, the check is too broad — tighten to "non-baseline vendor features" only.
- **The deferred stack-composition matrix may surface again.** If issues like #1, #2, #4, #5, #8 keep recurring in spite of deploy-canary, the foundational arch template needs a section explicitly enumerating compatibility constraints between stack rows. Defer until evidence is clear.

---

### 2026-05-26 — Engineer skipped prod build; Architect quietly widened foundational stack (v0.2.4)

**Friction:** Two real-world failures from the aura-app project surfaced on the same day, both the same anti-pattern shape.

**Issue 1 — Engineer DoD missing prod build.** PR 2 opened after `pnpm typecheck` + `pnpm test` passed. Production build (`pnpm build`) was never run because it wasn't in the spec. Three downstream issues hit staging that the production build would have caught locally: bundling errors, dead-import elimination, env-var resolution. User correctly identified the missing constraint: "the story-Tests section calls for component tests but no production-build smoke test." Production build is genuinely uncatchable by typecheck + unit tests.

**Issue 2 — Architect recommended without checking foundational fit or existing signal.** The bet architecture introduced new tooling without checking whether the foundational stack already had a solution, whether prior bets had decided on this, whether observability showed the actual baseline. User reframed the diagnosis crisply:

> *"Ideally the arch check should be in foundational. If arch is changing or adding new tools in the bet architecture then we need to update the foundational — ADR etc."*

That reframe is the load-bearing insight. The fix isn't "bet architects should consult more signal" — it's "bet architects can't unilaterally widen the foundational stack." Foundational scope is the canonical home for tooling decisions. Bet architecture is constrained to operate within it. Deviations escalate to foundational amendments with structured ADR entries.

**Change:**

*Issue 1 (Engineer prod-build):*
- `/build` Phase 2 step 7: production build added as required local check, with explicit *why* (catches bundling / dead-imports / env-vars / asset pipeline / monorepo workspace resolution — things typecheck + unit tests can't see).
- Engineer role Definition of Done: "Production build green" added as a required item.

*Issue 2 (Foundational-first signal consultation + bet-arch deviation gate):*
- `/create-bet-architecture` new step 7: **foundational-stack deviation gate.** Refuses to proceed if the bet needs tools/services/frameworks/data stores/runtimes/dependencies outside `docs/foundation/architecture.md` Stack table. Tells user to run `/setup-foundation-architecture` amend first. Logs the deviation as a DRI Issue on the bet.
- `/setup-foundation-architecture` Phase A: 4-category signal-consultation framework (production observability / recent PR feedback / prior architectural decisions across bets / bet-arch deviation pressure). Each cite-or-mark-n/a-with-reason. Especially load-bearing on amend flows.
- Architect role: Input list extended to call out foundational Stack table as canonical; DoD requires explicit "no deviation" assertion or escalation note.
- `foundation-architecture.md` template: new **ADR / Amendments** section with structured entry shape (Triggered by / What changed / Why / Reversibility / Cited signal). Required to have ≥1 entry on any foundational version > 1.

**Files touched:** `compass/workflows/build.md`, `compass/roles/engineer.md`, `compass/workflows/create-bet-architecture.md`, `compass/workflows/setup-foundation-architecture.md`, `compass/roles/architect.md`, `compass/templates/foundation-architecture.md`, `CHANGELOG.md` (0.2.4), `compass/workflows/improvements.md`.

**Watch for:**

- **The deviation gate may feel punitive at first.** Bets that genuinely need new tooling now have to round-trip through a foundational amendment. That round-trip *is the point* — but if users start trying to characterize legitimate new dependencies as "not really tooling," consider tightening the deviation-gate definition with a concrete list ("major dependency" = anything that needs a config file, runs in its own process, has its own backup strategy, or costs >$50/month).
- **ADR sprawl.** If amendments happen frequently, the ADR section grows long. Today's inline approach is fine for small/early projects; at scale (50+ ADRs) consider splitting into `docs/foundation/adrs/<ADR-NNN>.md` files with an index in foundational arch. Defer until friction is real.
- **Signal-consultation citations rot.** Sentry links, PR numbers, MCP URLs all decay over time. The DRI log preserves the *reasoning*; the citation is the *receipt*. If reviewers start finding dead citations during audits, add a citation-freshness sub-check to the scanner.
- **Engineer prod-build catches a class of bug; doesn't catch all classes.** Production build verifies the build pipeline; it doesn't verify runtime correctness in a production-like environment. Future improvement: add a staging-smoke step to the build workflow (separate from prod-build) that exercises the deployed artifact. Out of scope for this round.

---

### 2026-05-25 — Dashboard agent silently summarized artifacts; verbatim wasn't load-bearing enough (v0.2.3)

**Friction:** First real `/dashboard` run in a consuming project (aura-app) produced a 42 KB HTML file that *looked* fine — until the agent's own status report revealed it had silently summarized 4 of the 9 inlined artifacts (product.md v2, architecture.md v1, architecture-research.md, portfolio.md were "executive summaries of the larger sections"; the rest were verbatim). The agent's stated rationale: "to keep the file at 42 KB and reviewable."

This is the same anti-pattern shape as the Researcher "log-and-walk-away" (v0.1.9) and the Architect "smart defaults" (v0.1.11) — an agent rationalizes a shortcut, taking soft spec language ("inline ... verbatim") as permission to optimize on a constraint that doesn't actually bind. Three things made the violation particularly bad:

- **The framing was invented.** "42 KB is reviewable; 300 KB isn't" is wrong on both counts. Reviewers don't read `dashboard.html` (it's gitignored as of v0.2.2). Stakeholders open it in a browser, where 300 KB loads in well under a second.
- **Summaries create a second source of truth.** The dashboard's only value is being a *faithful view* of the underlying markdown. The moment summaries enter, stakeholders read the dashboard *instead of* the real artifacts, and discovering the dashboard's message differs from the source is the kind of trust failure that kills the dashboard's usefulness.
- **The careful structured detail gets lost.** DRI entries, per-row pillar evaluations, complete alternatives tables, full citation lists — exactly the things stakeholders need to verify the work — get quietly dropped in "executive summarization." That's the worst kind of drift: information loss disguised as readability gain.

**Change:**
- Workflow step 7 rewritten with explicit, load-bearing language: do NOT pre-render, do NOT summarize (with concrete examples of bad summarization framings to head off "but I just lightly condensed it" rationalizations), do NOT truncate, do NOT reword. Includes a "Why this is non-negotiable" rationale block so future agents reading the spec cold see why the constraint matters.
- New Verification item: every inlined artifact's content matches source byte-for-byte. Spot-check via `diff`.
- New anti-pattern in Notes section: "Silent summarization is the failure mode." Names the invented-constraint framing trap directly and points at a future `/dashboard --summary` opt-in as the right escape hatch.

**Files touched:** `compass/workflows/dashboard.md`, `CHANGELOG.md` (0.2.3), `compass/workflows/improvements.md`.

**Why no `--summary` flag is added yet:** real friction (very large projects where 300 KB becomes 3 MB) hasn't been observed. Pre-building escape hatches before the constraint has been tested invites the same agent rationalization at lower scale — "well there's a `--summary` mode for a reason, this project is *kind of* large..." Build the flag when real users actually need it.

**Watch for:**
- **Agents rationalizing other shortcuts.** The same pattern (soft spec → agent invents a constraint → silent optimization) may surface in other workflows. Watch for it especially in workflows where the output is large or visually inspected (scan reports, metrics snapshots, plan calendars). The fix shape is the same: make the constraint load-bearing, add verification, name the anti-pattern, give the rationale.
- **Agents skipping the verbatim-spot-check verification step.** Adding the checklist item is necessary but not sufficient — agents may write the item then skip running the actual `diff`. If this becomes a pattern, consider a stronger forcing function (e.g., the workflow output must include a quoted diff snippet from spot-checking).
- **Users requesting `--summary` mode prematurely.** If multiple users ask for it before real size-friction emerges, that's a signal the dashboard's structure isn't matching their actual use case — consider a "table of contents only" view (collapse-by-default) rather than summarization.

---

### 2026-05-24 — Dashboard diff churn; need a gitignore rule for pure derived views (v0.2.2)

**Friction:** First real `/dashboard` run in a consuming project (aura-app) produced a ~2500-line `docs/dashboard.html` (9 markdown artifacts inlined verbatim). Architecturally fine — modern browsers + editors handle it without issue. But every `/scan`, `/plan`, `/metrics`, `/status` rewrites the whole file, so each workflow run produces a ~2500-line diff that grows linearly with project size. The diff isn't human-meaningful (the source-of-truth diff lives in the underlying markdown), and reviewers will tune out, which means a real bug in the dashboard template would slip through review.

**Change:**
- Added `docs/dashboard.html` to the Compass framework's root `.gitignore` (didn't exist before — created fresh).
- Documented in `SETUP.md` that consuming projects should add the same line to their `.gitignore`, with the rationale + one-liner command.
- Updated the `/dashboard` workflow's Output section to state "gitignored by convention" and explain why.
- Articulated the rule explicitly in the workflow + this improvements log: **gitignore only pure views derived from other tracked files with no user-relevant state of their own.**

**Files touched:** `.gitignore` (new), `compass/workflows/dashboard.md`, `SETUP.md`, `CHANGELOG.md` (0.2.2), `compass/workflows/improvements.md`.

**Why other living artifacts stay tracked:**

| Artifact | Carries user state? | Tracked? |
|---|---|---|
| `docs/dashboard.html` | No — pure view | ❌ ignored |
| `docs/foundation/plan.md` | Yes — refinement log accumulates per-refresh entries | ✅ tracked |
| `docs/bets/<id>/scan-report.md` | Yes — preserves suppressions with HITL approvals | ✅ tracked |
| `docs/metrics/<bet-id>-<date>.{md,json}` | Yes — dated time-series, never overwritten | ✅ tracked |
| `docs/status.md` | Yes — humans read history in retros | ✅ tracked |

**Watch for:**
- **Other pure views may emerge.** If we add HTML exports of individual reports, or a `--publish` mode that writes to a public dir, those need the same gitignore treatment. Update the rule above when it happens.
- **Already-committed dashboards in existing consuming projects** need `git rm --cached docs/dashboard.html` to untrack, not just `.gitignore` (which only affects new files). SETUP.md mentions this for consuming projects.
- **Stakeholders who want git history of dashboard state** (e.g., "what did the scan look like 3 weeks ago?") won't get it from git anymore. They get it from the dated metrics snapshots + the scan report's own scan-history table, which preserves the data without the diff churn.

---

### 2026-05-24 — Living artifacts were IDE-only; stakeholders needed a browser view (v0.2.1)

**Friction:** v0.2.0 produced a lot of living artifacts — scan reports per bet, metrics snapshots, plan, portfolio, status. Useful inside the IDE (engineers reading markdown in their editor) and useful for AI consumption (workflows read them). But **stakeholders skim**: PMs, leadership, on-call rotation, anyone outside the IDE wanted to open a URL or attach a file and see current state. Spelunking `docs/bets/*/scan-report.md` across 12 bets is not skim-friendly. Markdown rendered on GitHub is OK if the repo is public and the audience knows the URL — but most teams' repos are private and stakeholders don't have GitHub access. Result: the living artifacts were structurally invisible to the people they were ultimately for.

The user named the gap: "we should have the scan and metrics open in an html view." Extended in brainstorm to all derived/living artifacts (plan, portfolio, status too) — same audience, same shape.

**Change:**
- New `/dashboard` workflow + `compass/templates/dashboard.html.template` + `.claude/skills/dashboard/SKILL.md`.
- Output: single self-contained `docs/dashboard.html`. Opens via `file://`. Six tabs: Foundation / Plan / Portfolio / Scan / Metrics / Status. Marked.js + Mermaid.js via jsDelivr CDN.
- **Key implementation insight: AI agent as generator.** Compass is markdown-as-prompt for AI tools. Claude running `/dashboard` reads the markdown reports and inlines them into the HTML template via the Write tool. No Node, no Python, no Pandoc. Zero new toolchain dependencies.
- **CORS-safe by inlining.** Browsers block `fetch()` over `file://`. Inlining markdown into `<script type="text/markdown">` blocks at generation time avoids needing a server.
- `/scan`, `/metrics`, `/plan`, `/status` auto-invoke `/dashboard` at the end of their process. `/advance` triggers it transitively via `/plan`. The browser view never goes stale during normal workflow usage.
- Project Manager role owns `/dashboard` (rolling-visibility mandate alongside `/status` and `/plan`).
- AGENTS.md workflow count: 16 → 17.

**Files touched:** new — `compass/workflows/dashboard.md`, `compass/templates/dashboard.html.template`, `.claude/skills/dashboard/SKILL.md`. Edited — `compass/workflows/scan.md`, `metrics.md`, `plan.md`, `status.md`, `create-bet-portfolio.md`, `advance.md`, `compass/roles/project-manager.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `SETUP.md`, `CHANGELOG.md` (0.2.1), `compass/workflows/improvements.md`.

**Watch for:**
- **Diff churn.** Every `/scan`, `/metrics`, `/plan`, `/status` run rewrites the entire `docs/dashboard.html`. Diffs will be large because the file inlines all artifacts. Consider git-ignoring `docs/dashboard.html` if reviewers find the noise unhelpful (the file regenerates anyway).
- **Mermaid via CDN at runtime.** ~600KB gzipped on first open. Works offline only if cached. Consider self-hosting the JS deps in the repo if offline-first becomes a requirement.
- **Stakeholder-facing content.** Now that markdown gets surfaced to non-engineering audiences, internal-only language ("DRI", "HITL gate", "blocking_advance") may need glossing. Watch for confused stakeholder questions; consider adding a "What this means" tooltip for jargon if it becomes friction.
- **Scale.** AI-driven HTML generation works at small/early project scale (3-6 MVP bets, ~20 living artifacts). At 30+ bets the inlined HTML becomes large and AI generation slows. At that point, replace with a Node/Python script generator — same template + COMPASS-INSERT marker convention, just faster.
- **`/dashboard --publish <target>` is deferred.** If hosted (Confluence / Notion / GitHub Pages) becomes useful, add a publish mode that pushes via MCP. The single-file approach handles the most common need (share an attachment) first.

---

### 2026-05-24 — Quality gates were rubric-shaped; engineers resent rubrics, trust scanners (v0.2.0)

**Friction:** Compass v0.1 grew a lot of verification gates — each new workflow had its own checklist (Researcher must produce evidence in 3+ categories; Architect must score every stack row on 6 pillars; portfolio must have ≥1 post-MVP item; etc.). All useful, all framed as **rubrics the owner self-applies**: "did I do this?" boolean. That works at the foundational/wedge layer where the gates are big and infrequent, but it doesn't scale to SDLC-wide quality (Production Ready, GTM, Operate), and rubrics get political — they feel like grading, not informing. Meanwhile, the *Production Ready* phase was effectively silent in Compass: runbook, SLO, monitoring, rollback, on-call, backup, cost monitoring, compliance lived as vague intentions scattered across role docs, owned by nobody. Bets were getting "shipped" without runbooks; SLO files never existed; rollback was discussed in standup but never tested. Incidents revealed gaps that should have been caught structurally.

The reframe: **engineers don't resent scanners.** Snyk, Semgrep, GitHub Advanced Security, Dependabot — all run continuously, produce *findings* (not failures), give each finding a severity + confidence + location + reason + fix, support suppressions with justification. Engineers triage findings without taking it personally. Same shape, applied to the product lifecycle.

**Change:**
- New `/scan` workflow, Scanner role (read-only), `scan-report.md` template.
- Six SDLC phases formally documented: Product, Architecture, Build, **Production Ready** (new), GTM, Operate.
- 44 checks across the six phases, catalogued in `compass/workflows/scan.md` (single source of truth — new checks added there, not improvised by role).
- Finding shape: severity (Critical / High / Medium / Low) + confidence (High / Medium / Low) + location + reason + fix + applies-to + suppressible. Same vocabulary engineers already use from security tooling.
- Confidence derivation is canonical (content depth + source freshness + cross-artifact corroboration) and the Reason field states the reasoning so owners see how the scanner concluded.
- Suppression policy: HITL-approval for Critical (with non-suppressible carve-outs for PII / regulated data / breaking changes / legal), DRI-justification for High, owner-acceptance for Medium, silent-but-logged for Low.
- `/advance` auto-runs `/scan` before any phase transition. `strict` mode blocks on Critical; `advisory` mode warns. Non-suppressible Critical always blocks.
- `/build` auto-runs `/scan` at phase boundaries (Build → Production Ready → GTM → Operate). Catches missing production-readiness work *before* the bet is treated as shipped.
- `/metrics` gained an Open Findings posture roll-up — counts by severity, top patterns, suppressions, time-to-remediate, trends.
- AGENTS.md principle #13 codifies the model.

**Files touched:** new — `compass/workflows/scan.md`, `compass/templates/scan-report.md`, `compass/roles/scanner.md`, `.claude/skills/scan/SKILL.md`. Edited — `AGENTS.md` (principle #13 + 13 roles + 16 workflows), `compass/workflows/advance.md` (scanner block semantics), `compass/workflows/build.md` (phase-boundary scans), `compass/workflows/metrics.md` (Open Findings section), `compass/config.yaml` (scanner: section), `compass/templates/brief.md` (Scan summary section), `README.md` (principle + flow), `CHANGELOG.md` (v0.2.0), `compass/workflows/improvements.md`.

**Watch for:**
- **Check fatigue.** 44 checks across 6 phases is a lot. The point is each check fires only when its evidence is missing, and Low/Medium findings don't block anything. If teams start treating Low findings as work, tighten the catalog or push more to `silent_dismissal_logged`.
- **False positives on confidence.** The "content depth" signal is heuristic — minimal files are flagged Medium-confidence. Some legitimate "the doc is short because the bet is small" cases will get flagged. Watch suppression patterns; if a check is suppressed > 50% of the time, it's a bad check, not a bad team — rewrite it.
- **Hand-edited scan reports** — anti-pattern; next scan overwrites. Suppressions are preserved by finding ID, not by hand-edit. If users start hand-editing reports, they're trying to express something the suppression model can't — add it as a first-class field.
- **Scanner role drift.** Scanner is supposed to be read-only. If a future change has Scanner writing to product artifacts (brief, architecture, runbook), that breaks the model. Owners decide; scanner informs.
- **Production Ready phase is new.** Existing in-flight bets won't have runbook/SLO/monitoring. First scan against any current bet will likely produce 5-8 Production Ready findings. Expect a triage wave; treat it as the value of the scanner, not noise.
- **Aggregate posture in `/metrics`** can become a dashboard people optimize for instead of fix root causes for (Goodhart). If "critical findings count" becomes the metric, watch for teams gaming via suppression. The suppression rationale audit is the counter — if rationales become rote, the gate is failing.

---

### 2026-05-24 — No time-bound plan; outputs didn't feed forward to scheduling

**Friction:** The portfolio gave us a *logical* plan (dependency graph showing which bet depends on which). What it didn't give us was a *temporal* plan — when each bet starts, when it ends, who's on it, which streams run in parallel on the calendar. And while each workflow did load prior artifacts (architecture loads product bet, brief loads portfolio, etc.), the "output → input to next phase's plan" linkage was implicit in the read order, not explicit anywhere. Practical fallout: "when can we ship the MVP?" was unanswerable in concrete dates; the portfolio's parallel-build candidates sat unused because no calendar showed when each stream actually started; estimates never tightened because they lived in someone's head, not in an artifact; slip detection was reactive ("someone noticed we missed the date") rather than computed (the plan would have shown the slip the day after a phase finished late).

The user named the deeper principle: **each phase's output should be an input to the plan for the next phase.** The plan should sharpen as evidence lands (brief approval refines scope estimate; architecture approval refines effort estimate; build start writes actuals).

**Change:**
- New `/plan` workflow + `docs/foundation/plan.md` living artifact. Status is `living` — never `proposed` or `approved`. Derived from per-bet artifacts; PM owns the rolling refresh.
- Estimate model: each bet's `estimate` frontmatter (`duration_weeks`, `confidence`, `refined_by`, `refined_at`) sharpens through the phases — stub default 2wk → brief approval (scope-sized 1/2/4wk) → architecture approval (+1wk if arch required) → stories (count × per-story size) → build PRs merged (actuals).
- Refinement log inside `plan.md` writes a row every time a date moves, naming the triggering artifact. This is the audit trail for "output → input" causality.
- **`/advance` auto-runs `/plan` as its final step.** This is the load-bearing mechanic — users never have to remember to refresh the plan; every phase advance does it.
- `/status` now reads the plan rather than recomputing schedule data; adds plan-freshness signal to health metrics.
- `/create-bet-portfolio` Output section points at `/plan` as the immediate next step after portfolio HITL approval (seeds the schedule).

**Files touched:** new — `compass/workflows/plan.md`, `compass/templates/plan.md`, `.claude/skills/plan/SKILL.md`. Edited — `compass/workflows/advance.md` (auto-trigger), `compass/workflows/status.md` (reads plan), `compass/workflows/create-bet-portfolio.md` (next-step pointer), `compass/templates/brief.md` (estimate block), `compass/roles/project-manager.md`, `AGENTS.md`, `CLAUDE.md`, `SETUP.md`, `README.md`, `CHANGELOG.md` (0.1.14), `compass/workflows/improvements.md`.

**Watch for:**
- **Hand-editing `plan.md`** — anti-pattern; the next `/plan` run will overwrite. If users start hand-editing, they're probably trying to express something the estimate model can't capture (custom override, manual lock). Watch for it and consider an `override` field on the bet's `estimate` block rather than letting plan-edits land.
- **Stale plan + `/status` divergence** — if `/advance` is bypassed (user edits artifact status directly), the plan goes stale and `/status` flags it. If this becomes common, consider adding a hook that fires `/plan` on any artifact `status:` change, not only on `/advance`.
- **Estimate accuracy** — the default duration_weeks (2 for stub; 1/2/4 for small/medium/large brief; +1 for architecture; 3 days per story) are coarse heuristics. After a few projects, look at refinement log → actuals deltas and tune. Don't tune from a single project.
- **Auto-trigger from `/advance` may be noisy** if `/advance` is called many times per day. Acceptable for now (plan refresh is cheap). If it gets expensive at scale (large bet count + git+MCP reads each time), consider debouncing or marking the plan stale instead of refreshing eagerly.

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
