import { describe, expect, it } from "vitest";
import { mapSignUpError } from "./signup-error";

// SUP-8 (#40 / SUP-7 audit) — signUp used to collapse every failure to `server`.
// Discriminate the user-actionable, anti-enumeration-SAFE cases; keep an
// existing-email error opaque so sign-up can't be used to enumerate accounts.
describe("mapSignUpError (SUP-8 — discriminate, but stay anti-enum)", () => {
  it("a stronger-password requirement → a validation message, not a server error", () => {
    expect(mapSignUpError({ code: "weak_password" })).toBe("validation_password");
  });

  it("a rate limit → rate_limited (by code or 429 status)", () => {
    expect(mapSignUpError({ code: "over_request_rate_limit" })).toBe("rate_limited");
    expect(mapSignUpError({ status: 429 })).toBe("rate_limited");
  });

  it("ANTI-ENUM: an 'email already registered' error stays opaque (server), never reveals the account", () => {
    expect(mapSignUpError({ code: "user_already_exists" })).toBe("server");
    expect(mapSignUpError({ code: "email_exists", status: 422 })).toBe("server");
  });

  it("unknown / empty / null → server", () => {
    expect(mapSignUpError({ code: "unexpected_failure" })).toBe("server");
    expect(mapSignUpError({})).toBe("server");
    expect(mapSignUpError(null)).toBe("server");
  });
});
