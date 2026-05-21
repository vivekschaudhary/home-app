# Setup — Compass

How to install Compass with Claude Code (implementer) + OpenAI Codex CLI (reviewer) as the v1 supported tools. Vendor-neutral — add other tools later via thin wrappers.

## Install

### 1. Drop the kit into your repo

```bash
cd /path/to/your-empty-or-existing-repo
cp -r path/to/compass/compass/    ./
cp -r path/to/compass/docs/       ./
cp -r path/to/compass/.claude/    ./
cp -r path/to/compass/.codex/     ./
cp -r path/to/compass/.github/    ./
cp    path/to/compass/.mcp.json   ./
cp    path/to/compass/AGENTS.md   ./
cp    path/to/compass/CLAUDE.md   ./
cp    path/to/compass/PROJECT.md  ./
cp    path/to/compass/README.md   ./  # optional; rename your existing if present
```

### 2. Install both AI tools

**Claude Code:**
```bash
npm install -g @anthropic-ai/claude-code
```
Install the VS Code extension ("Claude Code") from the marketplace.

**OpenAI Codex CLI:**
```bash
npm install -g @openai/codex
codex login
```

### 3. Authenticate MCP connectors

**Claude Code (in VS Code panel):**
```
/mcp
```
Authenticate each: GitHub, Atlassian (Jira/Confluence), Sentry, Figma.

**Codex CLI:**
Codex reads `.codex/config.toml`. Verify in chat:
```
List the MCP servers available to you.
```
(Codex's MCP config format evolves — check `codex --help` if servers don't appear.)

### 4. Commit the bootstrap

```bash
git add .
git commit -m "chore: bootstrap Compass"
```

## First run

### Step 1 — foundational product bet

In the Claude Code panel:
```
/setup-product
```

You'll be asked for source material (Confluence link, GDrive doc, or free text describing what you're building). Compass drafts `docs/foundation/product.md` as a measurable bet.

**Approve it** by editing the status field from `proposed` to `approved` in the file frontmatter, then commit.

### Step 2 — foundational architecture bet

```
/setup-architecture
```

Compass asks ~12 stack questions (with smart defaults), scaffolds the repo with boundary folders + CI/CD config, populates `compass/config.yaml`, drafts `docs/foundation/architecture.md`.

**Approve** by flipping the status to `approved` and committing.

### Step 3 — your first feature bet

```
/create-brief <link-to-Confluence-doc>
# or
/create-brief "We need to let users export their dashboards to CSV"
```

PM + Researcher engage. Brief drafted at `docs/bets/PROJ-XX/brief.md`. Approve when ready.

### Step 4 — bet-level architecture (if needed)

```
/create-architecture PROJ-XX
```

Architect + Enterprise/Solution Architect produce `docs/bets/PROJ-XX/architecture.md`. Skipped automatically for small bets.

### Step 5 — first story

```
/create-story PROJ-XX
```

PM identifies the first shippable slice. If UI, Designer + UX Writer engage in parallel for design + copy.

### Step 6 — build it

```
/build PROJ-XX-1
```

Engineer implements + tests + opens PR. Story may produce multiple PRs.

### Step 7 — Codex reviews

In your terminal:
```bash
codex
```

Then in Codex:
```
Run the reviewer prompt at .codex/prompts/reviewer.md against the diff on PR #N.
```

Codex reads `AGENTS.md`, the bet architecture, and the diff. Posts findings on the PR.

### Step 8 — back to Claude

```
Address the Codex findings on PR #N.
```

Loop until clean, then merge.

### Step 9 — measure

Cron auto-runs `/measure PROJ-XX` per the bet's `check_in_cadence`. Or run manually:
```
/measure PROJ-XX
```

When the measurement window closes, the bet transitions to `won`, `learning`, or `inconclusive`.

## Anytime

- `/status` — what's in flight
- `/metrics` — top-down outcomes view
- `/advance` — push current work to next phase

## What's where

```
.
├── AGENTS.md                    ← rules every AI tool reads first
├── PROJECT.md                   ← thin pointer to foundation docs
├── README.md                    ← project overview
├── SETUP.md                     ← this file
│
├── compass/                     ← ★ THE FRAMEWORK (vendor-neutral)
│   ├── roles/                   #   12 role definitions
│   ├── workflows/               #   13 workflows (one per command)
│   ├── templates/               #   10 artifact templates
│   └── config.yaml              #   team decisions
│
├── docs/                        ← ★ THE ARTIFACTS (your project's outputs)
│   ├── foundation/              #   product + architecture foundational bets
│   ├── bets/                    #   all bets, organized by ID
│   ├── ops/, fixes/, incidents/ #   standalone (hygiene + cross-system)
│   ├── sprints/                 #   weekly comms
│   ├── metrics/                 #   cached snapshots (json + md)
│   ├── status.md                #   rolling project status
│   └── changelog.md             #   user-visible changes
│
├── .github/PULL_REQUEST_TEMPLATE.md
├── .mcp.json                    ← MCP connectors for all tools
│
│   ─── TOOL WRAPPERS (thin; point at compass/) ───
│
├── CLAUDE.md                    ← Claude Code: read AGENTS.md + compass/
├── .claude/skills/              ← 13 skill stubs, one per command
└── .codex/                      ← Codex CLI: config + reviewer prompts
```

## Adding more AI tools later

The framework lives in `compass/`. To add Cursor, Cline, Windsurf, etc.:

1. Create the tool's expected config folder (`.cursor/rules/`, `.clinerules`, etc.)
2. Write thin wrappers that reference `compass/roles/<role>.md` and `compass/workflows/<workflow>.md`
3. Decide which roles that tool plays — update `compass/config.yaml` under `tool_assignments`
4. `compass/` files don't change. Only the wrapper folder is added.

For tools with flatter customization (Copilot, Cline's single-file rules), concatenate the relevant role files instead of referencing.

## Customizing

- **Roles:** edit `compass/roles/<role>.md`. All tools pick up the change.
- **Workflows:** edit `compass/workflows/<workflow>.md`. Skills reference, don't duplicate.
- **HITL strictness:** edit `compass/config.yaml` `hitl_level`.
- **Connectors:** edit `.mcp.json` and `compass/config.yaml` `connectors`.
- **New role:** add `compass/roles/<new>.md`, register in `AGENTS.md` and `compass/config.yaml`.
- **New workflow:** add `compass/workflows/<new>.md` + a thin `.claude/skills/<new>/SKILL.md`.

## Smoke test

In an empty branch after install:

```
/setup-product
```
(Use defaults; this is just to verify the loop works.)

After approving the product foundation, run `/setup-architecture`, then try `/create-brief "test feature"`.

If anything feels broken, look at the workflow file that's running — workflows are plain markdown you can edit.

## The principles, in 10 lines

1. Every initiative is a measurable bet (won / learning / inconclusive)
2. Roles, not job titles — 12 product roles loaded as context
3. Bets contain stories contain implementations
4. Two tools, separated jobs: Claude implements, Codex reviews
5. Decisions, Risks, Issues logged at every stage
6. HITL milestones — humans approve at meaningful gates
7. Discipline holds always — no shortcuts under pressure
8. Traceability end-to-end — everything links back to its source
9. No silent skips — declined engagements get logged with rationale
10. The framework is markdown — edit it freely as your team learns
