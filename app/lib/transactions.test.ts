import { describe, expect, it } from "vitest";
import { PAGE_SIZE, clampLimit, decodeCursor, encodeCursor, nextMonthStart, parseMonth, sanitizeSearch } from "./transactions";

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

describe("parseMonth", () => {
  it("accepts valid months", () => {
    expect(parseMonth("2026-01")).toBe("2026-01");
    expect(parseMonth("2026-06")).toBe("2026-06");
    expect(parseMonth("2026-12")).toBe("2026-12");
    expect(parseMonth("1999-09")).toBe("1999-09");
  });

  it("rejects month 00 and 13–99 (would produce invalid PostgreSQL dates → 500)", () => {
    expect(parseMonth("2026-00")).toBeNull();
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("2026-99")).toBeNull();
  });

  it("rejects bad format", () => {
    expect(parseMonth(null)).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
    expect(parseMonth("")).toBeNull();
    expect(parseMonth("2026-6")).toBeNull(); // must be zero-padded
    expect(parseMonth("2026/06")).toBeNull();
    expect(parseMonth("June 2026")).toBeNull();
    expect(parseMonth("2026-06-01")).toBeNull(); // full date, not month
  });
});

describe("nextMonthStart", () => {
  it("advances month within a year", () => {
    expect(nextMonthStart("2026-01")).toBe("2026-02-01");
    expect(nextMonthStart("2026-06")).toBe("2026-07-01");
    expect(nextMonthStart("2026-11")).toBe("2026-12-01");
  });

  it("wraps December into January of the next year", () => {
    expect(nextMonthStart("2026-12")).toBe("2027-01-01");
  });
});
