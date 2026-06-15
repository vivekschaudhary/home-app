import { describe, expect, it } from "vitest";
import { type AnomalyAccount, type AnomalyTxn, detectAnomalies } from "./anomaly";

// WLT-18 — the anomaly rules, PURE. The bar is PRECISION: each rule must fire on
// its fixture AND NOT false-positive on normal data (a wrong "worth a look" is
// worse than none). v1 = large_charge + low_balance (recurring_due deferred).

const ASOF = "2026-06-15";

function tx(id: string, occurredOn: string, amount: number, category = "GROCERIES", direction = "debit"): AnomalyTxn {
  return { id, accountId: "acc1", occurredOn, amount, category, direction };
}

// A normal baseline: ~$50 groceries, several times, older than the recent window.
function normalGroceryHistory(): AnomalyTxn[] {
  return [
    tx("h1", "2026-05-10", 48),
    tx("h2", "2026-05-17", 52),
    tx("h3", "2026-05-24", 50),
    tx("h4", "2026-05-31", 46),
    tx("h5", "2026-06-04", 54),
  ];
}

describe("detectAnomalies — large_charge", () => {
  it("fires on a recent debit ≫ the category's own baseline", () => {
    const found = detectAnomalies({
      transactions: [...normalGroceryHistory(), tx("big", "2026-06-13", 300)], // 300 vs ~50 median
      accounts: [],
      asOf: ASOF,
    });
    const lc = found.filter((a) => a.kind === "large_charge");
    expect(lc).toHaveLength(1);
    expect(lc[0].transactionId).toBe("big");
    expect(lc[0].dedupKey).toBe("large_charge:big");
    expect(lc[0].summary).toEqual({ amount: 300, category: "Groceries", date: "2026-06-13" });
    expect(lc[0].summary).not.toHaveProperty("merchant"); // no PII
  });

  it("does NOT fire on a normal recent charge (no false positive)", () => {
    const found = detectAnomalies({
      transactions: [...normalGroceryHistory(), tx("ok", "2026-06-13", 55)],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "large_charge")).toHaveLength(0);
  });

  it("does NOT fire below the absolute floor even if proportionally large", () => {
    // baseline ~$5 → a $40 charge is 8× but under the $150 floor → skip (noise control).
    const tinyHistory = ["a", "b", "c", "d"].map((id, i) => tx(id, `2026-05-${10 + i}`, 5, "COFFEE"));
    const found = detectAnomalies({
      transactions: [...tinyHistory, tx("z", "2026-06-13", 40, "COFFEE")],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "large_charge")).toHaveLength(0);
  });

  it("does NOT fire without enough category history to call 'usual'", () => {
    const found = detectAnomalies({
      transactions: [tx("h1", "2026-05-10", 50), tx("big", "2026-06-13", 400)], // only 1 prior
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "large_charge")).toHaveLength(0);
  });

  it("ignores charges outside the recent window + ignores credits", () => {
    const found = detectAnomalies({
      transactions: [
        ...normalGroceryHistory(),
        tx("old", "2026-05-01", 500), // old big charge — not recent
        tx("credit", "2026-06-13", 500, "GROCERIES", "credit"), // a credit, not spend
      ],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "large_charge")).toHaveLength(0);
  });
});

describe("detectAnomalies — low_balance", () => {
  const accounts: AnomalyAccount[] = [
    { id: "chk", kind: "depository", balanceCurrent: 40 }, // low
    { id: "sav", kind: "depository", balanceCurrent: 5000 }, // fine
    { id: "card", kind: "credit", balanceCurrent: 10 }, // credit — not a "low balance"
    { id: "new", kind: "depository", balanceCurrent: null }, // unknown — never fabricate
  ];

  it("fires only on a depository account below the floor", () => {
    const found = detectAnomalies({ transactions: [], accounts, asOf: ASOF });
    const lb = found.filter((a) => a.kind === "low_balance");
    expect(lb).toHaveLength(1);
    expect(lb[0].accountId).toBe("chk");
    expect(lb[0].summary).toEqual({ amount: 40 });
    expect(lb[0].dedupKey).toBe("low_balance:chk:2026-06"); // per account per month
  });

  it("no anomalies when nothing qualifies", () => {
    const found = detectAnomalies({
      transactions: normalGroceryHistory(),
      accounts: [{ id: "sav", kind: "depository", balanceCurrent: 5000 }],
      asOf: ASOF,
    });
    expect(found).toHaveLength(0);
  });
});
