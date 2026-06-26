import { describe, expect, it } from "vitest";
import { type AnomalyAccount, type AnomalyTxn, detectAnomalies } from "./anomaly";

// WLT-18 — the anomaly rules, PURE. The bar is PRECISION: each rule must fire on
// its fixture AND NOT false-positive on normal data (a wrong "worth a look" is
// worse than none). v1 = large_charge + low_balance (recurring_due deferred).

const ASOF = "2026-06-15";

function tx(id: string, occurredOn: string, amount: number, category = "GROCERIES", direction = "debit", merchant?: string): AnomalyTxn {
  return { id, accountId: "acc1", dedupKey: id, occurredOn, amount, category, direction, merchant };
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

// ── WLT-26-2: new_merchant detector ──────────────────────────────────────────

// Two months of grocery history — satisfies MIN_HISTORY_MONTHS = 2.
function twoMonthHistory(): AnomalyTxn[] {
  return [
    tx("h1", "2026-04-10", 50, "GROCERIES", "debit", "WholeFoods"),
    tx("h2", "2026-04-20", 55, "GROCERIES", "debit", "WholeFoods"),
    tx("h3", "2026-05-10", 48, "GROCERIES", "debit", "WholeFoods"),
    tx("h4", "2026-05-20", 52, "GROCERIES", "debit", "WholeFoods"),
  ];
}

describe("detectAnomalies — new_merchant", () => {
  it("fires on a debut merchant within the recent window", () => {
    const newTxn = tx("new1", "2026-06-13", 30, "DINING", "debit", "Nobu Restaurant");
    const found = detectAnomalies({
      transactions: [...twoMonthHistory(), newTxn],
      accounts: [],
      asOf: ASOF,
    });
    const nm = found.filter((a) => a.kind === "new_merchant");
    expect(nm).toHaveLength(1);
    expect(nm[0].transactionId).toBe("new1");
    expect(nm[0].dedupKey).toBe("new_merchant:new1"); // prefix + debut tx dedupKey
    expect(nm[0].severity).toBe("info");
    expect(nm[0].summary).toEqual({ amount: 30, date: "2026-06-13" });
    expect(nm[0].summary).not.toHaveProperty("merchant"); // PII invariant
  });

  it("does NOT fire for a merchant with prior occurrences in the window", () => {
    // WholeFoods appeared in April + May → not a debut when it appears in June.
    const returning = tx("ret1", "2026-06-13", 60, "GROCERIES", "debit", "WholeFoods");
    const found = detectAnomalies({
      transactions: [...twoMonthHistory(), returning],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "new_merchant")).toHaveLength(0);
  });

  it("does NOT fire when monthsOfHistory < 2", () => {
    // Only one month of history → gate blocks detection.
    const found = detectAnomalies({
      transactions: [
        tx("h1", "2026-06-01", 50, "GROCERIES", "debit", "WholeFoods"),
        tx("new1", "2026-06-13", 30, "DINING", "debit", "Nobu Restaurant"),
      ],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "new_merchant")).toHaveLength(0);
  });

  it("does NOT fire for a merchant appearing only outside the recent window", () => {
    // Debut in May (> 7 days before ASOF 2026-06-15) → not flagged.
    const found = detectAnomalies({
      transactions: [
        ...twoMonthHistory(),
        tx("old", "2026-05-30", 30, "DINING", "debit", "Nobu Restaurant"),
      ],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "new_merchant")).toHaveLength(0);
  });

  it("does NOT fire for transactions with no identifiable merchant", () => {
    const noMerchant = tx("nm1", "2026-06-13", 30, "DINING", "debit", undefined);
    const found = detectAnomalies({
      transactions: [...twoMonthHistory(), noMerchant],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "new_merchant")).toHaveLength(0);
  });

  it("uses dedupKey = 'new_merchant:' + debut transaction's dedupKey", () => {
    const debutTx = tx("debut-dedup-key", "2026-06-14", 25, "DINING", "debit", "NewPlace");
    const found = detectAnomalies({
      transactions: [...twoMonthHistory(), debutTx],
      accounts: [],
      asOf: ASOF,
    });
    const nm = found.filter((a) => a.kind === "new_merchant");
    expect(nm[0].dedupKey).toBe("new_merchant:debut-dedup-key");
  });

  it("normalizes merchant names — store-number variants of the same merchant count as one", () => {
    // "WholeFoods" in history normalizes to "wholefoods".
    // "Whole Foods #1234" → strip "#1234" (all-digit token) → "wholefoods" — same key, not a debut.
    const variant = tx("var1", "2026-06-13", 60, "GROCERIES", "debit", "Whole Foods #1234");
    const found = detectAnomalies({
      transactions: [...twoMonthHistory(), variant],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "new_merchant")).toHaveLength(0);
  });
});

// ── WLT-26-2: category_spike detector ────────────────────────────────────────

// asOf = 2026-06-15 → 15 days into June (31 days total → projection × (30/15) = 2×).
describe("detectAnomalies — category_spike", () => {
  // Prior April + May grocery totals = 100 each → median = 100.
  function twoMonthCategoryHistory(): AnomalyTxn[] {
    return [
      tx("g1", "2026-04-10", 60, "GROCERIES"),
      tx("g2", "2026-04-20", 40, "GROCERIES"), // April total = 100
      tx("g3", "2026-05-10", 55, "GROCERIES"),
      tx("g4", "2026-05-20", 45, "GROCERIES"), // May total = 100
    ];
  }

  it("fires when current-month projection >= 1.75× the median of prior months", () => {
    // June so far: 90 (day 15 of 30) → projection = 90 × (30/15) = 180 = 1.8× median 100.
    const found = detectAnomalies({
      transactions: [
        ...twoMonthCategoryHistory(),
        tx("cur1", "2026-06-10", 50, "GROCERIES"),
        tx("cur2", "2026-06-14", 40, "GROCERIES"), // current total = 90
      ],
      accounts: [],
      asOf: ASOF, // 2026-06-15
    });
    const cs = found.filter((a) => a.kind === "category_spike");
    expect(cs).toHaveLength(1);
    expect(cs[0].severity).toBe("attention");
    expect(cs[0].transactionId).toBeNull();
    expect(cs[0].accountId).toBeNull();
    expect(cs[0].dedupKey).toBe("category_spike:GROCERIES:2026-06");
    const s = cs[0].summary as { category: string; amount: number; baseline: number; multiple: number };
    expect(s.category).toBe("Groceries");
    expect(s.baseline).toBe(100);
    expect(s.amount).toBeGreaterThan(175); // 180 projected
    expect(s.multiple).toBeGreaterThanOrEqual(1.75);
  });

  it("does NOT fire when projection < 1.75× the median", () => {
    // June total 70 / 15 days × 30 = 140 = 1.4× median 100 → below threshold.
    const found = detectAnomalies({
      transactions: [
        ...twoMonthCategoryHistory(),
        tx("cur1", "2026-06-14", 70, "GROCERIES"), // projected = 140
      ],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "category_spike")).toHaveLength(0);
  });

  it("does NOT fire when fewer than 2 prior complete months for that category", () => {
    // Only one prior month (May) → not enough history.
    const found = detectAnomalies({
      transactions: [
        tx("g3", "2026-05-10", 55, "GROCERIES"),
        tx("g4", "2026-05-20", 45, "GROCERIES"), // only May
        tx("cur1", "2026-06-14", 90, "GROCERIES"),
      ],
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "category_spike")).toHaveLength(0);
  });

  it("does NOT fire when the category baseline is zero or negative", () => {
    // Prior months with $0 total (no debits counted) — no baseline to compare against.
    // In practice this means priorTotals = [] (no entries), already guarded by MIN_HISTORY.
    // Separately, a median of 0 is explicitly guarded.
    const found = detectAnomalies({
      transactions: [
        tx("g1", "2026-04-10", 0, "GROCERIES"),
        tx("g2", "2026-05-10", 0, "GROCERIES"),
        tx("cur1", "2026-06-14", 90, "GROCERIES"),
      ],
      accounts: [],
      asOf: ASOF,
    });
    // Zero-amount prior transactions → median = 0 → no spike (guard holds).
    expect(found.filter((a) => a.kind === "category_spike")).toHaveLength(0);
  });

  it("encodes the current YYYY-MM month in the dedupKey (monthly suppression)", () => {
    const found = detectAnomalies({
      transactions: [
        ...twoMonthCategoryHistory(),
        tx("cur1", "2026-06-14", 90, "GROCERIES"),
      ],
      accounts: [],
      asOf: ASOF,
    });
    const cs = found.filter((a) => a.kind === "category_spike");
    expect(cs[0].dedupKey).toMatch(/^category_spike:GROCERIES:2026-06$/);
  });

  it("projection formula is correct: currentTotal × (daysInMonth / dayOfMonth)", () => {
    // asOf = 2026-06-15 (day 15; June = 30 days). Current = 87.5 → projected 175 = exactly 1.75×.
    const found = detectAnomalies({
      transactions: [
        ...twoMonthCategoryHistory(),
        tx("cur1", "2026-06-14", 87.5, "GROCERIES"),
      ],
      accounts: [],
      asOf: "2026-06-15",
    });
    const cs = found.filter((a) => a.kind === "category_spike");
    // 87.5 × (30/15) = 175 = exactly 1.75 × 100 → fires at boundary.
    expect(cs).toHaveLength(1);
    expect((cs[0].summary as { amount: number }).amount).toBe(175);
  });

  it("does NOT fire when the current month has no transactions in that category", () => {
    const found = detectAnomalies({
      transactions: twoMonthCategoryHistory(), // no June transactions
      accounts: [],
      asOf: ASOF,
    });
    expect(found.filter((a) => a.kind === "category_spike")).toHaveLength(0);
  });
});
