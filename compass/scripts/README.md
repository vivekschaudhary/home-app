# Compass — `scripts/`

Reference utility scripts that complement Compass workflows. Each script is single-file and uses stdlib only (no `pip install`, no `npm install`). Adopt as-is or fork for team-specific needs.

**Owner convention:** scripts in this directory are operated by the **Project Manager** role (matching the existing `/status` + `/plan` ownership of "make work visible" jobs).

---

## `token-usage.py` — per-role token rollup

Parses a Claude Code session log and a Compass workflow markdown file; attributes tokens to roles using the workflow's `COMPASS_ROLE_BOUNDARY` markers as anchors (per the `[role-boundary]` Compass-original pattern in `compass/framework/canon.md`); produces a markdown report.

### What it produces

- **Per-workflow cost** — total input + output tokens, $ estimate at current Anthropic Sonnet 4.x pricing
- **Per-role rollup** — table of input/output/total/$ by role, sorted by total descending
- **Per-step breakdown** — table mapping each workflow step to its attributed tokens with cumulative %
- **Confidence footer** — names the heuristics used so readers know the accuracy bounds

### Usage

```bash
# Stdout
python compass/scripts/token-usage.py ~/.config/claude-code/sessions/<session>.jsonl

# Write to file (PM archive)
python compass/scripts/token-usage.py <session-log> --out docs/usage/build-2026-05-27.md

# Force a specific workflow file (otherwise auto-detected from the first slash-command in the session)
python compass/scripts/token-usage.py <session-log> --workflow compass/workflows/build.md

# Custom pricing (defaults: $3/M input, $15/M output — adjust to your model)
python compass/scripts/token-usage.py <session-log> --price-in 3.0 --price-out 15.0
```

### Finding Claude Code session logs

The exact path depends on your Claude Code version + OS. Common locations:

- **macOS:** `~/.config/claude-code/sessions/` or `~/Library/Application Support/claude-code/sessions/`
- **Linux:** `~/.config/claude-code/sessions/`
- **Windows:** `%APPDATA%\claude-code\sessions\`

If you can't find them, check Claude Code settings or run `claude-code --help` for the current session-log path. The script accepts either JSON or JSONL format; Claude Code typically writes JSONL.

### Accuracy honesty

This is a **rough estimator**, not exact attribution. Heuristics used:

- **Linear step assumption** — messages mapped to workflow steps by ordinal position. Out-of-order execution = off attribution.
- **Multi-message-per-step approximation** — divides total messages evenly across steps. Heavy steps are under-counted; light steps are over-counted.
- **User-interrupt sensitivity** — user messages mid-session shift the mapping.
- **Tool-call attribution** — per step, not per tool call within a step.
- **Pricing assumption** — Anthropic Sonnet 4.x current rates (configurable).

The report's Confidence footer names all of these explicitly so consumers know the bounds.

**For exact attribution, AI-tool integration is required** (Claude Code feature request territory). This script is the reference round-1 implementation per the `[role-boundary]` pattern — round 2+ accuracy lands when richer AI-tool instrumentation matures.

### How the markers work

Compass workflows in v0.3.4+ include HTML-comment markers at role load/transition points:

```markdown
### 3. Engineer implements

<!-- COMPASS_ROLE_BOUNDARY: enter | role=engineer | workflow=build | step=3 -->

**Work (Claude):** Engineer implements the story...

<!-- COMPASS_ROLE_BOUNDARY: exit | role=engineer | workflow=build | step=7 -->
```

The script reads these markers from the workflow file referenced by the session's initial slash-command. If a workflow has no markers (most v0.2.x and pre-v0.3.4 workflows), the script falls back to attributing everything to `(unattributed)`. Add markers to a workflow when you want per-role visibility for it.

### When to use this

- **Cost transparency** — periodic check of what Compass costs in your project
- **Role optimization** — identify role docs that consume disproportionate tokens (candidates for tightening)
- **Debugging / explainability** — when a workflow run feels expensive, see where the tokens went
- **Team reporting** — aggregate across many sessions (current script handles one at a time; team-wide rollup is v0.3.x+ territory)

PM-owned by convention — see `compass/roles/project-manager.md` for token-usage rollup as a PM responsibility.

---

## Future scripts

Reference implementations may join this directory as Compass evolves. Candidates:

- **Freshness detector** (v0.3.5+) — CI script that watches external-tool sources (Codex changelog, MCP schemas, library release notes, Vercel deploys) and auto-bumps `last_verified` markers on Compass docs
- **Multi-session aggregator** — wraps `token-usage.py` across many session logs for team-level reporting
- **Marker linter** — validates `COMPASS_ROLE_BOUNDARY` markers in workflows are well-formed (enter/exit balance, valid role names, no orphans)

Add scripts here when token-tracking-style problems are structurally hard to solve with markdown docs alone. **Keep them single-file, stdlib-only, and PM-operable** — same discipline as `token-usage.py`.
