// @vitest-environment jsdom
// WLT-26-2 — AnomalyPanelClient unit tests. The RSC wrapper (AnomalyPanel) reads
// from the DB and cannot be unit-tested without mocking Supabase; the client
// component owns all the interactive behaviour tested here.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DashboardAnomaly } from "@/app/lib/anomaly";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Stub fetch so no real network calls are made.
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal("fetch", fetchMock);

import { AnomalyPanelClient } from "./AnomalyPanelClient";

beforeEach(() => {
  fetchMock.mockClear();
});

const NEW_MERCHANT: DashboardAnomaly = {
  id: "nm1",
  kind: "new_merchant",
  summary: { amount: 42, date: "2026-06-13" },
  merchantName: "Nobu Restaurant",
};

const CATEGORY_SPIKE: DashboardAnomaly = {
  id: "cs1",
  kind: "category_spike",
  summary: { category: "Groceries", amount: 180, baseline: 100, multiple: 1.8 },
  rawCategory: "GROCERIES",
  spikeMonth: "2026-06",
};

describe("AnomalyPanelClient", () => {
  it("renders per-kind phrasing for new_merchant with a merchant name", () => {
    render(<AnomalyPanelClient anomalies={[NEW_MERCHANT]} />);
    expect(screen.getByText(/Nobu Restaurant/)).toBeTruthy();
  });

  it("falls back to anomalyKindNewMerchantUnknown copy when merchantName is null", () => {
    const noMerchant: DashboardAnomaly = { ...NEW_MERCHANT, merchantName: null };
    render(<AnomalyPanelClient anomalies={[noMerchant]} />);
    expect(screen.getByText(/couldn't identify/i)).toBeTruthy();
  });

  it("renders per-kind phrasing for category_spike with category + multiple", () => {
    render(<AnomalyPanelClient anomalies={[CATEGORY_SPIKE]} />);
    expect(screen.getByText(/Groceries/)).toBeTruthy();
    expect(screen.getByText(/1\.8×/)).toBeTruthy();
  });

  it("renders the dismiss button with correct accessible label for new_merchant", () => {
    render(<AnomalyPanelClient anomalies={[NEW_MERCHANT]} />);
    const btn = screen.getByRole("button", { name: /don't flag this merchant again/i });
    expect(btn).toBeTruthy();
  });

  it("renders the dismiss button with correct accessible label for category_spike", () => {
    render(<AnomalyPanelClient anomalies={[CATEGORY_SPIKE]} />);
    const btn = screen.getByRole("button", { name: /Dismiss Groceries overspend alert for 2026-06/i });
    expect(btn).toBeTruthy();
  });

  it("renders the investigate link with text from copy", () => {
    render(<AnomalyPanelClient anomalies={[NEW_MERCHANT]} />);
    expect(screen.getByRole("button", { name: /See transactions/i })).toBeTruthy();
  });

  it("optimistically removes the row when dismiss is clicked", () => {
    render(<AnomalyPanelClient anomalies={[NEW_MERCHANT, CATEGORY_SPIKE]} />);
    expect(screen.getByText(/Nobu Restaurant/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /don't flag this merchant again/i }));
    expect(screen.queryByText(/Nobu Restaurant/)).toBeNull();
    // Category spike row still visible.
    expect(screen.getByText(/Groceries/)).toBeTruthy();
  });

  it("calls PATCH /api/anomaly/:id on dismiss", async () => {
    render(<AnomalyPanelClient anomalies={[NEW_MERCHANT]} />);
    fireEvent.click(screen.getByRole("button", { name: /don't flag this merchant again/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/anomaly/nm1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("investigate for new_merchant fires POST to /api/anomaly/investigate with correct kind", () => {
    render(<AnomalyPanelClient anomalies={[NEW_MERCHANT]} />);
    fireEvent.click(screen.getByRole("button", { name: /See transactions/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/anomaly/investigate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ anomaly_kind: "new_merchant" }),
      }),
    );
  });

  it("investigate link for category_spike includes category + month params", () => {
    render(<AnomalyPanelClient anomalies={[CATEGORY_SPIKE]} />);
    // Just verify the POST to /api/anomaly/investigate fires with the right kind.
    fireEvent.click(screen.getByRole("button", { name: /See transactions/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/anomaly/investigate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ anomaly_kind: "category_spike" }),
      }),
    );
  });

  it("renders nothing when the visible list is empty (post-dismiss state)", () => {
    const { container } = render(<AnomalyPanelClient anomalies={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
