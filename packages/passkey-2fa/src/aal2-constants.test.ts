import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aal2RenewalWindowSeconds, aal2TtlSeconds, AAL2_TTL_SECONDS } from "./aal2";

// Preview-gated session-clock overrides. E2E needs to compress the AAL2 TTL +
// renewal window so re-challenge / sliding-renewal paths can be exercised in
// seconds, not the wall-clock hour the production defaults imply. The override
// is honored ONLY outside production (VERCEL_ENV !== "production"); production
// ALWAYS ignores the env vars and returns the baked-in defaults — a leaked
// override must never be able to shorten the AAL2 boundary in prod.

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

  it("honors the env override in local dev / test (no VERCEL_ENV)", () => {
    setEnv({ AAL2_TTL_SECONDS: "12" });
    expect(aal2TtlSeconds()).toBe(12);
  });

  it("IGNORES the env override in production (VERCEL_ENV=production)", () => {
    setEnv({ VERCEL_ENV: "production", AAL2_TTL_SECONDS: "30" });
    expect(aal2TtlSeconds()).toBe(DEFAULT_TTL);
  });

  it("IGNORES the env override when NODE_ENV=production (no VERCEL_ENV)", () => {
    setEnv({ NODE_ENV: "production", AAL2_TTL_SECONDS: "30" });
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
});
