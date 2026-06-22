// WLT-24-1 — Subscriptions reads + writes, under the user's RLS session. The
// cadence/total COMPUTE is pure in @wealth/core (subscriptions.ts); this file
// reads the marked transactions (owner-scoped) + writes the mark/unmark flag.
// A subscription flag is an OVERLAY orthogonal to category — this path never
// touches the category resolver or the budget surfaces (the AC5 invariant).

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS, type MarkedTxn, type SubscriptionsSummary, summarizeSubscriptions } from "@wealth/core";
import { markMerchantSubscription, readSubscriptionFlags, unmarkMerchantSubscription } from "@wealth/db/subscriptions";
import { emitFunnel } from "@wealth/db/emit";
import { readAllPaged } from "@wealth/db/paged";

export type SubscriptionWriteResult = { ok: true } | { ok: false; error: "invalid" | "save_failed" };

/**
 * The Subscriptions view model: the user's marked recurring charges, grouped +
 * summarized. Reads the subscription flags (paginated) then the ACTIVE
 * transactions behind them (debits, superseded/removed hidden), and hands them to
 * the pure `summarizeSubscriptions`. Per the architecture, the summary groups the
 * FLAGGED transactions — a single mark is `pending` until a second confirms the
 * cadence; the detection fast-follow auto-marks recurring siblings.
 */
export async function readSubscriptionsView(userId: string): Promise<SubscriptionsSummary> {
  const supabase = await createServerSupabase();
  const flagged = await readSubscriptionFlags(supabase, userId);
  if (flagged.size === 0) return { subscriptions: [], monthlyTotal: 0, annualTotal: 0 };

  // Read the user's ACTIVE debit transactions (paged past the 1000-row cap) and
  // keep the flagged ones — NOT an `IN(dedup_keys)`, whose query string overflows
  // the request-URL limit once enough charges are marked (FIX-2026-06-22: the
  // empty-panel bug — the IN read errored silently while the flags persisted).
  // `readAllPaged` throws on a real error rather than masquerading as "no subs".
  const rows = await readAllPaged<{
    dedup_key: string;
    merchant: string | null;
    description: string;
    amount: number | string;
    occurred_on: string;
  }>(
    (from, to) =>
      supabase
        .from("transactions")
        .select("dedup_key, merchant, description, amount, occurred_on")
        .eq("user_id", userId)
        .eq("direction", "debit")
        .is("superseded_by", null)
        .is("removed_at", null)
        .order("dedup_key", { ascending: true })
        .range(from, to),
    "subscriptions-view",
  );
  const marked: MarkedTxn[] = rows
    .filter((r) => flagged.has(r.dedup_key))
    .map((r) => ({
      dedupKey: r.dedup_key,
      merchant: r.merchant,
      description: r.description,
      amount: Math.abs(Number(r.amount)),
      occurredOn: r.occurred_on,
    }));
  return summarizeSubscriptions(marked);
}

/** Mark a charge as a subscription — and with it the whole MERCHANT (every active
 * charge from it), so one mark flags all of Netflix + totals from full history.
 * Idempotent; emits once per action. */
export async function markSubscription(userId: string, dedupKey: string): Promise<SubscriptionWriteResult> {
  if (!dedupKey || typeof dedupKey !== "string") return { ok: false, error: "invalid" };
  const supabase = await createServerSupabase();
  try {
    await markMerchantSubscription(supabase, userId, dedupKey);
  } catch {
    return { ok: false, error: "save_failed" };
  }
  await emitFunnel(FUNNEL_EVENTS.SUBSCRIPTION_MARKED, userId, { action: "mark" });
  return { ok: true };
}

/** Remove the subscription mark from the charge's whole merchant — HARD delete. */
export async function unmarkSubscription(userId: string, dedupKey: string): Promise<SubscriptionWriteResult> {
  if (!dedupKey || typeof dedupKey !== "string") return { ok: false, error: "invalid" };
  const supabase = await createServerSupabase();
  try {
    await unmarkMerchantSubscription(supabase, userId, dedupKey);
  } catch {
    return { ok: false, error: "save_failed" };
  }
  await emitFunnel(FUNNEL_EVENTS.SUBSCRIPTION_MARKED, userId, { action: "unmark" });
  return { ok: true };
}

// Re-export the helper `getSubscriptionFlagSet` for the ledger read (per-row
// indicator) so callers import from one place.
export { readSubscriptionFlags } from "@wealth/db/subscriptions";
