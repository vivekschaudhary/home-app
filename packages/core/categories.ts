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
  merchantEntityId?: string | null; // WLT-22-4 — Plaid's stable merchant id (primary match)
}
export interface MerchantRuleSpec {
  merchantNorm: string;
  categoryId: string;
  ruleId: string;
  merchantEntityId?: string | null; // WLT-22-4 — entity id captured at rule creation (primary key)
  updatedAt?: string; // ISO; on a key collision the NEWEST rule wins (deterministic)
}

// `a` is newer than `b`: later updatedAt, ties broken by the larger ruleId so the
// outcome is fully deterministic regardless of the order rules were loaded.
function ruleIsNewer(a: MerchantRuleSpec, b: MerchantRuleSpec): boolean {
  const au = a.updatedAt ?? "";
  const bu = b.updatedAt ?? "";
  return au !== bu ? au > bu : a.ruleId > b.ruleId;
}

/**
 * WLT-22-3 / WLT-22-4 (pure) — which transactions a set of merchant rules should
 * write a `'rule'` assignment to. A transaction matches a rule **entity-first**
 * (Plaid's stable `merchant_entity_id` — consistent across the merchant's name
 * variants), falling back to the **canonical name** (INC-2026-06-19). Excludes any
 * transaction with a `'user'` override (the user's explicit choice wins) and
 * de-duplicates by `dedupKey`. The DB layer maps these to upsert rows.
 */
export function matchRuleAssignments(
  txns: readonly RuleMatchTxn[],
  userOwnedDedupKeys: ReadonlySet<string>,
  rules: readonly MerchantRuleSpec[],
): { dedupKey: string; categoryId: string; ruleId: string }[] {
  // Two newest-wins indices: Plaid's stable entity id (PRIMARY) + the canonical
  // name (FALLBACK). Why newest-wins per key — the legacy DB was unique on the OLD
  // raw name key, so two rows ("walmart.com", "walmart supercenter #1234") can now
  // collapse to the same canonical key (or share one entity id); `readRules` has no
  // ordering, so a raw Map overwrite would pick a winner that varies across syncs.
  // Keeping the NEWEST rule (ties by ruleId) is deterministic + matches the user's
  // last explicit write, independent of load order. Legacy name keys are re-
  // canonicalized on the fly (normalizeMerchant is idempotent) so old rules match
  // new variants without a data migration.
  const byEntity = new Map<string, MerchantRuleSpec>();
  const byNorm = new Map<string, MerchantRuleSpec>();
  for (const r of rules) {
    if (r.merchantEntityId) {
      const cur = byEntity.get(r.merchantEntityId);
      if (!cur || ruleIsNewer(r, cur)) byEntity.set(r.merchantEntityId, r);
    }
    const key = normalizeMerchant(r.merchantNorm);
    if (key) {
      const cur = byNorm.get(key);
      if (!cur || ruleIsNewer(r, cur)) byNorm.set(key, r);
    }
  }
  const out: { dedupKey: string; categoryId: string; ruleId: string }[] = [];
  const seen = new Set<string>();
  for (const t of txns) {
    if (userOwnedDedupKeys.has(t.dedupKey) || seen.has(t.dedupKey)) continue;
    // entity-first, then the canonical-name fallback
    const rule = (t.merchantEntityId ? byEntity.get(t.merchantEntityId) : undefined) ?? byNorm.get(normalizeMerchant(t.merchant));
    if (!rule) continue;
    seen.add(t.dedupKey);
    out.push({ dedupKey: t.dedupKey, categoryId: rule.categoryId, ruleId: rule.ruleId });
  }
  return out;
}

/** WLT-22-5 — the protected, undeletable system category that holds transfers +
 * card payments so they don't inflate spending. The canonical name, shared by the
 * seed (app), the auto-assign writer (db), and the UI. */
export const PROTECTED_TRANSFERS_CATEGORY = "Transfers & Payments";

/**
 * WLT-22-5 — which transactions auto-route to the protected "Transfers &
 * Payments" category: those the provider adapter classified `transfer` or
 * `payment` (the double-count legs) that the user hasn't already assigned. `fee`
 * (a real bank-fee spend) and `income` (a credit, never spending) are deliberately
 * EXCLUDED — only the two non-spending debit kinds are set aside. Pure + keyed on
 * the normalized `kind`, never a provider taxonomy string (AC8).
 */
export function transfersToAutoAssign(
  txns: readonly { dedupKey: string; kind: string }[],
  userOwnedDedupKeys: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const t of txns) {
    if (userOwnedDedupKeys.has(t.dedupKey)) continue;
    if (t.kind === "transfer" || t.kind === "payment") out.push(t.dedupKey);
  }
  return out;
}
