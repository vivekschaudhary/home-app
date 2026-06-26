import { describe, expect, it } from "vitest";
import { type AnomalyAccount, type AnomalyTxn, detectAnomalies } from "./anomaly";

// WLT-18 — the anomaly rules, PURE. The bar is PRECISION: each rule must fire on
// its fixture AND NOT false-positive on normal data (a wrong "worth a look" is
// worse than none). v1 = large_charge + low_balance (recurring_due deferred).
// WLT-26-2 — extended: new_merchant + category_spike.

const ASOF = "2026-06-15";

function tx(
  id: string,
  occurredOn: string,
  amount: number,
  category = "GROCERIES",
  direction = "debit",
  merchant?: string,
): AnomalyTxn {
  return { id, accountId: "acc1", occurredOn, amount, category, direction, dedupKey: id, merchant };
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

describe("detectAnomalies — recurring_due", () => {
  // A clean monthly bill: Mar 18 / Apr 18 / May 18 → predicted ~Jun 18 (due soon).
  function monthlyBill(amount = 50): AnomalyTxn[] {
    return [
      tx("u1", "2026-03-18", amount, "UTILITIES"),
      tx("u2", "2026-04-18", amount, "UTILITIES"),
      tx("u3", "2026-05-18", amount, "UTILITIES"),
    ];
  }

  it("fires on a tightly-regular monthly charge predicted due in the next week", () => {
    const found = detectAnomalies({ transactions: monthlyBill(), accounts: [], asOf: ASOF });
    const rd = found.filter((a) => a.kind === "recurring_due");
    expect(rd).toHaveLength(1);
    expect(rd[0].severity).toBe("info"); // a heads-up, outranked by attention-level
    expect(rd[0].summary.category).toBe("Utilities");
    expect(rd[0].summary.amount).toBe(50);
    expect(rd[0].summary.date).toBe("2026-06-18"); // predicted next
    expect(rd[0].dedupKey).toBe("recurring_due:UTILITIES:50:2026-06");
    expect(rd[0].summary).not.toHaveProperty("merchant"); // no PII
  });

  it("does NOT fire when the next charge isn't due soon (no false alarm)", () => {
    // Jan/Feb/Mar → predicted ~Apr; far from the June asOf.
    const found = detectAnomalies({
      transactions: [
        tx("u1", "2026-01-18", 50, "UTILITIES"),
        tx("u2", "2026-02-18", 50, "UTILITIES"),
        tx("u3", "2026-03-18", 50, "UTILITIES"),
      ],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "recurring_due")).toHaveLength(0);
  });

  it("does NOT fire on irregular spacing (one off-cadence gap breaks it)", () => {
    const found = detectAnomalies({
      transactions: [
        tx("u1", "2026-04-18", 50, "UTILITIES"),
        tx("u2", "2026-05-18", 50, "UTILITIES"),
        tx("u3", "2026-05-25", 50, "UTILITIES"), // 7-day gap → not monthly
      ],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "recurring_due")).toHaveLength(0);
  });

  it("does NOT fire with fewer than 3 occurrences, or varying amounts (different groups)", () => {
    expect(
      detectAnomalies({ transactions: monthlyBill().slice(0, 2), accounts: [], asOf: ASOF }).filter(
        (a) => a.kind === "recurring_due",
      ),
    ).toHaveLength(0);
    // 50/50/80 split into separate (category, rounded-amount) groups → none reaches 3.
    const varying = detectAnomalies({
      transactions: [
        tx("u1", "2026-03-18", 50, "UTILITIES"),
        tx("u2", "2026-04-18", 50, "UTILITIES"),
        tx("u3", "2026-05-18", 80, "UTILITIES"),
      ],
      accounts: [],
      asOf: ASOF,
    });
    expect(varying.filter((a) => a.kind === "recurring_due")).toHaveLength(0);
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

// ── WLT-26-2 new rules ───────────────────────────────────────────────────────

describe("detectAnomalies — new_merchant", () => {
  // 2 prior months of known merchants (history gate: need ≥ 2 distinct months)
  function historicTxns(): AnomalyTxn[] {
    return [
      tx("old1", "2026-04-15", 50, "FOOD", "debit", "McDonald's"),
      tx("old2", "2026-05-10", 50, "FOOD", "debit", "McDonald's"),
    ];
  }

  it("fires on a debut merchant first seen within the last 7 days", () => {
    const debuting = tx("new1", "2026-06-12", 80, "FOOD", "debit", "TacoHub");
    const found = detectAnomalies({
      transactions: [...historicTxns(), debuting],
      accounts: [],
      asOf: ASOF,
    });
    const nm = found.filter((a) => a.kind === "new_merchant");
    expect(nm).toHaveLength(1);
    expect(nm[0].transactionId).toBe("new1");
    expect(nm[0].dedupKey).toBe("new_merchant:new1");
    expect(nm[0].summary).toEqual({ amount: 80, date: "2026-06-12" });
    expect(nm[0].summary).not.toHaveProperty("merchant"); // PII invariant
    expect(nm[0].severity).toBe("info");
  });

  it("does NOT fire for a merchant that appeared before the recent window", () => {
    const knownMerchant = tx("new2", "2026-06-12", 80, "FOOD", "debit", "McDonald's");
    const found = detectAnomalies({
      transactions: [...historicTxns(), knownMerchant],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "new_merchant")).toHaveLength(0);
  });

  it("does NOT fire when the debut is outside the recent 7-day window (too old)", () => {
    const tooOld = tx("new3", "2026-06-05", 80, "FOOD", "debit", "BurgerSpot"); // 10 days ago
    const found = detectAnomalies({
      transactions: [...historicTxns(), tooOld],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "new_merchant")).toHaveLength(0);
  });

  it("does NOT fire when user has fewer than 2 distinct calendar months (history gate)", () => {
    // Only 1 month of prior history — too little to call a merchant "new"
    const oneMonth = [tx("hist1", "2026-05-10", 50, "FOOD", "debit", "McDonald's")];
    const debuting = tx("new4", "2026-06-12", 80, "FOOD", "debit", "TacoHub");
    const found = detectAnomalies({
      transactions: [...oneMonth, debuting],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "new_merchant")).toHaveLength(0);
  });

  it("uses normalizeMerchant so variant names of the same merchant don't re-fire", () => {
    // "Walmart" and "Walmart.com" both normalize to "walmart"
    const prior = [
      tx("w1", "2026-04-01", 30, "FOOD", "debit", "Walmart"),
      tx("w2", "2026-05-01", 30, "FOOD", "debit", "Walmart.com"),
    ];
    const debuting = tx("w3", "2026-06-12", 30, "FOOD", "debit", "Walmart Supercenter");
    const found = detectAnomalies({
      transactions: [...prior, debuting],
      accounts: [],
      asOf: ASOF,
    });
    // All normalize to "walmart" → not a new merchant
    expect(found.filter((a) => a.kind === "new_merchant")).toHaveLength(0);
  });
});

describe("detectAnomalies — category_spike", () => {
  // Build a 5-month history with a consistent ~$100/month in FOOD.
  function foodHistory(): AnomalyTxn[] {
    const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
    return months.map((m, i) => tx(`h${i}`, `${m}-15`, 100, "FOOD", "debit", "Grocer"));
  }

  it("fires when the current month is on pace to exceed 1.75× the category median", () => {
    // Current month has $150 so far on day 15 of 30 → projected = $300
    // Baseline (median of prior months) = $100 → 300/100 = 3× > 1.75 → fires
    const curTxn = tx("cur1", "2026-06-12", 150, "FOOD", "debit", "BigGrocer");
    const found = detectAnomalies({
      transactions: [...foodHistory(), curTxn],
      accounts: [],
      asOf: ASOF, // June 15
    });
    const cs = found.filter((a) => a.kind === "category_spike");
    expect(cs).toHaveLength(1);
    expect(cs[0].kind).toBe("category_spike");
    expect(cs[0].severity).toBe("attention");
    expect(cs[0].dedupKey).toBe("category_spike:FOOD:2026-06");
    expect((cs[0].summary as { category: string }).category).toBe("Food");
    expect(cs[0].transactionId).toBeNull(); // category-level, not per-txn
    expect(cs[0].summary).not.toHaveProperty("merchant"); // no PII
  });

  it("does NOT fire just below the 1.75× threshold", () => {
    // $80 on day 15 of 30 → projected = $160; baseline = $100; 1.6× < 1.75 → no fire
    const curTxn = tx("cur2", "2026-06-12", 80, "FOOD", "debit", "Grocer");
    const found = detectAnomalies({
      transactions: [...foodHistory(), curTxn],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "category_spike")).toHaveLength(0);
  });

  it("does NOT fire when there are fewer than 2 prior complete months of category history", () => {
    // Only 1 prior month of FOOD
    const oneMonth = [tx("h0", "2026-05-15", 100, "FOOD", "debit", "Grocer")];
    const curTxn = tx("cur3", "2026-06-12", 500, "FOOD", "debit", "BigGrocer");
    const found = detectAnomalies({
      transactions: [...oneMonth, curTxn],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "category_spike")).toHaveLength(0);
  });

  it("does NOT fire when the category baseline is zero", () => {
    // Prior months all have zero spend in UNKNOWN_CAT — can't spike against 0
    const found = detectAnomalies({
      transactions: [
        tx("cur4", "2026-06-12", 500, "UNKNOWN_CAT", "debit", "Shop"),
        // No prior history in UNKNOWN_CAT at all
        tx("other1", "2026-04-01", 100, "FOOD", "debit", "Grocer"),
        tx("other2", "2026-05-01", 100, "FOOD", "debit", "Grocer"),
      ],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "category_spike")).toHaveLength(0);
  });

  it("dedup_key encodes the current YYYY-MM (monthly suppression)", () => {
    const curTxn = tx("cur5", "2026-06-12", 150, "FOOD", "debit", "BigGrocer");
    const found = detectAnomalies({
      transactions: [...foodHistory(), curTxn],
      accounts: [],
      asOf: ASOF,
    });
    const cs = found.filter((a) => a.kind === "category_spike");
    expect(cs[0].dedupKey).toBe("category_spike:FOOD:2026-06");
  });

  it("projection formula: currentTotal * (daysInMonth / dayOfMonth)", () => {
    // asOf = June 10 (day 10 of 30) → projected = curTotal * 3
    const asOf10 = "2026-06-10";
    const curTxn = tx("cur6", "2026-06-08", 60, "FOOD", "debit", "Grocer"); // $60 so far → projected $180
    const found = detectAnomalies({
      transactions: [...foodHistory(), curTxn],
      accounts: [],
      asOf: asOf10,
    });
    // baseline = $100; projected = 60 * (30/10) = 180; 1.8× ≥ 1.75 → fires
    expect(found.filter((a) => a.kind === "category_spike")).toHaveLength(1);
  });
});
