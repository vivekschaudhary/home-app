---
workflow: fix
step: 3
agent: reviewer
task: review-pr
generated: 2026-06-23 15:57
---

## Code Review

Architecture match:  ✓
Copy verbatim:       ✓
Tests adequate:      ✗
Conventions:         ✓
E2E coverage:        N/A

### Findings

[BLOCKER] Preview override must fail-closed on unknown/empty VERCEL_ENV
  File: packages/passkey-2fa/src/aal2.ts:1
  Rule violated: Story focus (1) PROD SAFETY — fail-closed gating
  Issue: If the gate is implemented as VERCEL_ENV !== "production", then undefined/empty/random values (e.g., when not running on Vercel) would incorrectly ENABLE the override. That is not fail-closed and risks a session-security seam leaking outside intended preview/dev. I cannot confirm the exact check from the diff, so I’m calling this out explicitly.
  Fix: Use an explicit allowlist: enable the override ONLY when VERCEL_ENV is exactly one of ["preview", "development", "test"]; treat any other value (including undefined/empty) as production. Add unit tests that assert: undefined, "", "staging", "prod", and any unknown string → defaults (override ignored); "preview"/"development"/"test" → override honored.

[ISSUE] Malformed/extreme override values must fall back to secure defaults (never “unbounded”)
  File: packages/passkey-2fa/src/aal2.ts:1
  Rule violated: Story focus (2) malformed → default; session safety
  Issue: It’s unclear whether aal2TtlSeconds()/aal2RenewalWindowSeconds() validate inputs. NaN, negative, zero, decimals, scientific notation, whitespace, or excessively large values must not produce an unsafe TTL/window. In preview this is still important (avoids accidental long-lived sessions).
  Fix: Parse as base-10 integer; accept only finite, positive integers within a bounded range; on invalid/out-of-range, return the baked-in secure default. Add tests for: "abc", "", " ", "0", "-1", "1.5", "1e9", Number.MAX_SAFE_INTEGER, extremely large strings.

[ISSUE] Renewal window must be strictly less than TTL (and clamped/fallback if not)
  File: packages/passkey-2fa/src/aal2.ts:1
  Rule violated: Auth session semantics (sliding renewal)
  Issue: If AAL2_RENEWAL_WINDOW_SECONDS >= effective TTL, sliding-renewal semantics can be incorrect (either perpetual renewal or immediate rechallenge anomalies). It’s not stated whether you clamp or fallback when window ≥ TTL.
  Fix: Enforce renewalWindow = Math.min(parsedWindow, ttl - safetyMargin) with a non-negative result; if invalid, use the baked-in default. Add tests where window == TTL and window > TTL to verify clamping/fallback.

[ISSUE] Cookie maxAge must match effective TTL and be in seconds (not ms)
  File: packages/passkey-2fa/src/guard.ts:1
  Rule violated: HTTP cookie semantics correctness
  Issue: You note “maxAge tracks effective TTL,” but different libraries use seconds vs milliseconds. A unit mismatch would cause 1000× errors or drift from the gating value.
  Fix: Confirm the cookie API expects seconds and set maxAge to the effective TTL (in seconds). Add a unit test for setAal2Cookie that asserts the Set-Cookie Max-Age equals aal2TtlSeconds() under both default and overridden (preview) paths.

[NIT] Naming consistency: standardize on seconds-based envs; remove TTL_MS remnants
  File: packages/passkey-2fa/.env.example:1
  Rule violated: Conventions/docs consistency
  Issue: The PR text mentions AAL2_TTL_MS historically; ensure there are no remaining TTL_MS codepaths or docs. .env.example should list AAL2_TTL_SECONDS and AAL2_RENEWAL_WINDOW_SECONDS only, marked preview/dev/test-only.
  Fix: Audit for TTL_MS references; keep a single canonical seconds-based interface in code/tests/docs.

### Recommendation

Block until: explicit fail-closed allowlist gating on VERCEL_ENV is confirmed in code and covered by tests; add validation/clamping for malformed/extreme values (TTL and renewal window) with tests; verify cookie maxAge unit alignment with effective TTL via a focused unit test.