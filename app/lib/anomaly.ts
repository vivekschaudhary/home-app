// WLT-26-2 — Dashboard anomaly panel read. Owner-scoped, under the user's RLS
// session. Reads the 'new_merchant' and 'category_spike' anomaly kinds (the
// dashboard surface — separate from the recap's 3 original kinds). Transitions
// open→surfaced + emits ANOMALY_SURFACED once per anomaly on first surface.
// PII invariant: merchant name is resolved at read time via a live-transaction
// join on the CDC-stable dedup_key; it is NEVER stored in anomalies.summary.
//
// Orthogonality guard (load-bearing): this reader filters to its 2 kinds ONLY.
// The recap's readTopAnomaly filters to its 3 kinds ONLY. Neither surface leaks
// into the other (guard integration test asserts both sides of the separation).

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

export interface DashboardAnomaly {
  id: string;
  kind: "new_merchant" | "category_spike";
  summary: Record<string, unknown>;
  /** Resolved at read from the live transaction; null if the transaction was superseded. */
  merchantName?: string | null;
  /** Raw category slug extracted from the category_spike dedup_key (for the Investigate URL). */
  rawCategory?: string | null;
  /** The YYYY-MM month from the dedup_key (category_spike) or summary.date (new_merchant). */
  debutMonth?: string | null;
}

export interface DashboardAnomalyRead {
  anomalies: DashboardAnomaly[];
  monthsOfHistory: number;
}

/** First day of the month 5 months ago (the 6-month window start). */
function windowStart(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 5);
  return d.toISOString().slice(0, 10);
}

/**
 * Read open/surfaced dashboard anomalies for the given user. Orthogonality guard:
 * filters to kind IN ('new_merchant', 'category_spike') ONLY — never returns
 * large_charge, recurring_due, or low_balance rows.
 */
export async function readDashboardAnomalies(userId: string): Promise<DashboardAnomalyRead> {
  const supabase = await createServerSupabase();

  // Owner-scoped reads (RLS on anomalies + transactions ensures cross-tenant isolation).
  const [anomalyRes, txnRes] = await Promise.all([
    supabase
      .from("anomalies")
      .select("id, kind, severity, status, summary, dedup_key, created_at")
      .eq("user_id", userId)
      .in("kind", ["new_merchant", "category_spike"]) // orthogonality guard — never recap kinds
      .in("status", ["open", "surfaced"])
      .order("severity", { ascending: true }) // 'attention' before 'info' (alphabetical asc)
      .order("created_at", { ascending: false })
      .limit(20),
    // Count distinct calendar months in the 6-month window for the history gate.
    supabase
      .from("transactions")
      .select("occurred_on")
      .eq("user_id", userId)
      .eq("direction", "debit")
      .gte("occurred_on", windowStart())
      .is("removed_at", null)
      .is("superseded_by", null)
      .limit(2000),
  ]);

  if (anomalyRes.error) return { anomalies: [], monthsOfHistory: 0 };

  const distinctMonths = new Set(
    (txnRes.data ?? []).map((r) => (r as { occurred_on: string }).occurred_on.slice(0, 7)),
  );
  const monthsOfHistory = distinctMonths.size;

  const anomalyRows = (anomalyRes.data ?? []) as {
    id: string;
    kind: string;
    severity: string;
    status: string;
    summary: Record<string, unknown>;
    dedup_key: string;
    created_at: string;
  }[];

  // Collect dedup_keys for new_merchant rows to batch-resolve transaction merchants.
  const nmTxnKeys: string[] = [];
  for (const row of anomalyRows) {
    if (row.kind === "new_merchant") {
      nmTxnKeys.push(row.dedup_key.slice("new_merchant:".length));
    }
  }

  // Batch-fetch merchant names for all new_merchant rows.
  const merchantByDedupKey = new Map<string, string | null>();
  if (nmTxnKeys.length > 0) {
    const { data: txnRows } = await supabase
      .from("transactions")
      .select("dedup_key, merchant")
      .eq("user_id", userId)
      .in("dedup_key", nmTxnKeys)
      .is("removed_at", null)
      .is("superseded_by", null);
    for (const r of (txnRows ?? []) as { dedup_key: string; merchant: string | null }[]) {
      merchantByDedupKey.set(r.dedup_key, r.merchant);
    }
  }

  // Batch the open→surfaced transition: single UPDATE for all open rows.
  const openRows = anomalyRows.filter((r) => r.status === "open");
  if (openRows.length > 0) {
    await supabase
      .from("anomalies")
      .update({ status: "surfaced" })
      .in(
        "id",
        openRows.map((r) => r.id),
      )
      .eq("status", "open");
    // Emit ANOMALY_SURFACED for each newly-surfaced row.
    for (const row of openRows) {
      await emitFunnel(FUNNEL_EVENTS.ANOMALY_SURFACED, userId, { anomaly_kind: row.kind });
    }
  }

  const anomalies: DashboardAnomaly[] = [];
  for (const row of anomalyRows) {
    let merchantName: string | null | undefined;
    let rawCategory: string | null = null;
    let debutMonth: string | null = null;

    if (row.kind === "new_merchant") {
      const txnDedupKey = row.dedup_key.slice("new_merchant:".length);
      merchantName = merchantByDedupKey.get(txnDedupKey) ?? null;
      // Month from summary.date: 'YYYY-MM-DD' → 'YYYY-MM'
      const summaryDate = row.summary.date as string | undefined;
      debutMonth = summaryDate ? summaryDate.slice(0, 7) : null;
    } else if (row.kind === "category_spike") {
      // dedup_key format: 'category_spike:<rawCat>:<YYYY-MM>'
      // Use lastIndexOf to safely handle categories that don't contain ':'.
      const withoutPrefix = row.dedup_key.slice("category_spike:".length);
      const lastColon = withoutPrefix.lastIndexOf(":");
      rawCategory = lastColon >= 0 ? withoutPrefix.slice(0, lastColon) : withoutPrefix;
      debutMonth = lastColon >= 0 ? withoutPrefix.slice(lastColon + 1) : null;
    }

    anomalies.push({
      id: row.id,
      kind: row.kind as "new_merchant" | "category_spike",
      summary: row.summary,
      merchantName,
      rawCategory,
      debutMonth,
    });
  }

  return { anomalies, monthsOfHistory };
}
