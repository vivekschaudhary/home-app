import { describe, expect, it } from "vitest";
import { effectiveCategory, resolveCategory } from "./categories";

describe("effectiveCategory (WLT-22-2 — saved ?? Plaid)", () => {
  it("the SAVED category wins over Plaid's", () => {
    expect(effectiveCategory("FOOD_AND_DRINK", "Rent")).toBe("Rent");
  });

  it("an UNTOUCHED transaction falls back to Plaid's", () => {
    expect(effectiveCategory("FOOD_AND_DRINK", null)).toBe("FOOD_AND_DRINK");
    expect(effectiveCategory("FOOD_AND_DRINK", undefined)).toBe("FOOD_AND_DRINK");
  });

  it("null Plaid + no saved → null (display humanizes to 'Other')", () => {
    expect(effectiveCategory(null, null)).toBeNull();
    expect(effectiveCategory(undefined, undefined)).toBeNull();
  });

  it("a saved category resolves even when Plaid's is null", () => {
    expect(effectiveCategory(null, "Rent")).toBe("Rent");
  });
});

describe("resolveCategory (against an assignment map)", () => {
  const assignments = new Map<string, string>([["plaid:acct:txn-1", "Rent"]]);

  it("uses the saved name when the dedupKey has an assignment", () => {
    expect(resolveCategory({ dedupKey: "plaid:acct:txn-1", category: "RENT_AND_UTILITIES" }, assignments)).toBe("Rent");
  });

  it("falls back to Plaid for an unassigned dedupKey", () => {
    expect(resolveCategory({ dedupKey: "plaid:acct:txn-2", category: "FOOD_AND_DRINK" }, assignments)).toBe(
      "FOOD_AND_DRINK",
    );
  });
});
