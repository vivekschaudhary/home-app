import { describe, expect, it } from "vitest";
import { PAGE_SIZE, clampLimit, decodeCursor, encodeCursor, sanitizeSearch } from "./transactions";

describe("transactions keyset cursor", () => {
  it("round-trips (occurredOn, id)", () => {
    const c = encodeCursor({ occurredOn: "2026-06-15", id: "abc-123" });
    expect(decodeCursor(c)).toEqual({ occurredOn: "2026-06-15", id: "abc-123" });
  });

  it("is opaque (not the raw value)", () => {
    const c = encodeCursor({ occurredOn: "2026-06-15", id: "abc-123" });
    expect(c).not.toContain("2026-06-15");
    expect(c).not.toContain("|");
  });

  it("preserves an id that itself contains the separator", () => {
    const c = encodeCursor({ occurredOn: "2026-06-15", id: "a|b|c" });
    expect(decodeCursor(c)).toEqual({ occurredOn: "2026-06-15", id: "a|b|c" });
  });

  it("returns null for empty / malformed cursors (treated as page 1)", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not-base64-no-separator")).toBeNull();
  });
});

describe("sanitizeSearch", () => {
  it("strips PostgREST .or()/ilike grammar characters", () => {
    const out = sanitizeSearch("a,b(c)%d*e\\f");
    expect(out).not.toMatch(/[%,()*\\]/); // no grammar/wildcard chars survive
    expect(out.replace(/\s+/g, "")).toBe("abcdef"); // the letters do
  });
  it("trims and bounds length to 100", () => {
    expect(sanitizeSearch("  coffee  ")).toBe("coffee");
    expect(sanitizeSearch("x".repeat(250)).length).toBe(100);
  });
  it("handles null/undefined", () => {
    expect(sanitizeSearch(null)).toBe("");
    expect(sanitizeSearch(undefined)).toBe("");
  });
});

describe("clampLimit", () => {
  it("defaults to PAGE_SIZE for non-positive / non-finite", () => {
    expect(clampLimit(undefined)).toBe(PAGE_SIZE);
    expect(clampLimit(0)).toBe(PAGE_SIZE);
    expect(clampLimit(-5)).toBe(PAGE_SIZE);
    expect(clampLimit(Number.NaN)).toBe(PAGE_SIZE);
  });
  it("caps at PAGE_SIZE and floors", () => {
    expect(clampLimit(10_000)).toBe(PAGE_SIZE);
    expect(clampLimit(10.9)).toBe(10);
  });
});
