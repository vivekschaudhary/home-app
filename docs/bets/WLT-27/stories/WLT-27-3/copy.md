---
id: WLT-27-3-copy
story: WLT-27-3
status: draft
type: copy
created: 2026-06-28
author: UX Writer
---

# Copy: WLT-27-3 — CSV Import API (Ingest Pipeline Extension)

## Voice and tone

n/a — no user-facing copy changes. All user-facing feedback from this API (success counts, discriminated error codes) is rendered by the WLT-27-4 wizard. Copy ownership for those surfaces lives in WLT-27-4.

## Strings

None. This story delivers the `POST /api/accounts/[id]/import` route and ingest pipeline only. The response shape `{ inserted, superseded, removed }` and error codes (`ACCOUNT_NOT_MANUAL`, `ROW_LIMIT_EXCEEDED`) are consumed and surfaced by the WLT-27-4 wizard. See WLT-27-4 copy.md for those strings.

## Terminology consistency

n/a — no user-facing strings.

## DRI Log

### Decisions

- [2026-06-28] [UX Writer] **No copy deliverable for WLT-27-3** — design spec confirms API-only story; all user-facing feedback is delegated to WLT-27-4. Voice guidelines: `n/a — product.md has no dedicated voice/tone section`. Area: copy/tooling. Reversibility: n/a.

### Risks

- _none_

### Issues

- _none_
