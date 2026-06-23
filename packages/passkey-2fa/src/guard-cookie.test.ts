import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ISSUE fix evidence: the AAL2 cookie's `maxAge` must equal the effective TTL
// in SECONDS (next/headers cookies().set uses seconds, per the Web Cookie
// Max-Age semantics) — never milliseconds. A unit mismatch would cause a 1000×
// drift between the cookie lifetime and the signed-token `exp`. These tests
// pin: (a) maxAge === aal2TtlSeconds() under the default, and (b) it tracks the
// compressed value under a preview override (so cookie + token expire together).

// --- Mocks: keep setAal2Cookie's collaborators inert so we can read the cookie
//     options the unit actually sets. ---

const setSpy = vi.fn();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: setSpy,
    get: vi.fn(() => undefined),
    delete: vi.fn(),
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));

vi.mock("./config", () => ({
  mfaSecret: () => "test-secret",
}));

// currentSessionId() reads the supabase session; a null sid is fine for this test.
vi.mock("./supabase", () => ({
  createServerSupabase: async () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
  }),
}));

import { aal2TtlSeconds } from "./aal2";
import { setAal2Cookie } from "./guard";

const ENV_KEYS = ["VERCEL_ENV", "NODE_ENV", "AAL2_TTL_SECONDS"] as const;
const env = process.env as Record<string, string | undefined>;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  setSpy.mockClear();
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

describe("setAal2Cookie — maxAge unit correctness (seconds)", () => {
  it("sets maxAge to the effective TTL in SECONDS (default)", async () => {
    setEnv({});
    await setAal2Cookie("11111111-1111-1111-1111-111111111111");
    expect(setSpy).toHaveBeenCalledTimes(1);
    const [, , opts] = setSpy.mock.calls[0];
    expect(opts.maxAge).toBe(aal2TtlSeconds());
    expect(opts.maxAge).toBe(60 * 60); // 1h in seconds — NOT ms (would be 3_600_000)
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("strict");
  });

  it("tracks the compressed TTL so cookie + token expire together (preview override)", async () => {
    setEnv({ VERCEL_ENV: "preview", AAL2_TTL_SECONDS: "30" });
    await setAal2Cookie("11111111-1111-1111-1111-111111111111");
    const [, , opts] = setSpy.mock.calls[0];
    expect(opts.maxAge).toBe(30);
    expect(opts.maxAge).toBe(aal2TtlSeconds());
  });

  it("IGNORES the override in production — cookie maxAge stays the default", async () => {
    setEnv({ VERCEL_ENV: "production", AAL2_TTL_SECONDS: "30" });
    await setAal2Cookie("11111111-1111-1111-1111-111111111111");
    const [, , opts] = setSpy.mock.calls[0];
    expect(opts.maxAge).toBe(60 * 60);
  });
});
