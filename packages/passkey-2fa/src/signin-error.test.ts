import { describe, expect, it } from "vitest";
import { mapSignInError } from "./signin-error";

describe("mapSignInError (#40 — don't call every failure 'wrong password')", () => {
  it("a genuine credential rejection → invalid_credentials", () => {
    expect(mapSignInError({ code: "invalid_credentials" })).toBe("invalid_credentials");
    expect(mapSignInError({ code: "invalid_grant" })).toBe("invalid_credentials");
  });

  it("an unconfirmed email → its own code, not 'wrong password'", () => {
    expect(mapSignInError({ code: "email_not_confirmed" })).toBe("email_confirmation_required");
  });

  it("REGRESSION: a server/config error must NOT masquerade as a bad password", () => {
    expect(mapSignInError({ code: "unexpected_failure" })).toBe("server");
    expect(mapSignInError({ code: "over_request_rate_limit" })).toBe("server");
    expect(mapSignInError({ code: "some_future_code" })).toBe("server");
  });

  it("conservative default when there's no usable code (error w/o code, or no error)", () => {
    expect(mapSignInError({})).toBe("invalid_credentials");
    expect(mapSignInError(null)).toBe("invalid_credentials");
    expect(mapSignInError(undefined)).toBe("invalid_credentials");
  });
});
