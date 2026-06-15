// Net-worth snapshot job (WLT-15 / WLT-16) — samples each user's net worth once
// a day into net_worth_snapshots, OFF the request path (architecture.md →
// Reliability; never in RSC render). This time series is what makes the recap's
// MOVEMENT line and target PROGRESS bar computable — balances can't be
// reconstructed from transactions, so net worth must be sampled, not derived.
//
// Idempotent: upsert on (user_id, captured_on) do-nothing → re-running the same
// day (retry, manual replay) inserts nothing new. Fans out over users with at
// least one active connection; users with no reported balance are skipped (never
// a fake/zero snapshot — the real-data guardrail, mirrors personalizeNetWorth).

import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { personalizeNetWorth } from "@wealth/core";
import { inngest } from "../client";

/** UTC calendar day — one sample per user per day. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const netWorthSnapshotDaily = inngest.createFunction(
  { id: "recap-networth-snapshot-daily" },
  { cron: "0 8 * * *" }, // daily 08:00 UTC
  async ({ step }) => {
    const capturedOn = todayUtc();

    // Distinct users with a live, active connection (the recap population).
    const userIds = await step.run("list-active-users", async () => {
      const svc = createServiceSupabase();
      const { data } = await svc
        .from("account_connections")
        .select("user_id")
        .eq("health_status", "active")
        .is("deleted_at", null);
      return [...new Set((data ?? []).map((r) => (r as { user_id: string }).user_id))];
    });
    if (userIds.length === 0) return { capturedOn, sampled: 0, skipped: 0 };

    const { sampled, skipped } = await step.run("sample-net-worth", async () => {
      const svc = createServiceSupabase();
      let nSampled = 0;
      let nSkipped = 0;
      for (const userId of userIds) {
        const { data: accts } = await svc
          .from("financial_accounts")
          .select("kind, balance_current")
          .eq("user_id", userId)
          .is("deleted_at", null);
        const config = personalizeNetWorth(
          (accts ?? []).map((a) => {
            const row = a as { kind: string; balance_current: number | string | null };
            return {
              kind: row.kind,
              balanceCurrent: row.balance_current === null ? null : Number(row.balance_current),
            };
          }),
        );
        if (!config) {
          nSkipped += 1; // no reported balance → never a fake snapshot
          continue;
        }
        // Idempotent: one sample per user per day (ignore the conflict).
        const { error } = await svc.from("net_worth_snapshots").upsert(
          {
            user_id: userId,
            captured_on: capturedOn,
            net_worth: config.netWorth,
            assets: config.assets,
            debts: config.debts,
          },
          { onConflict: "user_id,captured_on", ignoreDuplicates: true },
        );
        if (error) throw new Error(`[snapshot] upsert failed for ${userId}: ${error.message}`);
        nSampled += 1;
      }
      return { sampled: nSampled, skipped: nSkipped };
    });

    return { capturedOn, sampled, skipped };
  },
);
