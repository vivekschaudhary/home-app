// WLT-25-1 — Follow-up flags under the user's RLS session. The flag is a per-charge
// overlay orthogonal to category AND subscription — this path never touches the
// category resolver or the subscription/budget surfaces (the orthogonality invariant,
// guarded). Mirrors app/lib/subscriptions.ts (mark/resolve + a funnel emit once).

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { markFollowup, resolveFollowup } from "@wealth/db/followups";
import { emitFunnel } from "@wealth/db/emit";

export type FollowupWriteResult = { ok: true } | { ok: false; error: "invalid" | "save_failed" };

/** Flag a charge "follow up" (per-transaction). Idempotent; re-opens a resolved one. */
export async function flagFollowup(userId: string, dedupKey: string): Promise<FollowupWriteResult> {
  if (!dedupKey || typeof dedupKey !== "string") return { ok: false, error: "invalid" };
  const supabase = await createServerSupabase();
  try {
    await markFollowup(supabase, userId, dedupKey);
  } catch {
    return { ok: false, error: "save_failed" };
  }
  await emitFunnel(FUNNEL_EVENTS.TRANSACTION_FOLLOWUP_FLAGGED, userId, {});
  return { ok: true };
}

/** Resolve a follow-up ("Done") — a durable soft-delete (kept as history). */
export async function resolveFollowupFlag(userId: string, dedupKey: string): Promise<FollowupWriteResult> {
  if (!dedupKey || typeof dedupKey !== "string") return { ok: false, error: "invalid" };
  const supabase = await createServerSupabase();
  try {
    await resolveFollowup(supabase, userId, dedupKey);
  } catch {
    return { ok: false, error: "save_failed" };
  }
  await emitFunnel(FUNNEL_EVENTS.TRANSACTION_FOLLOWUP_RESOLVED, userId, {});
  return { ok: true };
}
