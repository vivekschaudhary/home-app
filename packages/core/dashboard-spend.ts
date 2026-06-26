// WLT-26-1 — Category spend bar chart (dashboard intelligence). PURE compute over
// the user's own transactions. No DB, no I/O → exhaustively unit-testable.
// The dashboard read (app/lib/dashboard-spend.ts) feeds pre-filtered SpendingTxns;
// this assembles the view: top-10 categories by current-month spend with a rolling
// median baseline (robust to a one-off spike inflating its own baseline).

import { humanizeCategory, type SpendingTxn } from "./recap";

/** One bar in the category spend chart. */
export interface CategoryBar {
  category: string; // raw resolved category slug (used for the ledger ?category= filter)
  label: string; // humanized display name
  currentMonth: number; // this month's spend so far
  average: number | null; // median of prior months; null when monthsOfHistory < 2
}

export interface CategorySpendChart {
  bars: CategoryBar[]; // top-10, sorted by currentMonth desc then category asc
  monthsOfHistory: number; // count of distinct calendar months with ≥1 spending txn
}

const TOP_N = 10;
const PRIOR_MONTHS = 5; // 5 prior complete months + current = 6-month rolling window
const MIN_HISTORY_MONTHS = 2;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The N calendar months immediately BEFORE curMonth ('YYYY-MM'), newest-first. */
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
 * Build the category spend chart from pre-filtered transactions (transfers/payments
 * already excluded via countsAsSpending at the reader level). Pure + deterministic.
 *
 * Algorithm:
 *   1. Group debits by (category, calendar month) within the 6-month window.
 *   2. monthsOfHistory = distinct calendar months with ≥1 spending txn.
 *   3. For each category with current-month spend:
 *      - average = median of non-zero prior-complete-month totals (robust to gaps).
 *      - average = null when monthsOfHistory < MIN_HISTORY_MONTHS (cold-start gate).
 *   4. Sort by current-month spend (desc), ties broken alphabetically.
 *   5. Return top-10.
 */
export function buildCategorySpendChart(
  txns: readonly SpendingTxn[],
  asOf: string,
  countsAsSpending: (category: string) => boolean = () => true,
): CategorySpendChart {
  const curMonth = asOf.slice(0, 7);
  const priorMonthList = trailingMonths(curMonth, PRIOR_MONTHS); // 5 months, newest-first
  const inWindow = new Set([curMonth, ...priorMonthList]);

  // per-category per-month debit totals (spending only)
  const byCatMonth = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const cat = t.category ?? "";
    if (!countsAsSpending(cat)) continue;
    const month = t.occurredOn.slice(0, 7);
    if (!inWindow.has(month)) continue;
    let mm = byCatMonth.get(cat);
    if (!mm) {
      mm = new Map();
      byCatMonth.set(cat, mm);
    }
    mm.set(month, round2((mm.get(month) ?? 0) + t.amount));
  }

  // monthsOfHistory = distinct calendar months with ≥1 spending txn (across all categories)
  const allMonths = new Set<string>();
  for (const mm of byCatMonth.values()) {
    for (const month of mm.keys()) allMonths.add(month);
  }
  const monthsOfHistory = allMonths.size;

  const bars: CategoryBar[] = [];
  for (const [cat, mm] of byCatMonth) {
    const currentMonthTotal = round2(mm.get(curMonth) ?? 0);
    if (currentMonthTotal <= 0) continue; // no current-month spend → skip

    // Average: median of non-zero prior-month totals (months in the window with any spend).
    // Using only non-zero months avoids a low median caused by months the category
    // didn't exist (a brand-new category looks abnormally cheap otherwise).
    let average: number | null = null;
    if (monthsOfHistory >= MIN_HISTORY_MONTHS) {
      const priorTotals = priorMonthList
        .map((m) => mm.get(m) ?? 0)
        .filter((v) => v > 0);
      if (priorTotals.length > 0) {
        average = round2(median(priorTotals));
      }
    }

    bars.push({
      category: cat,
      label: humanizeCategory(cat || null),
      currentMonth: currentMonthTotal,
      average,
    });
  }

  // Sort by current-month spend desc; ties broken alphabetically by raw category
  bars.sort((a, b) => b.currentMonth - a.currentMonth || a.category.localeCompare(b.category));

  return { bars: bars.slice(0, TOP_N), monthsOfHistory };
}
