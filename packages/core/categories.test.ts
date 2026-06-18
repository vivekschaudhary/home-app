import { describe, expect, it } from "vitest";
import { effectiveCategory, matchRuleAssignments, normalizeMerchant, resolveCategory } from "./categories";

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

describe("normalizeMerchant (WLT-22-3 — the rule match key)", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeMerchant("  STARBUCKS   #123 ")).toBe("starbucks #123");
    expect(normalizeMerchant("Starbucks #123")).toBe("starbucks #123");
  });
  it("null / blank → empty string", () => {
    expect(normalizeMerchant(null)).toBe("");
    expect(normalizeMerchant("   ")).toBe("");
  });
});

describe("matchRuleAssignments (WLT-22-3 — which transactions a rule writes)", () => {
  const rules = [{ merchantNorm: "starbucks", categoryId: "cat-coffee", ruleId: "rule-1" }];

  it("writes 'rule' to every matching transaction (normalized), regardless of case/spacing", () => {
    const out = matchRuleAssignments(
      [
        { dedupKey: "dk-1", merchant: "STARBUCKS" },
        { dedupKey: "dk-2", merchant: "  starbucks " },
        { dedupKey: "dk-3", merchant: "Whole Foods" }, // no rule → skipped
      ],
      new Set(),
      rules,
    );
    expect(out.map((m) => m.dedupKey).sort()).toEqual(["dk-1", "dk-2"]);
    expect(out.every((m) => m.categoryId === "cat-coffee" && m.ruleId === "rule-1")).toBe(true);
  });

  it("NEVER writes over a 'user' override — the user's explicit choice wins", () => {
    const out = matchRuleAssignments(
      [
        { dedupKey: "dk-1", merchant: "Starbucks" }, // user-owned → excluded
        { dedupKey: "dk-2", merchant: "Starbucks" },
      ],
      new Set(["dk-1"]),
      rules,
    );
    expect(out.map((m) => m.dedupKey)).toEqual(["dk-2"]);
  });

  it("returns nothing when no merchant matches a rule", () => {
    expect(matchRuleAssignments([{ dedupKey: "dk-1", merchant: "Costco" }], new Set(), rules)).toEqual([]);
  });
});
