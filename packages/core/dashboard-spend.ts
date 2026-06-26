// Dashboard Intelligence (WLT-26-1) — PURE compute for the category spend bar
// chart. No DB, no I/O → exhaustively unit-testable. The data read
// (app/lib/dashboard-spend.ts) feeds pre-resolved transactions here; this
// assembles the top-10 bars + rolling-average reference values.
//
// Design: reuses the budget.ts median/trailing-month idiom. Average = median of
// prior complete months (robust to a one-off spike inflating its own baseline,
// consistent with the budget recommendation baseline).

import { humanizeCategory, type SpendingTxn } from "./recap";

export interface CategoryBar {
  category: string; // resolved category name (used in ledger href)
  label: string; // humanized for display
  currentMonth: number; // current-month spend so far
  average: number | null; // median of prior months; null when monthsOfHistory < 2
}

export interface CategorySpendChart {
  bars: CategoryBar[]; // top-10 by currentMonth desc, ties broken by label asc
  monthsOfHistory: number; // distinct months with ≥1 spending txn in the 6-month window
  currentMonth: string; // 'YYYY-MM' — the month the bars represent (for bar hrefs)
}

const CHART_TOP_N = 10;
const PRIOR_MONTHS = 5; // 5 prior + 1 current = 6-month window
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

/** The `n` calendar months immediately BEFORE `curMonth` ('YYYY-MM'), newest first. */
function trailingMonthsBefore(curMonth: string, n: number): string[] {
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
 * Build the category spend bar chart from pre-resolved transactions.
 *
 * Rules:
 *  (a) Drop non-spending categories via `countsAsSpending` (WLT-22-5 discipline).
 *  (b) Group by resolved category + calendar month.
 *  (c) Average = median of prior complete months' per-category totals in the
 *      rolling 6-month window (robust to one-off spike inflating its own baseline).
 *  (d) `average = null` when `monthsOfHistory < 2`.
 *  (e) Top-10 by current-month spend; ties broken alphabetically by label.
 *  (f) `monthsOfHistory` = count of distinct calendar months in the 6-month
 *      window with ≥1 spending transaction.
 */
export function buildCategorySpendChart(
  txns: readonly SpendingTxn[],
  asOf: string, // 'YYYY-MM-DD'
  countsAsSpending: (name: string) => boolean = () => true,
): CategorySpendChart {
  const curMonth = asOf.slice(0, 7);
  const priorMonthSet = new Set(trailingMonthsBefore(curMonth, PRIOR_MONTHS));

  // Per-category per-month debit totals
  const currentByCat = new Map<string, number>(); // curMonth totals
  const priorByCat = new Map<string, Map<string, number>>(); // cat → (month → total)
  const monthsWithData = new Set<string>(); // distinct months with spending

  for (const t of txns) {
    if (t.direction !== "debit") continue;
    const cat = t.category ?? "";
    if (!countsAsSpending(cat)) continue;

    const txMonth = t.occurredOn.slice(0, 7);
    if (txMonth === curMonth && t.occurredOn <= asOf) {
      currentByCat.set(cat, round2((currentByCat.get(cat) ?? 0) + t.amount));
      monthsWithData.add(curMonth);
    } else if (priorMonthSet.has(txMonth)) {
      monthsWithData.add(txMonth);
      let mm = priorByCat.get(cat);
      if (!mm) {
        mm = new Map();
        priorByCat.set(cat, mm);
      }
      mm.set(txMonth, round2((mm.get(txMonth) ?? 0) + t.amount));
    }
  }

  const monthsOfHistory = monthsWithData.size;

  const bars: CategoryBar[] = [];
  for (const [cat, current] of currentByCat) {
    if (current <= 0) continue;

    let average: number | null = null;
    if (monthsOfHistory >= MIN_HISTORY_MONTHS) {
      const priorMm = priorByCat.get(cat);
      if (priorMm && priorMm.size > 0) {
        average = round2(median([...priorMm.values()]));
      }
    }

    bars.push({
      category: cat,
      label: humanizeCategory(cat || null),
      currentMonth: current,
      average,
    });
  }

  bars.sort((a, b) => b.currentMonth - a.currentMonth || a.label.localeCompare(b.label));

  return {
    bars: bars.slice(0, CHART_TOP_N),
    monthsOfHistory,
    currentMonth: curMonth,
  };
}
