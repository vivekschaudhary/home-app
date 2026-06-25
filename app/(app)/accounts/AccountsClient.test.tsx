// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionView } from "@/app/lib/aggregation-client";
import { COPY } from "@/app/lib/copy";

// Heavy browser deps the component pulls in — stubbed so it renders in jsdom.
vi.mock("react-plaid-link", () => ({ usePlaidLink: () => ({ open: vi.fn(), ready: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const fetchConnections = vi.fn();
const triggerRefreshMock = vi.fn();
vi.mock("@/app/lib/aggregation-client", async (orig) => {
  const actual = await orig<typeof import("@/app/lib/aggregation-client")>();
  return {
    ...actual,
    fetchConnections: () => fetchConnections(),
    triggerRefresh: () => triggerRefreshMock(),
  };
});

import { AccountsClient } from "./AccountsClient";

const CONNECTION: ConnectionView = {
  connectionId: "c1",
  provider: "plaid",
  institutionName: "Test Credit Union",
  healthStatus: "active",
  lastSyncedAt: "2026-06-14T00:00:00Z",
  historySyncedAt: "2026-06-14T00:00:00Z", // settled → not importing (no poll)
  createdAt: "2026-06-14T00:00:00Z",
  accounts: [
    {
      id: "a1",
      name: "Everyday Checking",
      kind: "depository",
      mask: "1234",
      balanceCurrent: "4210.55",
      balanceAvailable: null,
      balanceUpdatedAt: null,
    },
  ],
};

afterEach(() => {
  fetchConnections.mockReset();
  triggerRefreshMock.mockReset();
});

describe("AccountsClient — reconcile on mount (#36 regression)", () => {
  it("a stale/transiently-EMPTY initial render self-heals: re-fetches on mount and shows the connection", async () => {
    // The prod symptom: the server handed an empty initial render (stale prefetch
    // / a transient read), so the page must reconcile with the live server state
    // on mount rather than trust a possibly-stale prop forever.
    fetchConnections.mockResolvedValue([CONNECTION]);
    render(<AccountsClient initialConnections={[]} />);

    // The populated state appears (the "Add another account" button only renders
    // once there's ≥1 connection) and the empty state is gone.
    await waitFor(() => screen.getByRole("button", { name: "Add another account" }));
    expect(screen.queryByText("No accounts connected yet")).toBeNull();
    expect(fetchConnections).toHaveBeenCalled();
  });

  it("does not flash empty when the initial render already has the connection", async () => {
    fetchConnections.mockResolvedValue([CONNECTION]);
    render(<AccountsClient initialConnections={[CONNECTION]} />);
    expect(screen.getByRole("button", { name: "Add another account" })).toBeTruthy();
    expect(screen.queryByText("No accounts connected yet")).toBeNull();
  });
});

describe("AccountsClient — mount-trigger and sync indicator", () => {
  it("calls fetchConnections then triggerRefresh on mount", async () => {
    fetchConnections.mockResolvedValue([CONNECTION]);
    triggerRefreshMock.mockResolvedValue(false);
    render(<AccountsClient initialConnections={[]} />);
    await waitFor(() => expect(triggerRefreshMock).toHaveBeenCalledTimes(1));
    expect(fetchConnections).toHaveBeenCalledTimes(1);
  });

  it("shows syncing indicator when triggerRefresh returns true", async () => {
    fetchConnections.mockResolvedValue([CONNECTION]);
    triggerRefreshMock.mockResolvedValue(true);
    render(<AccountsClient initialConnections={[CONNECTION]} />);
    await waitFor(() => screen.getByText(COPY.accounts.syncing));
  });

  it("does not show syncing indicator when triggerRefresh returns false (no active connections triggered)", async () => {
    fetchConnections.mockResolvedValue([CONNECTION]);
    triggerRefreshMock.mockResolvedValue(false);
    render(<AccountsClient initialConnections={[CONNECTION]} />);
    await waitFor(() => expect(triggerRefreshMock).toHaveBeenCalled());
    expect(screen.queryByText(COPY.accounts.syncing)).toBeNull();
  });

  it("clears syncing when ALL active connections have updated lastSyncedAt", async () => {
    const connectionUpdated = { ...CONNECTION, lastSyncedAt: "2026-06-25T12:00:00Z" };
    // mount fetch returns the snapshot; polling fetch returns updated data
    fetchConnections
      .mockResolvedValueOnce([CONNECTION])
      .mockResolvedValue([connectionUpdated]);
    triggerRefreshMock.mockResolvedValue(true);

    vi.useFakeTimers();
    try {
      render(<AccountsClient initialConnections={[CONNECTION]} />);
      // waitFor cannot be used here: its polling relies on setTimeout, which is
      // mocked by vi.useFakeTimers(). Instead, flush exactly two microtask ticks —
      // one per awaited call in the mount effect (fetchConnections, then triggerRefresh).
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());
      expect(screen.getByText(COPY.accounts.syncing)).toBeTruthy();

      // advance 5 s → polling interval fires → fetchConnections called with updated data
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(screen.queryByText(COPY.accounts.syncing)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears syncing after 120 s hard timeout even when connections never update", async () => {
    fetchConnections.mockResolvedValue([CONNECTION]);
    triggerRefreshMock.mockResolvedValue(true);

    vi.useFakeTimers();
    try {
      render(<AccountsClient initialConnections={[CONNECTION]} />);
      // See comment above: two microtask flushes cover the two awaited calls in
      // the mount effect under fake timers where waitFor cannot poll.
      await act(() => Promise.resolve());
      await act(() => Promise.resolve());
      expect(screen.getByText(COPY.accounts.syncing)).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });
      expect(screen.queryByText(COPY.accounts.syncing)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
