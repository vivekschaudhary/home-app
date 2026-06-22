import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { type MarkedTxn, detectSubscriptions, normalizeMerchant, subscriptionMerchantKey } from "@wealth/core";
import { readAllPaged } from "./paged";

// WLT-24-1 — the shared read of a user's subscription flags (the dedup_keys they
// marked as a subscription). Used by the Subscriptions view AND by the ledger
// read (to show the per-row "subscription" indicator) — one source of truth,
// mirroring the shared category-assignment reader. Works under either client (RLS
// app session or service role). Paginated past the 1000-row cap (mark many).

type SupabaseClientT = ReturnType<typeof createServiceSupabase>;

/** The set of `dedup_key`s the user has flagged as an ACTIVE subscription.
 * Filters `dismissed_at is null` (WLT-24-2) — a dismissed flag is retained (so the
 * detector never re-adds it) but is NOT an active subscription, so it drops out of
 * both the panel and the ledger ★ (this is the single source for both). The filter
 * lives here in the query, NOT in the RLS policy (the WLT-21 soft-delete lesson). */
export async function readSubscriptionFlags(client: SupabaseClientT, userId: string): Promise<Set<string>> {
  const rows = await readAllPaged<{ dedup_key: string }>(
    (from, to) =>
      client
        .from("transaction_flags")
        .select("dedup_key")
        .eq("user_id", userId)
        .eq("flag_type", "subscription")
        .is("dismissed_at", null)
        .order("dedup_key", { ascending: true })
        .range(from, to),
    "subscription-flags",
  );
  return new Set(rows.map((r) => r.dedup_key));
}

/** Like `readSubscriptionFlags` but keeps each ACTIVE flag's `source` ('user' or
 * 'auto') — the Subscriptions view needs it to tag auto-detected rows "detected"
 * (WLT-24-2 AC7). Dismissed flags are excluded (same as the set reader). */
export async function readSubscriptionFlagSources(
  client: SupabaseClientT,
  userId: string,
): Promise<Map<string, "user" | "auto">> {
  const rows = await readAllPaged<{ dedup_key: string; source: "user" | "auto" }>(
    (from, to) =>
      client
        .from("transaction_flags")
        .select("dedup_key, source")
        .eq("user_id", userId)
        .eq("flag_type", "subscription")
        .is("dismissed_at", null)
        .order("dedup_key", { ascending: true })
        .range(from, to),
    "subscription-flag-sources",
  );
  return new Map(rows.map((r) => [r.dedup_key, r.source]));
}

type TxnMerchant = {
  dedup_key: string;
  merchant: string | null;
  merchant_entity_id: string | null;
  description: string;
  amount: number | string;
  occurred_on: string;
};

/** A page of the user's ACTIVE debit transactions (the subscription candidates).
 * Carries amount + occurred_on + description so the WLT-24-2 detector can infer
 * cadence + amount stability; the WLT-24-1 merchant-match callers ignore the extra
 * columns. */
function readActiveDebits(client: SupabaseClientT, userId: string) {
  return readAllPaged<TxnMerchant>(
    (from, to) =>
      client
        .from("transactions")
        .select("dedup_key, merchant, merchant_entity_id, description, amount, occurred_on")
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

/**
 * Upsert subscription flags. `source='user'` is an explicit mark — it FORCES the
 * flag active (sets `source='user'`, clears any `dismissed_at`) on conflict, so a
 * re-mark revives a dismissed flag and a user mark promotes an auto one (a user
 * choice always wins). `source='auto'` is the detector's signal — it uses
 * `ignoreDuplicates`, so it NEVER clobbers an existing flag (user, auto, or
 * dismissed); the detector relies on the caller having already skipped
 * dismissed/flagged merchants. Both chunk the upsert (the 1000-row cap).
 */
async function writeFlags(
  client: SupabaseClientT,
  userId: string,
  dedupKeys: readonly string[],
  source: "user" | "auto" = "user",
): Promise<number> {
  if (dedupKeys.length === 0) return 0;
  const rows = dedupKeys.map((dedup_key) =>
    source === "user"
      ? { user_id: userId, dedup_key, flag_type: "subscription", source: "user" as const, dismissed_at: null }
      : { user_id: userId, dedup_key, flag_type: "subscription", source: "auto" as const },
  );
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await client
      .from("transaction_flags")
      .upsert(rows.slice(i, i + 500), { onConflict: "user_id,dedup_key,flag_type", ignoreDuplicates: source === "auto" });
    if (error) throw new Error(`[subscriptions] ${source} flag write failed for ${userId}: ${error.message}`);
  }
  return rows.length;
}

/** WLT-24-1 (mark-the-merchant) — mark EVERY active charge from `dedupKey`'s
 * merchant as a subscription. So one mark flags all of Netflix + gives a monthly
 * total from the full history. Idempotent (ignoreDuplicates). */
export async function markMerchantSubscription(client: SupabaseClientT, userId: string, dedupKey: string): Promise<number> {
  return writeFlags(client, userId, await merchantCharges(client, userId, dedupKey));
}

/** Unmark (DISMISS) every active charge from `dedupKey`'s merchant — WLT-24-2 makes
 * this a SOFT-delete (set `dismissed_at = now()`) instead of a hard-delete, so the
 * removal is DURABLE: the detector skips any merchant with a dismissed flag and
 * never re-adds it. A later explicit re-mark clears the dismissal (see writeFlags).
 * Filters `dismissed_at is null` so it only stamps currently-active flags. */
export async function unmarkMerchantSubscription(client: SupabaseClientT, userId: string, dedupKey: string): Promise<number> {
  const keys = await merchantCharges(client, userId, dedupKey);
  const dismissedAt = new Date().toISOString();
  // Small UPDATE chunks: the `dedup_key` IN-list rides in the request URL, so a
  // large chunk of long keys would overflow the URL limit (FIX-2026-06-22).
  for (let i = 0; i < keys.length; i += 50) {
    const { error } = await client
      .from("transaction_flags")
      .update({ dismissed_at: dismissedAt })
      .eq("user_id", userId)
      .eq("flag_type", "subscription")
      .is("dismissed_at", null)
      .in("dedup_key", keys.slice(i, i + 50));
    if (error) throw new Error(`[subscriptions] dismiss failed for ${userId}: ${error.message}`);
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

/** All of a user's subscription flag rows (INCLUDING dismissed) — the detector
 * needs the dismissed ones to know what NOT to re-add. Paginated. */
async function readAllSubscriptionFlagRows(
  client: SupabaseClientT,
  userId: string,
): Promise<{ dedup_key: string; dismissed_at: string | null }[]> {
  return readAllPaged<{ dedup_key: string; dismissed_at: string | null }>(
    (from, to) =>
      client
        .from("transaction_flags")
        .select("dedup_key, dismissed_at")
        .eq("user_id", userId)
        .eq("flag_type", "subscription")
        .order("dedup_key", { ascending: true })
        .range(from, to),
    "subscription-flag-rows",
  );
}

/**
 * WLT-24-2 — the custom subscription DETECTOR write path. Reads the user's active
 * debits, runs the pure `detectSubscriptions`, and auto-flags each detected
 * merchant's charges with `source='auto'` (a SIGNAL the user overrides). Mirrors
 * `autoAssignTransfers`: a paged read → a pure decision → a chunked idempotent
 * upsert. SKIPS any merchant that is already flagged (user OR auto) or DISMISSED —
 * so it never clobbers a user choice and never re-adds what the user removed
 * (precedence: user > auto > dismissed). Returns the number of NEW merchants
 * auto-flagged. A cheap no-op when there are no fresh candidates. Works under
 * either client (RLS app session or the service-role sync job).
 */
export async function detectAndFlagSubscriptionsForUser(client: SupabaseClientT, userId: string): Promise<number> {
  const debits = await readActiveDebits(client, userId);
  if (debits.length === 0) return 0;

  // Map each active charge → its merchant key, so we can bucket the flag rows by
  // merchant (the flag is per dedup_key; "dismissed/flagged" is per merchant).
  const keyByDedup = new Map<string, string>();
  for (const t of debits) {
    const key = subscriptionMerchantKey(t.merchant, t.merchant_entity_id);
    if (key) keyByDedup.set(t.dedup_key, key);
  }

  const flaggedKeys = new Set<string>(); // merchants with an ACTIVE flag (user or auto)
  const dismissedKeys = new Set<string>(); // merchants the user dismissed — never re-add
  for (const row of await readAllSubscriptionFlagRows(client, userId)) {
    const key = keyByDedup.get(row.dedup_key);
    if (!key) continue;
    if (row.dismissed_at) dismissedKeys.add(key);
    else flaggedKeys.add(key);
  }

  const txns: MarkedTxn[] = debits.map((t) => ({
    dedupKey: t.dedup_key,
    merchant: t.merchant,
    merchantEntityId: t.merchant_entity_id,
    description: t.description,
    amount: Math.abs(Number(t.amount)),
    occurredOn: t.occurred_on,
  }));

  const toFlag: string[] = [];
  let newMerchants = 0;
  for (const c of detectSubscriptions({ txns })) {
    if (flaggedKeys.has(c.merchantKey) || dismissedKeys.has(c.merchantKey)) continue;
    toFlag.push(...c.dedupKeys);
    newMerchants += 1;
  }
  if (toFlag.length === 0) return 0;
  await writeFlags(client, userId, toFlag, "auto");
  return newMerchants;
}
