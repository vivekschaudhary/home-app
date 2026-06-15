import { describe, expect, it } from "vitest";
import { mapUpdatePasswordError } from "./update-password-error";

// SUP-7 (#40 class) — the recovery "set a new password" handler used to map EVERY
// supabase.auth.updateUser error to a blanket 502 "server", so a client-actionable
// rejection (most often: the new password equals the current one) surfaced as an
// opaque server error with no path forward. Discriminate by Supabase's error code.
describe("mapUpdatePasswordError (SUP-7 — don't 502 a client-actionable rejection)", () => {
  it("REGRESSION: 'same as current password' is its own code, NOT a 502 server error", () => {
    expect(mapUpdatePasswordError({ code: "same_password" })).toBe("same_password");
  });

  it("a password Supabase won't accept (weak/breached/policy) → a validation message, not 502", () => {
    expect(mapUpdatePasswordError({ code: "weak_password" })).toBe("validation_password");
  });

  it("a server-side rate limit → rate_limited (by code or 429 status)", () => {
    expect(mapUpdatePasswordError({ code: "over_request_rate_limit" })).toBe("rate_limited");
    expect(mapUpdatePasswordError({ status: 429 })).toBe("rate_limited");
  });

  it("a genuine server/unknown failure stays 'server' (the only case that should 502)", () => {
    expect(mapUpdatePasswordError({ code: "unexpected_failure" })).toBe("server");
    expect(mapUpdatePasswordError({ code: "some_future_code" })).toBe("server");
    expect(mapUpdatePasswordError({})).toBe("server");
    expect(mapUpdatePasswordError(null)).toBe("server");
  });
});
