// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionView } from "@/app/lib/aggregation-client";

// Heavy browser deps the component pulls in — stubbed so it renders in jsdom.
vi.mock("react-plaid-link", () => ({ usePlaidLink: () => ({ open: vi.fn(), ready: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const fetchConnections = vi.fn();
vi.mock("@/app/lib/aggregation-client", async (orig) => {
  const actual = await orig<typeof import("@/app/lib/aggregation-client")>();
  return { ...actual, fetchConnections: () => fetchConnections() };
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

afterEach(() => fetchConnections.mockReset());

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
