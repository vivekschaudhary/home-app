import { describe, expect, it } from "vitest";
import { PAGE_SIZE, clampLimit, decodeCursor, encodeCursor, sanitizeSearch } from "./transactions";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("transactions keyset cursor", () => {
  it("round-trips a valid (date, uuid) cursor", () => {
    const c = encodeCursor({ occurredOn: "2026-06-15", id: UUID });
    expect(decodeCursor(c)).toEqual({ occurredOn: "2026-06-15", id: UUID });
  });

  it("is opaque (not the raw value)", () => {
    const c = encodeCursor({ occurredOn: "2026-06-15", id: UUID });
    expect(c).not.toContain("2026-06-15");
    expect(c).not.toContain("|");
  });

  it("returns null for empty / malformed cursors (treated as page 1)", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not-base64-no-separator")).toBeNull();
  });

  it("rejects a cursor whose decoded fields aren't a strict (date, uuid) — no grammar can reach the filter", () => {
    // a crafted payload that would alter the .or() predicate if trusted
    const inject = Buffer.from("2026-06-15,id.gt.0|abc", "utf8").toString("base64url");
    expect(decodeCursor(inject)).toBeNull();
    // bad date shape
    expect(decodeCursor(encodeCursor({ occurredOn: "June 15", id: UUID }))).toBeNull();
    // bad id shape (not a uuid)
    expect(decodeCursor(encodeCursor({ occurredOn: "2026-06-15", id: "abc-123" }))).toBeNull();
    // id carrying or-grammar / wildcard chars
    expect(decodeCursor(encodeCursor({ occurredOn: "2026-06-15", id: "a),b" }))).toBeNull();
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
