// WLT-27-1 regression suite — verifies that adding `currency: string` to
// SpendingTxn does NOT change any computation for USD-only transaction sets.
// All pure compute functions receive a pre-filtered SpendingTxn[] from the
// app-layer read; they never branch on `currency` themselves.
//
// Tagged: regression: true, e2e: false

import { describe, expect, it } from "vitest";
import { buildBudgetRows, computeMonthlySeries } from "./budget";
import { buildCategorySpendChart } from "./dashboard-spend";
import { type SpendingTxn, computeSpendingComparison } from "./recap";

// ----------------------------------------------------------------------------
// Shared fixture — a realistic 2-month USD-only transaction set
// ----------------------------------------------------------------------------

const ASOF = "2026-06-15";

function usdTx(
  occurredOn: string,
  amount: number,
  category: string | null = "FOOD_AND_DRINK",
  direction = "debit",
): SpendingTxn {
  return { occurredOn, amount, category, direction, currency: "USD" };
}

// A representative USD-only set exercising all the code paths the pure functions use.
const USD_TXNS: SpendingTxn[] = [
  usdTx("2026-06-03", 120, "FOOD_AND_DRINK"),
  usdTx("2026-06-08", 45, "TRAVEL"),
  usdTx("2026-06-10", 200, "RENT_AND_UTILITIES"),
  usdTx("2026-06-11", 30, "FOOD_AND_DRINK"),
  usdTx("2026-06-12", 500, "FOOD_AND_DRINK", "credit"), // credit — excluded from totals
  usdTx("2026-05-10", 110, "FOOD_AND_DRINK"),
  usdTx("2026-05-12", 40, "TRAVEL"),
  usdTx("2026-04-14", 105, "FOOD_AND_DRINK"),
  usdTx("2026-04-20", 35, "TRAVEL"),
];

// ----------------------------------------------------------------------------
// AC-6: computeMonthlySeries — identical output before and after currency field
// ----------------------------------------------------------------------------

describe("computeMonthlySeries — USD-only txns unchanged by currency field (AC-6)", () => {
  it("produces the same FOOD_AND_DRINK monthly series as before the currency field was added", () => {
    const series = computeMonthlySeries(USD_TXNS, ASOF);
    const food = series.get("FOOD_AND_DRINK")!;
    expect(food).toHaveLength(12);
    // current month (index 11 = 2026-06): 120 + 30 = 150 (credit not counted)
    expect(food[11]).toBe(150);
    // 2026-05 (index 10): 110
    expect(food[10]).toBe(110);
    // 2026-04 (index 9): 105
    expect(food[9]).toBe(105);
    // months outside the window are real zeros
    expect(food[0]).toBe(0);
  });

  it("produces the same TRAVEL series", () => {
    const series = computeMonthlySeries(USD_TXNS, ASOF);
    const travel = series.get("TRAVEL")!;
    expect(travel[11]).toBe(45); // 2026-06
    expect(travel[10]).toBe(40); // 2026-05
    expect(travel[9]).toBe(35);  // 2026-04
  });
});

// ----------------------------------------------------------------------------
// AC-6: buildBudgetRows — unchanged output for USD-only txns
// ----------------------------------------------------------------------------

describe("buildBudgetRows — USD-only txns unchanged by currency field (AC-6)", () => {
  it("returns correct this-month actuals for each category", () => {
    const rows = buildBudgetRows({ budgets: [], txns: USD_TXNS, asOf: ASOF });
    const food = rows.find((r) => r.category === "FOOD_AND_DRINK")!;
    const rent = rows.find((r) => r.category === "RENT_AND_UTILITIES")!;
    const travel = rows.find((r) => r.category === "TRAVEL")!;

    expect(food.actualThisMonth).toBe(150); // 120 + 30; credit excluded
    expect(rent.actualThisMonth).toBe(200);
    expect(travel.actualThisMonth).toBe(45);
  });

  it("none of the rows has 'over' status with no budget set (no currency-driven change)", () => {
    const rows = buildBudgetRows({ budgets: [], txns: USD_TXNS, asOf: ASOF });
    expect(rows.every((r) => r.status === "none")).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// AC-6: buildCategorySpendChart — unchanged output for USD-only txns
// ----------------------------------------------------------------------------

describe("buildCategorySpendChart — USD-only txns unchanged by currency field (AC-6)", () => {
  it("returns the same current-month totals per category", () => {
    const chart = buildCategorySpendChart(USD_TXNS, ASOF);
    const food = chart.bars.find((b) => b.category === "FOOD_AND_DRINK");
    const travel = chart.bars.find((b) => b.category === "TRAVEL");
    const rent = chart.bars.find((b) => b.category === "RENT_AND_UTILITIES");

    expect(food?.currentMonth).toBe(150);
    expect(travel?.currentMonth).toBe(45);
    expect(rent?.currentMonth).toBe(200);
  });

  it("currentMonth field on the chart object matches ASOF", () => {
    const chart = buildCategorySpendChart(USD_TXNS, ASOF);
    expect(chart.currentMonth).toBe("2026-06");
  });
});

// ----------------------------------------------------------------------------
// AC-6: computeSpendingComparison — unchanged for USD-only txns
// (the comparison window uses the last 14 days of USD_TXNS relative to ASOF)
// ----------------------------------------------------------------------------

describe("computeSpendingComparison — USD-only txns unchanged by currency field (AC-6)", () => {
  // ASOF = 2026-06-15. this-week = (06-08, 06-15]; prior-week = (06-01, 06-08]
  const TXNS: SpendingTxn[] = [
    usdTx("2026-06-10", 200, "FOOD_AND_DRINK"),   // this week
    usdTx("2026-06-12", 80, "TRAVEL"),             // this week
    usdTx("2026-06-03", 150, "FOOD_AND_DRINK"),    // prior week
  ];

  it("computes the same thisWeek total and delta as before the currency field", () => {
    const s = computeSpendingComparison(TXNS, ASOF);
    expect(s?.thisWeek).toBe(280); // 200 + 80
    expect(s?.comparable).toBe(true);
    expect(s?.delta).toEqual({ direction: "more", amount: 130 }); // 280 vs 150
  });

  it("top categories are unchanged", () => {
    const s = computeSpendingComparison(TXNS, ASOF);
    expect(s?.topCategories[0]).toEqual({ category: "Food And Drink", amount: 200 });
    expect(s?.topCategories[1]).toEqual({ category: "Travel", amount: 80 });
  });
});

// ----------------------------------------------------------------------------
// Note: detectAnomalies uses AnomalyTxn[], not SpendingTxn[], so it is not
// directly covered here. The anomaly scan's currency filter is an app-layer
// read concern; the pure detectAnomalies function is currency-agnostic.
// AC-5 (anomaly scan filter) and AC-8 (user-listing) are covered by the
// integration tests in packages/jobs/recap/anomaly-scan-currency.test.ts.
// ----------------------------------------------------------------------------
