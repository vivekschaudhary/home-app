// Anomaly scan job (WLT-15 / WLT-18) — runs the pure high-precision rules over
// each user's recent transactions + balances and INSERTs new anomalies, OFF the
// request path. Idempotent on (user_id, dedup_key): a re-scan never duplicates an
// existing anomaly (`on conflict do nothing`). Fans out over users with an active
// connection, same shape as netWorthSnapshotDaily.
//
// NOTE (OPS-1): a new cron only runs in prod once Inngest registers it — now
// automatic via .github/workflows/inngest-sync.yml on each production deploy.

import { createServiceSupabase } from "@vc1023/passkey-2fa";
import { type AnomalyAccount, type AnomalyTxn, detectAnomalies, effectiveCategory } from "@wealth/core";
import { readCategoryAssignments, readCategorySpendingFlags } from "@wealth/db/categories";
import { inngest } from "../client";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export const anomalyScanDaily = inngest.createFunction(
  { id: "recap-anomaly-scan-daily" },
  { cron: "0 9 * * *" }, // daily 09:00 UTC (after the 08:00 snapshot)
  async ({ step }) => {
    const asOf = todayUtc();

    const userIds = await step.run("list-active-users", async () => {
      const svc = createServiceSupabase();
      const { data } = await svc
        .from("account_connections")
        .select("user_id")
        .eq("health_status", "active")
        .is("deleted_at", null);
      return [...new Set((data ?? []).map((r) => (r as { user_id: string }).user_id))];
    });
    if (userIds.length === 0) return { asOf, scanned: 0, inserted: 0 };

    const { scanned, inserted } = await step.run("scan-and-insert", async () => {
      const svc = createServiceSupabase();
      const since = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10); // ~quarter of history for a baseline
      let nInserted = 0;
      for (const userId of userIds) {
        const [{ data: txRows }, { data: acctRows }, assignments, spendingFlags] = await Promise.all([
          svc
            .from("transactions")
            .select("id, account_id, dedup_key, direction, category, merchant, amount, occurred_on")
            .eq("user_id", userId)
            .is("removed_at", null)
            .is("superseded_by", null)
            .gte("occurred_on", since),
          svc.from("financial_accounts").select("id, kind, balance_current").eq("user_id", userId).is("deleted_at", null),
          // WLT-22-2: the user's saved category assignments, via the ONE shared
          // helper — so anomalies detect on the user's category, consistent with
          // budget + recap (the guardrail). Service-role client, scoped by user_id.
          readCategoryAssignments(svc, userId),
          // WLT-22-5: the spending flags, so transfers/payments are dropped before
          // detection (we never want a "large charge" anomaly on a card payment).
          readCategorySpendingFlags(svc, userId),
        ]);
        const countsAsSpending = (name: string | null) => spendingFlags.get(name ?? "") ?? true;

        const transactions: AnomalyTxn[] = (txRows ?? [])
          .map((r) => {
            const row = r as { id: string; account_id: string; dedup_key: string; direction: string; category: string | null; merchant: string | null; amount: number | string; occurred_on: string };
            return {
              id: row.id,
              accountId: row.account_id,
              dedupKey: row.dedup_key, // WLT-26-2: needed to key new_merchant candidates
              direction: row.direction,
              category: effectiveCategory(row.category, assignments.get(row.dedup_key)),
              merchant: row.merchant ?? null, // WLT-26-2: resolved at read time in the panel (never stored in summary)
              amount: Number(row.amount),
              occurredOn: row.occurred_on,
            };
          })
          .filter((t) => countsAsSpending(t.category));
        const accounts: AnomalyAccount[] = (acctRows ?? []).map((r) => {
          const row = r as { id: string; kind: string; balance_current: number | string | null };
          return { id: row.id, kind: row.kind, balanceCurrent: row.balance_current === null ? null : Number(row.balance_current) };
        });

        const candidates = detectAnomalies({ transactions, accounts, asOf });
        if (candidates.length === 0) continue;

        const rows = candidates.map((c) => ({
          user_id: userId,
          account_id: c.accountId,
          transaction_id: c.transactionId,
          kind: c.kind,
          severity: c.severity,
          summary: c.summary,
          detected_on: c.detectedOn,
          dedup_key: c.dedupKey,
        }));
        // Idempotent: skip any anomaly we've already recorded for this user.
        const { error } = await svc.from("anomalies").upsert(rows, { onConflict: "user_id,dedup_key", ignoreDuplicates: true });
        if (error) throw new Error(`[anomaly-scan] insert failed for ${userId}: ${error.message}`);
        nInserted += rows.length;
      }
      return { scanned: userIds.length, inserted: nInserted };
    });

    return { asOf, scanned, inserted };
  },
);
