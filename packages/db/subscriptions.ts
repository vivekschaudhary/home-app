import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { normalizeMerchant, subscriptionMerchantKey } from "@wealth/core";
import { readAllPaged } from "./paged";

// WLT-24-1 — the shared read of a user's subscription flags (the dedup_keys they
// marked as a subscription). Used by the Subscriptions view AND by the ledger
// read (to show the per-row "subscription" indicator) — one source of truth,
// mirroring the shared category-assignment reader. Works under either client (RLS
// app session or service role). Paginated past the 1000-row cap (mark many).

type SupabaseClientT = ReturnType<typeof createServiceSupabase>;

/** The set of `dedup_key`s the user has flagged as a subscription. */
export async function readSubscriptionFlags(client: SupabaseClientT, userId: string): Promise<Set<string>> {
  const rows = await readAllPaged<{ dedup_key: string }>(
    (from, to) =>
      client
        .from("transaction_flags")
        .select("dedup_key")
        .eq("user_id", userId)
        .eq("flag_type", "subscription")
        .order("dedup_key", { ascending: true })
        .range(from, to),
    "subscription-flags",
  );
  return new Set(rows.map((r) => r.dedup_key));
}

type TxnMerchant = { dedup_key: string; merchant: string | null; merchant_entity_id: string | null };

/** A page of the user's ACTIVE debit transactions (the subscription candidates). */
function readActiveDebits(client: SupabaseClientT, userId: string) {
  return readAllPaged<TxnMerchant>(
    (from, to) =>
      client
        .from("transactions")
        .select("dedup_key, merchant, merchant_entity_id")
        .eq("user_id", userId)
        .eq("direction", "debit")
        .is("superseded_by", null)
        .is("removed_at", null)
        .order("dedup_key", { ascending: true })
        .range(from, to),
    "subscription-candidates",
  );
}

/** Every ACTIVE charge from the same MERCHANT as `dedupKey` (entity-id first, else
 * normalized name) — the set a mark/unmark applies to. Falls back to just the one
 * charge when the merchant is unidentifiable. */
async function merchantCharges(client: SupabaseClientT, userId: string, dedupKey: string): Promise<string[]> {
  const { data: src } = await client
    .from("transactions")
    .select("merchant, merchant_entity_id")
    .eq("user_id", userId)
    .eq("dedup_key", dedupKey)
    .is("superseded_by", null)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();
  const row = src as { merchant: string | null; merchant_entity_id: string | null } | null;
  const key = row ? subscriptionMerchantKey(row.merchant, row.merchant_entity_id) : null;
  if (!key) return [dedupKey]; // unmatchable merchant → mark just this charge

  // Entity-id key → an exact, indexed SQL match; name key → JS-normalize a paged read.
  if (key.startsWith("e:")) {
    const id = key.slice(2);
    const rows = await readAllPaged<{ dedup_key: string }>(
      (from, to) =>
        client
          .from("transactions")
          .select("dedup_key")
          .eq("user_id", userId)
          .eq("merchant_entity_id", id)
          .eq("direction", "debit")
          .is("superseded_by", null)
          .is("removed_at", null)
          .order("dedup_key", { ascending: true })
          .range(from, to),
      "subscription-merchant-entity",
    );
    const keys = rows.map((r) => r.dedup_key);
    return keys.length ? keys : [dedupKey];
  }
  const norm = key.slice(2);
  const keys = (await readActiveDebits(client, userId))
    .filter((t) => normalizeMerchant(t.merchant) === norm)
    .map((t) => t.dedup_key);
  return keys.length ? keys : [dedupKey];
}

async function writeFlags(client: SupabaseClientT, userId: string, dedupKeys: readonly string[]): Promise<number> {
  if (dedupKeys.length === 0) return 0;
  const rows = dedupKeys.map((dedup_key) => ({ user_id: userId, dedup_key, flag_type: "subscription", source: "user" as const }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client
      .from("transaction_flags")
      .upsert(rows.slice(i, i + 500), { onConflict: "user_id,dedup_key,flag_type", ignoreDuplicates: true });
    if (error) throw new Error(`[subscriptions] mark failed for ${userId}: ${error.message}`);
  }
  return rows.length;
}

/** WLT-24-1 (mark-the-merchant) — mark EVERY active charge from `dedupKey`'s
 * merchant as a subscription. So one mark flags all of Netflix + gives a monthly
 * total from the full history. Idempotent (ignoreDuplicates). */
export async function markMerchantSubscription(client: SupabaseClientT, userId: string, dedupKey: string): Promise<number> {
  return writeFlags(client, userId, await merchantCharges(client, userId, dedupKey));
}

/** Unmark every active charge from `dedupKey`'s merchant (hard-delete the flags). */
export async function unmarkMerchantSubscription(client: SupabaseClientT, userId: string, dedupKey: string): Promise<number> {
  const keys = await merchantCharges(client, userId, dedupKey);
  // Small DELETE chunks: the `dedup_key` IN-list rides in the request URL, so a
  // large chunk of long keys would overflow the URL limit (FIX-2026-06-22).
  for (let i = 0; i < keys.length; i += 50) {
    const { error } = await client
      .from("transaction_flags")
      .delete()
      .eq("user_id", userId)
      .eq("flag_type", "subscription")
      .in("dedup_key", keys.slice(i, i + 50));
    if (error) throw new Error(`[subscriptions] unmark failed for ${userId}: ${error.message}`);
  }
  return keys.length;
}

/** Sync-time re-apply: flag any NEW charge whose merchant the user has already
 * marked as a subscription (so a fresh Netflix charge auto-joins). Mirrors the
 * WLT-22-3 rule re-apply, keyed on the subscription merchant key. */
export async function applySubscriptionMerchantsForUser(client: SupabaseClientT, userId: string): Promise<number> {
  const flagged = await readSubscriptionFlags(client, userId);
  if (flagged.size === 0) return 0;
  const candidates = await readActiveDebits(client, userId);
  // The merchant keys the user has marked (derived from the already-flagged charges).
  const markedKeys = new Set<string>();
  for (const t of candidates) {
    if (flagged.has(t.dedup_key)) {
      const key = subscriptionMerchantKey(t.merchant, t.merchant_entity_id);
      if (key) markedKeys.add(key);
    }
  }
  if (markedKeys.size === 0) return 0;
  const toFlag = candidates
    .filter((t) => !flagged.has(t.dedup_key))
    .filter((t) => {
      const key = subscriptionMerchantKey(t.merchant, t.merchant_entity_id);
      return key != null && markedKeys.has(key);
    })
    .map((t) => t.dedup_key);
  return writeFlags(client, userId, toFlag);
}
