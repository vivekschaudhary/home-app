// WLT-24-1 — browser-side calls to the subscriptions routes. try/catch,
// discriminated returns, no thrown exceptions (the budget-client.ts pattern).

import type { SubscriptionsSummary } from "@wealth/core";

export type SubscriptionsViewDTO = SubscriptionsSummary;
export type SubscriptionError = "invalid" | "server" | "network";

/** Reconcile the Subscriptions view (after an unmark). */
export async function fetchSubscriptions(): Promise<{ ok: true; view: SubscriptionsViewDTO } | { ok: false }> {
  try {
    const res = await fetch("/api/subscriptions", { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false };
    return { ok: true, view: (await res.json()) as SubscriptionsViewDTO };
  } catch {
    return { ok: false };
  }
}

async function write(
  method: "POST" | "DELETE",
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: SubscriptionError }> {
  try {
    const res = await fetch("/api/subscriptions/mark", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, error: res.status === 400 ? "invalid" : "server" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Mark a transaction as a subscription (marks the whole merchant). Reused by the
 * ledger row + the view. */
export function markSubscription(dedupKey: string) {
  return write("POST", { dedupKey });
}
/** Remove ONE price series (WLT-24-3) — pass that row's `dedupKeys` (the cluster), so
 * removing one of a vendor's subscriptions leaves the others. (Subscriptions panel.) */
export function unmarkSubscription(dedupKeys: string[]) {
  return write("DELETE", { dedupKeys });
}
/** Unmark from the LEDGER (one charge) — the server dismisses the price series that
 * charge belongs to, so a sibling series from the same vendor is untouched. */
export function unmarkSubscriptionFromLedger(dedupKey: string) {
  return write("DELETE", { dedupKey });
}
