import type { ConnectionView } from "@/app/lib/aggregation-client";
import { COPY } from "@/app/lib/copy";

// A connection's 24-month history lands asynchronously after connect (webhook/
// cron). We treat it as "importing" for a window after `created_at` — which is
// SERVER-DERIVABLE (the page re-derives it on every load, so the honest
// "Importing…" state + polling survive navigating away and back, not just local
// client memory). After the window the cron/webhook keep it fresh.

export const IMPORT_WINDOW_MS = 5 * 60 * 1000; // generous upper bound for Plaid's historical pull

export type DisplayStatus = "connected" | "syncing" | "needs_reauth" | "error";

/** Is this connection still in its post-connect historical-import window? */
export function isImporting(conn: ConnectionView, now: number): boolean {
  if (conn.healthStatus !== "active") return false; // error / needs_reauth take precedence
  return now - new Date(conn.createdAt).getTime() < IMPORT_WINDOW_MS;
}

export function statusFor(conn: ConnectionView, now: number): { status: DisplayStatus; label: string } {
  if (conn.healthStatus === "needs_reauth")
    return { status: "needs_reauth", label: COPY.accounts.needsReauthStatus };
  if (conn.healthStatus === "error") return { status: "error", label: COPY.accounts.errorStatus };
  if (isImporting(conn, now)) return { status: "syncing", label: COPY.accounts.importingStatus };
  if (!conn.lastSyncedAt) return { status: "syncing", label: COPY.accounts.syncingStatus };
  return { status: "connected", label: COPY.accounts.connectedStatus };
}
