import { describe, expect, it } from "vitest";
import { buildCategorySpendChart } from "./dashboard-spend";
import type { SpendingTxn } from "./recap";

// WLT-26-1 — pure compute tests. Bar is HONESTY: no fabricated zeros, no
// reference line without real history, top-10 correct.

const ASOF = "2026-06-15";
const CUR = "2026-06"; // June = current month
const P1 = "2026-05"; // May (1 month prior)
const P2 = "2026-04"; // April
const P3 = "2026-03"; // March
const P4 = "2026-02"; // February
const P5 = "2026-01"; // January (oldest in 6-month window)

function txn(
  category: string,
  month: string,
  amount: number,
  direction: "debit" | "credit" = "debit",
): SpendingTxn {
  return { direction, category, amount, occurredOn: `${month}-01` };
}

describe("buildCategorySpendChart", () => {
  describe("top-10 selection", () => {
    it("returns at most 10 bars, sorted by current-month spend desc", () => {
      const txns: SpendingTxn[] = [];
      // 12 categories in current month
      for (let i = 0; i < 12; i++) {
        txns.push(txn(`CAT_${i}`, CUR, (12 - i) * 10)); // 120, 110, 100, …, 10
        txns.push(txn(`CAT_${i}`, P1, 50)); // some prior history
      }
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.bars).toHaveLength(10);
      // Top bar = CAT_0 ($120)
      expect(chart.bars[0].category).toBe("CAT_0");
      expect(chart.bars[0].currentMonth).toBe(120);
      // 10th bar = CAT_9 ($30)
      expect(chart.bars[9].category).toBe("CAT_9");
    });

    it("ties broken alphabetically by category slug", () => {
      const txns: SpendingTxn[] = [
        txn("ZEBRA", CUR, 100),
        txn("APPLE", CUR, 100),
        txn("MANGO", CUR, 100),
        txn("APPLE", P1, 50),
        txn("ZEBRA", P1, 50),
        txn("MANGO", P1, 50),
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      const cats = chart.bars.map((b) => b.category);
      expect(cats).toEqual(["APPLE", "MANGO", "ZEBRA"]);
    });
  });

  describe("average (median of prior complete months)", () => {
    it("computes median of non-zero prior-month totals", () => {
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 120),
        txn("FOOD", P1, 80),
        txn("FOOD", P2, 100),
        txn("FOOD", P3, 90),
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      const bar = chart.bars.find((b) => b.category === "FOOD")!;
      // prior months: P1=80, P2=100, P3=90 → sorted=[80,90,100] median=90
      expect(bar.average).toBe(90);
    });

    it("returns null average when monthsOfHistory < 2", () => {
      // Only current-month transactions → monthsOfHistory = 1
      const txns: SpendingTxn[] = [txn("FOOD", CUR, 100)];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.monthsOfHistory).toBe(1);
      expect(chart.bars[0].average).toBeNull();
    });

    it("returns non-null average when monthsOfHistory >= 2 and category has prior spend", () => {
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 100),
        txn("FOOD", P1, 80),
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.monthsOfHistory).toBe(2);
      expect(chart.bars[0].average).toBe(80);
    });

    it("returns null average for a category with no prior-month spend even when other categories have history", () => {
      // FOOD has prior history; NEW_CAT is brand new (only current month)
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 100),
        txn("FOOD", P1, 80),
        txn("NEW_CAT", CUR, 50),
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.monthsOfHistory).toBe(2); // FOOD has 2 months
      const newBar = chart.bars.find((b) => b.category === "NEW_CAT")!;
      // NEW_CAT has no prior months → average = null
      expect(newBar.average).toBeNull();
    });

    it("uses median (not mean), which is robust to an outlier prior month", () => {
      // Prior months: $50, $60, $300 (outlier). mean = ~$137; median = $60
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 100),
        txn("FOOD", P1, 60),
        txn("FOOD", P2, 50),
        txn("FOOD", P3, 300), // outlier — should not inflate the baseline
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      const bar = chart.bars[0]!;
      // sorted prior: [50, 60, 300] → median = 60
      expect(bar.average).toBe(60);
    });
  });

  describe("monthsOfHistory", () => {
    it("counts distinct calendar months with ≥1 spending transaction", () => {
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 100),
        txn("FOOD", P1, 80),
        txn("FOOD", P2, 90),
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.monthsOfHistory).toBe(3);
    });

    it("counts months across categories (not per-category)", () => {
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 100),
        txn("DINING", P1, 50), // different category, different month
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.monthsOfHistory).toBe(2); // CUR + P1
    });

    it("caps at 6 within the 6-month window", () => {
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 100),
        txn("FOOD", P1, 80),
        txn("FOOD", P2, 90),
        txn("FOOD", P3, 70),
        txn("FOOD", P4, 60),
        txn("FOOD", P5, 50),
        txn("FOOD", "2025-12", 40), // outside the 6-month window → ignored
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.monthsOfHistory).toBe(6);
    });
  });

  describe("transfers excluded", () => {
    it("drops transfers/payments via countsAsSpending", () => {
      const countsAsSpending = (cat: string) => cat !== "TRANSFERS";
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 100),
        txn("TRANSFERS", CUR, 500), // should be excluded
        txn("FOOD", P1, 80),
      ];
      const chart = buildCategorySpendChart(txns, ASOF, countsAsSpending);
      expect(chart.bars.find((b) => b.category === "TRANSFERS")).toBeUndefined();
      expect(chart.bars.find((b) => b.category === "FOOD")).toBeDefined();
    });

    it("excludes credit transactions regardless", () => {
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 100),
        txn("FOOD", CUR, 500, "credit"), // credit → not spending
        txn("FOOD", P1, 80),
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.bars[0].currentMonth).toBe(100); // only the debit
    });
  });

  describe("empty states", () => {
    it("returns empty bars when current month has no spending", () => {
      // All spending in prior months only
      const txns: SpendingTxn[] = [
        txn("FOOD", P1, 80),
        txn("FOOD", P2, 90),
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.bars).toHaveLength(0);
      expect(chart.monthsOfHistory).toBe(2); // still has history
    });

    it("returns zero monthsOfHistory with no transactions", () => {
      const chart = buildCategorySpendChart([], ASOF);
      expect(chart.bars).toHaveLength(0);
      expect(chart.monthsOfHistory).toBe(0);
    });
  });

  describe("no fabricated zeros", () => {
    it("omits categories with zero current-month spend from bars", () => {
      const txns: SpendingTxn[] = [
        txn("FOOD", CUR, 100),
        txn("TRAVEL", P1, 200), // no TRAVEL spend this month
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.bars.map((b) => b.category)).toEqual(["FOOD"]);
    });
  });

  describe("humanized labels", () => {
    it("humanizes FOOD_AND_DRINK to 'Food And Drink'", () => {
      const txns: SpendingTxn[] = [
        txn("FOOD_AND_DRINK", CUR, 100),
        txn("FOOD_AND_DRINK", P1, 80),
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.bars[0].label).toBe("Food And Drink");
    });

    it("humanizes null/empty category to 'Other'", () => {
      const txns: SpendingTxn[] = [
        { direction: "debit", category: null, amount: 50, occurredOn: `${CUR}-01` },
        { direction: "debit", category: null, amount: 40, occurredOn: `${P1}-01` },
      ];
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.bars[0].label).toBe("Other");
    });
  });
});
