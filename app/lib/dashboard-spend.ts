// WLT-26-1 — Dashboard category spend chart read. Owner-scoped, under the user's
// RLS session. Reads the rolling 6-month transaction window, resolves categories
// via the ONE shared effectiveCategory helper (WLT-22 discipline), applies the
// WLT-22-5 countsAsSpending filter, then delegates to the pure buildCategorySpendChart.
//
// Performance: bounded by the rolling 6-month window + the readAllPaged 1000-row
// discipline. Validate with EXPLAIN ANALYZE before launch (brief guardrail: p95 < 200ms).

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { effectiveCategory } from "@wealth/core";
import { readCategoryAssignments, readCategorySpendingFlags } from "@wealth/db/categories";
import { readAllPaged } from "@wealth/db/paged";
import { buildCategorySpendChart, type CategorySpendChart } from "@wealth/core/dashboard-spend";
import type { SpendingTxn } from "@wealth/core/recap";

/** First day of the month N calendar months before today (UTC). */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Read the category spend chart data for the dashboard. Owner-scoped (RLS), no
 * public endpoint — consumed directly by the dashboard RSC.
 */
export async function readCategorySpendChart(userId: string): Promise<CategorySpendChart> {
  const supabase = await createServerSupabase();
  const asOf = new Date().toISOString().slice(0, 10);
  // Rolling 6-month window: first day of the month 5 months ago through today.
  const windowStart = monthsAgo(5);

  const [txnRows, assignments, spendingFlags] = await Promise.all([
    readAllPaged(
      (from, to) =>
        supabase
          .from("transactions")
          .select("dedup_key, direction, category, amount, occurred_on")
          .eq("user_id", userId)
          .is("removed_at", null)
          .is("superseded_by", null)
          .gte("occurred_on", windowStart)
          .order("occurred_on", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      "readCategorySpendChart",
    ),
    readCategoryAssignments(supabase, userId),
    readCategorySpendingFlags(supabase, userId),
  ]);

  const countsAsSpending = (name: string) => spendingFlags.get(name) ?? true;

  const txns: SpendingTxn[] = (txnRows as { dedup_key: string; direction: string; category: string | null; amount: number | string; occurred_on: string }[]).map(
    (r) => ({
      direction: r.direction,
      category: effectiveCategory(r.category, assignments.get(r.dedup_key)),
      amount: Number(r.amount),
      occurredOn: r.occurred_on,
    }),
  );

  return buildCategorySpendChart(txns, asOf, countsAsSpending);
}
