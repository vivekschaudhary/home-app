// WLT-24-1 — Subscriptions reads + writes, under the user's RLS session. The
// cadence/total COMPUTE is pure in @wealth/core (subscriptions.ts); this file
// reads the marked transactions (owner-scoped) + writes the mark/unmark flag.
// A subscription flag is an OVERLAY orthogonal to category — this path never
// touches the category resolver or the budget surfaces (the AC5 invariant).

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS, type MarkedTxn, type SubscriptionsSummary, summarizeSubscriptions } from "@wealth/core";
import {
  detectAndFlagSubscriptionsForUser,
  dismissSubscriptionFlags,
  dismissSubscriptionSeriesForCharge,
  markMerchantSubscription,
  readSubscriptionFlagSources,
} from "@wealth/db/subscriptions";
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
/**
 * WLT-24-2 — run the custom subscription detector for the user (idempotent) and
 * emit `subscription_detected` when it auto-flags new merchants. Called at the top
 * of the Subscriptions page RSC so an already-connected user sees detections on
 * first visit, mirroring the WLT-22-5 auto-assign-on-read pattern. Best-effort:
 * detection never blocks the view (a failure logs nothing user-facing and returns 0,
 * since the sync step is the durable path). Returns the number of new merchants.
 */
export async function runSubscriptionDetection(userId: string): Promise<number> {
  const supabase = await createServerSupabase();
  let detected = 0;
  try {
    detected = await detectAndFlagSubscriptionsForUser(supabase, userId);
  } catch {
    return 0;
  }
  if (detected > 0) await emitFunnel(FUNNEL_EVENTS.SUBSCRIPTION_DETECTED, userId, { merchants: detected });
  return detected;
}

export async function readSubscriptionsView(userId: string): Promise<SubscriptionsSummary> {
  const supabase = await createServerSupabase();
  const sources = await readSubscriptionFlagSources(supabase, userId);
  if (sources.size === 0) return { subscriptions: [], monthlyTotal: 0, annualTotal: 0 };

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
    .filter((r) => sources.has(r.dedup_key))
    .map((r) => ({
      dedupKey: r.dedup_key,
      merchant: r.merchant,
      description: r.description,
      amount: Math.abs(Number(r.amount)),
      occurredOn: r.occurred_on,
      source: sources.get(r.dedup_key), // 'user' | 'auto' — drives the "detected" tag
    }));
  // WLT-24-4 — pass today so the summary can flag a series that's overdue vs its
  // cadence ("may have ended") and drop it from the headline.
  const asOf = new Date().toISOString().slice(0, 10);
  return summarizeSubscriptions(marked, asOf);
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

/** Remove (DISMISS) one price SERIES — exactly the passed charges (a cluster), not
 * the whole merchant (WLT-24-3), so removing one of a vendor's subscriptions leaves
 * the others. A durable SOFT-delete — the detector won't re-add a dismissed series.
 * Emits `subscription_dismissed` (the false-positive / curation signal). */
export async function unmarkSubscription(userId: string, dedupKeys: readonly string[]): Promise<SubscriptionWriteResult> {
  if (!Array.isArray(dedupKeys) || dedupKeys.length === 0 || !dedupKeys.every((k) => typeof k === "string" && k)) {
    return { ok: false, error: "invalid" };
  }
  const supabase = await createServerSupabase();
  try {
    await dismissSubscriptionFlags(supabase, userId, dedupKeys);
  } catch {
    return { ok: false, error: "save_failed" };
  }
  await emitFunnel(FUNNEL_EVENTS.SUBSCRIPTION_DISMISSED, userId, { action: "unmark", series: dedupKeys.length });
  return { ok: true };
}

/** Unmark from the LEDGER (one charge). WLT-24-3 — dismiss the price SERIES that
 * charge belongs to (resolved server-side), so toggling off a $13.99 Sony charge
 * never removes a sibling $45 Sony subscription. */
export async function unmarkSubscriptionFromLedger(userId: string, dedupKey: string): Promise<SubscriptionWriteResult> {
  if (!dedupKey || typeof dedupKey !== "string") return { ok: false, error: "invalid" };
  const supabase = await createServerSupabase();
  try {
    await dismissSubscriptionSeriesForCharge(supabase, userId, dedupKey);
  } catch {
    return { ok: false, error: "save_failed" };
  }
  await emitFunnel(FUNNEL_EVENTS.SUBSCRIPTION_DISMISSED, userId, { action: "unmark", from: "ledger" });
  return { ok: true };
}

// Re-export the helper `getSubscriptionFlagSet` for the ledger read (per-row
// indicator) so callers import from one place.
export { readSubscriptionFlags } from "@wealth/db/subscriptions";
