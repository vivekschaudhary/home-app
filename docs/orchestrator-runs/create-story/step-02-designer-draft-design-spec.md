---
workflow: create-story
step: 2
agent: designer
task: draft-design-spec
generated: 2026-06-28 18:02
---

Blocked by [refuse-escalate]: I can’t draft the design spec without the approved brief, the actual story content, and the design system reference. Please provide the inputs below and confirm the target story to start with (suggest WLT-27-1 per “Next: /build WLT-27-1”).

What I need to proceed
- Approved brief for bet WLT-27: goals, success metrics, constraints/guardrails, non-goals.
- Story to design first: full file for WLT-27-1 (persona, entry points, scopes, Acceptance Criteria, Standard Experience Checklist).
- Design system reference:
  - System name/version and link to component library
  - Design tokens (spacing unit/scale, type ramp, color tokens incl. semantic roles, radius, elevation)
  - Grid/breakpoints, density, motion scale/easing
  - Form patterns, validation, toast/snackbar/inline alert, modal/sheet, navigation, table/list, button, input, menu, tooltip
  - Icon set, illustration policy
- Platform/scope: web (responsive breakpoints), iOS, Android; supported browsers/OS; theming (light/dark, high-contrast).
- Accessibility target and policies: WCAG level (assume 2.1 AA unless told otherwise), reduced motion, focus-visible standard.
- Internationalization: locales, RTL support, date/number/currency formats.
- Error taxonomy: canonical error codes/messages per AC; field-level vs global errors.
- Data/objects touched (field names, constraints, masks/redaction rules), privacy/security constraints (PII/PCI, telemetry).
- Analytics/telemetry/events to instrument (if any).
- Existing screens this must align with (navigation, header/footer, route patterns).
- Figma: link to project/file or permission to create a new file and where to place it.

Tooling status (explicit degradation)
- mcp_figma: not connected in this host. I will produce a full text spec and note “Figma file creation requires a manual step” and log that as a DRI Decision.
- mcp_jira / mcp_linear / mcp_confluence: not connected. I won’t mirror tickets/pages; will log this as a DRI Decision.
- text_input: available. I will proceed with a text-first design spec once unblocked.

What you’ll get once unblocked
- docs/bets/WLT-27/stories/WLT-27-1/design.md covering:
  - End-to-end flows (entry → steps → success + all failure/edge paths)
  - Each screen: default, empty, loading, error, success states
  - Component specs using your design system by name; any gaps flagged via /ops
  - Concrete interaction details (click/hover/focus/keyboard/touch, motion durations/easings, responsive rules)
  - Accessibility (keyboard order, ARIA roles/labels, focus management, contrast, reduced motion)
  - Copy needs flagged for UX Writer as [copy: token-name]; no copy written by me
  - Figma frame list and mapping (manual creation noted)
  - ≥1 DRI Decision and explicit SEC → design coverage mapping for PM

Open confirmations
- Confirm starting story: WLT-27-1?
- Confirm hitl_level (is it every_phase? I will halt for approval before marking spec ready).
- Confirm WCAG target (2.1 AA?) and platforms.

TL;DR
- Blocked: Missing approved brief, story file(s), and design system reference. Cannot start spec per [refuse-escalate].
- Tools: Only text available; no MCP Figma/Jira/Linear/Confluence. Will produce text spec and log manual Figma step as DRI Decision.
- Ready to begin immediately upon receipt; will start with WLT-27-1 unless you direct otherwise.

Files created/modified
- None (blocked pending inputs).

Copy needs list
- Will be generated during spec; I will tag all copy tokens as [copy: …] for UX Writer.

Next recommended command
- /pm.attach-brief WLT-27 <file-or-link>
- /pm.send-story WLT-27-1 <file-content>
- /ops.link-design-system <url> <version> (tokens/components/breakpoints/motion)
- /product.confirm-platform web|ios|android and /pm.confirm-a11y-target WCAG-2.1-AA
- /pm.confirm-hitl-level every_phase|milestones