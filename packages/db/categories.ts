import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { matchRuleAssignments } from "@wealth/core";

// WLT-22-2 — the ONE shared read of a user's saved category assignments, used by
// EVERY grouping reader (budget, recap, anomaly) so they resolve `saved ?? Plaid`
// the same way and never disagree (the brief's #1 guardrail). Works under either
// client: the app's RLS session (createServerSupabase) OR the anomaly job's
// service role (createServiceSupabase) — it always scopes by `user_id`
// explicitly, so it's correct even when RLS is bypassed.

// Both createServerSupabase (awaited) and createServiceSupabase return the same
// SupabaseClient shape; type the param off the synchronous one.
type SupabaseClientT = ReturnType<typeof createServiceSupabase>;

/**
 * `dedupKey → saved category NAME` for the user's transactions the user has
 * recategorized. Absent key ⇒ no saved category ⇒ the reader falls back to
 * Plaid's via `effectiveCategory`. Two owner-scoped selects joined in memory
 * (bounded per user; avoids PostgREST embedding ambiguity on the composite FK).
 */
export async function readCategoryAssignments(
  client: SupabaseClientT,
  userId: string,
): Promise<Map<string, string>> {
  const [cats, assigns] = await Promise.all([
    client.from("categories").select("id, name").eq("user_id", userId),
    client.from("transaction_categories").select("dedup_key, category_id").eq("user_id", userId),
  ]);
  const idToName = new Map<string, string>();
  for (const c of (cats.data ?? []) as { id: string; name: string }[]) idToName.set(c.id, c.name);

  const out = new Map<string, string>();
  for (const a of (assigns.data ?? []) as { dedup_key: string; category_id: string }[]) {
    const name = idToName.get(a.category_id);
    if (name) out.set(a.dedup_key, name);
  }
  return out;
}

// WLT-22-3 — a "remember the merchant" rule, normalized for matching.
export interface MerchantRule {
  merchantNorm: string;
  categoryId: string;
  ruleId: string;
  updatedAt?: string; // INC-2026-06-19 — newest wins on a canonical-key collision
}

/** The user's merchant rules (for the sync-time apply). */
export async function readRules(client: SupabaseClientT, userId: string): Promise<MerchantRule[]> {
  const { data } = await client
    .from("category_rules")
    .select("id, merchant_norm, category_id, updated_at")
    .eq("user_id", userId);
  return (data ?? []).map((r) => {
    const row = r as { id: string; merchant_norm: string; category_id: string; updated_at: string };
    return { merchantNorm: row.merchant_norm, categoryId: row.category_id, ruleId: row.id, updatedAt: row.updated_at };
  });
}

/**
 * Apply the given merchant rules to the user's transactions — write `'rule'`
 * assignments for every active transaction whose normalized merchant matches a
 * rule and that has NO `'user'` override (the user's explicit choice always
 * wins). Idempotent: re-running writes the same rows (so it's safe to call after
 * every sync, and to re-backfill on a last-write-wins rule replace). Returns the
 * number of transactions written. Works under either client (RLS app session or
 * the service-role sync job) — always scoped by `user_id`, and explicitly
 * filters superseded/removed (required under the RLS-bypassing service role).
 */
export async function applyRulesToTransactions(
  client: SupabaseClientT,
  userId: string,
  rules: readonly MerchantRule[],
): Promise<number> {
  if (rules.length === 0) return 0;

  const [{ data: txns }, { data: userAssigns }] = await Promise.all([
    client
      .from("transactions")
      .select("dedup_key, merchant")
      .eq("user_id", userId)
      .is("superseded_by", null)
      .is("removed_at", null)
      .not("merchant", "is", null),
    client.from("transaction_categories").select("dedup_key").eq("user_id", userId).eq("assigned_by", "user"),
  ]);
  const userOwned = new Set((userAssigns ?? []).map((a) => (a as { dedup_key: string }).dedup_key));

  // Pure matching (which transactions get a 'rule' assignment, user-wins) lives
  // in @wealth/core; map the matches to upsert rows here.
  const matched = matchRuleAssignments(
    ((txns ?? []) as { dedup_key: string; merchant: string | null }[]).map((t) => ({
      dedupKey: t.dedup_key,
      merchant: t.merchant,
    })),
    userOwned,
    rules,
  );
  if (matched.length === 0) return 0;
  const toWrite = matched.map((m) => ({
    user_id: userId,
    dedup_key: m.dedupKey,
    category_id: m.categoryId,
    assigned_by: "rule" as const,
    rule_id: m.ruleId,
  }));
  // onConflict UPDATE (not ignore) → a new rule overwrites a stale 'rule' row;
  // 'user' rows were already excluded above, so they're never touched.
  const { error } = await client
    .from("transaction_categories")
    .upsert(toWrite, { onConflict: "user_id,dedup_key" });
  if (error) throw new Error(`[apply-rules] insert failed for ${userId}: ${error.message}`);
  return toWrite.length;
}

/** Read the user's rules and apply them all — the sync-time entry point. */
export async function applyAllRulesForUser(client: SupabaseClientT, userId: string): Promise<number> {
  return applyRulesToTransactions(client, userId, await readRules(client, userId));
}
