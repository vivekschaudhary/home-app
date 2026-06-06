import { describe, expect, it } from "vitest";
import { signAal2Token, verifyAal2Token } from "./mfa";

const SECRET = "test-secret";
const USER = "11111111-1111-1111-1111-111111111111";
const NOW = 1_700_000_000;

describe("AAL2 token (session guard)", () => {
  it("round-trips a valid token", () => {
    const token = signAal2Token(USER, SECRET, 3600, NOW);
    expect(verifyAal2Token(token, SECRET, NOW + 10)).toBe(USER);
  });

  it("rejects an expired token", () => {
    const token = signAal2Token(USER, SECRET, 60, NOW);
    expect(verifyAal2Token(token, SECRET, NOW + 120)).toBeNull();
  });

  it("rejects a wrong secret", () => {
    const token = signAal2Token(USER, SECRET, 3600, NOW);
    expect(verifyAal2Token(token, "other-secret", NOW + 10)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signAal2Token(USER, SECRET, 3600, NOW);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ sub: "attacker", exp: NOW + 3600 })).toString("base64url")}.${sig}`;
    expect(verifyAal2Token(forged, SECRET, NOW + 10)).toBeNull();
  });

  it("rejects malformed / empty tokens", () => {
    expect(verifyAal2Token(undefined, SECRET, NOW)).toBeNull();
    expect(verifyAal2Token("", SECRET, NOW)).toBeNull();
    expect(verifyAal2Token("no-dot", SECRET, NOW)).toBeNull();
  });
});
