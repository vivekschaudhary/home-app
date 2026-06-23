// WLT-25-1 — browser-side calls to the follow-up route. try/catch, discriminated
// returns, no thrown exceptions (the subscriptions-client.ts pattern).

export type FollowupError = "invalid" | "server" | "network";

async function write(
  method: "POST" | "DELETE",
  dedupKey: string,
): Promise<{ ok: true } | { ok: false; error: FollowupError }> {
  try {
    const res = await fetch("/api/transactions/followup", {
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

/** Flag a charge to follow up (POST). */
export function flagFollowup(dedupKey: string) {
  return write("POST", dedupKey);
}
/** Resolve a follow-up — "Done" (DELETE → soft-delete server-side). */
export function resolveFollowup(dedupKey: string) {
  return write("DELETE", dedupKey);
}
