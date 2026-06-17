// Budget & Spending (WLT-21 / WLT-21-1) — PURE compute over the user's own
// transactions. No DB, no I/O → exhaustively unit-testable. The /budget page
// reads the rows (app/lib/budget.ts, owner-scoped) and the saved budgets, and
// this assembles the view: a per-category Recommended (from the user's OWN
// history — no income benchmarks), This-month-so-far actual, and the over/under
// vs the user's saved cap. Honest cold-start: no recommendation until there's
// ≥1 month of history (never a fabricated number).

import { humanizeCategory, type SpendingTxn } from "./recap";

// The Plaid personal_finance_category PRIMARY enumeration (the strings we store
// in transactions.category). Stable provider taxonomy; humanized for display.
export const PLAID_PRIMARY_CATEGORIES = [
  "INCOME",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "LOAN_PAYMENTS",
  "BANK_FEES",
  "ENTERTAINMENT",
  "FOOD_AND_DRINK",
  "GENERAL_MERCHANDISE",
  "HOME_IMPROVEMENT",
  "MEDICAL",
  "PERSONAL_CARE",
  "GENERAL_SERVICES",
  "GOVERNMENT_AND_NON_PROFIT",
  "TRANSPORTATION",
  "TRAVEL",
  "RENT_AND_UTILITIES",
] as const;

// Documented / legacy category names that ALSO appear in stored data: the Plaid
// mapper falls back to the legacy `category[0]` taxonomy when the personal-finance
// category is absent (packages/aggregation/plaid/map.ts), and the product's own
// fixtures + the user's enumerated list use these. So the real taxonomy is a
// union — budget against both.
const DOCUMENTED_EXTRA_CATEGORIES = ["GROCERIES", "INSURANCE"] as const;

// What the "add a category" picker offers: spendable categories only — income +
// transfers aren't spending — across BOTH the Plaid primary taxonomy and the
// documented/legacy names (so GROCERIES + INSURANCE are offerable).
export const BUDGETABLE_CATEGORIES: readonly string[] = [
  ...PLAID_PRIMARY_CATEGORIES.filter((c) => c !== "INCOME" && c !== "TRANSFER_IN" && c !== "TRANSFER_OUT"),
  ...DOCUMENTED_EXTRA_CATEGORIES,
];

// Essentials get their typical spend as the recommendation; discretionary
// categories get a modest trim (recommend spending a little less). Covers BOTH
// taxonomies so groceries — whether stored as FOOD_AND_DRINK or GROCERIES — and
// insurance are never wrongly trimmed as discretionary.
const ESSENTIAL_CATEGORIES = new Set([
  "RENT_AND_UTILITIES",
  "LOAN_PAYMENTS",
  "MEDICAL",
  "FOOD_AND_DRINK",
  "GROCERIES",
  "INSURANCE",
  "TRANSPORTATION",
]);

const DISCRETIONARY_TRIM = 0.9; // recommend 10% under typical for discretionary
const RECOMMEND_MIN_MONTHS = 1; // need ≥1 month of history to suggest anything
const TRAILING_MONTHS = 6; // the window for "typical" (median of monthly totals)

/** A user's saved budget for a category (exactly one limit is set). */
export interface SavedBudget {
  category: string; // raw Plaid primary key
  limitAmount: number | null;
  limitPercent: number | null;
}

/** One row of the budget table — the view model. */
export interface BudgetRow {
  category: string; // raw key (identity for save/clear)
  label: string; // humanized for display
  recommended: number | null; // null = cold-start (insufficient history)
  actualThisMonth: number; // current calendar month, so far
  budget: { type: "amount"; amount: number } | { type: "percent"; percent: number } | null;
  effectiveCap: number | null; // resolved dollar cap (percent → resolved); null if no/unresolvable budget
  status: "over" | "under" | "none";
}

export interface BuildBudgetRowsInput {
  budgets: readonly SavedBudget[];
  txns: readonly SpendingTxn[];
  asOf: string; // 'YYYY-MM-DD'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The `n` calendar months immediately BEFORE `curMonth` ('YYYY-MM'), as keys. */
function trailingMonths(curMonth: string, n: number): string[] {
  const [y, m] = curMonth.split("-").map(Number);
  const out: string[] = [];
  let yy = y;
  let mm = m;
  for (let i = 0; i < n; i++) {
    mm -= 1;
    if (mm === 0) {
      mm = 12;
      yy -= 1;
    }
    out.push(`${yy}-${String(mm).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Debits in the CURRENT calendar month up to `asOf` ("this month so far"), summed
 * per raw category. null category → "" (humanized to "Other" at display).
 */
export function computeMonthlySpending(txns: readonly SpendingTxn[], asOf: string): Map<string, number> {
  const month = asOf.slice(0, 7);
  const out = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    if (t.occurredOn.slice(0, 7) !== month) continue;
    if (t.occurredOn > asOf) continue; // so far (defensive — no future-dated)
    const key = t.category ?? "";
    out.set(key, round2((out.get(key) ?? 0) + t.amount));
  }
  return out;
}

/** The ordered 'YYYY-MM' keys for the year-spread chart: oldest → current (so far). */
export function seriesMonthKeys(asOf: string, months = 12): string[] {
  const cur = asOf.slice(0, 7);
  // trailingMonths gives the months BEFORE cur, newest-first → reverse + append cur.
  return [...trailingMonths(cur, months - 1)].reverse().concat(cur);
}

/**
 * Per category, debit spend in each of the trailing `months` calendar months
 * (index 0 = oldest … last = current month "so far"). Real zeros for gap/pre-
 * history months — never fabricated. (WLT-21-2 year-spread.)
 */
export function computeMonthlySeries(
  txns: readonly SpendingTxn[],
  asOf: string,
  months = 12,
): Map<string, number[]> {
  const keys = seriesMonthKeys(asOf, months);
  const index = new Map(keys.map((k, i) => [k, i]));
  const curMonth = asOf.slice(0, 7);
  const out = new Map<string, number[]>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const m = t.occurredOn.slice(0, 7);
    const i = index.get(m);
    if (i === undefined) continue;
    if (m === curMonth && t.occurredOn > asOf) continue; // current month = so far
    const key = t.category ?? "";
    let arr = out.get(key);
    if (!arr) {
      arr = new Array(months).fill(0);
      out.set(key, arr);
    }
    arr[i] = round2(arr[i] + t.amount);
  }
  return out;
}

/**
 * Recommended budget per raw category, from the user's OWN history: the median of
 * the category's monthly totals across the trailing window, trimmed 10% for
 * discretionary categories (essentials untrimmed). A category with no spend in the
 * window gets NO recommendation (omitted) — honest cold-start, never fabricated.
 */
export function computeRecommendedBudgets(txns: readonly SpendingTxn[], asOf: string): Map<string, number> {
  const allowed = new Set(trailingMonths(asOf.slice(0, 7), TRAILING_MONTHS));
  const byCatMonth = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const m = t.occurredOn.slice(0, 7);
    if (!allowed.has(m)) continue;
    const key = t.category ?? "";
    let mm = byCatMonth.get(key);
    if (!mm) {
      mm = new Map();
      byCatMonth.set(key, mm);
    }
    mm.set(m, round2((mm.get(m) ?? 0) + t.amount));
  }
  const out = new Map<string, number>();
  for (const [key, mm] of byCatMonth) {
    const monthlyTotals = [...mm.values()];
    if (monthlyTotals.length < RECOMMEND_MIN_MONTHS) continue; // not enough history
    const typical = median(monthlyTotals);
    if (typical <= 0) continue;
    const rec = ESSENTIAL_CATEGORIES.has(key) ? typical : typical * DISCRETIONARY_TRIM;
    out.set(key, round2(rec));
  }
  return out;
}

/** Median of the trailing-window monthly GRAND totals — the base for percent budgets. */
function typicalMonthlyTotal(txns: readonly SpendingTxn[], asOf: string): number | null {
  const allowed = new Set(trailingMonths(asOf.slice(0, 7), TRAILING_MONTHS));
  const byMonth = new Map<string, number>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const m = t.occurredOn.slice(0, 7);
    if (!allowed.has(m)) continue;
    byMonth.set(m, round2((byMonth.get(m) ?? 0) + t.amount));
  }
  const totals = [...byMonth.values()];
  if (totals.length < RECOMMEND_MIN_MONTHS) return null;
  const t = median(totals);
  return t > 0 ? round2(t) : null;
}

/** Resolve a percent budget to its effective dollar cap (% of typical monthly spend). */
export function resolvePercentCap(percent: number, typicalTotal: number | null): number | null {
  if (typicalTotal == null) return null;
  return round2((percent / 100) * typicalTotal);
}

/**
 * The budget table view model: every category with this-month spend OR a saved
 * budget, joined with its recommendation + actual + over/under status. Sorted by
 * this-month spend (desc). null category → "Other", never dropped.
 */
export function buildBudgetRows({ budgets, txns, asOf }: BuildBudgetRowsInput): BudgetRow[] {
  const actuals = computeMonthlySpending(txns, asOf);
  const recommended = computeRecommendedBudgets(txns, asOf);
  const typicalTotal = typicalMonthlyTotal(txns, asOf);
  const budgetByCat = new Map(budgets.map((b) => [b.category, b]));

  // Show every category the user actually spends in — this month's spend, their
  // trailing history (so a recommendation exists), or a saved budget. The "add a
  // category" picker covers only the truly-new (zero-history) categories.
  const keys = new Set<string>();
  for (const k of actuals.keys()) keys.add(k);
  for (const k of recommended.keys()) keys.add(k);
  for (const b of budgets) keys.add(b.category);

  const rows: BudgetRow[] = [];
  for (const key of keys) {
    const actual = round2(actuals.get(key) ?? 0);
    const saved = budgetByCat.get(key);
    let budget: BudgetRow["budget"] = null;
    let effectiveCap: number | null = null;
    if (saved) {
      if (saved.limitAmount != null) {
        budget = { type: "amount", amount: round2(saved.limitAmount) };
        effectiveCap = round2(saved.limitAmount);
      } else if (saved.limitPercent != null) {
        budget = { type: "percent", percent: saved.limitPercent };
        effectiveCap = resolvePercentCap(saved.limitPercent, typicalTotal);
      }
    }
    const status: BudgetRow["status"] = effectiveCap == null ? "none" : actual > effectiveCap ? "over" : "under";
    rows.push({
      category: key,
      label: humanizeCategory(key || null),
      recommended: recommended.get(key) ?? null,
      actualThisMonth: actual,
      budget,
      effectiveCap,
      status,
    });
  }
  rows.sort((a, b) => b.actualThisMonth - a.actualThisMonth || a.label.localeCompare(b.label));
  return rows;
}

/** Typical monthly total exposed for the app layer (percent helper text). */
export function computeTypicalMonthlyTotal(txns: readonly SpendingTxn[], asOf: string): number | null {
  return typicalMonthlyTotal(txns, asOf);
}
