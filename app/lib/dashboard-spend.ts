// WLT-26-1 — the category spend bar chart read, wired to Supabase. The
// COMPUTATIONS are pure in @wealth/core (dashboard-spend.ts); this file reads
// the transactions (owner-scoped, under the user's RLS session), resolves
// categories via the shared WLT-22 helper, applies the WLT-22-5 spending flag,
// and feeds the rows to buildCategorySpendChart. Consumed by the dashboard RSC —
// no public endpoint.
//
// Rolling 6-month window: first day of the month 5 calendar months before today
// through today. The (user_id, occurred_on, category) index (0018 migration)
// keeps the bounded read sub-50ms for typical corpus sizes.

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { type CategorySpendChart, buildCategorySpendChart, effectiveCategory } from "@wealth/core";
import { readCategoryAssignments, readCategorySpendingFlags } from "@wealth/db/categories";
import { readAllPaged } from "@wealth/db/paged";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** First day of the month N calendar months before `curMonth` ('YYYY-MM'). */
function monthsAgoStart(curMonth: string, n: number): string {
  const [y, m] = curMonth.split("-").map(Number);
  let yy = y;
  let mm = m;
  for (let i = 0; i < n; i++) {
    mm -= 1;
    if (mm === 0) {
      mm = 12;
      yy -= 1;
    }
  }
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

/**
 * Fetch the category spend chart data for the user's dashboard.
 * Reads the rolling 6-month window of transactions, resolves categories, and
 * returns the structured chart view (top-10 bars + monthsOfHistory).
 * WLT-27-1: activeCurrency filters to a single currency (default 'USD').
 *
 * EXPLAIN ANALYZE pre-launch discipline (architecture.md): confirm the
 * (user_id, occurred_on, category) composite index from 0018_category_index.sql
 * keeps this under 50ms for a typical corpus.
 */
export async function readCategorySpendChart(userId: string, activeCurrency = "USD"): Promise<CategorySpendChart> {
  const supabase = await createServerSupabase();
  const asOf = todayUtc();
  const curMonth = asOf.slice(0, 7);
  const since = monthsAgoStart(curMonth, 5); // first day of 5 months ago

  const [rows, assignments, spendingFlags] = await Promise.all([
    readAllPaged<{
      dedup_key: string;
      direction: string;
      category: string | null;
      amount: number | string;
      occurred_on: string;
      currency: string;
    }>(
      (from, to) =>
        supabase
          .from("transactions")
          .select("dedup_key, direction, category, amount, occurred_on, currency")
          .eq("user_id", userId)
          .eq("currency", activeCurrency)
          .gte("occurred_on", since)
          .lte("occurred_on", asOf)
          .order("dedup_key", { ascending: true })
          .range(from, to),
      "dashboard-spend",
    ),
    readCategoryAssignments(supabase, userId),
    readCategorySpendingFlags(supabase, userId),
  ]);

  const txns = rows.map((r) => ({
    direction: r.direction,
    category: effectiveCategory(r.category, assignments.get(r.dedup_key)),
    amount: Number(r.amount),
    occurredOn: r.occurred_on,
    currency: r.currency,
  }));

  const countsAsSpending = (name: string): boolean => {
    const flag = spendingFlags.get(name);
    return flag === undefined ? true : flag;
  };

  return buildCategorySpendChart(txns, asOf, countsAsSpending);
}
