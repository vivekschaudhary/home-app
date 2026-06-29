// WLT-27-1 integration tests for readCategorySpendChart currency filtering (AC-3).
//
// Approach: mock @vc1023/passkey-2fa + @wealth/db/* so the test controls what
// "rows" the DB returns. The supabase mock captures the currency eq-filter and
// only returns matching rows — proving that .eq("currency", activeCurrency) is
// wired correctly in readCategorySpendChart.
//
// Tagged: regression: true, e2e: false

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --------------------------------------------------------------------------
// Fixtures: mix of USD and EUR rows in the current calendar month
// --------------------------------------------------------------------------

// Time is frozen to FIXED_NOW in beforeEach so that:
//   (a) code-under-test (todayUtc, monthsAgoStart) anchors to the same date, and
//   (b) fixture dates never drift across month boundaries as wall-clock time advances.
// FIXED_NOW = 2025-06-15 (midmonth Sunday) — both fixture dates land in currentMonth
// ("2025-06"), well inside the 6-month window starting 2025-01-01.
const FIXED_NOW = new Date("2025-06-15T12:00:00.000Z");

const ALL_ROWS = [
  { dedup_key: "k1", direction: "debit", category: "FOOD_AND_DRINK", amount: "100", occurred_on: "2025-06-12", currency: "USD" },
  { dedup_key: "k2", direction: "debit", category: "TRAVEL", amount: "200", occurred_on: "2025-06-12", currency: "EUR" },
  { dedup_key: "k3", direction: "debit", category: "FOOD_AND_DRINK", amount: "50", occurred_on: "2025-06-14", currency: "USD" },
  { dedup_key: "k4", direction: "debit", category: "TRAVEL", amount: "300", occurred_on: "2025-06-14", currency: "EUR" },
];

// --------------------------------------------------------------------------
// Supabase query-builder mock that simulates currency filtering
// --------------------------------------------------------------------------

function buildQueryMock() {
  let currencyFilter: string | null = null;

  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((col: string, val: string) => {
      if (col === "currency") currencyFilter = val;
      return builder;
    }),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockImplementation(async () => {
      const filtered = currencyFilter
        ? ALL_ROWS.filter((r) => r.currency === currencyFilter)
        : ALL_ROWS;
      return { data: filtered, error: null };
    }),
    getCurrencyFilter: () => currencyFilter,
  };
  return builder;
}

// --------------------------------------------------------------------------
// Module mocks
// --------------------------------------------------------------------------

vi.mock("@wealth/db/categories", () => ({
  readCategoryAssignments: async () => new Map(),
  readCategorySpendingFlags: async () => new Map(),
}));

let queryMock = buildQueryMock();

vi.mock("@vc1023/passkey-2fa", () => ({
  createServerSupabase: async () => ({
    from: () => queryMock,
  }),
}));

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW });
  queryMock = buildQueryMock();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("readCategorySpendChart — currency isolation (AC-3)", () => {
  it("with activeCurrency='USD' returns only USD transactions", async () => {
    const { readCategorySpendChart } = await import("../dashboard-spend");
    const chart = await readCategorySpendChart("user-1", "USD");

    // USD rows: k1 (100) + k3 (50) = 150 FOOD_AND_DRINK this month
    const food = chart.bars.find((b) => b.category === "FOOD_AND_DRINK");
    expect(food?.currentMonth).toBe(150);

    // EUR TRAVEL rows (200 + 300) must NOT appear
    const travel = chart.bars.find((b) => b.category === "TRAVEL");
    expect(travel).toBeUndefined();
  });

  it("with activeCurrency='EUR' returns only EUR transactions", async () => {
    const { readCategorySpendChart } = await import("../dashboard-spend");
    const chart = await readCategorySpendChart("user-1", "EUR");

    // EUR rows: k2 (200) + k4 (300) = 500 TRAVEL this month
    const travel = chart.bars.find((b) => b.category === "TRAVEL");
    expect(travel?.currentMonth).toBe(500);

    // USD FOOD rows (100 + 50) must NOT appear
    const food = chart.bars.find((b) => b.category === "FOOD_AND_DRINK");
    expect(food).toBeUndefined();
  });

  it("default activeCurrency is 'USD' — existing callers see no behavior change (AC-10)", async () => {
    const { readCategorySpendChart } = await import("../dashboard-spend");
    const chart = await readCategorySpendChart("user-1"); // no activeCurrency argument

    // Must behave identically to activeCurrency='USD'
    const food = chart.bars.find((b) => b.category === "FOOD_AND_DRINK");
    expect(food?.currentMonth).toBe(150);
    const travel = chart.bars.find((b) => b.category === "TRAVEL");
    expect(travel).toBeUndefined();
  });

  it("the currency filter is wired to the transactions query", async () => {
    const { readCategorySpendChart } = await import("../dashboard-spend");
    await readCategorySpendChart("user-1", "EUR");
    // The captured filter on the mock proves the .eq("currency", "EUR") call was made
    expect(queryMock.getCurrencyFilter()).toBe("EUR");
  });
});
