import { describe, expect, it } from "vitest";
import { wouldLeaveNoSecondFactor } from "./totp";

describe("wouldLeaveNoSecondFactor (last-factor guard)", () => {
  it("blocks when removing TOTP would leave zero second factors", () => {
    // no passkey, removing the only TOTP → 0 left → block
    expect(wouldLeaveNoSecondFactor(0, 0)).toBe(true);
  });

  it("allows when a passkey remains", () => {
    // passkey present, removing TOTP leaves the passkey → allow
    expect(wouldLeaveNoSecondFactor(1, 0)).toBe(false);
  });

  it("allows when another TOTP factor remains", () => {
    expect(wouldLeaveNoSecondFactor(0, 1)).toBe(false);
  });

  it("allows with both factors present after removal", () => {
    expect(wouldLeaveNoSecondFactor(2, 1)).toBe(false);
  });
});
