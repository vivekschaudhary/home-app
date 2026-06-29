import { describe, expect, it } from "vitest";
import { buildCategorySpendChart } from "./dashboard-spend";
import type { SpendingTxn } from "./recap";

const ASOF = "2026-06-15"; // curMonth = 2026-06; 5 prior months = 2026-01..2026-05

function tx(occurredOn: string, amount: number, category: string | null = "FOOD_AND_DRINK", direction = "debit", currency = "USD"): SpendingTxn {
  return { occurredOn, amount, category, direction, currency };
}

describe("buildCategorySpendChart", () => {
  describe("current-month spend", () => {
    it("sums current-month debits per category up to asOf", () => {
      const chart = buildCategorySpendChart(
        [
          tx("2026-06-03", 100, "FOOD_AND_DRINK"),
          tx("2026-06-10", 50, "FOOD_AND_DRINK"),
          tx("2026-06-05", 200, "TRAVEL"),
          tx("2026-06-20", 40, "TRAVEL"), // after asOf → excluded
          tx("2026-06-07", 999, "FOOD_AND_DRINK", "credit"), // credit → excluded
        ],
        ASOF,
      );
      const food = chart.bars.find((b) => b.category === "FOOD_AND_DRINK");
      const travel = chart.bars.find((b) => b.category === "TRAVEL");
      expect(food?.currentMonth).toBe(150);
      expect(travel?.currentMonth).toBe(200);
    });

    it("sets currentMonth in the returned chart", () => {
      const chart = buildCategorySpendChart([tx("2026-06-01", 50)], ASOF);
      expect(chart.currentMonth).toBe("2026-06");
    });
  });

  describe("top-10 selection", () => {
    it("returns at most 10 bars sorted by currentMonth desc", () => {
      const txns: SpendingTxn[] = [];
      for (let i = 1; i <= 12; i++) {
        txns.push(tx("2026-06-01", i * 100, `CAT_${String(i).padStart(2, "0")}`));
      }
      const chart = buildCategorySpendChart(txns, ASOF);
      expect(chart.bars.length).toBe(10);
      expect(chart.bars[0].currentMonth).toBe(1200); // CAT_12 is highest
      expect(chart.bars[9].currentMonth).toBe(300); // CAT_03 is 10th
    });

    it("breaks ties alphabetically by label", () => {
      const chart = buildCategorySpendChart(
        [
          tx("2026-06-01", 100, "TRAVEL"),
          tx("2026-06-01", 100, "FOOD_AND_DRINK"),
          tx("2026-06-01", 100, "ENTERTAINMENT"),
        ],
        ASOF,
      );
      expect(chart.bars[0].label).toBe("Entertainment"); // 'E' < 'F' < 'T'
      expect(chart.bars[1].label).toBe("Food And Drink");
      expect(chart.bars[2].label).toBe("Travel");
    });
  });

  describe("average — median of prior months", () => {
    it("computes median of prior-month totals per category", () => {
      const chart = buildCategorySpendChart(
        [
          // 3 prior months of FOOD_AND_DRINK: 100, 200, 300 → median = 200
          tx("2026-03-01", 100, "FOOD_AND_DRINK"),
          tx("2026-04-01", 200, "FOOD_AND_DRINK"),
          tx("2026-05-01", 300, "FOOD_AND_DRINK"),
          // current month
          tx("2026-06-01", 150, "FOOD_AND_DRINK"),
        ],
        ASOF,
      );
      const food = chart.bars.find((b) => b.category === "FOOD_AND_DRINK")!;
      expect(food.average).toBe(200);
    });

    it("multiple transactions in the same prior month are summed before median", () => {
      const chart = buildCategorySpendChart(
        [
          // May: 80 + 120 = 200; Apr: 150; Mar: 100 → totals [200, 150, 100] → median = 150
          tx("2026-05-01", 80, "FOOD_AND_DRINK"),
          tx("2026-05-15", 120, "FOOD_AND_DRINK"),
          tx("2026-04-01", 150, "FOOD_AND_DRINK"),
          tx("2026-03-01", 100, "FOOD_AND_DRINK"),
          tx("2026-06-01", 50, "FOOD_AND_DRINK"),
        ],
        ASOF,
      );
      const food = chart.bars.find((b) => b.category === "FOOD_AND_DRINK")!;
      expect(food.average).toBe(150);
    });

    it("returns average = null when monthsOfHistory < 2 (even if prior data exists)", () => {
      // Only 1 month of history (current month only)
      const chart = buildCategorySpendChart(
        [tx("2026-06-01", 100, "FOOD_AND_DRINK")],
        ASOF,
      );
      expect(chart.monthsOfHistory).toBe(1);
      const food = chart.bars.find((b) => b.category === "FOOD_AND_DRINK")!;
      expect(food.average).toBeNull();
    });

    it("returns average = null for a category with no prior-month history even if monthsOfHistory >= 2", () => {
      const chart = buildCategorySpendChart(
        [
          tx("2026-05-01", 100, "FOOD_AND_DRINK"), // prior month → monthsOfHistory >= 2
          tx("2026-06-01", 50, "FOOD_AND_DRINK"),
          tx("2026-06-01", 200, "TRAVEL"), // TRAVEL only in current month — no prior
        ],
        ASOF,
      );
      const travel = chart.bars.find((b) => b.category === "TRAVEL")!;
      expect(travel.average).toBeNull();
    });
  });

  describe("monthsOfHistory", () => {
    it("counts distinct months with spending in the 6-month window", () => {
      const chart = buildCategorySpendChart(
        [
          tx("2026-04-01", 100),
          tx("2026-05-01", 100),
          tx("2026-06-01", 100),
        ],
        ASOF,
      );
      expect(chart.monthsOfHistory).toBe(3);
    });

    it("is 0 when there are no spending transactions in the window", () => {
      const chart = buildCategorySpendChart([], ASOF);
      expect(chart.monthsOfHistory).toBe(0);
    });

    it("does not count months outside the 6-month window", () => {
      const chart = buildCategorySpendChart(
        [
          tx("2025-12-01", 100), // 6+ months before curMonth → outside window
          tx("2026-06-01", 100),
        ],
        ASOF,
      );
      expect(chart.monthsOfHistory).toBe(1); // only current month
    });
  });

  describe("transfers excluded", () => {
    it("drops categories where countsAsSpending returns false", () => {
      const countsAsSpending = (cat: string) => cat !== "TRANSFER_OUT";
      const chart = buildCategorySpendChart(
        [
          tx("2026-06-01", 500, "TRANSFER_OUT"),
          tx("2026-06-01", 100, "FOOD_AND_DRINK"),
        ],
        ASOF,
        countsAsSpending,
      );
      expect(chart.bars.find((b) => b.category === "TRANSFER_OUT")).toBeUndefined();
      expect(chart.bars.find((b) => b.category === "FOOD_AND_DRINK")).toBeDefined();
    });

    it("excluded categories do not count toward monthsOfHistory", () => {
      const countsAsSpending = (cat: string) => cat !== "TRANSFER_OUT";
      const chart = buildCategorySpendChart(
        [tx("2026-06-01", 500, "TRANSFER_OUT")],
        ASOF,
        countsAsSpending,
      );
      expect(chart.monthsOfHistory).toBe(0);
    });
  });

  describe("empty states", () => {
    it("returns empty bars when there are no current-month spending transactions", () => {
      const chart = buildCategorySpendChart(
        [tx("2026-05-01", 100)], // prior month only
        ASOF,
      );
      expect(chart.bars).toHaveLength(0);
    });

    it("returns empty bars and 0 history when given no transactions", () => {
      const chart = buildCategorySpendChart([], ASOF);
      expect(chart.bars).toHaveLength(0);
      expect(chart.monthsOfHistory).toBe(0);
    });

    it("null category is grouped under '' and humanized to 'Other' in the label", () => {
      const chart = buildCategorySpendChart([tx("2026-06-01", 50, null)], ASOF);
      const other = chart.bars.find((b) => b.category === "");
      expect(other).toBeDefined();
      expect(other?.label).toBe("Other");
    });
  });

  describe("no fabricated zeros", () => {
    it("bars with zero current-month spend are not emitted", () => {
      // A category with prior history but no current-month spend should not appear
      const chart = buildCategorySpendChart(
        [tx("2026-05-01", 100, "TRAVEL")],
        ASOF,
      );
      expect(chart.bars.find((b) => b.category === "TRAVEL")).toBeUndefined();
    });
  });
});
