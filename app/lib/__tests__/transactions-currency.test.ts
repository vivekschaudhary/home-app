// WLT-27-5 integration tests — transactions ledger currency filter (AC-7) +
// regression guard for USD-only users (AC-13).
//
// Approach: mock createServerSupabase so each .from() call returns a fresh builder
// with its own per-query state. Each builder captures the currency eq-filter and
// returns appropriate rows when awaited (via .then()) or when .limit() resolves.
//
// Tagged: regression: true, e2e: false

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

// t1 + t3 are from the USD account (a1); t2 is from the EUR account (a2).
// The mock uses account_id to simulate the currency filter effect.
const ALL_TXN_ROWS = [
  { id: "t1", occurred_on: "2026-06-15", merchant: "Coffee Shop", description: "Coffee", amount: "5", direction: "debit", category: "FOOD_AND_DRINK", dedup_key: "dk1", pending: false, account_id: "a1" },
  { id: "t2", occurred_on: "2026-06-14", merchant: "Boulangerie", description: "Bread", amount: "8", direction: "debit", category: "FOOD_AND_DRINK", dedup_key: "dk2", pending: false, account_id: "a2" },
  { id: "t3", occurred_on: "2026-06-13", merchant: "Grocery", description: "Groceries", amount: "50", direction: "debit", category: "GROCERIES", dedup_key: "dk3", pending: false, account_id: "a1" },
];

const USD_ACCOUNTS = [{ id: "a1", name: "Checking USD" }];
const EUR_ACCOUNTS = [{ id: "a2", name: "Cheque EUR" }];
const ALL_ACCOUNTS = [...USD_ACCOUNTS, ...EUR_ACCOUNTS];

// --------------------------------------------------------------------------
// Per-query builder factory — each .from() returns a fresh object so
// concurrent queries in Promise.all don't share mutable state.
// --------------------------------------------------------------------------

function makeBuilder(table: string) {
  let currencyFilter: string | null = null;
  let isNullCategory = false;

  const resolve = () => {
    // financial_accounts: return accounts filtered by currency (if set)
    if (table === "financial_accounts") {
      if (currencyFilter === "USD") return { data: USD_ACCOUNTS, error: null };
      if (currencyFilter === "EUR") return { data: EUR_ACCOUNTS, error: null };
      return { data: ALL_ACCOUNTS, error: null };
    }
    // transactions — filter by currency if set, otherwise return all
    let rows = ALL_TXN_ROWS;
    if (currencyFilter === "USD") rows = ALL_TXN_ROWS.filter((r) => r.account_id === "a1");
    else if (currencyFilter === "EUR") rows = ALL_TXN_ROWS.filter((r) => r.account_id === "a2");
    // otherProbe (category=null): return empty so hasOther=false
    if (isNullCategory) return { data: [], error: null };
    return { data: rows, error: null };
  };

  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(function (col: string, val: string) {
      if (col === "currency") currencyFilter = val;
      return builder;
    }),
    is: vi.fn().mockImplementation(function (col: string, val: unknown) {
      if (col === "category" && val === null) isNullCategory = true;
      return builder;
    }),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    // .limit() must return `this` — the Supabase builder is chainable past limit().
    // fetchChunk does: .limit(take) then .eq("currency", ...) — if limit() returned
    // a Promise, the subsequent .eq() call would throw "not a function".
    limit: vi.fn().mockReturnThis(),
    // .range() resolves transaction pages (used by readAllPaged in budget reads;
    // for transactions, fetchChunk is awaited via then() below).
    range: vi.fn().mockImplementation(async () => resolve()),
    // Thennable — `await builder` resolves here. Used by fetchChunk (transactions),
    // otherProbe (.is().limit()), and accounts query (.eq().eq()).
    then: (onFulfilled: (v: unknown) => unknown, _onRejected: unknown) =>
      Promise.resolve(resolve()).then(onFulfilled),
  };
  return builder;
}

// --------------------------------------------------------------------------
// Mocks
// --------------------------------------------------------------------------

vi.mock("@wealth/db/categories", () => ({
  readCategoryAssignments: async () => new Map(),
  readCategorySpendingFlags: async () => new Map(),
}));

vi.mock("@wealth/db/subscriptions", () => ({
  readSubscriptionFlags: async () => new Map(),
}));

vi.mock("@wealth/db/followups", () => ({
  readFollowupStatuses: async () => new Map(),
}));

const supabaseMock = {
  from: (table: string) => makeBuilder(table),
};

vi.mock("@vc1023/passkey-2fa", () => ({
  createServerSupabase: async () => supabaseMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("readTransactionsPage — currency isolation (AC-7, WLT-27-5)", () => {
  it("with currency='USD' returns only USD-account transactions", async () => {
    const { readTransactionsPage } = await import("../transactions");
    const result = await readTransactionsPage("user-1", { currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.page.rows.map((r) => r.id);
    // t1 and t3 are from the USD account (a1); t2 (EUR) must not appear.
    expect(ids).toContain("t1");
    expect(ids).toContain("t3");
    expect(ids).not.toContain("t2");
  });

  it("with currency='EUR' returns only EUR-account transactions", async () => {
    const { readTransactionsPage } = await import("../transactions");
    const result = await readTransactionsPage("user-1", { currency: "EUR" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.page.rows.map((r) => r.id);
    // t2 is from the EUR account (a2); t1 and t3 (USD) must not appear.
    expect(ids).toContain("t2");
    expect(ids).not.toContain("t1");
    expect(ids).not.toContain("t3");
  });

  it("with currency=null (flag off) returns all transactions — AC-13 regression", async () => {
    // When MULTI_CURRENCY_ACCOUNTS_ENABLED is off, currency=null → no filter.
    const { readTransactionsPage } = await import("../transactions");
    const result = await readTransactionsPage("user-1", { currency: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ids = result.page.rows.map((r) => r.id);
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
    expect(ids).toContain("t3");
  });

  it("default (no currency opt) returns all transactions — existing callers unaffected (AC-13)", async () => {
    const { readTransactionsPage } = await import("../transactions");
    const result = await readTransactionsPage("user-1"); // no opts
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.page.rows.length).toBe(3);
  });

  it("with currency='USD' scopes the account-filter dropdown to USD accounts only", async () => {
    const { readTransactionsPage } = await import("../transactions");
    const result = await readTransactionsPage("user-1", { currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const accountIds = result.page.accounts.map((a) => a.id);
    expect(accountIds).toContain("a1");
    expect(accountIds).not.toContain("a2");
  });
});
