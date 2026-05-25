# Workflow: /dashboard

Generates a **single self-contained `docs/dashboard.html`** that renders all living Compass artifacts (foundation, plan, portfolio, scan reports, metrics, status) in a browser. Opens via `file://`. No server, no build toolchain. Shareable as an attachment.

**Why:** Markdown is great for git diffs, AI consumption, and engineers in the IDE. But stakeholders skim — PMs, leadership, on-call, anyone outside the IDE wants to open a URL or attach a file and see current state without spelunking `docs/bets/*/scan-report.md`. The dashboard is that view.

**How:** Compass workflows are already AI-driven. The "generator" is the AI agent following this workflow — no Node, no Python, no Pandoc. Read all the markdown reports, inline them verbatim into `<script type="text/markdown">` blocks inside the HTML template, write `docs/dashboard.html`. Browser-side, **marked.js + mermaid.js (CDN)** render the inlined content. CORS-safe because everything is inline; no `fetch()` of local files.

## Trigger

- `/dashboard` — manual full refresh
- Auto-invoked at the end of `/scan`, `/metrics`, `/plan`, `/status`
- Auto-invoked by `/advance` (transitively via its `/plan` step)

## State detection

| State                                          | Action                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `docs/foundation/product.md` missing           | **Refuse.** Nothing meaningful to dashboard yet — run `/setup-product` first. |
| `docs/foundation/product.md` exists            | Render available artifacts; show "not yet generated" placeholder for any missing section. |

## Process

1. **Verify gate:** `docs/foundation/product.md` exists (any status). If not, refuse with pointer to `/setup-product`.
2. **Load Project Manager role context** (`compass/roles/project-manager.md`) — PM owns rolling visibility, dashboard fits the role.
3. **Discover source artifacts:**
   - **Foundation:** `docs/foundation/product.md`, `architecture.md`, `architecture-research.md` (if exists)
   - **Plan:** `docs/foundation/plan.md` (if exists)
   - **Portfolio:** `docs/foundation/portfolio.md` (if exists)
   - **Scan:** all `docs/bets/*/scan-report.md`
   - **Metrics:** for each bet, the **most recent** `docs/metrics/<bet-id>-*.md` snapshot (sort by date in filename)
   - **Status:** `docs/status.md`
4. **Read project name** from the foundation product bet (first H1 or `id:` frontmatter).
5. **Load template** at `compass/templates/dashboard.html.template`.
6. **Fill the COMPASS-INSERT markers:**
   - `<!-- COMPASS-INSERT:project-name -->` → project name (HTML-escape)
   - `<!-- COMPASS-INSERT:timestamp -->` → today's date + UTC time (e.g., `2026-05-24 14:32 UTC`)
   - `<!-- COMPASS-INSERT:foundation-blocks -->` → one `<article class="artifact-block">` per foundation file (see Block shape below)
   - `<!-- COMPASS-INSERT:plan-block -->` → single artifact-block OR empty-tab message
   - `<!-- COMPASS-INSERT:portfolio-block -->` → single artifact-block OR empty-tab message
   - `<!-- COMPASS-INSERT:scan-blocks -->` → one artifact-block per bet, sorted by bet ID. Sub-heading per bet with title from the bet's brief.
   - `<!-- COMPASS-INSERT:metrics-blocks -->` → one artifact-block per bet (latest snapshot only)
   - `<!-- COMPASS-INSERT:status-block -->` → single artifact-block OR empty-tab message
7. **Inline markdown verbatim — byte-for-byte from source. This is load-bearing.**
   - Do NOT pre-render to HTML — marked.js does that client-side.
   - **Do NOT summarize.** Not "executive summaries of the larger sections." Not "key points only." Not "DRI log entries condensed." Not "abbreviated for readability."
   - **Do NOT truncate.** Not even with `...[truncated, see source]` markers.
   - **Do NOT reword for clarity**, even if the source markdown reads awkwardly.

   **Why this is non-negotiable:** the dashboard's only value is being a *faithful view* of the underlying markdown. The moment summaries enter, the dashboard becomes a second source of truth — it drifts from source, stakeholders read it instead of the real artifacts, and the markdown's careful structure (DRI entries, per-row pillar evaluations, complete alternatives tables, full citation lists) gets quietly lost in translation. The dashboard is **allowed** to be 200-300 KB. Browsers handle it. If a project genuinely outgrows that, the answer is `/dashboard --summary` as an explicit opt-in mode (deferred, not yet implemented) — never silent summarization.

   Inline format:
   ```html
   <article class="artifact-block">
     <div class="artifact-path">docs/bets/PROJ-42/scan-report.md</div>
     <script type="text/markdown" data-artifact="docs/bets/PROJ-42/scan-report.md">
   <!-- full markdown content here, verbatim, byte-for-byte from source, including frontmatter (which marked.js will treat as a horizontal-rule + code block — that's fine; it makes the metadata visible) -->
     </script>
     <div class="rendered"></div>
   </article>
   ```
   *One critical detail:* if the markdown contains `</script>` anywhere (rare, but possible in code examples), escape it as `<\/script>` to avoid breaking the HTML parser. This is the **only** transformation permitted on the source content.
8. **Empty-tab fallback** — for any tab where no source files exist, emit:
   ```html
   <div class="empty-tab">No <name> artifacts yet. Run <code>/<command></code> to generate.</div>
   ```
9. **Write `docs/dashboard.html`** with the Write tool.
10. **Output summary in chat:**
    - File path
    - Count of inlined artifacts (per tab)
    - File size
    - Opening instruction:
      - macOS: `open docs/dashboard.html`
      - Linux: `xdg-open docs/dashboard.html`
      - Windows: `start docs/dashboard.html`
11. **No HITL gate** — dashboard is a living artifact, refreshed on demand. Same shape as `plan.md` and `scan-report.md`.

## Block shape (canonical)

Every inlined artifact follows this shape:

```html
<article class="artifact-block">
  <div class="artifact-path"><source file path></div>
  <script type="text/markdown" data-artifact="<source file path>">
<markdown content, verbatim, with </script> escaped as <\/script>>
  </script>
  <div class="rendered"></div>
</article>
```

The `<div class="rendered"></div>` is where marked.js writes the rendered HTML (client-side, on tab activation). Don't pre-fill it.

## Verification (mandatory)

- [ ] `docs/dashboard.html` exists
- [ ] Every available source artifact is inlined as `<script type="text/markdown" data-artifact="<path>">…</script>` with the source path preserved
- [ ] **Every inlined artifact's content matches its source file byte-for-byte.** No summarization, no executive summaries, no truncation, no rewording. Spot-check by `diff`-ing 2-3 inlined blocks against their source `.md` files (excluding whitespace at the `<script>` block boundary). The **only** permitted transformation is escaping `</script>` → `<\/script>` inside the inlined content.
- [ ] Marked.js + Mermaid.js CDN `<script>` tags present in `<head>`
- [ ] Tab navigation present with all six tabs: Foundation / Plan / Portfolio / Scan / Metrics / Status
- [ ] "Last generated" timestamp visible at top of page
- [ ] Footer note about re-running `/dashboard` present
- [ ] Empty tabs show empty-tab message (not blank, not error)
- [ ] `</script>` inside any inlined markdown is escaped to `<\/script>` (HTML parser would otherwise break)
- [ ] Mermaid `flowchart` / `erDiagram` / `gantt` blocks in the inlined markdown remain as ` ```mermaid` fences (marked + the page script turn them into `<div class="mermaid">` and run mermaid.js)
- [ ] No HTML or JS console errors when opened in browser (smoke test)

## Output

- `docs/dashboard.html` — single self-contained HTML file, openable via `file://`. Shareable as an attachment. Auto-refreshed by other workflows.
- **Gitignored by convention.** `docs/dashboard.html` is a *derived view* — every `/scan`, `/plan`, `/metrics`, `/status` rewrites it, producing large diffs that aren't human-meaningful (the source-of-truth diff is in the underlying markdown). The framework's root `.gitignore` excludes it. Consuming projects should add the same line to their own `.gitignore` (see `SETUP.md`). Other living artifacts (`plan.md`, `scan-report.md`, metrics snapshots, `status.md`) DO get committed — they carry user-relevant state (suppressions, refinement log, history). The dashboard doesn't.

## Refusal cases

- `docs/foundation/product.md` missing — pointer to `/setup-product`.

## Notes

- **Living artifact.** Like `plan.md` and `scan-report.md`, this is regenerated each run. Hand-editing `docs/dashboard.html` is anti-pattern — the next `/dashboard` run overwrites.
- **Silent summarization is the failure mode.** If the generating agent chooses to "summarize larger artifacts to keep file size manageable," that's a **spec violation, not an optimization**. The dashboard is allowed to be 200-300 KB. Browsers handle it. The framing "small file is reviewable, large file isn't" is an invented constraint — reviewers don't read `dashboard.html` (it's gitignored). Stakeholders open it in a browser, where size is a non-issue. If a project genuinely outgrows 300 KB (30+ bets, hundreds of artifacts), the answer is `/dashboard --summary` as an explicit opt-in mode (deferred, not yet implemented). Filing the size gap as a future enhancement is fine; quietly summarizing is not.
- **Inlined, not fetched.** Browsers block `fetch()` over `file://` due to CORS. Inlining markdown into `<script type="text/markdown">` blocks at generation time keeps the dashboard zero-server.
- **CDN dependencies.** Marked.js + Mermaid.js loaded via jsDelivr. Total runtime page weight ~600KB gzipped. Works offline only if dependencies cached; first open requires internet.
- **Future: `--publish` mode.** If hosted (Confluence / Notion / GitHub Pages) becomes useful, add `/dashboard --publish <target>` that pushes via MCP. Deferred until asked.
- **Future: real generator.** At Compass project scale beyond ~30 bets, the inlined HTML may grow large. A small Node/Python script generator can replace AI-driven generation. Deferred until needed.
