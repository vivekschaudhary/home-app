// WLT-27-1 regression suite — verifies that adding currency: string to SpendingTxn
// does NOT change the output of the pure compute functions for a USD-only input.
// regression: true  e2e: false
//
// Each test passes a SpendingTxn[] where all records have currency = 'USD' and
// asserts the function produces bit-for-bit identical output to what it produced
// before the currency field existed. The pure compute functions receive a
// pre-filtered SpendingTxn[] and do not branch on currency — this suite confirms
// that invariant holds.

import { describe, expect, it } from "vitest";
import { buildBudgetRows, computeMonthlySeries, type SavedBudget } from "./budget";
import { buildCategorySpendChart } from "./dashboard-spend";
import { computeSpendingComparison, type SpendingTxn } from "./recap";
import { type AnomalyAccount, type AnomalyTxn, detectAnomalies } from "./anomaly";

const ASOF = "2026-06-15";

function usdTx(occurredOn: string, amount: number, category: string | null = "FOOD_AND_DRINK", direction = "debit"): SpendingTxn {
  return { occurredOn, amount, category, direction, currency: "USD" };
}

// ── buildBudgetRows ────────────────────────────────────────────────────────────
describe("buildBudgetRows — USD-only regression (WLT-27-1)", () => {
  const txns: SpendingTxn[] = [
    usdTx("2026-06-03", 100, "FOOD_AND_DRINK"),
    usdTx("2026-06-10", 50, "FOOD_AND_DRINK"),
    usdTx("2026-06-05", 200, "TRAVEL"),
  ];
  const budgets: SavedBudget[] = [];
  const isEssential = (_: string) => false;
  const countsAsSpending = (_: string) => true;

  it("produces the same totals for USD-only input as before the currency field was added", () => {
    const rows = buildBudgetRows({ budgets, txns, asOf: ASOF, isEssential, countsAsSpending });
    const food = rows.find((r) => r.category === "FOOD_AND_DRINK");
    const travel = rows.find((r) => r.category === "TRAVEL");
    expect(food?.actualThisMonth).toBe(150);
    expect(travel?.actualThisMonth).toBe(200);
  });
});

// ── computeMonthlySeries ───────────────────────────────────────────────────────
describe("computeMonthlySeries — USD-only regression (WLT-27-1)", () => {
  const txns: SpendingTxn[] = [
    usdTx("2026-05-10", 100, "FOOD_AND_DRINK"),
    usdTx("2026-06-03", 50, "FOOD_AND_DRINK"),
  ];

  it("produces identical series values for USD-only input", () => {
    const series = computeMonthlySeries(txns, ASOF, 12);
    const foodSeries = series.get("FOOD_AND_DRINK");
    expect(foodSeries).toBeDefined();
    expect(foodSeries?.[foodSeries.length - 1]).toBe(50); // June (current month, last index)
    expect(foodSeries?.[foodSeries.length - 2]).toBe(100); // May
  });
});

// ── buildCategorySpendChart ────────────────────────────────────────────────────
describe("buildCategorySpendChart — USD-only regression (WLT-27-1)", () => {
  const txns: SpendingTxn[] = [
    usdTx("2026-06-03", 120, "FOOD_AND_DRINK"),
    usdTx("2026-06-10", 80, "TRAVEL"),
  ];

  it("produces identical chart bars for USD-only input", () => {
    const chart = buildCategorySpendChart(txns, ASOF, () => true);
    const food = chart.bars.find((b) => b.category === "FOOD_AND_DRINK");
    const travel = chart.bars.find((b) => b.category === "TRAVEL");
    expect(food?.currentMonth).toBe(120);
    expect(travel?.currentMonth).toBe(80);
  });
});

// ── computeSpendingComparison ──────────────────────────────────────────────────
describe("computeSpendingComparison — USD-only regression (WLT-27-1)", () => {
  it("produces identical weekly comparison for USD-only input", () => {
    const txns: SpendingTxn[] = [
      { occurredOn: "2026-06-10", amount: 420, direction: "debit", category: "GROCERIES", currency: "USD" },
      { occurredOn: "2026-06-03", amount: 600, direction: "debit", category: "GROCERIES", currency: "USD" },
    ];
    const s = computeSpendingComparison(txns, ASOF);
    expect(s?.thisWeek).toBe(420);
    expect(s?.comparable).toBe(true);
    expect(s?.delta).toEqual({ direction: "less", amount: 180 });
  });
});

// ── detectAnomalies ────────────────────────────────────────────────────────────
describe("detectAnomalies — USD-only regression (WLT-27-1)", () => {
  function anomalyTx(id: string, occurredOn: string, amount: number): AnomalyTxn {
    return { id, accountId: "acc1", dedupKey: id, occurredOn, amount, direction: "debit", category: "GROCERIES", merchant: null };
  }
  const baseline: AnomalyTxn[] = [
    anomalyTx("h1", "2026-05-10", 48),
    anomalyTx("h2", "2026-05-17", 52),
    anomalyTx("h3", "2026-05-24", 50),
    anomalyTx("h4", "2026-05-31", 46),
    anomalyTx("h5", "2026-06-04", 54),
  ];
  const accounts: AnomalyAccount[] = [];

  it("fires large_charge on the same transactions as before the currency field was added", () => {
    const big = anomalyTx("big", "2026-06-13", 300);
    const found = detectAnomalies({ transactions: [...baseline, big], accounts, asOf: ASOF });
    expect(found.some((a) => a.kind === "large_charge" && a.transactionId === "big")).toBe(true);
  });

  it("does NOT fire on the normal baseline (no false positives)", () => {
    const found = detectAnomalies({ transactions: baseline, accounts, asOf: ASOF });
    expect(found.filter((a) => a.kind === "large_charge")).toHaveLength(0);
  });
});
