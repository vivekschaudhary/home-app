// Pure settle decision for the historical backfill (WLT-10). Plaid streams the
// 24-month history asynchronously, so "drained once" ≠ "complete". We re-sync
// (with waits) until a pass brings NOTHING new — that's genuinely caught up.
//
// Returns `true` ONLY when a pass returned 0 new transactions within the cap. If
// the cap is reached while a pass still returned data (Plaid is still streaming),
// returns `false` → the caller does NOT stamp history_synced_at, so the UI keeps
// showing "Importing…" and the cron refresh becomes the backstop. This is the
// fix for "stamped unconditionally after N attempts even if still importing".

export async function settleHistory(
  syncOnce: (attempt: number) => Promise<number>, // returns the # of new rows that pass
  wait: (attempt: number) => Promise<unknown>,
  maxAttempts: number,
): Promise<boolean> {
  for (let s = 0; s < maxAttempts; s += 1) {
    await wait(s);
    if ((await syncOnce(s)) === 0) return true; // caught up — safe to stamp
  }
  return false; // capped while still receiving — NOT settled
}
