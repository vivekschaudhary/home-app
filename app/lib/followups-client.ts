// WLT-25-1 — browser-side calls to the follow-up route. try/catch, discriminated
// returns, no thrown exceptions (the subscriptions-client.ts pattern).

export type FollowupError = "invalid" | "server" | "network";

async function write(
  method: "POST" | "DELETE",
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: FollowupError }> {
  try {
    const res = await fetch("/api/transactions/followup", {
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

/** Flag a charge to follow up (POST). */
export function flagFollowup(dedupKey: string) {
  return write("POST", { dedupKey });
}
/** Resolve a follow-up — "Done" (DELETE → soft-delete server-side). */
export function resolveFollowup(dedupKey: string) {
  return write("DELETE", { dedupKey });
}
/** Re-open a resolved follow-up — Done → Open (WLT-25-2). Same write as flag; the
 * `reopen` flag distinguishes the funnel event server-side. */
export function reopenFollowup(dedupKey: string) {
  return write("POST", { dedupKey, reopen: true });
}
