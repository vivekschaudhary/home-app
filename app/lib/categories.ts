// WLT-22-2 — the user's OWN categories + the SAVED per-transaction assignment.
// Owner-scoped (RLS session). Plaid's `transactions.category` is never written;
// what the user sets lives in `categories` + `transaction_categories` (keyed by
// the stable `dedup_key`). Reads resolve `saved ?? Plaid` via the shared helper
// in @wealth/db/categories — this file is the WRITE + management side.

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS, isEssentialCategory, normalizeMerchant } from "@wealth/core";
import { applyRulesToTransactions } from "@wealth/db/categories";
import { emitFunnel } from "@wealth/db/emit";

type Supa = Awaited<ReturnType<typeof createServerSupabase>>;

export type CategoryKind = "essential" | "discretionary";
export interface UserCategory {
  id: string;
  name: string;
  kind: CategoryKind;
  source: "seed" | "custom";
}

export type CategoryWriteError = "invalid" | "duplicate" | "save_failed";

/**
 * Pure: the category rows to seed for a user — the DISTINCT provider categories
 * present in their transactions that they don't already have (case-insensitive).
 * `kind` from the built-in essential allow-list; `source: 'seed'`. Extracted for
 * unit testing the cold-start seeding without a DB.
 */
export function categoriesToSeed(
  presentCategories: readonly (string | null)[],
  existingNames: readonly string[],
): { user_id?: string; name: string; kind: CategoryKind; source: "seed" }[] {
  const distinct = [...new Set(presentCategories.filter((c): c is string => !!c))];
  const have = new Set(existingNames.map((n) => n.toLowerCase()));
  return distinct
    .filter((name) => !have.has(name.toLowerCase()))
    .map((name) => ({ name, kind: isEssentialCategory(name) ? "essential" : "discretionary", source: "seed" }));
}

/**
 * Idempotently seed the user's `categories` from the DISTINCT provider categories
 * present in their transactions (the cold-start on-ramp, so the picker isn't
 * empty + WLT-21 string-keyed budgets map 1:1). `kind` from the built-in
 * essential allow-list; `source: 'seed'`. Read-diff-insert (no upsert) so it
 * never collides with the `(user_id, lower(name))` functional unique index;
 * re-running inserts nothing new.
 */
export async function ensureSeededCategories(userId: string, supabase: Supa): Promise<void> {
  const [{ data: txnCats }, { data: existing }] = await Promise.all([
    supabase.from("transactions").select("category").eq("user_id", userId).not("category", "is", null),
    supabase.from("categories").select("name").eq("user_id", userId),
  ]);
  const present = (txnCats ?? []).map((r) => (r as { category: string | null }).category);
  const existingNames = (existing ?? []).map((r) => (r as { name: string }).name);
  const toInsert = categoriesToSeed(present, existingNames).map((row) => ({ ...row, user_id: userId }));
  if (toInsert.length === 0) return;
  // A concurrent seed could race; the unique index protects integrity, so a
  // duplicate error here is benign (the rows exist either way).
  await supabase.from("categories").insert(toInsert);
}

/** The user's category set (seeding first so a fresh user has their provider categories). */
export async function readCategories(userId: string): Promise<UserCategory[]> {
  const supabase = await createServerSupabase();
  await ensureSeededCategories(userId, supabase);
  const { data } = await supabase
    .from("categories")
    .select("id, name, kind, source")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  return (data ?? []).map((r) => {
    const row = r as { id: string; name: string; kind: CategoryKind; source: "seed" | "custom" };
    return { id: row.id, name: row.name, kind: row.kind, source: row.source };
  });
}

/** `name → kind` for the user's categories — feeds the recommendation predicate (AC9). */
export async function readCategoryKinds(userId: string, supabase: Supa): Promise<Map<string, CategoryKind>> {
  const { data } = await supabase.from("categories").select("name, kind").eq("user_id", userId);
  const out = new Map<string, CategoryKind>();
  for (const r of data ?? []) {
    const row = r as { name: string; kind: CategoryKind };
    out.set(row.name, row.kind);
  }
  return out;
}

/**
 * Create a custom category (so the user can split a coarse group). Rejects an
 * empty name + a case-insensitive duplicate of an existing category.
 */
export async function createCategory(
  userId: string,
  name: string,
  kind: CategoryKind,
): Promise<{ ok: true; category: UserCategory } | { ok: false; error: CategoryWriteError }> {
  const trimmed = (name ?? "").trim();
  if (!trimmed || (kind !== "essential" && kind !== "discretionary")) return { ok: false, error: "invalid" };
  const supabase = await createServerSupabase();

  const { data: existing } = await supabase.from("categories").select("name").eq("user_id", userId);
  const clash = (existing ?? []).some((r) => (r as { name: string }).name.toLowerCase() === trimmed.toLowerCase());
  if (clash) return { ok: false, error: "duplicate" };

  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: trimmed, kind, source: "custom" })
    .select("id, name, kind, source")
    .single();
  if (error || !data) {
    // The unique index can still fire on a race → surface as a duplicate, not a 500.
    return { ok: false, error: error?.code === "23505" ? "duplicate" : "save_failed" };
  }
  await emitFunnel(FUNNEL_EVENTS.CATEGORY_CREATED, userId, {});
  const row = data as { id: string; name: string; kind: CategoryKind; source: "seed" | "custom" };
  return { ok: true, category: { id: row.id, name: row.name, kind: row.kind, source: row.source } };
}

/**
 * Save the user's category for ONE transaction (the per-transaction override).
 * Upsert on `(user_id, dedup_key)` — re-categorizing replaces it. `assigned_by:
 * 'user'` is authoritative (a future rule never clobbers it). The composite FK
 * guarantees `categoryId` belongs to this user.
 */
export async function recategorizeTransaction(
  userId: string,
  dedupKey: string,
  categoryId: string,
  applyToMerchant = false,
): Promise<{ ok: true; count: number } | { ok: false; error: "invalid" | "save_failed" }> {
  if (!dedupKey || !categoryId) return { ok: false, error: "invalid" };
  const supabase = await createServerSupabase();

  // WLT-22-3 — "remember the merchant": create a rule + backfill ALL the user's
  // matching transactions as 'rule' (incl. this one, since it has no 'user'
  // override). Returns how many were written. A merchant is required to match on.
  if (applyToMerchant) {
    const { data: tx } = await supabase
      .from("transactions")
      .select("merchant")
      .eq("user_id", userId)
      .eq("dedup_key", dedupKey)
      .is("superseded_by", null)
      .limit(1)
      .maybeSingle();
    const merchant = (tx as { merchant: string | null } | null)?.merchant ?? null;
    if (merchant) {
      const merchantNorm = normalizeMerchant(merchant);
      const { data: rule, error: rErr } = await supabase
        .from("category_rules")
        .upsert({ user_id: userId, merchant_norm: merchantNorm, category_id: categoryId }, { onConflict: "user_id,merchant_norm" })
        .select("id")
        .single();
      if (rErr || !rule) return { ok: false, error: "save_failed" }; // incl. a forged cross-tenant categoryId (FK)
      const ruleId = (rule as { id: string }).id;
      const count = await applyRulesToTransactions(supabase, userId, [{ merchantNorm, categoryId, ruleId }]);
      await emitFunnel(FUNNEL_EVENTS.CATEGORY_RULE_CREATED, userId, {});
      return { ok: true, count };
    }
    // merchant null → no rule possible; fall through to a single override.
  }

  // The single per-transaction override (WLT-22-2 path).
  const { error } = await supabase.from("transaction_categories").upsert(
    { user_id: userId, dedup_key: dedupKey, category_id: categoryId, assigned_by: "user", rule_id: null },
    { onConflict: "user_id,dedup_key" },
  );
  if (error) return { ok: false, error: "save_failed" }; // incl. a forged cross-tenant categoryId (FK violation)
  await emitFunnel(FUNNEL_EVENTS.TRANSACTION_RECATEGORIZED, userId, {});
  return { ok: true, count: 1 };
}
