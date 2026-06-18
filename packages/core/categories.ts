// WLT-22-2 — the ONE shared category resolver (pure). The user's saved category
// is the authority; Plaid's is the cold-start indication, used only for a
// transaction the user hasn't touched. Every grouping reader (budget, recap,
// anomaly) resolves through THIS — so no surface disagrees (the brief's #1
// guardrail). String-in, string-out: the pure compute downstream is unchanged.

/**
 * The effective category for a transaction: the user's SAVED category name if
 * present, else Plaid's provider category. `null` (no saved, no Plaid) flows
 * through unchanged — display humanizes it to "Other".
 */
export function effectiveCategory(
  plaidCategory: string | null | undefined,
  savedName: string | null | undefined,
): string | null {
  return savedName ?? plaidCategory ?? null;
}

/** A transaction carrying its stable identity + Plaid's category, pre-resolution. */
export interface ResolvableTxn {
  dedupKey: string;
  category: string | null;
}

/**
 * Resolve a transaction's category against a `dedupKey → saved category name`
 * map (the assignment map a reader fetched once for the user). Returns the
 * effective category string the pure compute should group by.
 */
export function resolveCategory(txn: ResolvableTxn, assignments: ReadonlyMap<string, string>): string | null {
  return effectiveCategory(txn.category, assignments.get(txn.dedupKey));
}
