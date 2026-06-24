import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { readAllPaged } from "./paged";

// WLT-25-1 — Follow-up flags: the SECOND overlay on `transaction_flags`
// (`flag_type='followup'`). A follow-up is PER-CHARGE (about this one transaction —
// a dispute, an unrecognized charge), NOT per-merchant like a subscription: mark /
// resolve operate on a single `dedup_key`, no fan-out. Resolve is a SOFT-delete
// (`dismissed_at` set ⇒ done, null ⇒ open) so a resolved follow-up is kept as
// history; re-flagging re-opens it. Owner-scoped (RLS); never touches the category
// or subscription axes (orthogonality — guarded).

type SupabaseClientT = ReturnType<typeof createServiceSupabase>;

export type FollowupStatus = "open" | "done";

/** Each flagged charge's follow-up state: `dedup_key` → 'open' (`dismissed_at is
 * null`) or 'done' (resolved). One paginated read covers both the per-row indicator
 * AND the Open/Done filter (WLT-25-2). */
export async function readFollowupStatuses(client: SupabaseClientT, userId: string): Promise<Map<string, FollowupStatus>> {
  const rows = await readAllPaged<{ dedup_key: string; dismissed_at: string | null }>(
    (from, to) =>
      client
        .from("transaction_flags")
        .select("dedup_key, dismissed_at")
        .eq("user_id", userId)
        .eq("flag_type", "followup")
        .order("dedup_key", { ascending: true })
        .range(from, to),
    "followup-statuses",
  );
  return new Map(rows.map((r) => [r.dedup_key, r.dismissed_at == null ? "open" : "done"]));
}

/** Flag ONE charge "follow up" (per `dedup_key`). The upsert clears `dismissed_at`,
 * so re-flagging a resolved charge RE-OPENS it. `source='user'` (manual only). */
export async function markFollowup(client: SupabaseClientT, userId: string, dedupKey: string): Promise<void> {
  const { error } = await client
    .from("transaction_flags")
    .upsert(
      { user_id: userId, dedup_key: dedupKey, flag_type: "followup", source: "user" as const, dismissed_at: null },
      { onConflict: "user_id,dedup_key,flag_type" },
    );
  if (error) throw new Error(`[followups] flag failed for ${userId}: ${error.message}`);
}

/** Resolve ONE follow-up ("Done") — a SOFT-delete (`dismissed_at = now()`), kept as
 * history (the Open/Done view is WLT-25-2). Only stamps a currently-open flag. */
export async function resolveFollowup(client: SupabaseClientT, userId: string, dedupKey: string): Promise<void> {
  const { error } = await client
    .from("transaction_flags")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("dedup_key", dedupKey)
    .eq("flag_type", "followup")
    .is("dismissed_at", null);
  if (error) throw new Error(`[followups] resolve failed for ${userId}: ${error.message}`);
}
