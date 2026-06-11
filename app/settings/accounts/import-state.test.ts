import { describe, expect, it } from "vitest";
import type { ConnectionView } from "@/app/lib/aggregation-client";
import { COPY } from "@/app/lib/copy";
import { isImporting, statusFor } from "./import-state";

function conn(p: Partial<ConnectionView>): ConnectionView {
  return {
    connectionId: "c1",
    provider: "plaid",
    institutionName: "Test Bank",
    healthStatus: "active",
    lastSyncedAt: "2026-06-10T00:00:00Z",
    historySyncedAt: null,
    createdAt: "2026-06-10T00:00:00Z",
    accounts: [],
    ...p,
  };
}

describe("import state machine (WLT-10)", () => {
  it("is importing until the backfill stamps history_synced_at (real signal, not a clock)", () => {
    expect(isImporting(conn({ historySyncedAt: null }))).toBe(true);
    expect(isImporting(conn({ historySyncedAt: "2026-06-10T00:05:00Z" }))).toBe(false);
  });

  it("shows Importing… while unsettled, Connected once settled", () => {
    expect(statusFor(conn({ historySyncedAt: null }))).toEqual({
      status: "syncing",
      label: COPY.accounts.importingStatus,
    });
    expect(statusFor(conn({ historySyncedAt: "2026-06-10T00:05:00Z" }))).toEqual({
      status: "connected",
      label: COPY.accounts.connectedStatus,
    });
  });

  it("does not depend on elapsed time — an old-but-unsettled connection still imports", () => {
    // created long ago but history not yet settled → still importing (no 5-min cutoff)
    expect(isImporting(conn({ createdAt: "2020-01-01T00:00:00Z", historySyncedAt: null }))).toBe(true);
  });

  it("health states take precedence over importing", () => {
    expect(statusFor(conn({ healthStatus: "needs_reauth" })).status).toBe("needs_reauth");
    expect(statusFor(conn({ healthStatus: "error" })).status).toBe("error");
    expect(isImporting(conn({ healthStatus: "error" }))).toBe(false);
  });
});
