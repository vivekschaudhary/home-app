// WLT-26-2 — Dashboard Intelligence: anomaly panel read, wired to Supabase.
// Owner-scoped (RLS session). Reads only the two WLT-26-2 kinds (new_merchant,
// category_spike) so the recap surface (large_charge / recurring_due / low_balance)
// is never contaminated — the orthogonality guard (architecture.md).
//
// new_merchant merchant names are PII-free in anomalies.summary (architecture
// invariant from 0009). They are resolved here at read time by joining the live
// transaction on the stripped dedup_key. If the transaction was superseded, the
// panel renders without the merchant name (graceful degradation, AC6).
//
// open → surfaced transition + ANOMALY_SURFACED emit mirror the readTopAnomaly
// pattern in recap.ts.

import { createServerSupabase } from "@vc1023/passkey-2fa";
import { FUNNEL_EVENTS } from "@wealth/core";
import { emitFunnel } from "@wealth/db/emit";

export interface DashboardAnomaly {
  id: string;
  kind: "new_merchant" | "category_spike";
  summary: Record<string, unknown>;
  merchantName?: string | null; // new_merchant only; null when CDC supersession
  rawCategory?: string | null;  // category_spike only: slug for the ledger ?category= filter
  spikeMonth?: string | null;   // category_spike only: YYYY-MM for the ledger ?month= filter
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** First day of the month 5 calendar months before today (rolling 6-month window). */
function sixMonthsAgoStart(): string {
  const today = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [y, m] = today.split("-").map(Number);
  let yy = y;
  let mm = m;
  for (let i = 0; i < 5; i++) {
    mm -= 1;
    if (mm === 0) {
      mm = 12;
      yy -= 1;
    }
  }
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

/**
 * Read open/surfaced dashboard anomalies (new_merchant + category_spike only).
 * Transitions open → surfaced + emits ANOMALY_SURFACED on first surface.
 * Also returns monthsOfHistory (distinct debit months in the rolling 6-month
 * window) so the panel can render the ≥2-month empty state.
 *
 * Orthogonality: this reader NEVER returns large_charge / recurring_due /
 * low_balance rows. readTopAnomaly (recap.ts) NEVER returns new_merchant /
 * category_spike rows. Both filters are pinned by integration tests.
 */
export async function readDashboardAnomalies(
  userId: string,
): Promise<{ anomalies: DashboardAnomaly[]; monthsOfHistory: number }> {
  const supabase = await createServerSupabase();
  const since = sixMonthsAgoStart();
  const today = todayUtc();

  // Read anomalies + debit-month history in parallel.
  const [{ data: anomalyRows }, { data: txMonthRows }] = await Promise.all([
    supabase
      .from("anomalies")
      .select("id, kind, status, summary, dedup_key, created_at")
      .eq("user_id", userId)
      .in("kind", ["new_merchant", "category_spike"])
      .in("status", ["open", "surfaced"])
      .order("severity", { ascending: true }) // 'attention' < 'info' alphabetically → attention first
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("occurred_on")
      .eq("user_id", userId)
      .eq("direction", "debit")
      .is("removed_at", null)
      .is("superseded_by", null)
      .gte("occurred_on", since)
      .lte("occurred_on", today),
  ]);

  // Count distinct calendar months with debit activity.
  const monthsWithDebits = new Set(
    (txMonthRows ?? []).map((r) => (r as { occurred_on: string }).occurred_on.slice(0, 7)),
  );
  const monthsOfHistory = monthsWithDebits.size;

  const rows = (anomalyRows ?? []) as Array<{
    id: string;
    kind: string;
    status: string;
    summary: Record<string, unknown>;
    dedup_key: string;
    created_at: string;
  }>;

  // Transition open → surfaced (idempotent) + emit ANOMALY_SURFACED once each.
  const openRows = rows.filter((r) => r.status === "open");
  if (openRows.length > 0) {
    await supabase
      .from("anomalies")
      .update({ status: "surfaced" })
      .in(
        "id",
        openRows.map((r) => r.id),
      )
      .eq("status", "open");
    for (const row of openRows) {
      await emitFunnel(FUNNEL_EVENTS.ANOMALY_SURFACED, userId, { anomaly_kind: row.kind });
    }
  }

  // Resolve new_merchant merchant names via live-transaction join on stripped dedup_key.
  const newMerchantRows = rows.filter((r) => r.kind === "new_merchant");
  const merchantNameMap = new Map<string, string | null>();

  if (newMerchantRows.length > 0) {
    const txDedupKeys = newMerchantRows.map((r) => r.dedup_key.slice("new_merchant:".length));
    const { data: txRows } = await supabase
      .from("transactions")
      .select("dedup_key, merchant")
      .in("dedup_key", txDedupKeys)
      .is("removed_at", null)
      .is("superseded_by", null);
    for (const row of (txRows ?? []) as Array<{ dedup_key: string; merchant: string | null }>) {
      merchantNameMap.set(row.dedup_key, row.merchant);
    }
  }

  // Assemble the DashboardAnomaly array.
  const anomalies: DashboardAnomaly[] = rows.map((r) => {
    if (r.kind === "new_merchant") {
      const txDedupKey = r.dedup_key.slice("new_merchant:".length);
      // Graceful degradation: null when the transaction was superseded (CDC).
      const merchantName = merchantNameMap.has(txDedupKey) ? merchantNameMap.get(txDedupKey) ?? null : null;
      return { id: r.id, kind: "new_merchant" as const, summary: r.summary, merchantName };
    }
    // category_spike: parse rawCategory + spikeMonth from the dedup_key.
    // format: 'category_spike:<rawCategory>:<YYYY-MM>'
    const withoutPrefix = r.dedup_key.slice("category_spike:".length);
    const lastColon = withoutPrefix.lastIndexOf(":");
    const rawCategory = lastColon > -1 ? withoutPrefix.slice(0, lastColon) : withoutPrefix;
    const spikeMonth = lastColon > -1 ? withoutPrefix.slice(lastColon + 1) : null;
    return { id: r.id, kind: "category_spike" as const, summary: r.summary, rawCategory, spikeMonth };
  });

  return { anomalies, monthsOfHistory };
}
