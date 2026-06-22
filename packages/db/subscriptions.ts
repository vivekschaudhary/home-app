import { createServiceSupabase } from "@vc1023/passkey-2fa";
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
