// Pure settle decision for the historical backfill (WLT-10). Plaid streams the
// 24-month history asynchronously, so neither "drained once" nor a single quiet
// pass proves completion — a lull between batches looks identical to being done.
// The approved rule is STABILIZATION: only settle once sync activity has gone
// quiet and STAYED quiet for `requiredQuietPasses` consecutive passes. Any pass
// that brings new rows resets the streak.
//
// Returns `true` only when that consecutive-quiet streak is reached within the
// cap. If the cap is hit first (still streaming, or only transient lulls),
// returns `false` → the caller does NOT stamp history_synced_at, the UI stays
// "Importing…", and the next refresh/cron re-evaluates.

export async function settleHistory(
  syncOnce: (attempt: number) => Promise<number>, // returns the # of new rows that pass
  wait: (attempt: number) => Promise<unknown>,
  maxAttempts: number,
  requiredQuietPasses: number,
): Promise<boolean> {
  let consecutiveQuiet = 0;
  for (let s = 0; s < maxAttempts; s += 1) {
    await wait(s);
    if ((await syncOnce(s)) === 0) {
      consecutiveQuiet += 1;
      if (consecutiveQuiet >= requiredQuietPasses) return true; // stabilized
    } else {
      consecutiveQuiet = 0; // new history arrived — not stable yet
    }
  }
  return false; // never stabilized within the cap
}
