---
id: WLT-27-3-design
story: WLT-27-3
status: draft
type: design-spec
created: 2026-06-28
author: Designer
---

# Design Spec — CSV Import API (Ingest Pipeline Extension)

## Summary

No user-visible UI surface. This story is the API and ingest pipeline layer only. The wizard UI that calls this route is designed in WLT-27-4. All user-facing feedback (success counts, error messages) is the responsibility of the WLT-27-4 wizard, which consumes the `{ inserted, superseded, removed }` response shape from this API.

## Flows

No new UI flows. The API flow is:

```
CsvImportWizard (WLT-27-4) → POST /api/accounts/[id]/import → ingestTransactions pipeline
```

Response `{ inserted: N, superseded: M, removed: 0 }` is surfaced to the user by the WLT-27-4 wizard (see WLT-27-4 design spec for that mapping).

## Screens & States

None. The story's observable states are HTTP responses:

| HTTP Status | Condition | User surface |
|-------------|-----------|--------------|
| 200 `{ inserted, superseded, removed }` | Successful import | WLT-27-4 wizard displays counts |
| 401 | AAL1 / unauthenticated | WLT-27-4 wizard shows generic error → redirect to sign-in |
| 400 `ACCOUNT_NOT_MANUAL` | Target account has Plaid connection | WLT-27-4 wizard: discriminated error |
| 400 `ROW_LIMIT_EXCEEDED` | > 10,000 rows | WLT-27-4 wizard: row-limit error message |
| 400 malformed row | Missing required field | WLT-27-4 wizard: validation error |
| 404 | Account not found / wrong owner | WLT-27-4 wizard: generic error |

## Interactions

None — no interactive UI surface.

## Copy Needs

None at this layer — copy ownership lives in the WLT-27-4 wizard (see WLT-27-4 design spec).

## Accessibility

n/a — no UI surface.

## Standard Experience Checklist

- **Navigation:** n/a
- **States:** All HTTP states covered; user surface delegated to WLT-27-4
- **Feedback:** Delegated to WLT-27-4 wizard
- **Accessibility:** n/a
- **Edge cases:** row-limit guard (AC-7), non-manual account guard (AC-6), cross-user guard (AC-5), idempotent re-import (AC-11)
- **Cross-surface consistency:** n/a

## Figma

No Figma required — no UI surface. Logged as DRI Decision below.

## DRI Decisions

- **[2026-06-28] [Designer] Figma skip — API-only story** — all user-facing behavior for the import flow is expressed in WLT-27-4's design spec. This story's observable effect on the user is the response shape that the wizard renders. No independent UI design artifact is needed. Area: tooling. Reversibility: n/a.

## AC Coverage for PM

No story ACs map to visible UI states. The discriminated error codes (ACCOUNT_NOT_MANUAL, ROW_LIMIT_EXCEEDED) are consumed by the WLT-27-4 wizard — PM should verify WLT-27-4 ACs map to each error code before marking either story shipped.
