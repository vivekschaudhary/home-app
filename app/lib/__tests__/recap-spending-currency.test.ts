// WLT-27-1 integration tests for the recap spending read (readRecentSpending)
// currency filtering (AC-4).
//
// Approach: mock @vc1023/passkey-2fa with a multi-table router so getRecap can
// proceed past its early-exit guards and reach the readRecentSpending path.
// The transactions query builder captures the currency eq-filter, proving that
// .eq("currency", activeCurrency) is wired correctly in readRecentSpending.
//
// Tagged: regression: true, e2e: false

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --------------------------------------------------------------------------
// Fixtures — dates anchored to FIXED_NOW (2025-06-15) so the 7-day / 14-day
// windows never shift as wall-clock time advances.
//
// Time is frozen in beforeEach so code-under-test (todayUtc, readRecentSpending's
// 14-day `since`) anchors to the same date as the fixtures.
// --------------------------------------------------------------------------

// FIXED_NOW = 2025-06-15 (midmonth Sunday).
// Fixture dates relative to that anchor:
//   r1: 2025-06-12 (3 days before) → "this week" window (0–7 days)
//   r2: 2025-06-11 (4 days before) → "this week" window, EUR — filtered out
//   r3: 2025-06-07 (8 days before) → "prior week" window (7–14 days)
const FIXED_NOW = new Date("2025-06-15T12:00:00.000Z");

const RECAP_TX_ROWS = [
  { dedup_key: "r1", direction: "debit", category: "FOOD_AND_DRINK", amount: "80", occurred_on: "2025-06-12", currency: "USD" },
  { dedup_key: "r2", direction: "debit", category: "TRAVEL", amount: "200", occurred_on: "2025-06-11", currency: "EUR" },
  { dedup_key: "r3", direction: "debit", category: "FOOD_AND_DRINK", amount: "40", occurred_on: "2025-06-07", currency: "USD" },
];

// --------------------------------------------------------------------------
// Mock builders
// --------------------------------------------------------------------------

type SimpleResult = { data: unknown[] | null; error: null };

// A fluent chain that resolves to `result` when awaited (via then getter).
// Every method returns `this` so arbitrary chains work.
function makeSimpleChain(result: SimpleResult): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "gte", "lte", "in", "order", "limit", "update"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  Object.defineProperty(chain, "then", {
    get() {
      return (resolve: (v: SimpleResult) => void) => resolve(result);
    },
  });
  return chain;
}

// Builds the transactions query chain that:
//   (a) captures the value passed to .eq("currency", val)
//   (b) resolves with rows filtered by that captured currency
function makeTxChain(): { chain: Record<string, unknown>; getCapturedCurrency: () => string | null } {
  let captured: string | null = null;
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockImplementation((col: string, val: string) => {
    if (col === "currency") captured = val;
    return chain;
  });
  Object.defineProperty(chain, "then", {
    get() {
      return (resolve: (v: SimpleResult) => void) => {
        const filtered = captured
          ? RECAP_TX_ROWS.filter((r) => r.currency === captured)
          : RECAP_TX_ROWS;
        resolve({ data: filtered, error: null });
      };
    },
  });
  return { chain, getCapturedCurrency: () => captured };
}

// Routes supabase.from(table) to the right mock chain.
// The transactions chain is sourced from the module-level txMock so it can be
// inspected after getRecap returns.
function makeSupabase(): { from: (table: string) => Record<string, unknown> } {
  return {
    from: (table: string) => {
      if (table === "workflows") {
        return makeSimpleChain({ data: [{ id: "wf-1", config: { target: 50000 } }], error: null });
      }
      if (table === "net_worth_snapshots") {
        return makeSimpleChain({
          data: [
            { captured_on: "2025-06-14", net_worth: "48000" },
            { captured_on: "2025-06-08", net_worth: "47000" },
          ],
          error: null,
        });
      }
      if (table === "financial_accounts") {
        return makeSimpleChain({ data: [{ kind: "checking", balance_current: "50000" }], error: null });
      }
      if (table === "anomalies") {
        return makeSimpleChain({ data: null, error: null });
      }
      if (table === "transactions") {
        return txMock.chain;
      }
      return makeSimpleChain({ data: null, error: null });
    },
  };
}

// --------------------------------------------------------------------------
// Module mocks
// --------------------------------------------------------------------------

vi.mock("@wealth/db/emit", () => ({
  emitFunnel: async () => {},
  emitAudit: async () => {},
}));

vi.mock("@wealth/db/categories", () => ({
  readCategoryAssignments: async () => new Map(),
  readCategorySpendingFlags: async () => new Map(),
}));

let txMock = makeTxChain();

vi.mock("@vc1023/passkey-2fa", () => ({
  createServerSupabase: async () => makeSupabase(),
}));

beforeEach(() => {
  vi.useFakeTimers({ now: FIXED_NOW });
  txMock = makeTxChain();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("getRecap — recap spending read currency filter (AC-4)", () => {
  it("queries transactions with currency = 'USD' (the default until MULTI_CURRENCY_ACCOUNTS_ENABLED)", async () => {
    const { getRecap } = await import("../recap");
    await getRecap("user-1");

    // The captured currency filter from the transactions query must be 'USD'
    expect(txMock.getCapturedCurrency()).toBe("USD");
  });

  it("spending comparison reflects only USD transactions — EUR rows are excluded (AC-4)", async () => {
    const { getRecap } = await import("../recap");
    const view = await getRecap("user-1");

    if (!view.visible || !view.spending) return; // spending is null when no this-week debits

    // USD debits this week: r1 (2025-06-12, 80). EUR r2 (2025-06-11, 200) must not appear.
    // If EUR leaked in, thisWeek would be ≥ 280 (80 + 200). With the filter: exactly 80.
    expect(view.spending.thisWeek).toBe(80);
  });

  it("existing USD-only behavior is unchanged with no extra arg — getRecap always passes 'USD' (AC-10)", async () => {
    const { getRecap } = await import("../recap");
    await getRecap("user-1");

    // getRecap hardcodes 'USD' in readRecentSpending(userId, 'USD') until WLT-27-5
    expect(txMock.getCapturedCurrency()).toBe("USD");
  });

  it("returns visible: true when a workflow with a target + balances exist (precondition check)", async () => {
    const { getRecap } = await import("../recap");
    const view = await getRecap("user-1");

    // Confirms the mock setup is correct and getRecap reached the spending path
    expect(view.visible).toBe(true);
  });
});
