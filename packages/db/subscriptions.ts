import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { type MarkedTxn, clusterByPrice, detectSubscriptions, normalizeMerchant, subscriptionMerchantKey } from "@wealth/core";
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

/** WLT-24-3 — DISMISS (soft-delete) EXACTLY these flags — one price series, not the
 * whole merchant. The Subscriptions view passes a cluster's `dedupKeys`, so removing
 * one of a vendor's subscriptions (Sony $13.99) leaves the others (Sony $45). A
 * SOFT-delete (`dismissed_at = now()`) makes removal DURABLE: the detector skips a
 * dismissed series and never re-adds it; a later explicit re-mark clears it (see
 * writeFlags). Filters `dismissed_at is null` so it only stamps active flags. */
export async function dismissSubscriptionFlags(client: SupabaseClientT, userId: string, dedupKeys: readonly string[]): Promise<number> {
  if (dedupKeys.length === 0) return 0;
  const dismissedAt = new Date().toISOString();
  // Small UPDATE chunks: the `dedup_key` IN-list rides in the request URL, so a
  // large chunk of long keys would overflow the URL limit (FIX-2026-06-22).
  for (let i = 0; i < dedupKeys.length; i += 50) {
    const { error } = await client
      .from("transaction_flags")
      .update({ dismissed_at: dismissedAt })
      .eq("user_id", userId)
      .eq("flag_type", "subscription")
      .is("dismissed_at", null)
      .in("dedup_key", dedupKeys.slice(i, i + 50));
    if (error) throw new Error(`[subscriptions] dismiss failed for ${userId}: ${error.message}`);
  }
  return dedupKeys.length;
}

/** WLT-24-3 — dismiss the price SERIES that `dedupKey` belongs to (resolved server-side
 * by clustering the merchant's charges), for the LEDGER toggle which has only one key.
 * So un-starring a $13.99 Sony charge removes that subscription but NOT a sibling $45
 * Sony series. Unmatchable merchant → just that charge. */
export async function dismissSubscriptionSeriesForCharge(client: SupabaseClientT, userId: string, dedupKey: string): Promise<number> {
  const debits = await readActiveDebits(client, userId);
  const composite = compositeKeyByDedup(debitsToMarkedTxns(debits));
  const target = composite.get(dedupKey);
  const seriesKeys = target
    ? debits.filter((d) => composite.get(d.dedup_key) === target).map((d) => d.dedup_key)
    : [dedupKey];
  return dismissSubscriptionFlags(client, userId, seriesKeys);
}

/** Map active charges → MarkedTxn (unsigned amount), the shape the pure core wants. */
function debitsToMarkedTxns(debits: readonly TxnMerchant[]): MarkedTxn[] {
  return debits.map((t) => ({
    dedupKey: t.dedup_key,
    merchant: t.merchant,
    merchantEntityId: t.merchant_entity_id,
    description: t.description,
    amount: Math.abs(Number(t.amount)),
    occurredOn: t.occurred_on,
  }));
}

/** WLT-24-3 — map each active charge → its (merchant, price-cluster) COMPOSITE key.
 * Subscription identity is per price SERIES, not per merchant: cluster each merchant's
 * charges by price (`clusterByPrice`) and stamp every charge `${merchantKey}|${clusterId}`.
 * Re-derived from amounts each run — never persisted. Used by both the detector
 * skip-sets and the sync re-apply so a dismissed series never revives via its sibling. */
function compositeKeyByDedup(txns: readonly MarkedTxn[]): Map<string, string> {
  const byMerchant = new Map<string, MarkedTxn[]>();
  for (const t of txns) {
    const mk = subscriptionMerchantKey(t.merchant, t.merchantEntityId);
    if (!mk) continue;
    const g = byMerchant.get(mk);
    if (g) g.push(t);
    else byMerchant.set(mk, [t]);
  }
  const map = new Map<string, string>();
  for (const [mk, members] of byMerchant) {
    for (const [clusterId, clusterMembers] of clusterByPrice(members)) {
      const composite = `${mk}|${clusterId}`;
      for (const m of clusterMembers) map.set(m.dedupKey, composite);
    }
  }
  return map;
}

/** Sync-time re-apply: flag any NEW charge whose (merchant, price-series) the user has
 * already marked (so a fresh Netflix charge auto-joins). WLT-24-3 makes this
 * CLUSTER-AWARE: it re-applies per price series and NEVER revives a dismissed series —
 * otherwise a dismissed Sony $13.99 would silently come back because the Sony $45
 * series keeps the merchant "marked" (the cross-cluster revive hole). */
export async function applySubscriptionMerchantsForUser(client: SupabaseClientT, userId: string): Promise<number> {
  const flagRows = await readAllSubscriptionFlagRows(client, userId);
  if (flagRows.length === 0) return 0;
  const debits = await readActiveDebits(client, userId);
  const compositeByDedup = compositeKeyByDedup(debitsToMarkedTxns(debits));

  const activeFlagged = new Set<string>(); // dedup_keys with an ACTIVE flag
  const markedComposites = new Set<string>(); // series the user marked (active)
  const dismissedComposites = new Set<string>(); // series dismissed — never revive
  for (const row of flagRows) {
    const composite = compositeByDedup.get(row.dedup_key);
    if (row.dismissed_at) {
      if (composite) dismissedComposites.add(composite);
    } else {
      activeFlagged.add(row.dedup_key);
      if (composite) markedComposites.add(composite);
    }
  }
  if (markedComposites.size === 0) return 0;
  const toFlag = debits
    .filter((t) => !activeFlagged.has(t.dedup_key))
    .filter((t) => {
      const composite = compositeByDedup.get(t.dedup_key);
      return composite != null && markedComposites.has(composite) && !dismissedComposites.has(composite);
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

  const txns = debitsToMarkedTxns(debits);
  // WLT-24-3 — skip-sets are keyed by the (merchant, price-cluster) COMPOSITE, not the
  // merchant, so dismissing one of a vendor's subscriptions doesn't skip the other.
  const compositeByDedup = compositeKeyByDedup(txns);

  const flaggedKeys = new Set<string>(); // series (composite) with an ACTIVE flag (user or auto)
  const dismissedKeys = new Set<string>(); // series the user dismissed — never re-add
  for (const row of await readAllSubscriptionFlagRows(client, userId)) {
    const composite = compositeByDedup.get(row.dedup_key);
    if (!composite) continue;
    if (row.dismissed_at) dismissedKeys.add(composite);
    else flaggedKeys.add(composite);
  }

  const toFlag: string[] = [];
  let newSeries = 0;
  for (const c of detectSubscriptions({ txns })) {
    if (flaggedKeys.has(c.compositeKey) || dismissedKeys.has(c.compositeKey)) continue;
    toFlag.push(...c.dedupKeys);
    newSeries += 1;
  }
  if (toFlag.length === 0) return 0;
  await writeFlags(client, userId, toFlag, "auto");
  return newSeries;
}
