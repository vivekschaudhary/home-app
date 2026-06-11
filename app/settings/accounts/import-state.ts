import type { ConnectionView } from "@/app/lib/aggregation-client";
import { COPY } from "@/app/lib/copy";

// A connection is "importing" until its initial 24-month backfill actually
// SETTLES — the backfill stamps `history_synced_at` once Plaid stops returning new
// history (see packages/jobs/aggregation/sync.ts). Deriving the state from that
// server-provided flag (not a clock) makes "Importing…" correct in BOTH directions
// (it doesn't end before the history is in, nor linger after it settles) AND
// survive navigating away and back.

export type DisplayStatus = "connected" | "syncing" | "needs_reauth" | "error";

/** Still pulling the initial history? Settles when `history_synced_at` is set. */
export function isImporting(conn: ConnectionView): boolean {
  return conn.healthStatus === "active" && conn.historySyncedAt === null;
}

export function statusFor(conn: ConnectionView): { status: DisplayStatus; label: string } {
  if (conn.healthStatus === "needs_reauth")
    return { status: "needs_reauth", label: COPY.accounts.needsReauthStatus };
  if (conn.healthStatus === "error") return { status: "error", label: COPY.accounts.errorStatus };
  if (isImporting(conn)) return { status: "syncing", label: COPY.accounts.importingStatus };
  return { status: "connected", label: COPY.accounts.connectedStatus };
}
