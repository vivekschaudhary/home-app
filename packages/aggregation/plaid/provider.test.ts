// Regression: fetchAccounts must call accountsBalanceGet (real-time from the
// institution) — NOT accountsGet (Plaid's own cached snapshot, which can be
// hours stale). Bug: accounts page showed stale balances vs. the live bank total.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountBase } from "plaid";
import { createPlaidProvider } from "./index";

const { mockAccountsGet, mockAccountsBalanceGet } = vi.hoisted(() => ({
  mockAccountsGet: vi.fn(),
  mockAccountsBalanceGet: vi.fn(),
}));

vi.mock("plaid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("plaid")>();
  return {
    ...actual,
    Configuration: vi.fn(),
    PlaidApi: vi.fn(() => ({
      accountsGet: mockAccountsGet,
      accountsBalanceGet: mockAccountsBalanceGet,
    })),
  };
});

const stubAccount = {
  account_id: "acc-1",
  name: "Checking",
  official_name: null,
  type: "depository",
  subtype: "checking",
  mask: "9999",
  balances: {
    current: 1500.0,
    available: 1400.0,
    limit: null,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
  },
  verification_status: null,
  persistent_account_id: null,
} as unknown as AccountBase;

describe("createPlaidProvider — fetchAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccountsBalanceGet.mockResolvedValue({ data: { accounts: [stubAccount] } });
    mockAccountsGet.mockResolvedValue({ data: { accounts: [stubAccount] } });
    process.env.PLAID_ENV = "sandbox";
    process.env.PLAID_CLIENT_ID = "test-client";
    process.env.PLAID_SANDBOX_SECRET = "test-secret";
  });

  it("calls accountsBalanceGet (real-time) — not accountsGet (cached Plaid snapshot)", async () => {
    const provider = createPlaidProvider();
    await provider.fetchAccounts({ accessSecret: "access-sandbox-xxx" });

    expect(mockAccountsBalanceGet).toHaveBeenCalledOnce();
    expect(mockAccountsBalanceGet).toHaveBeenCalledWith({ access_token: "access-sandbox-xxx" });
    expect(mockAccountsGet).not.toHaveBeenCalled();
  });

  it("maps real-time balance data into NormalizedAccount shapes", async () => {
    const provider = createPlaidProvider();
    const result = await provider.fetchAccounts({ accessSecret: "access-sandbox-xxx" });

    expect(result).toHaveLength(1);
    expect(result[0].balanceCurrent).toBe("1500.00");
    expect(result[0].balanceAvailable).toBe("1400.00");
    expect(result[0].kind).toBe("depository");
  });
});
