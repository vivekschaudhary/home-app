import { describe, expect, it } from "vitest";
import { formatDuration, isAdmin } from "./metrics";

describe("isAdmin (the /admin/metrics gate, AC5)", () => {
  it("matches against the allow-list, case-insensitive + trimmed", () => {
    expect(isAdmin("vc@example.com", "vc@example.com")).toBe(true);
    expect(isAdmin("VC@Example.COM", " vc@example.com , other@x.com ")).toBe(true);
    expect(isAdmin("other@x.com", "vc@example.com,other@x.com")).toBe(true);
  });

  it("denies non-members, empty email, and an unset/empty allow-list (deny by default)", () => {
    expect(isAdmin("intruder@x.com", "vc@example.com")).toBe(false);
    expect(isAdmin("", "vc@example.com")).toBe(false);
    expect(isAdmin(null, "vc@example.com")).toBe(false);
    expect(isAdmin("vc@example.com", undefined)).toBe(false);
    expect(isAdmin("vc@example.com", "")).toBe(false);
    expect(isAdmin("vc@example.com", " , ,")).toBe(false); // junk list ≠ open door
  });

  it("never substring-matches (a@b.com must not pass for xa@b.com)", () => {
    expect(isAdmin("a@b.com", "xa@b.com")).toBe(false);
    expect(isAdmin("xa@b.com", "a@b.com")).toBe(false);
  });
});

describe("formatDuration", () => {
  it("renders m+s, s-only, and absent", () => {
    expect(formatDuration(872)).toBe("14m 32s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(180)).toBe("3m 0s");
    expect(formatDuration(null)).toBe("—");
  });
});
