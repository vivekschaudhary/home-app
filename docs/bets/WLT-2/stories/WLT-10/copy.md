---
bet: WLT-2
story: WLT-10
author: UX Writer
created: 2026-06-08
---

> Engineer note: use these strings **verbatim**. Most of WLT-10 is backend; the only
> new user-facing copy is the historical-import state. Reuses WLT-9 strings otherwise.

# Copy: WLT-10 — Full-history import

## Voice and tone
Calm, patient, honest. The import can take a minute — reassure that it's working and that the user doesn't have to wait around.

## Strings
| Location / ID | Final copy | Rationale |
|---|---|---|
| `accounts.importingStatus` | Importing… | Status chip during the historical pull |
| `accounts.importingNote` | Importing your history — this can take a minute. You can keep using the app; we'll keep loading in the background. | Sets expectation + frees the user to leave |
| `accounts.importDone` | Your full history is in. | Optional quiet confirmation once complete (no toast — calm) |

## Terminology consistency
- **"Importing your history"** for the historical backfill (distinct from WLT-9's "Syncing your transactions…", which stays for the initial recent pull).
- **"Connected" / "Updated {time}"** — carried from WLT-9, unchanged.

## DRI Log
### Decisions
- [2026-06-08] [UX Writer] Separate "Importing your history" (historical) from "Syncing your transactions" (initial) — rationale: they're different moments; the historical one explicitly signals it's longer + backgroundable — area: clarity
### Risks
- _none_
### Issues
- _none_
