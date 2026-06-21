import { describe, expect, it } from "vitest";
import type { AccountBase, Transaction as PlaidTransaction } from "plaid";
import { classifyKind, mapAccount, mapAccountKind, mapTransaction } from "./map";

describe("mapAccountKind", () => {
  it("keeps depository + credit; drops out-of-scope types", () => {
    expect(mapAccountKind("depository")).toBe("depository");
    expect(mapAccountKind("credit")).toBe("credit");
    expect(mapAccountKind("loan")).toBeNull();
    expect(mapAccountKind("investment")).toBeNull();
  });
});

const acct = {
  account_id: "a1",
  name: "Checking",
  official_name: null,
  type: "depository",
  subtype: "checking",
  mask: "4242",
  balances: { current: 1234.56, available: 1200, iso_currency_code: "USD", limit: null },
} as unknown as AccountBase;

describe("mapAccount", () => {
  it("maps a depository account; money is a fixed-decimal string", () => {
    const r = mapAccount(acct);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe("depository");
    expect(r?.balanceCurrent).toBe("1234.56");
    expect(r?.balanceAvailable).toBe("1200.00");
    expect(r?.mask).toBe("4242");
  });

  it("returns null for an out-of-scope account type", () => {
    expect(mapAccount({ ...acct, type: "investment" } as unknown as AccountBase)).toBeNull();
  });
});

const txn = {
  transaction_id: "t1",
  account_id: "a1",
  amount: 12.34,
  iso_currency_code: "USD",
  name: "Coffee",
  merchant_name: "Cafe",
  date: "2026-06-01",
  pending: false,
  personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "x", confidence_level: "HIGH" },
} as unknown as PlaidTransaction;

describe("mapTransaction", () => {
  it("positive amount ⇒ debit (money out); unsigned decimal string; source=plaid", () => {
    const r = mapTransaction(txn);
    expect(r.direction).toBe("debit");
    expect(r.amount).toBe("12.34");
    expect(r.source).toBe("plaid");
    expect(r.occurredOn).toBe("2026-06-01");
    expect(r.category).toBe("FOOD_AND_DRINK");
  });

  it("maps Plaid merchant_entity_id (WLT-22-4 — the stable rule-match key); null when absent", () => {
    expect(mapTransaction({ ...txn, merchant_entity_id: "ent-123" } as unknown as PlaidTransaction).merchantEntityId).toBe("ent-123");
    expect(mapTransaction(txn).merchantEntityId).toBeNull(); // fixture has none → null
  });

  it("negative amount ⇒ credit (money in)", () => {
    const r = mapTransaction({ ...txn, amount: -50 } as unknown as PlaidTransaction);
    expect(r.direction).toBe("credit");
    expect(r.amount).toBe("50.00");
  });

  it("classifies kind from the personal-finance-category (WLT-22-5 AC8)", () => {
    expect(mapTransaction(txn).kind).toBe("spend"); // FOOD_AND_DRINK
  });
});

describe("classifyKind (WLT-22-5 AC8 — the only place Plaid taxonomy is read for kind)", () => {
  const pfc = (primary: string, detailed?: string) =>
    ({ primary, detailed, confidence_level: "HIGH" }) as unknown as PlaidTransaction["personal_finance_category"];

  it("credit-card payment (DETAILED) ⇒ payment — separates it from a mortgage", () => {
    expect(classifyKind(pfc("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"))).toBe("payment");
  });

  it("other LOAN_PAYMENTS (mortgage/auto/student) ⇒ spend (real outflow, not a double-count)", () => {
    expect(classifyKind(pfc("LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT"))).toBe("spend");
    expect(classifyKind(pfc("LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"))).toBe("spend");
  });

  it("transfers ⇒ transfer; income ⇒ income; bank fees ⇒ fee; everything else ⇒ spend", () => {
    expect(classifyKind(pfc("TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER"))).toBe("transfer");
    expect(classifyKind(pfc("TRANSFER_IN", "TRANSFER_IN_DEPOSIT"))).toBe("transfer");
    expect(classifyKind(pfc("INCOME", "INCOME_WAGES"))).toBe("income");
    expect(classifyKind(pfc("BANK_FEES", "BANK_FEES_ATM_FEES"))).toBe("fee");
    expect(classifyKind(pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"))).toBe("spend");
    expect(classifyKind(null)).toBe("spend");
  });
});
