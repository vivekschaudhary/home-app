import { describe, expect, it } from "vitest";
import {
  BUDGETABLE_CATEGORIES,
  buildBudgetRows,
  computeMonthlySpending,
  computeRecommendedBudgets,
  computeTypicalMonthlyTotal,
  resolvePercentCap,
  type SavedBudget,
} from "./budget";
import type { SpendingTxn } from "./recap";

const ASOF = "2026-06-15"; // current month 2026-06; trailing window 2025-12..2026-05

function tx(occurredOn: string, amount: number, category: string | null = "FOOD_AND_DRINK", direction = "debit"): SpendingTxn {
  return { occurredOn, amount, category, direction };
}

describe("computeMonthlySpending — this month so far", () => {
  it("sums current-month debits per category; ignores credits, other months, the future", () => {
    const m = computeMonthlySpending(
      [
        tx("2026-06-03", 100, "FOOD_AND_DRINK"),
        tx("2026-06-10", 50, "FOOD_AND_DRINK"),
        tx("2026-06-05", 200, "TRAVEL"),
        tx("2026-06-07", 999, "FOOD_AND_DRINK", "credit"), // credit ignored
        tx("2026-05-30", 80, "FOOD_AND_DRINK"), // prior month ignored
        tx("2026-06-20", 40, "TRAVEL"), // after asOf ignored
      ],
      ASOF,
    );
    expect(m.get("FOOD_AND_DRINK")).toBe(150);
    expect(m.get("TRAVEL")).toBe(200);
  });

  it("buckets a null category under '' (→ 'Other' at display)", () => {
    const m = computeMonthlySpending([tx("2026-06-02", 30, null)], ASOF);
    expect(m.get("")).toBe(30);
  });
});

describe("computeRecommendedBudgets — median of trailing monthly totals", () => {
  it("trims discretionary 10%, leaves essentials untrimmed", () => {
    const r = computeRecommendedBudgets(
      [
        // ENTERTAINMENT (discretionary): monthly totals 100/200/300 → median 200 → ×0.9 = 180
        tx("2025-12-10", 100, "ENTERTAINMENT"),
        tx("2026-01-10", 200, "ENTERTAINMENT"),
        tx("2026-02-10", 300, "ENTERTAINMENT"),
        // RENT_AND_UTILITIES (essential): 2000/2000 → median 2000 → untrimmed
        tx("2026-03-01", 2000, "RENT_AND_UTILITIES"),
        tx("2026-04-01", 2000, "RENT_AND_UTILITIES"),
      ],
      ASOF,
    );
    expect(r.get("ENTERTAINMENT")).toBe(180);
    expect(r.get("RENT_AND_UTILITIES")).toBe(2000);
  });

  it("cold-start: a category with spend only in the current month gets NO recommendation", () => {
    const r = computeRecommendedBudgets([tx("2026-06-05", 500, "TRAVEL")], ASOF);
    expect(r.has("TRAVEL")).toBe(false);
  });

  it("treats the documented GROCERIES + INSURANCE categories as untrimmed essentials", () => {
    const r = computeRecommendedBudgets(
      [
        // GROCERIES (documented essential — legacy taxonomy): 300/300 → median 300, untrimmed
        tx("2026-04-04", 300, "GROCERIES"),
        tx("2026-05-04", 300, "GROCERIES"),
        // INSURANCE (documented essential): 100/100 → median 100, untrimmed
        tx("2026-04-06", 100, "INSURANCE"),
        tx("2026-05-06", 100, "INSURANCE"),
      ],
      ASOF,
    );
    expect(r.get("GROCERIES")).toBe(300); // NOT 270 — essential, not trimmed
    expect(r.get("INSURANCE")).toBe(100);
  });
});

describe("resolvePercentCap + computeTypicalMonthlyTotal", () => {
  it("resolves a percent of the trailing median monthly total; null when no history", () => {
    // trailing monthly grand totals: 2026-04 = 1000, 2026-05 = 2000 → median 1500
    const txns = [tx("2026-04-10", 1000, "FOOD_AND_DRINK"), tx("2026-05-10", 2000, "TRAVEL")];
    expect(computeTypicalMonthlyTotal(txns, ASOF)).toBe(1500);
    expect(resolvePercentCap(20, 1500)).toBe(300);
    expect(resolvePercentCap(20, null)).toBeNull();
    expect(computeTypicalMonthlyTotal([], ASOF)).toBeNull();
  });
});

describe("buildBudgetRows — the view model", () => {
  const history: SpendingTxn[] = [
    // FOOD trailing: 2026-04 = 400, 2026-05 = 600 → median 500 → discretionary? FOOD is essential → 500
    tx("2026-04-02", 400, "FOOD_AND_DRINK"),
    tx("2026-05-02", 600, "FOOD_AND_DRINK"),
    // this month FOOD actual = 520
    tx("2026-06-03", 520, "FOOD_AND_DRINK"),
    // TRAVEL this month = 200, no history → no recommendation
    tx("2026-06-04", 200, "TRAVEL"),
  ];

  it("joins actual + recommended; an amount budget under/over sets status + cap", () => {
    const budgets: SavedBudget[] = [{ category: "FOOD_AND_DRINK", limitAmount: 500, limitPercent: null }];
    const rows = buildBudgetRows({ budgets, txns: history, asOf: ASOF });
    const food = rows.find((r) => r.category === "FOOD_AND_DRINK")!;
    expect(food.label).toBe("Food And Drink");
    expect(food.actualThisMonth).toBe(520);
    expect(food.recommended).toBe(500); // essential, untrimmed
    expect(food.budget).toEqual({ type: "amount", amount: 500 });
    expect(food.effectiveCap).toBe(500);
    expect(food.status).toBe("over"); // 520 > 500
  });

  it("resolves a percent budget to an effective cap", () => {
    // trailing grand totals: 2026-04 = 400, 2026-05 = 600 → median 500; 50% → 250
    const budgets: SavedBudget[] = [{ category: "TRAVEL", limitAmount: null, limitPercent: 50 }];
    const rows = buildBudgetRows({ budgets, txns: history, asOf: ASOF });
    const travel = rows.find((r) => r.category === "TRAVEL")!;
    expect(travel.budget).toEqual({ type: "percent", percent: 50 });
    expect(travel.effectiveCap).toBe(250);
    expect(travel.status).toBe("under"); // 200 < 250
    expect(travel.recommended).toBeNull(); // no history
  });

  it("shows a category that has a budget but no spend this month; sorts by spend desc", () => {
    const budgets: SavedBudget[] = [{ category: "INSURANCE", limitAmount: 100, limitPercent: null }];
    const rows = buildBudgetRows({ budgets, txns: history, asOf: ASOF });
    expect(rows.map((r) => r.category)).toEqual(["FOOD_AND_DRINK", "TRAVEL", "INSURANCE"]); // 520 > 200 > 0
    const ins = rows.find((r) => r.category === "INSURANCE")!;
    expect(ins.actualThisMonth).toBe(0);
    expect(ins.status).toBe("under"); // 0 < 100
  });

  it("null category surfaces as 'Other', never dropped", () => {
    const rows = buildBudgetRows({ budgets: [], txns: [tx("2026-06-02", 30, null)], asOf: ASOF });
    const other = rows.find((r) => r.category === "")!;
    expect(other.label).toBe("Other");
    expect(other.actualThisMonth).toBe(30);
    expect(other.status).toBe("none"); // no budget
  });
});

describe("BUDGETABLE_CATEGORIES", () => {
  it("offers spendable categories only — never income or transfers", () => {
    expect(BUDGETABLE_CATEGORIES).toContain("FOOD_AND_DRINK");
    expect(BUDGETABLE_CATEGORIES).toContain("RENT_AND_UTILITIES");
    expect(BUDGETABLE_CATEGORIES).not.toContain("INCOME");
    expect(BUDGETABLE_CATEGORIES).not.toContain("TRANSFER_IN");
    expect(BUDGETABLE_CATEGORIES).not.toContain("TRANSFER_OUT");
  });

  it("offers the documented categories the picker must surface (GROCERIES, INSURANCE)", () => {
    expect(BUDGETABLE_CATEGORIES).toContain("GROCERIES");
    expect(BUDGETABLE_CATEGORIES).toContain("INSURANCE");
  });
});
