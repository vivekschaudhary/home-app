import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { matchRuleAssignments } from "@wealth/core";
import { readAllPaged } from "./paged";

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
  // `categories` is bounded (a handful per user) — one read. `transaction_categories`
  // is one row per recategorized transaction and can exceed 1000 for a heavy user;
  // page it (FIX-2026-06-20b) or the resolver map truncates and every surface
  // (budget, recap, anomaly, drill) silently falls back to Plaid's category for the
  // dropped rows.
  const [cats, assigns] = await Promise.all([
    client.from("categories").select("id, name").eq("user_id", userId),
    readAllPaged<{ dedup_key: string; category_id: string }>(
      (from, to) =>
        client
          .from("transaction_categories")
          .select("dedup_key, category_id")
          .eq("user_id", userId)
          .order("dedup_key", { ascending: true })
          .range(from, to),
      "category-assignments",
    ),
  ]);
  const idToName = new Map<string, string>();
  for (const c of (cats.data ?? []) as { id: string; name: string }[]) idToName.set(c.id, c.name);

  const out = new Map<string, string>();
  for (const a of assigns) {
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
  merchantEntityId?: string | null; // WLT-22-4 — Plaid's stable merchant id (primary match key)
  updatedAt?: string; // INC-2026-06-19 — newest wins on a key collision
}

/** The user's merchant rules (for the sync-time apply). */
export async function readRules(client: SupabaseClientT, userId: string): Promise<MerchantRule[]> {
  const { data } = await client
    .from("category_rules")
    .select("id, merchant_norm, merchant_entity_id, category_id, updated_at")
    .eq("user_id", userId);
  return (data ?? []).map((r) => {
    const row = r as {
      id: string;
      merchant_norm: string;
      merchant_entity_id: string | null;
      category_id: string;
      updated_at: string;
    };
    return {
      merchantNorm: row.merchant_norm,
      categoryId: row.category_id,
      ruleId: row.id,
      merchantEntityId: row.merchant_entity_id,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Apply the given merchant rules to the user's transactions — write `'rule'`
 * assignments for every active transaction whose normalized merchant matches a
 * rule. By default a `'user'` override wins (the row is skipped), so AUTOMATIC
 * re-application (sync) never clobbers a deliberate manual choice. Pass
 * `overrideUserAssignments: true` for an EXPLICIT "always categorize this
 * merchant" action — it re-assigns ALL matching rows, including the user's own
 * prior per-transaction choices for that merchant (FIX-2026-06-20). Idempotent;
 * returns the number written. Works under either client (RLS app session or the
 * service-role sync job) — always scoped by `user_id`, filters superseded/removed.
 */
export async function applyRulesToTransactions(
  client: SupabaseClientT,
  userId: string,
  rules: readonly MerchantRule[],
  opts: { overrideUserAssignments?: boolean } = {},
): Promise<number> {
  if (rules.length === 0) return 0;

  // Read ALL matchable transactions, paginating past PostgREST's 1000-row response
  // cap (FIX-2026-06-20b). A single uncapped read returns only ~1000 rows, so a
  // rule silently skipped a >1000-transaction user's older rows — e.g. 2025 "Flc
  // Dining" rows beyond the cap never got the rule while 2026 ones did.
  const txns = await readAllPaged<{ dedup_key: string; merchant: string | null; merchant_entity_id: string | null }>(
    (from, to) =>
      client
        .from("transactions")
        .select("dedup_key, merchant, merchant_entity_id")
        .eq("user_id", userId)
        .is("superseded_by", null)
        .is("removed_at", null)
        // WLT-22-4 — matchable if it has a merchant NAME or a Plaid entity id.
        .or("merchant.not.is.null,merchant_entity_id.not.is.null")
        .order("dedup_key", { ascending: true })
        .range(from, to),
    "apply-rules",
  );
  // The user's explicit per-transaction overrides (also paged). Skipped on an
  // explicit "always categorize this merchant", which deliberately overrides them.
  const userOwned = new Set<string>(
    opts.overrideUserAssignments
      ? []
      : (
          await readAllPaged<{ dedup_key: string }>((from, to) =>
            client
              .from("transaction_categories")
              .select("dedup_key")
              .eq("user_id", userId)
              .eq("assigned_by", "user")
              .order("dedup_key", { ascending: true })
              .range(from, to),
            "apply-rules",
          )
        ).map((a) => a.dedup_key),
  );

  // Pure matching (which transactions get a 'rule' assignment, user-wins) lives in
  // @wealth/core; map the matches to upsert rows here.
  const matched = matchRuleAssignments(
    txns.map((t) => ({ dedupKey: t.dedup_key, merchant: t.merchant, merchantEntityId: t.merchant_entity_id })),
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
  // Upsert in chunks so a high-frequency merchant over a long history doesn't blow
  // a single request. onConflict UPDATE → a new rule overwrites a stale 'rule' row.
  for (let i = 0; i < toWrite.length; i += 500) {
    const { error } = await client
      .from("transaction_categories")
      .upsert(toWrite.slice(i, i + 500), { onConflict: "user_id,dedup_key" });
    if (error) throw new Error(`[apply-rules] insert failed for ${userId}: ${error.message}`);
  }
  return toWrite.length;
}

/** Read the user's rules and apply them all — the sync-time entry point. */
export async function applyAllRulesForUser(client: SupabaseClientT, userId: string): Promise<number> {
  return applyRulesToTransactions(client, userId, await readRules(client, userId));
}
