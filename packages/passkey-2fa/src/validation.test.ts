import { describe, expect, it } from "vitest";
import { passwordStrength, signInSchema, signUpSchema } from "./validation";

describe("signUpSchema", () => {
  it("accepts a valid email + 12+ char password", () => {
    expect(signUpSchema.safeParse({ email: "a@example.com", password: "a strong pass" }).success).toBe(
      true,
    );
  });
  it("rejects an invalid email", () => {
    const r = signUpSchema.safeParse({ email: "nope", password: "a strong pass" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path[0]).toBe("email");
  });
  it("rejects a password under 12 chars", () => {
    const r = signUpSchema.safeParse({ email: "a@example.com", password: "short" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path[0]).toBe("password");
  });
});

describe("signInSchema", () => {
  it("requires a non-empty password but not the 12-char rule", () => {
    expect(signInSchema.safeParse({ email: "a@example.com", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@example.com", password: "" }).success).toBe(false);
  });
});

describe("passwordStrength", () => {
  it("scores too-short as 0", () => {
    expect(passwordStrength("short").score).toBe(0);
  });
  it("rewards length + passphrase spaces", () => {
    expect(passwordStrength("correct horse battery staple").score).toBeGreaterThanOrEqual(3);
  });
});
