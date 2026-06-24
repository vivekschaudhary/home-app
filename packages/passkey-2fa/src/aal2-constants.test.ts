import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aal2RenewalWindowSeconds, aal2TtlSeconds, AAL2_TTL_SECONDS } from "./aal2";

// Preview-gated session-clock overrides. E2E needs to compress the AAL2 TTL +
// renewal window so re-challenge / sliding-renewal paths can be exercised in
// seconds, not the wall-clock hour the production defaults imply.
//
// FAIL-CLOSED CONTRACT (the property these tests prove):
//   1. The override is honored ONLY in an explicitly-recognized NON-production
//      environment: VERCEL_ENV ∈ {preview, development}, OR (VERCEL_ENV unset
//      AND NODE_ENV ∈ {development, test}). EVERYTHING else — VERCEL_ENV
//      "production", "", "staging", "prod", any unknown value, or VERCEL_ENV
//      unset on a box that didn't set NODE_ENV to dev/test — is treated as
//      production and returns the baked-in default.
//   2. CRITICAL — the gate keys off VERCEL_ENV, NOT `NODE_ENV === "production"`.
//      Vercel sets NODE_ENV=production for preview deploys too, AND Next.js
//      INLINES process.env.NODE_ENV at build time (which would constant-fold an
//      NODE_ENV-based gate to a dead `true` and eliminate the override in the
//      bundle). The real Vercel-preview shape is VERCEL_ENV=preview WITH
//      NODE_ENV=production — the override MUST fire there.
//   3. When honored, the override is accepted ONLY when it parses to a strictly
//      positive base-10 integer in [1, default]. Otherwise → default. The
//      override can only SHORTEN the boundary, never widen or break it.

const DEFAULT_TTL = 60 * 60; // 1h — the production AAL2 TTL
const DEFAULT_RENEWAL = 5 * 60; // 5m — renew when this much (or less) remains

const ENV_KEYS = ["VERCEL_ENV", "NODE_ENV", "AAL2_TTL_SECONDS", "AAL2_RENEWAL_WINDOW_SECONDS"] as const;

// process.env.NODE_ENV is typed as a read-only literal in this repo's TS config;
// go through a mutable index-signature view so the gating test can set/clear it
// without an @ts-ignore.
const env = process.env as Record<string, string | undefined>;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) delete env[k];
  for (const [k, v] of Object.entries(values)) env[k] = v;
}

describe("AAL2 TTL — preview-gated override", () => {
  it("defaults to the baked-in TTL when nothing is set", () => {
    setEnv({});
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
    // The legacy constant stays as the canonical default.
    expect(AAL2_TTL_SECONDS).toBe(DEFAULT_TTL);
  });

  it("honors the env override on a preview deploy (VERCEL_ENV=preview)", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(30);
  });

  it("honors the env override in local dev (NODE_ENV=development, no VERCEL_ENV)", () => {
    setEnv({ NODE_ENV: "development", AAL2_TTL_SECONDS: "12" });
    expect(aal2TtlSeconds()).toBe(12);
  });

  it("honors the env override in test (NODE_ENV=test, no VERCEL_ENV)", () => {
    setEnv({ NODE_ENV: "test", AAL2_TTL_SECONDS: "7" });
    expect(aal2TtlSeconds()).toBe(7);
  });

  it("IGNORES the env override in production (VERCEL_ENV=production)", () => {
    setEnv({ VERCEL_ENV: "production", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
  });

  it("falls back to the default when the override is non-numeric", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "not-a-number" });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
  });

  it("falls back to the default when the override is zero or negative", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "0" });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "-5" });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
  });
});

// ── REGRESSION (constant-fold / Vercel-preview shape). The first cut keyed the
// gate off `NODE_ENV === "production"`, which (a) is true on Vercel preview
// deploys too and (b) is inlined + constant-folded by Next at build time,
// dead-eliminating the override in the bundle. The real Vercel-preview shape is
// VERCEL_ENV=preview WITH NODE_ENV=production. This MUST honor the override.
describe("AAL2 TTL — Vercel-preview shape (VERCEL_ENV=preview + NODE_ENV=production)", () => {
  it("honors the override on a real Vercel preview deploy", () => {
    setEnv({ VERCEL_ENV: "preview", NODE_ENV: "production", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(30);
  });

  it("honors the renewal override on a real Vercel preview deploy", () => {
    setEnv({ VERCEL_ENV: "preview", NODE_ENV: "production", AAL2_RENEWAL_WINDOW_SECONDS: "5" });
    expect(aal2RenewalWindowSeconds()).toBe(5);
  });

  it("still IGNORES the override on a real Vercel PRODUCTION deploy (VERCEL_ENV=production + NODE_ENV=production)", () => {
    setEnv({ VERCEL_ENV: "production", NODE_ENV: "production", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
  });
});

// ── BLOCKER fix evidence: FAIL-CLOSED on unknown / empty / non-allowlist
// VERCEL_ENV. Reviewer's concern was that a `VERCEL_ENV !== "production"` gate
// would ENABLE the override for undefined/empty/random values. The gate is an
// explicit non-prod allowlist (preview/development, or local dev/test off
// Vercel), so anything else is production. These tests pin that property: an
// override is NEVER honored unless the environment is explicitly recognized as
// non-production.
describe("AAL2 TTL — fail-closed across environment values", () => {
  it("returns the default for every VERCEL_ENV value when no override var is set", () => {
    for (const v of ["production", "preview", "development", "", "staging", "prod", "PRODUCTION", "random"]) {
      setEnv({ VERCEL_ENV: v });
      expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
    }
    // VERCEL_ENV entirely absent → still default.
    setEnv({});
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
  });

  it("IGNORES an explicitly-set override for non-allowlist VERCEL_ENV values", () => {
    for (const v of ["production", "", "staging", "prod", "PRODUCTION", "random"]) {
      setEnv({ VERCEL_ENV: v, AAL2_TTL_SECONDS: "30" });
      expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
    }
  });

  it("IGNORES an explicitly-set override on a box with VERCEL_ENV unset and NODE_ENV=production", () => {
    // Self-hosted prod box: VERCEL_ENV unset, NODE_ENV=production → fail-closed.
    setEnv({ NODE_ENV: "production", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
  });

  it("IGNORES an explicitly-set override on a box with NEITHER VERCEL_ENV nor a dev/test NODE_ENV", () => {
    // No env signal at all → treated as production (fail-closed).
    setEnv({ AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
    // An unrecognized NODE_ENV is also not on the allowlist.
    setEnv({ NODE_ENV: "staging", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
  });

  it("an explicitly-set override is honored under recognized non-prod values", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(30);
    setEnv({ VERCEL_ENV: "development", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(30);
    setEnv({ NODE_ENV: "development", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(30);
    setEnv({ NODE_ENV: "test", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(30);
  });
});

// ── ISSUE fix evidence: malformed / extreme override values must fall back to
// the secure default — NEVER an unbounded, NaN, or 0s TTL.
describe("AAL2 TTL — malformed / extreme values fall back to the default", () => {
  const cases: Array<[string, string]> = [
    ["empty string", ""],
    ["whitespace only", "   "],
    ["interior whitespace", "1 2"],
    ["alpha", "abc"],
    ["trailing alpha", "12abc"],
    ["explicit plus sign", "+30"],
    ["zero", "0"],
    ["negative", "-1"],
    ["decimal", "1.5"],
    ["scientific notation", "1e9"],
    ["hex", "0x10"],
    ["above the default (would LENGTHEN the boundary)", String(DEFAULT_TTL + 1)],
    ["MAX_SAFE_INTEGER", String(Number.MAX_SAFE_INTEGER)],
    ["beyond safe integer (huge string)", "9".repeat(40)],
  ];
  for (const [label, value] of cases) {
    it(`falls back to default for ${label} ("${value.slice(0, 12)}")`, () => {
      setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: value });
      expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
    });
  }

  it("trims surrounding whitespace on an otherwise-valid integer (benign convenience)", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "  12  " });
    expect(aal2TtlSeconds()).toBe(12);
  });

  it("accepts a value exactly equal to the default (boundary, allowed)", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: String(DEFAULT_TTL) });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
  });

  it("accepts the smallest valid value (1s) for fast E2E", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "1" });
    expect(aal2TtlSeconds()).toBe(1);
  });
});

describe("AAL2 renewal window — preview-gated override", () => {
  it("defaults to the baked-in renewal window when nothing is set", () => {
    setEnv({});
    expect(aal2RenewalWindowSeconds()).toBe(DEFAULT_RENEWAL);
  });

  it("honors the env override on a preview deploy", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_RENEWAL_WINDOW_SECONDS: "5" });
    expect(aal2RenewalWindowSeconds()).toBe(5);
  });

  it("IGNORES the env override in production", () => {
    setEnv({ VERCEL_ENV: "production", AAL2_RENEWAL_WINDOW_SECONDS: "5" });
    expect(aal2RenewalWindowSeconds()).toBe(DEFAULT_RENEWAL);
  });

  it("falls back to the default for invalid values", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_RENEWAL_WINDOW_SECONDS: "nope" });
    expect(aal2RenewalWindowSeconds()).toBe(DEFAULT_RENEWAL);
    setEnv({ VERCEL_ENV: "preview", AAL2_RENEWAL_WINDOW_SECONDS: "0" });
    expect(aal2RenewalWindowSeconds()).toBe(DEFAULT_RENEWAL);
  });

  it("never lets the renewal window exceed the effective TTL", () => {
    // TTL compressed to 30s, renewal asked for 100s (nonsensical) → clamped.
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "30", AAL2_RENEWAL_WINDOW_SECONDS: "100" });
    expect(aal2RenewalWindowSeconds()).toBeLessThanOrEqual(aal2TtlSeconds());
  });

  // ── ISSUE fix evidence: window >= TTL must clamp to TTL, never overflow it.
  it("clamps the renewal window to the TTL when window > TTL", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "30", AAL2_RENEWAL_WINDOW_SECONDS: "999" });
    expect(aal2RenewalWindowSeconds()).toBe(30); // clamped to ttl
  });

  it("clamps the renewal window to the TTL when window == TTL", () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "30", AAL2_RENEWAL_WINDOW_SECONDS: "30" });
    expect(aal2RenewalWindowSeconds()).toBe(30);
    expect(aal2RenewalWindowSeconds()).toBeLessThanOrEqual(aal2TtlSeconds());
  });

  it("clamps the DEFAULT renewal window to a smaller compressed TTL", () => {
    // Default renewal is 300s; compress TTL to 10s → renewal must clamp to 10.
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "10" });
    expect(aal2RenewalWindowSeconds()).toBe(10);
  });
});
