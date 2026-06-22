---
id: FIX-2026-06-22-empty-subscriptions-panel
type: fix
bet: WLT-24
story: WLT-24-1
status: in-review
severity: P1
reported_by: operator (dogfooding)
created: 2026-06-22
area_tags: [subscriptions, data, scale]
---

# Fix: the Subscriptions panel is empty even though the marks persist

## Triage (Support)

- **Report:** "I logged in and added my subscriptions as planned. I logged off and came back in and the subscriptions panel is empty — I do see subscription flags in the transactions."
- **Severity:** **P1** — the surface's core value (the recurring-spend total) shows **empty** while the data is clearly there (the ★ indicators persist on the ledger), so the feature looks broken. No data loss — the flags are intact.
- **Affected:** WLT-24-1 (`readSubscriptionsView`). Deterministic from code once enough charges are marked; reproduces on the operator's account (the merchant-mark fix flags *all* of a merchant's charges, so the flagged set is large).

## Root cause (Engineer)

`readSubscriptionsView` ([app/lib/subscriptions.ts](app/lib/subscriptions.ts)) reads the marked transactions with **`.in("dedup_key", chunk)`** over the flagged dedup_keys (chunk = 300). A `dedup_key` is `source:providerAccountId:providerTransactionId` — long, and URL-encoded (`:` → `%3A`) in the PostgREST query string. With dozens-to-hundreds of flags (the common case after **mark-the-merchant** flags a merchant's whole history), the `dedup_key=in.(…)` query string **overflows the request-URL limit**, the query **errors — and the code ignores the error** (`const { data } = …`), so `data` is `null`, `marked` stays empty, and `summarizeSubscriptions([])` returns an empty panel.

The **ledger is unaffected** (and so the ★ still shows): its flag read is `readSubscriptionFlags` (paginated by `.range()`, no IN) and its transactions read is keyset — neither builds an IN over the flagged keys. That's why the flags look present but the panel is empty.

### Why it survived the gated E2E
The E2E marks one merchant with ~3–4 seeded charges — well under the URL limit — so the IN read succeeded there. The bug only manifests at a realistic flag count.

## Fix

Read the user's **active debit transactions paginated** (`readAllPaged`, the FIX-2026-06-20c helper) and **filter to the flagged set in memory** — no `IN()` over the dedup_keys, so the request URL never overflows regardless of how many subscriptions are marked. `readAllPaged` also **throws on a query error** (rather than the old silent `data ?? []`), so a real failure surfaces instead of masquerading as "no subscriptions" (the honesty contract). No schema change; orthogonality (AC5) preserved.

## Verification

- Engineer: the read returns the marked subscriptions regardless of flag count (the IN-URL ceiling is gone). Verified the read logic end-to-end on an ephemeral Postgres (mark N charges → the summary lists them). Full gate: lint · typecheck · tests · build. A source-guard test pins that the view read stays paginated (no `.in(` over dedup_keys reintroduced).
- **Codex (separate handoff):** extend the gated E2E so the Subscriptions panel is populated when a merchant with **many** charges is marked (a flag count that would have overflowed the old IN read) — the real-path regression proof.

## DRI Log

### Decisions
- [2026-06-22] [Engineer] **Replace the `IN(dedup_keys)` read with a paged active-debit read + in-memory filter** — rationale: bulletproof against any flag count (the IN URL was the ceiling); reuses the existing pagination helper, which also surfaces errors instead of swallowing them — area: data/scale — alternatives: smaller IN chunks (rejected — only raises the ceiling, doesn't remove it; still silently empty past it), an RPC (heavier, unnecessary) — reversibility: easy

### Risks
- [2026-06-22] [Engineer] **The paged read scans the user's active debits** (to filter to the flagged ones) — likelihood: n/a — impact: low — mitigation: bounded by `readAllPaged`, on a page-load read (not a hot path); the same pattern the budget + transfers reads use — area: perf

### Issues
- [2026-06-22] [Engineer] **Other `IN(list)` reads should be audited for the same URL ceiling** — severity: low — owner: Engineer — status: open — area: scale — the recategorize/ledger reads use keyset/paged paths, but any future `.in(longList)` has this trap; flagged for a `/scan`.

---

**Shipped:** _pending PR._ No migration. CLEAR to be tied to HEAD on merge.
