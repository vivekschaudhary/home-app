// WLT-27-1 integration tests for the anomaly-scan currency filter (AC-5)
// and the extended user-listing (AC-8).
//
// Approach: mock @vc1023/passkey-2fa and inngest to control what rows the
// scan receives and assert both:
//   (a) the transactions query filters by currency = 'USD'
//   (b) users with ONLY manual accounts (connection_id IS NULL) appear in the
//       scan fan-out
//
// Tagged: regression: true, e2e: false

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------

const MANUAL_ONLY_USER = "user-manual-only";
const PLAID_USER = "user-plaid";
const BOTH_USER = "user-both";

const MOCK_ACCOUNT_CONNECTIONS = [
  { user_id: PLAID_USER },
  { user_id: BOTH_USER },
];

const MOCK_MANUAL_ACCOUNTS = [
  { user_id: MANUAL_ONLY_USER },
  { user_id: BOTH_USER },
];

// --------------------------------------------------------------------------
// Mock helpers
// --------------------------------------------------------------------------

type QueryResult = { data: unknown[] | null; error: null };

function makeSelectReturning(rows: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  // Make the chain itself thenable (so await chain resolves to the result)
  Object.defineProperty(chain, "then", {
    get() {
      return (res: (v: QueryResult) => void) => res({ data: rows, error: null });
    },
  });
  return chain;
}

// Track which currencies were requested in .eq("currency", val) calls
const capturedCurrencyFilters: string[] = [];

function makeTransactionQuery(rows: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((col: string, val: string) => {
      if (col === "currency") capturedCurrencyFilters.push(val);
      return chain;
    }),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };
  Object.defineProperty(chain, "then", {
    get() {
      return (res: (v: QueryResult) => void) => res({ data: rows, error: null });
    },
  });
  return chain;
}

// --------------------------------------------------------------------------
// Step executor: simulate inngest step.run()
// --------------------------------------------------------------------------

function makeStep() {
  return {
    run: async (_name: string, fn: () => Promise<unknown>) => fn(),
  };
}

vi.mock("@vc1023/passkey-2fa", () => ({
  createServiceSupabase: () => ({
    from: (table: string) => {
      if (table === "account_connections") return makeSelectReturning(MOCK_ACCOUNT_CONNECTIONS);
      if (table === "financial_accounts") return makeSelectReturning(MOCK_MANUAL_ACCOUNTS);
      // transactions — return empty for simplicity; we care about user listing + filter
      return makeTransactionQuery([]);
    },
  }),
}));

vi.mock("@wealth/db/categories", () => ({
  readCategoryAssignments: async () => new Map(),
  readCategorySpendingFlags: async () => new Map(),
}));

// Mock inngest.createFunction to capture and invoke the handler synchronously
vi.mock("../client", () => ({
  inngest: {
    createFunction: (_meta: unknown, _trigger: unknown, fn: (ctx: { step: ReturnType<typeof makeStep> }) => unknown) => ({
      _handler: fn,
    }),
  },
}));

beforeEach(() => {
  capturedCurrencyFilters.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("anomalyScanDaily — user listing (AC-8)", () => {
  it("includes manual-account-only users in the scan fan-out", async () => {
    // Import after mocks are set up
    const { anomalyScanDaily } = await import("./anomaly-scan");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (anomalyScanDaily as any)._handler({ step: makeStep() });

    // All three user types must appear: PLAID_USER, MANUAL_ONLY_USER, BOTH_USER
    expect(result.scanned).toBe(3);
  });

  it("de-duplicates users that have BOTH a Plaid connection and a manual account", async () => {
    const { anomalyScanDaily } = await import("./anomaly-scan");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (anomalyScanDaily as any)._handler({ step: makeStep() });

    // BOTH_USER appears in both lists but should be counted only once
    expect(result.scanned).toBe(3); // not 4
  });
});

describe("anomalyScanDaily — currency filter (AC-5)", () => {
  it("queries transactions with currency = 'USD' for every scanned user", async () => {
    const { anomalyScanDaily } = await import("./anomaly-scan");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (anomalyScanDaily as any)._handler({ step: makeStep() });

    // Each of the 3 users should have triggered a currency filter
    expect(capturedCurrencyFilters).toHaveLength(3);
    expect(capturedCurrencyFilters.every((c) => c === "USD")).toBe(true);
  });
});
