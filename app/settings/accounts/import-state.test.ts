import { describe, expect, it } from "vitest";
import type { ConnectionView } from "@/app/lib/aggregation-client";
import { COPY } from "@/app/lib/copy";
import { IMPORT_WINDOW_MS, isImporting, statusFor } from "./import-state";

const NOW = 1_000_000_000_000;
function conn(p: Partial<ConnectionView>): ConnectionView {
  return {
    connectionId: "c1",
    provider: "plaid",
    institutionName: "Test Bank",
    healthStatus: "active",
    lastSyncedAt: new Date(NOW).toISOString(),
    createdAt: new Date(NOW).toISOString(),
    accounts: [],
    ...p,
  };
}

describe("import state machine (WLT-10)", () => {
  it("is importing within the window, connected after it", () => {
    expect(isImporting(conn({ createdAt: new Date(NOW - 60_000).toISOString() }), NOW)).toBe(true);
    expect(isImporting(conn({ createdAt: new Date(NOW - IMPORT_WINDOW_MS - 1).toISOString() }), NOW)).toBe(false);
  });

  it("a recently-connected account shows Importing… (survives reload — derived from created_at)", () => {
    const c = conn({ createdAt: new Date(NOW - 30_000).toISOString() });
    expect(statusFor(c, NOW)).toEqual({ status: "syncing", label: COPY.accounts.importingStatus });
  });

  it("settles to Connected after the window once synced", () => {
    const c = conn({ createdAt: new Date(NOW - IMPORT_WINDOW_MS - 1).toISOString() });
    expect(statusFor(c, NOW)).toEqual({ status: "connected", label: COPY.accounts.connectedStatus });
  });

  it("health states take precedence over importing", () => {
    const fresh = { createdAt: new Date(NOW).toISOString() };
    expect(statusFor(conn({ ...fresh, healthStatus: "needs_reauth" }), NOW).status).toBe("needs_reauth");
    expect(statusFor(conn({ ...fresh, healthStatus: "error" }), NOW).status).toBe("error");
    expect(isImporting(conn({ ...fresh, healthStatus: "error" }), NOW)).toBe(false);
  });

  it("never-synced (no lastSyncedAt) after the window still reads syncing, not connected", () => {
    const c = conn({ createdAt: new Date(NOW - IMPORT_WINDOW_MS - 1).toISOString(), lastSyncedAt: null });
    expect(statusFor(c, NOW).status).toBe("syncing");
  });
});
