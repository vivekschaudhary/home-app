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

// WLT-22-3 / INC-2026-06-19 — noise tokens that denote the SAME merchant across
// Plaid's name variants (online vs in-store vs format/legal suffix). Conservative
// on purpose: stripping a real distinguishing word (e.g. "pharmacy") would
// over-merge two merchants, so only format/legal/online noise lives here — NOT
// category words.
const MERCHANT_NOISE = new Set(["com", "online", "inc", "llc", "corp", "co", "supercenter", "superstore"]);

/**
 * WLT-22-3 — canonical merchant key for a "remember the merchant" rule. The SAME
 * function keys the rule (`category_rules.merchant_norm`) AND matches it against a
 * transaction's merchant at backfill + sync, so the two can never drift.
 *
 * INC-2026-06-19: Plaid emits the same real merchant under varying `merchant_name`
 * ("Walmart", "Walmart.com", "WAL-MART", "Walmart Supercenter #1234"), so the old
 * exact key (lowercase + collapse-whitespace) treated every variant as a different
 * merchant → new transactions missed the rule. Now: lowercase → punctuation to
 * spaces → drop store/location NUMBERS + format/legal/online NOISE tokens →
 * concatenate the rest. The Walmart variants all key to `"walmart"`, while
 * `"Walmart Pharmacy"` stays `"walmartpharmacy"` (distinct). `null`/blank/
 * number-only → `""`. **Idempotent** — re-applying to an already-stored key is a
 * no-op, so the matcher can re-canonicalize legacy rule keys on the fly.
 */
export function normalizeMerchant(merchant: string | null | undefined): string {
  const tokens = (merchant ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((tok) => tok && !MERCHANT_NOISE.has(tok) && !/^\d+$/.test(tok));
  return tokens.join("");
}

export interface RuleMatchTxn {
  dedupKey: string;
  merchant: string | null;
}
export interface MerchantRuleSpec {
  merchantNorm: string;
  categoryId: string;
  ruleId: string;
}

/**
 * WLT-22-3 (pure) — which transactions a set of merchant rules should write a
 * `'rule'` assignment to: every transaction whose normalized merchant matches a
 * rule, EXCLUDING any with a `'user'` override (the user's explicit choice always
 * wins) and de-duplicated by `dedupKey`. The DB layer maps these to upsert rows.
 */
export function matchRuleAssignments(
  txns: readonly RuleMatchTxn[],
  userOwnedDedupKeys: ReadonlySet<string>,
  rules: readonly MerchantRuleSpec[],
): { dedupKey: string; categoryId: string; ruleId: string }[] {
  // Re-canonicalize each stored rule key (INC-2026-06-19): a rule written before
  // the fix may hold a pre-canonical key (e.g. "walmart supercenter"); running it
  // back through normalizeMerchant (idempotent) makes legacy rules match the new
  // canonical transaction keys without a data migration.
  const byNorm = new Map(rules.map((r) => [normalizeMerchant(r.merchantNorm), r]));
  const out: { dedupKey: string; categoryId: string; ruleId: string }[] = [];
  const seen = new Set<string>();
  for (const t of txns) {
    if (userOwnedDedupKeys.has(t.dedupKey) || seen.has(t.dedupKey)) continue;
    const rule = byNorm.get(normalizeMerchant(t.merchant));
    if (!rule) continue;
    seen.add(t.dedupKey);
    out.push({ dedupKey: t.dedupKey, categoryId: rule.categoryId, ruleId: rule.ruleId });
  }
  return out;
}
