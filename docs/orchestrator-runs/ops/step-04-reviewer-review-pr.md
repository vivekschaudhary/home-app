---
workflow: ops
step: 4
agent: reviewer
task: review-pr
generated: 2026-06-23 16:51
---

I’m ready to run review-pr, but I don’t have repo access or shell on your CI artifacts in this chat. Required tools (mcp_github, shell) aren’t available here, so I can’t fetch the diff or inspect build output myself. I’ll proceed in degraded mode if you provide the inputs below.

Please provide:
- PR link/number and repo slug (owner/repo)
- CI status: confirm all required checks are green (or paste the latest run URL)
- The PR diff (or files changed) — paste or attach:
  - CI configs/workflows (e.g., .github/workflows/*.yml), Playwright config, any scripts (the node:crypto leak guard), and package.json changes
  - Any app/build config touched (Next.js/Vercel/Edge settings if present)
- If the PR touches framework-discovered surfaces (routing, middleware, edge functions), paste the relevant build/runtime manifests for mechanical verification:
  - Next.js 16: .next/server/functions-config-manifest.json, routes-manifest.json
  - Pre-16: middleware-manifest.json (plus routes/prerender manifests)
  - Vercel: .vercel/output/functions/ directory listing
- For the node:crypto guard, paste:
  - The exact grep/script content
  - Where it’s wired in the workflow (job/step names) and the path(s) it scans
  - A sample of the failure output it would produce (even a dry-run/log excerpt)

Once I have those, I’ll post the structured Code Review with findings and a recommendation. If CI isn’t green, say so and I’ll pause review per gate: “CI not green — fix tests/build first; review starts after.”