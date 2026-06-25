// Regression: accounts page showed stale balances because no sync was triggered
// on page load. The refresh endpoint must fire CONNECTION_REFRESH_EVENT for every
// active connection — otherwise balances only update on webhook or the 6-hour cron.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionView } from "@wealth/aggregation";
import { POST } from "./route";

const { mockGetAal2UserId, mockConnectionsList, mockInngestSend } = vi.hoisted(() => ({
  mockGetAal2UserId: vi.fn(),
  mockConnectionsList: vi.fn(),
  mockInngestSend: vi.fn(),
}));

vi.mock("@vc1023/passkey-2fa", () => ({
  getAal2UserId: mockGetAal2UserId,
}));

vi.mock("@/app/lib/aggregation", () => ({
  handlers: { connectionsList: mockConnectionsList },
}));

vi.mock("@wealth/jobs", () => ({
  inngest: { send: mockInngestSend },
  CONNECTION_REFRESH_EVENT: "aggregation/connection.refresh",
}));

function stubConn(overrides: Partial<ConnectionView> = {}): ConnectionView {
  return {
    connectionId: "conn-1",
    provider: "plaid",
    institutionName: "Test Bank",
    healthStatus: "active",
    lastSyncedAt: "2026-06-24T00:00:00Z",
    historySyncedAt: "2026-06-20T00:00:00Z",
    createdAt: "2026-06-01T00:00:00Z",
    accounts: [],
    ...overrides,
  };
}

describe("POST /api/aggregation/connections/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInngestSend.mockResolvedValue(undefined);
  });

  it("returns 401 and does not send events when unauthenticated", async () => {
    mockGetAal2UserId.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("sends CONNECTION_REFRESH_EVENT for each active connection", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    mockConnectionsList.mockResolvedValue([
      stubConn({ connectionId: "conn-1" }),
      stubConn({ connectionId: "conn-2" }),
    ]);

    const res = await POST();
    const body = (await res.json()) as { triggered: number };

    expect(res.status).toBe(200);
    expect(body.triggered).toBe(2);
    expect(mockInngestSend).toHaveBeenCalledWith([
      { name: "aggregation/connection.refresh", data: { connectionId: "conn-1", userId: "user-1" } },
      { name: "aggregation/connection.refresh", data: { connectionId: "conn-2", userId: "user-1" } },
    ]);
  });

  it("skips non-active connections (needs_reauth, error, disconnected)", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    mockConnectionsList.mockResolvedValue([
      stubConn({ connectionId: "conn-ok", healthStatus: "active" }),
      stubConn({ connectionId: "conn-reauth", healthStatus: "needs_reauth" }),
      stubConn({ connectionId: "conn-err", healthStatus: "error" }),
    ]);

    const res = await POST();
    const body = (await res.json()) as { triggered: number };

    expect(body.triggered).toBe(1);
    expect(mockInngestSend).toHaveBeenCalledWith([
      { name: "aggregation/connection.refresh", data: { connectionId: "conn-ok", userId: "user-1" } },
    ]);
  });

  it("returns { triggered: 0 } without calling inngest when no active connections exist", async () => {
    mockGetAal2UserId.mockResolvedValue("user-1");
    mockConnectionsList.mockResolvedValue([]);

    const res = await POST();
    const body = (await res.json()) as { triggered: number };

    expect(res.status).toBe(200);
    expect(body.triggered).toBe(0);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});
