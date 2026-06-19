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
  it("lowercases + canonicalizes a merchant to a stable key across Plaid name variants (INC-2026-06-19)", () => {
    // The bug: Plaid emits varying merchant_name for the same merchant, so the
    // exact-match rule key missed new transactions. The key now collapses store
    // numbers, ".com"/format noise, and punctuation so the variants converge.
    for (const variant of ["Walmart", "Walmart.com", "WAL-MART", "Walmart  Supercenter #1234", "WALMART ONLINE"]) {
      expect(normalizeMerchant(variant)).toBe("walmart");
    }
    expect(normalizeMerchant("  STARBUCKS   #123 ")).toBe("starbucks");
    expect(normalizeMerchant("Starbucks #456")).toBe("starbucks");
  });
  it("keeps genuinely-different merchants distinct (precision — no over-merge)", () => {
    expect(normalizeMerchant("Walmart Pharmacy")).toBe("walmartpharmacy");
    expect(normalizeMerchant("Walmart Pharmacy")).not.toBe(normalizeMerchant("Walmart"));
  });
  it("is idempotent (safe to re-apply to an already-stored key)", () => {
    expect(normalizeMerchant(normalizeMerchant("Walmart.com"))).toBe("walmart");
    expect(normalizeMerchant(normalizeMerchant("Walmart Pharmacy"))).toBe("walmartpharmacy");
  });
  it("null / blank → empty string", () => {
    expect(normalizeMerchant(null)).toBe("");
    expect(normalizeMerchant("   ")).toBe("");
    expect(normalizeMerchant("#1234")).toBe(""); // a bare store number → no merchant key
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

  it("matches a merchant rule across Plaid name VARIANTS — the INC-2026-06-19 fix", () => {
    const walmart = [{ merchantNorm: "walmart", categoryId: "cat-grocery", ruleId: "r-wm" }];
    const out = matchRuleAssignments(
      [
        { dedupKey: "dk-1", merchant: "Walmart" },
        { dedupKey: "dk-2", merchant: "Walmart.com" },
        { dedupKey: "dk-3", merchant: "WAL-MART" },
        { dedupKey: "dk-4", merchant: "Walmart Supercenter #1234" },
        { dedupKey: "dk-5", merchant: "Walmart Pharmacy" }, // a DIFFERENT merchant → must NOT match
        { dedupKey: "dk-6", merchant: null }, // no name → can't match
      ],
      new Set(),
      walmart,
    );
    expect(out.map((m) => m.dedupKey).sort()).toEqual(["dk-1", "dk-2", "dk-3", "dk-4"]);
    expect(out.every((m) => m.categoryId === "cat-grocery")).toBe(true);
  });

  it("on a canonical-key collision (two legacy rows) the NEWEST rule wins — deterministically, regardless of load order (review BLOCKER)", () => {
    // The pre-fix DB was unique on the OLD raw key, so these two rows coexisted;
    // both now canonicalize to "walmart". The newest updated_at must win, and the
    // outcome must NOT depend on the order readRules() returned the rows.
    const older = { merchantNorm: "walmart.com", categoryId: "cat-old", ruleId: "r-a", updatedAt: "2026-06-01T00:00:00Z" };
    const newer = { merchantNorm: "walmart supercenter #1234", categoryId: "cat-new", ruleId: "r-b", updatedAt: "2026-06-18T00:00:00Z" };
    const txns = [{ dedupKey: "dk-1", merchant: "Walmart" }];
    expect(matchRuleAssignments(txns, new Set(), [older, newer])).toEqual([{ dedupKey: "dk-1", categoryId: "cat-new", ruleId: "r-b" }]);
    expect(matchRuleAssignments(txns, new Set(), [newer, older])).toEqual([{ dedupKey: "dk-1", categoryId: "cat-new", ruleId: "r-b" }]);
  });

  it("ignores a rule whose key canonicalizes to empty (e.g. a number-only legacy key)", () => {
    expect(matchRuleAssignments([{ dedupKey: "dk-1", merchant: "Walmart" }], new Set(), [{ merchantNorm: "#9999", categoryId: "x", ruleId: "r" }])).toEqual([]);
  });

  it("re-canonicalizes a LEGACY rule key stored before the fix (so old rules match new variants)", () => {
    // a rule created pre-fix may have stored a variant key like "walmart supercenter"
    const legacy = [{ merchantNorm: "walmart supercenter", categoryId: "cat-grocery", ruleId: "r-old" }];
    const out = matchRuleAssignments(
      [
        { dedupKey: "dk-1", merchant: "Walmart" },
        { dedupKey: "dk-2", merchant: "Walmart.com" },
      ],
      new Set(),
      legacy,
    );
    expect(out.map((m) => m.dedupKey).sort()).toEqual(["dk-1", "dk-2"]);
  });
});
