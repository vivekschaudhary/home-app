---
workflow: create-story
step: 3
agent: ux-writer
task: write-copy
generated: 2026-06-28 18:02
---

Refusal — [refuse-escalate]: I can’t write copy without a design spec. I need a design.md for the target story with explicit copy placeholders (e.g., [copy: error-invalid-email]) before I can proceed.

What I need to unblock write-copy:
- Target story: confirm WLT-27-1 (per “Next: /build WLT-27-1”)
- Approved brief (user mindset at each moment)
- Design spec (design.md) with all screens, states, and copy placeholders + character limits/truncation constraints per component
- Design system reference for the components used (so I can respect patterns and limits)
- Voice/tone guidelines (docs/foundation/product.md) or confirm n/a
- Links to related features for terminology consistency
- Error handling patterns per flow (validation, network, permissions, server, unknown)
- Empty state intents and required next actions

Host/tooling note:
- Optional tools not active: mcp_confluence, mcp_jira, mcp_linear. I can’t fetch voice/tone guidelines or mirror decisions automatically. I will apply [cite-or-mark-na] and mark voice guidance as n/a unless you attach/paste docs/foundation/product.md.

TL;DR
- Shipped: none — blocked by missing design spec with copy placeholders.
- State: Waiting on design.md, brief, design-system reference, and voice/tone guidelines.
- Pending: Once provided, I’ll fill every placeholder, discriminate error types, validate empty states, and log DRI decisions.

Files created/modified
- None.

Copy decisions log
- n/a — no decisions made without a design spec.

Next recommended command
- Re-run designer.draft-design-spec for WLT-27-1 with:
  - brief: attach/paste approved brief
  - story file: docs/bets/WLT-27/stories/WLT-27-1/story.md
  - design system reference: link or file with component specs and character limits
  - voice/tone: attach/paste docs/foundation/product.md
Then re-issue: Execute task: write-copy.