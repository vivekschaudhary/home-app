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
  dedupKey: string,
): Promise<{ ok: true } | { ok: false; error: SubscriptionError }> {
  try {
    const res = await fetch("/api/subscriptions/mark", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dedupKey }),
    });
    if (!res.ok) return { ok: false, error: res.status === 400 ? "invalid" : "server" };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Mark a transaction as a subscription. Reused by the ledger row + the view. */
export function markSubscription(dedupKey: string) {
  return write("POST", dedupKey);
}
/** Remove a subscription mark. */
export function unmarkSubscription(dedupKey: string) {
  return write("DELETE", dedupKey);
}
