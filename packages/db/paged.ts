// FIX-2026-06-20b — read EVERY row of a query, paginating past PostgREST's
// 1000-row response cap. A single uncapped `.select()` returns only the first
// ~1000 rows, so any reader over a >1000-row set silently undercounts (budget
// totals) or skips rows (a rule never reaching a user's older transactions).
//
// `page(from, to)` builds the query for ONE inclusive `.range()` window — the
// caller MUST apply a stable, total `.order()` (a unique tiebreaker) so windows
// don't overlap or skip rows at the boundaries. `label` tags the thrown error so
// a failure points at the calling reader.
export async function readAllPaged<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label = "paged-read",
): Promise<T[]> {
  const SIZE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await page(from, from + SIZE - 1);
    if (error) throw new Error(`[${label}] paged read failed: ${error.message}`);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < SIZE) break;
  }
  return out;
}
